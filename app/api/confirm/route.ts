import { db } from "@/lib/supabase";
import { resultPage } from "@/lib/pages";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!UUID_RE.test(token)) return resultPage("Link not valid", "This confirmation link isn't valid.", 400);

  try {
    const sb = db();
    const { data: sub } = await sb
      .from("subscriptions")
      .select("id,confirmed,doctor_slug")
      .eq("token", token)
      .maybeSingle();
    if (!sub) {
      return resultPage("Link expired", "We couldn't find this sign-up. It may have been cancelled.", 404);
    }

    const { data: doctor } = await sb
      .from("doctors")
      .select("name,earliest_available")
      .eq("slug", sub.doctor_slug)
      .single();

    if (!sub.confirmed) {
      // Baseline = what the doctor has right now. Alerts fire only for something sooner than this.
      await sb
        .from("subscriptions")
        .update({ confirmed: true, last_seen: doctor?.earliest_available ?? null })
        .eq("id", sub.id);
    }

    return resultPage(
      "You're all set",
      `We'll email you as soon as ${doctor?.name ?? "this doctor"} has an earlier appointment.`,
    );
  } catch (err) {
    console.error("confirm failed", err);
    return resultPage("Something went wrong", "Please try the link again in a moment.", 500);
  }
}
