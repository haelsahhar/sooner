import featured from "@/config/doctors.json";
import { db } from "./supabase";

export const CENTRE = {
  name: "Rouse Hill Town Medical Centre",
  doctorsUrl:
    "https://www.hotdoc.com.au/medical-centres/rouse-hill-NSW-2155/rouse-hill-town-medical-centre/doctors",
};

// The doctors shown as cards at the top. Everyone else at the clinic is in the dropdown below.
export const FEATURED = featured;

export const bookingUrl = (slug: string) => `${CENTRE.doctorsUrl}/${slug}`;

export type Doctor = {
  slug: string;
  name: string;
  image_url: string | null;
  earliest_available: string | null;
  call_to_book: boolean;
  updated_at: string | null; // null = never polled yet
};

// "Dr Ajantha Ediriweera" sorts under A, not D.
const sortKey = (name: string) => name.replace(/^dr\.?\s+/i, "").toLowerCase();

export async function getDoctors(): Promise<{ featured: Doctor[]; others: Doctor[] }> {
  const fallback: Doctor[] = featured.map((t) => ({
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
      .eq("active", true);
    if (error || !data) return { featured: fallback, others: [] };

    const rows = data as Doctor[];
    const bySlug = new Map(rows.map((d) => [d.slug, d]));
    const featuredSlugs = new Set(featured.map((t) => t.slug));

    return {
      featured: featured.map((t) => bySlug.get(t.slug) ?? fallback.find((f) => f.slug === t.slug)!),
      others: rows
        .filter((d) => !featuredSlugs.has(d.slug))
        .sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name))),
    };
  } catch {
    return { featured: fallback, others: [] };
  }
}
