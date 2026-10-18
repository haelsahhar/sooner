import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { CENTRE } from "@/lib/doctors";
import { emailHtml, sendMail, siteUrl } from "@/lib/mail";

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const RESEND_AFTER_MS = 10 * 60 * 1000;
const HOURLY_CONFIRMATION_CAP = 40; // protects the Gmail sending limit from abuse

const reply = (status: string) => NextResponse.json({ ok: true, status });
const fail = (error: string, code = 400) => NextResponse.json({ ok: false, error }, { status: code });

export async function POST(req: Request) {
  let body: { email?: unknown; slug?: unknown; website?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("Invalid request");
  }

  // Honeypot: real users never fill this hidden field.
  if (typeof body.website === "string" && body.website.length > 0) return reply("confirm_sent");

  const email = String(body.email ?? "").trim().toLowerCase();
  const slug = String(body.slug ?? "");
  if (email.length > 254 || !EMAIL_RE.test(email)) return fail("Enter a valid email address.");

  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return fail("Unknown doctor.");

  try {
    const sb = db();

    const { data: doctor } = await sb
      .from("doctors")
      .select("name")
      .eq("slug", slug)
      .eq("active", true)
      .maybeSingle();
    if (!doctor) return fail("Unknown doctor.");

    const { data: existing } = await sb
      .from("subscriptions")
      .select("id,token,confirmed,confirm_sent_at")
      .eq("email", email)
      .eq("doctor_slug", slug)
      .maybeSingle();

    if (existing?.confirmed) return reply("already");
    if (
      existing?.confirm_sent_at &&
      Date.now() - Date.parse(existing.confirm_sent_at) < RESEND_AFTER_MS
    ) {
      return reply("throttled");
    }

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await sb
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .gt("confirm_sent_at", since);
    if ((count ?? 0) >= HOURLY_CONFIRMATION_CAP) {
      return fail("Lots of sign-ups right now. Please try again in a little while.", 429);
    }

    const now = new Date().toISOString();
    let token: string;
    if (existing) {
      token = existing.token;
      await sb.from("subscriptions").update({ confirm_sent_at: now }).eq("id", existing.id);
    } else {
      const { data, error } = await sb
        .from("subscriptions")
        .insert({ email, doctor_slug: slug, confirm_sent_at: now })
        .select("token")
        .single();
      if (error || !data) throw error ?? new Error("insert failed");
      token = data.token;
    }

    const link = `${siteUrl()}/api/confirm?token=${token}`;
    await sendMail({
      to: email,
      subject: `Confirm your alerts for ${doctor.name}`,
      text:
        `Tap the link to confirm you'd like an email whenever ${doctor.name} has an earlier ` +
        `appointment at ${CENTRE.name}:\n\n${link}\n\n` +
        `If this wasn't you, ignore this email and nothing will happen.`,
      html: emailHtml(
        `Confirm alerts for ${doctor.name}`,
        [
          `We'll email you whenever ${doctor.name} has an earlier appointment at ${CENTRE.name}.`,
          "If this wasn't you, ignore this email and nothing will happen.",
        ],
        { url: link, label: "Confirm alerts" },
      ),
    });

    return reply("confirm_sent");
  } catch (err) {
    console.error("subscribe failed", err);
    return fail("Couldn't send the confirmation email. Please try again.", 500);
  }
}
