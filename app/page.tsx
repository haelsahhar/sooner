import DoctorGrid, { type DoctorView } from "./components/DoctorGrid";
import { CENTRE, bookingUrl, getDoctors, type Doctor } from "@/lib/doctors";
import { formatClock, formatSlot } from "@/lib/format";

// The poller refreshes the data every ~10 minutes; re-render the page at most once a minute.
export const revalidate = 60;

const toView = (d: Doctor): DoctorView => ({
  slug: d.slug,
  name: d.name,
  imageUrl: d.image_url,
  slot: formatSlot(d.earliest_available),
  checking: !d.updated_at,
  callToBook: d.call_to_book,
  bookUrl: bookingUrl(d.slug),
});

export default async function Home() {
  const { featured, others } = await getDoctors();

  const latest = [...featured, ...others]
    .map((d) => d.updated_at)
    .filter((x): x is string => !!x)
    .sort()
    .at(-1);

  return (
    <main className="wrap">
      <header>
        <div className="logo" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="" width={38} height={38} />
        </div>
        <div>
          <h1>Sooner</h1>
          <div className="sub">{CENTRE.name}</div>
        </div>
      </header>

      <DoctorGrid doctors={featured.map(toView)} others={others.map(toView)} />

      <p className="foot">
        {latest ? <>Checked {formatClock(latest)} · </> : null}
        Unofficial and not affiliated with HotDoc or the clinic. Times can change, so confirm when you book.
      </p>
    </main>
  );
}
