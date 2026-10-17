// Checks HotDoc once, stores each tracked doctor's earliest slot, and emails anyone whose
// doctor now has something sooner than what they last saw. Run by GitHub Actions every ~10 min.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

const TZ = "Australia/Sydney";
const CENTRE_NAME = "Rouse Hill Town Medical Centre";
const DOCTORS_PATH = "/medical-centres/rouse-hill-NSW-2155/rouse-hill-town-medical-centre/doctors";
const BOOKING_BASE = `https://www.hotdoc.com.au${DOCTORS_PATH}`;

const tracked = JSON.parse(readFileSync(new URL("../config/doctors.json", import.meta.url), "utf8"));

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;
const SITE_URL = (process.env.SITE_URL ?? "").replace(/\/$/, "");
for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GMAIL_USER, GMAIL_APP_PASSWORD, SITE_URL })) {
  if (!v) {
    console.error(`Missing required environment variable: ${k}`);
    process.exit(1);
  }
}

// Be polite: no overnight polling unless forced (manual runs set FORCE=true).
const sydneyHour = Number(
  new Intl.DateTimeFormat("en-AU", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(new Date()),
);
if (!process.env.FORCE && (sydneyHour >= 22 || sydneyHour < 6)) {
  console.log(`Quiet hours (${sydneyHour}:00 Sydney) - skipping.`);
  process.exit(0);
}

const fmt = (o) => new Intl.DateTimeFormat("en-AU", { timeZone: TZ, ...o });
const clean = (s) => s.replace(/\s/g, " ").replace(",", "");
const describe = (iso) =>
  clean(fmt({ weekday: "short", day: "numeric", month: "short" }).format(new Date(iso))) +
  ", " +
  clean(fmt({ hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso))).toLowerCase();

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---- 1. Fetch HotDoc ------------------------------------------------------------------------
const url = "https://www.hotdoc.com.au/api/patient/pages?path=" + encodeURIComponent(encodeURIComponent(DOCTORS_PATH));
const res = await fetch(url, {
  headers: {
    Accept: "application/au.com.hotdoc.v6",
    "User-Agent": "Sooner/1.0 (personal appointment alerts; low-frequency polling)",
  },
  signal: AbortSignal.timeout(30_000),
});
if (!res.ok) {
  console.error(`HotDoc responded ${res.status} ${res.statusText}. Not updating anything.`);
  process.exit(1);
}
const json = await res.json();
if (!Array.isArray(json.doctors) || json.doctors.length === 0) {
  console.error("HotDoc response had no doctors array. The format may have changed. Not updating anything.");
  process.exit(1);
}

// ---- 2. Store the latest availability -------------------------------------------------------
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const now = new Date().toISOString();
const fresh = new Map(); // slug -> { name, earliest }

for (const t of tracked) {
  const d = json.doctors.find((x) => x.slug === t.slug);
  if (!d) {
    console.warn(`${t.slug}: not in HotDoc response, leaving as is.`);
    continue;
  }
  const earliest = d.earliest_available ? new Date(d.earliest_available).toISOString() : null;
  const { error } = await sb.from("doctors").upsert(
    {
      slug: t.slug,
      name: d.full_name ?? t.name,
      image_url: d.profile_image_url ?? null,
      earliest_available: earliest,
      call_to_book: Boolean(d.call_to_book),
      updated_at: now,
    },
    { onConflict: "slug" },
  );
  if (error) throw new Error(`Saving ${t.slug} failed: ${error.message}`);
  fresh.set(t.slug, { name: d.full_name ?? t.name, earliest });
  console.log(`${t.slug}: ${earliest ? describe(earliest) : "no appointments"}`);
}

// ---- 3. Alert anyone with a sooner slot ----------------------------------------------------
const { data: subs, error: subsError } = await sb
  .from("subscriptions")
  .select("id,email,token,doctor_slug,last_seen")
  .eq("confirmed", true)
  .in("doctor_slug", [...fresh.keys()]);
if (subsError) throw new Error(`Reading subscriptions failed: ${subsError.message}`);

const transport = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
});

let sent = 0;
let failed = 0;
for (const sub of subs ?? []) {
  const doc = fresh.get(sub.doctor_slug);
  const next = doc.earliest ? new Date(doc.earliest).getTime() : null;
  const prev = sub.last_seen ? new Date(sub.last_seen).getTime() : null;
  const sooner = next !== null && (prev === null || next < prev);

  if (sooner) {
    const when = describe(doc.earliest);
    const was = prev === null ? "nothing was available" : `it was ${describe(sub.last_seen)}`;
    const book = `${BOOKING_BASE}/${sub.doctor_slug}`;
    const stop = `${SITE_URL}/api/unsubscribe?token=${sub.token}`;
    try {
      await transport.sendMail({
        from: `Sooner <${GMAIL_USER}>`,
        to: sub.email,
        subject: `${doc.name} has an earlier slot: ${when}`,
        text:
          `${doc.name} now has an appointment at ${CENTRE_NAME}: ${when}\n(Before, ${was}.)\n\n` +
          `Book it on HotDoc: ${book}\n\nSlots go quickly, so don't wait.\n\n` +
          `Stop alerts for this doctor: ${stop}`,
        html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#13201E">
<h2 style="margin:0 0 6px;font-size:20px">${esc(doc.name)} has an earlier slot</h2>
<p style="margin:0 0 4px;font-size:26px;font-weight:700;color:#0F766E">${esc(when)}</p>
<p style="margin:0 0 20px;font-size:14px;color:#6C7A77">Before, ${esc(was)}.</p>
<p style="margin:0 0 22px"><a href="${esc(book)}" style="background:#0F766E;color:#fff;text-decoration:none;padding:13px 24px;border-radius:999px;font-weight:600;font-size:15px;display:inline-block">Book on HotDoc</a></p>
<p style="margin:0 0 18px;font-size:13px;color:#6C7A77">Slots go quickly, so don't wait. Times are Sydney time.</p>
<p style="margin:0;font-size:12px;color:#6C7A77"><a href="${esc(stop)}" style="color:#6C7A77">Stop alerts for this doctor</a></p>
</div>`,
      });
      sent++;
    } catch (err) {
      failed++;
      console.error(`Email to ${sub.email} failed, will retry next run: ${err.message}`);
      continue; // leave last_seen alone so the alert is retried
    }
  }

  if (next !== prev) {
    const { error } = await sb.from("subscriptions").update({ last_seen: doc.earliest }).eq("id", sub.id);
    if (error) console.error(`Updating subscription ${sub.id} failed: ${error.message}`);
  }
}

console.log(`Done. ${subs?.length ?? 0} active alerts, ${sent} emails sent, ${failed} failed.`);
if (failed > 0) process.exit(1);
