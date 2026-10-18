// Checks HotDoc once, stores every listing at the clinic, and emails anyone whose doctor now has
// something sooner than what they last saw. Called every 10 minutes by cron-job.org via /api/poll.
import { db } from "./supabase";
import { CENTRE, bookingUrl } from "./doctors";
import { formatSlot } from "./format";
import { emailHtml, sendMail, siteUrl } from "./mail";

const DOCTORS_PATH = new URL(CENTRE.doctorsUrl).pathname;
const HOTDOC_URL =
  "https://www.hotdoc.com.au/api/patient/pages?path=" + encodeURIComponent(encodeURIComponent(DOCTORS_PATH));

// Outage alerts: email after this many failed runs in a row (~20 min), then remind once a day.
const ALERT_AFTER_FAILURES = 2;
const REMIND_EVERY_MS = 24 * 60 * 60 * 1000;

type HotDocDoctor = {
  slug: string;
  full_name?: string;
  profession?: string;
  profile_image_url?: string | null;
  earliest_available?: string | null;
  call_to_book?: boolean;
};

export type PollResult =
  | { ok: true; doctors: number; alerts: number; sent: number; failed: number }
  | { ok: false; error: string };

const describe = (iso: string) => {
  const s = formatSlot(iso)!;
  return `${s.day}, ${s.time}`;
};

