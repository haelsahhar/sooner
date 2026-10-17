import DoctorGrid, { type DoctorView } from "./components/DoctorGrid";
import { CENTRE, bookingUrl, getDoctors } from "@/lib/doctors";
import { formatClock, formatSlot } from "@/lib/format";

// The poller refreshes the data every ~10 minutes; re-render the page at most once a minute.
export const revalidate = 60;

export default async function Home() {
  const doctors = await getDoctors();

  const views: DoctorView[] = doctors.map((d) => ({
    slug: d.slug,
    name: d.name,
    imageUrl: d.image_url,
    slot: formatSlot(d.earliest_available),
    checking: !d.updated_at,
    callToBook: d.call_to_book,
    bookUrl: bookingUrl(d.slug),
  }));

  const latest = doctors
    .map((d) => d.updated_at)
    .filter((x): x is string => !!x)
    .sort()
    .at(-1);

  return (
    <main className="wrap">
      <header>
        <div className="logo" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
        </div>
        <div>
          <h1>Sooner</h1>
          <div className="sub">{CENTRE.name}</div>
        </div>
      </header>

      <DoctorGrid doctors={views} />

      <p className="foot">
        {latest ? <>Checked {formatClock(latest)} · </> : null}
        Unofficial and not affiliated with HotDoc or the clinic. Times can change, so confirm when you book.
      </p>
    </main>
  );
}
