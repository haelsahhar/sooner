import { db } from "@/lib/supabase";
import { resultPage } from "@/lib/pages";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!UUID_RE.test(token)) return resultPage("Link not valid", "This unsubscribe link isn't valid.", 400);

  try {
    const { error } = await db().from("subscriptions").delete().eq("token", token);
    if (error) throw error;
    // Same message whether or not a row existed, so the link can't be used to probe sign-ups.
    return resultPage("Unsubscribed", "You won't get any more alerts for this doctor.");
  } catch (err) {
    console.error("unsubscribe failed", err);
    return resultPage("Something went wrong", "Please try the link again in a moment.", 500);
  }
}