async function fetchHotDoc(): Promise<HotDocDoctor[]> {
  let res: Response;
  try {
    res = await fetch(HOTDOC_URL, {
      headers: {
        Accept: "application/au.com.hotdoc.v6",
        "User-Agent": "Sooner/1.1 (personal appointment alerts; low-frequency polling)",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new Error(`Couldn't reach HotDoc: ${(err as Error).message}`);
  }
  if (!res.ok) throw new Error(`HotDoc responded ${res.status} ${res.statusText}`);

  let json: { doctors?: unknown };
  try {
    json = await res.json();
  } catch {
    throw new Error("HotDoc sent something that isn't JSON (possibly a block or captcha page)");
  }
  if (!Array.isArray(json.doctors) || json.doctors.length === 0) {
    throw new Error("HotDoc's response had no doctors list. The format may have changed.");
  }
  return json.doctors as HotDocDoctor[];
}

export async function runPoll(): Promise<PollResult> {
  const sb = db();
  const now = new Date().toISOString();

  // ---- 1. Fetch HotDoc (failures are recorded and may trigger an outage email) ----------------
  let listings: HotDocDoctor[];
  try {
    listings = await fetchHotDoc();
  } catch (err) {
    const error = (err as Error).message;
    console.error(`${error}. Not updating anything.`);
    await recordFailure(error, now);
    return { ok: false, error };
  }
  await recordSuccess(now);

  // ---- 2. Store every listing -----------------------------------------------------------------
  // Generic placeholder photos (e.g. for nurses) are shared by several listings; show initials instead.
  const imageUses = new Map<string, number>();
  for (const d of listings) {
    if (d.profile_image_url) imageUses.set(d.profile_image_url, (imageUses.get(d.profile_image_url) ?? 0) + 1);
  }

  const rows = listings
    .filter((d) => d.slug && d.full_name)
    .map((d) => ({
      slug: d.slug,
      name: d.full_name!.replace(/\s+/g, " ").trim(),
      profession: d.profession ?? null,
      image_url: d.profile_image_url && imageUses.get(d.profile_image_url) === 1 ? d.profile_image_url : null,
      earliest_available: d.earliest_available ? new Date(d.earliest_available).toISOString() : null,
      call_to_book: Boolean(d.call_to_book),
      active: true,
      updated_at: now,
    }));

  const { error: upsertError } = await sb.from("doctors").upsert(rows, { onConflict: "slug" });
  if (upsertError) throw new Error(`Saving doctors failed: ${upsertError.message}`);

  // Anyone no longer on the clinic page is hidden from the site (their row and subscriptions stay).
  const slugs = rows.map((r) => r.slug);
  const { error: hideError } = await sb
    .from("doctors")
    .update({ active: false })
    .eq("active", true)
    .not("slug", "in", `(${slugs.join(",")})`);
  if (hideError) console.error(`Hiding departed doctors failed: ${hideError.message}`);

  const fresh = new Map(rows.map((r) => [r.slug, r]));

  // ---- 3. Alert anyone with a sooner slot ------------------------------------------------------
  const { data: subs, error: subsError } = await sb
    .from("subscriptions")
    .select("id,email,token,doctor_slug,last_seen")
    .eq("confirmed", true)
    .in("doctor_slug", slugs);
  if (subsError) throw new Error(`Reading subscriptions failed: ${subsError.message}`);

  let sent = 0;
  let failed = 0;
  for (const sub of subs ?? []) {
    const doc = fresh.get(sub.doctor_slug)!;
    const next = doc.earliest_available ? Date.parse(doc.earliest_available) : null;
    const prev = sub.last_seen ? Date.parse(sub.last_seen) : null;

    if (next !== null && (prev === null || next < prev)) {
      try {
        await sendAlert(sub, doc.name, doc.earliest_available!);
        sent++;
      } catch (err) {
        failed++;
        console.error(`Email to ${sub.email} failed, will retry next run: ${(err as Error).message}`);
        continue; // leave last_seen alone so the alert is retried
      }
    }

    if (next !== prev) {
      const { error } = await sb.from("subscriptions").update({ last_seen: doc.earliest_available }).eq("id", sub.id);
      if (error) console.error(`Updating subscription ${sub.id} failed: ${error.message}`);
    }
  }

  console.log(`Done. ${rows.length} listings, ${subs?.length ?? 0} active alerts, ${sent} emails sent, ${failed} failed.`);
  return { ok: true, doctors: rows.length, alerts: subs?.length ?? 0, sent, failed };
}

async function sendAlert(
  sub: { email: string; token: string; doctor_slug: string; last_seen: string | null },
  name: string,
  earliest: string,
) {
  const when = describe(earliest);
  const was = sub.last_seen ? `it was ${describe(sub.last_seen)}` : "nothing was available";
  const book = bookingUrl(sub.doctor_slug);
  const stop = `${siteUrl()}/api/unsubscribe?token=${sub.token}`;
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  await sendMail({
    to: sub.email,
    subject: `${name} has an earlier slot: ${when}`,
    text:
      `${name} now has an appointment at ${CENTRE.name}: ${when}\n(Before, ${was}.)\n\n` +
      `Book it on HotDoc: ${book}\n\nSlots go quickly, so don't wait.\n\n` +
      `Stop alerts for this doctor: ${stop}`,
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#13201E">
<h2 style="margin:0 0 6px;font-size:20px">${esc(name)} has an earlier slot</h2>
<p style="margin:0 0 4px;font-size:26px;font-weight:700;color:#0F766E">${esc(when)}</p>
<p style="margin:0 0 20px;font-size:14px;color:#6C7A77">Before, ${esc(was)}.</p>
<p style="margin:0 0 22px"><a href="${esc(book)}" style="background:#0F766E;color:#fff;text-decoration:none;padding:13px 24px;border-radius:999px;font-weight:600;font-size:15px;display:inline-block">Book on HotDoc</a></p>
<p style="margin:0 0 18px;font-size:13px;color:#6C7A77">Slots go quickly, so don't wait. Times are Sydney time.</p>
<p style="margin:0;font-size:12px;color:#6C7A77"><a href="${esc(stop)}" style="color:#6C7A77">Stop alerts for this doctor</a></p>
</div>`,
  });
}

// ---- Outage alerts to the site owner (ADMIN_EMAIL) ---------------------------------------------

type Status = {
  consecutive_failures: number;
  failing_since: string | null;
  last_error: string | null;
  alerted_at: string | null;
  last_success_at: string | null;
};

async function readStatus(): Promise<Status | null> {
  const { data, error } = await db().from("poller_status").select("*").eq("id", 1).maybeSingle();
  if (error) {
    console.error(`Reading poller_status failed: ${error.message}`);
    return null;
  }
  return data ?? { consecutive_failures: 0, failing_since: null, last_error: null, alerted_at: null, last_success_at: null };
}

async function writeStatus(s: Status) {
  const { error } = await db().from("poller_status").upsert({ id: 1, ...s });
  if (error) console.error(`Saving poller_status failed: ${error.message}`);
}

async function recordFailure(error: string, now: string) {
  const prev = await readStatus();
  if (!prev) return;

  const s: Status = {
    ...prev,
    consecutive_failures: prev.consecutive_failures + 1,
    failing_since: prev.failing_since ?? now,
    last_error: error,
  };
  const due =
    s.consecutive_failures >= ALERT_AFTER_FAILURES &&
    (!s.alerted_at || Date.now() - Date.parse(s.alerted_at) >= REMIND_EVERY_MS);

  if (due && (await notifyAdmin("down", s))) s.alerted_at = now;
  await writeStatus(s);
}

async function recordSuccess(now: string) {
  const prev = await readStatus();
  if (!prev) return;
  if (prev.alerted_at) await notifyAdmin("recovered", prev);
  await writeStatus({ consecutive_failures: 0, failing_since: null, last_error: null, alerted_at: null, last_success_at: now });
}

async function notifyAdmin(kind: "down" | "recovered", s: Status): Promise<boolean> {
  const to = process.env.ADMIN_EMAIL;
  if (!to) {
    console.error("ADMIN_EMAIL is not set, so no outage email was sent.");
    return false;
  }
  const since = s.failing_since ? describe(s.failing_since) : "recently";
  const lastOk = s.last_success_at ? describe(s.last_success_at) : "never";

  const [subject, heading, paragraphs] =
    kind === "down"
      ? [
          "Sooner can't reach HotDoc",
          "Sooner can't reach HotDoc",
          [
            `The last ${s.consecutive_failures} checks failed, starting ${since} (Sydney time). No alerts can go out until this is fixed.`,
            `Error: ${s.last_error ?? "unknown"}`,
            `Last successful check: ${lastOk}.`,
            "If this keeps happening, HotDoc may have changed its page or started blocking automated checks. You'll get a reminder every 24 hours while it's down, and an email when it recovers.",
          ],
        ]
      : [
          "Sooner is reaching HotDoc again",
          "All clear: HotDoc is reachable again",
          [`Checks were failing from ${since} (Sydney time). The latest check worked, and alerts are running normally again.`],
        ];

  try {
    await sendMail({ to, subject, text: paragraphs.join("\n\n"), html: emailHtml(heading, paragraphs) });
    return true;
  } catch (err) {
    console.error(`Outage email to ADMIN_EMAIL failed: ${(err as Error).message}`);
    return false;
  }
}
