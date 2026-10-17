const TZ = "Australia/Sydney";

const fmt = (o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-AU", { timeZone: TZ, ...o });

// YYYY-MM-DD in Sydney time, used to count calendar days between two instants
const ymd = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

export type Slot = { day: string; time: string; relative: string };

// Normalise odd Unicode spaces from Intl and drop the comma ("Tue, 20 Oct" -> "Tue 20 Oct")
const clean = (s: string) => s.replace(/\s/g, " ").replace(",", "");

export function formatClock(iso: string): string {
  return fmt({ hour: "numeric", minute: "2-digit", hour12: true })
    .format(new Date(iso))
    .replace(/\s/g, " ")
    .toLowerCase();
}

export function formatSlot(iso: string | null, now = new Date()): Slot | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const diff = Math.round((Date.parse(ymd(d)) - Date.parse(ymd(now))) / 86_400_000);
  const relative = diff <= 0 ? "Today" : diff === 1 ? "Tomorrow" : `In ${diff} days`;

  return {
    day: clean(fmt({ weekday: "short", day: "numeric", month: "short" }).format(d)),
    time: formatClock(iso),
    relative,
  };
}
