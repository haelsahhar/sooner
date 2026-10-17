import tracked from "@/config/doctors.json";
import { db } from "./supabase";

export const CENTRE = {
  name: "Rouse Hill Town Medical Centre",
  doctorsUrl:
    "https://www.hotdoc.com.au/medical-centres/rouse-hill-NSW-2155/rouse-hill-town-medical-centre/doctors",
};

export const TRACKED = tracked;

export const bookingUrl = (slug: string) => `${CENTRE.doctorsUrl}/${slug}`;

export type Doctor = {
  slug: string;
  name: string;
  image_url: string | null;
  earliest_available: string | null;
  call_to_book: boolean;
  updated_at: string | null; // null = never polled yet
};

export async function getDoctors(): Promise<Doctor[]> {
  const fallback: Doctor[] = tracked.map((t) => ({
    slug: t.slug,
    name: t.name,
    image_url: null,
    earliest_available: null,
    call_to_book: false,
    updated_at: null,
  }));

  try {
    const { data, error } = await db()
      .from("doctors")
      .select("slug,name,image_url,earliest_available,call_to_book,updated_at")
      .in("slug", tracked.map((t) => t.slug));
    if (error || !data) return fallback;

    const bySlug = new Map((data as Doctor[]).map((d) => [d.slug, d]));
    return tracked.map((t) => bySlug.get(t.slug) ?? fallback.find((f) => f.slug === t.slug)!);
  } catch {
    return fallback;
  }
}
