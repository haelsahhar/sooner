"use client";

import { useEffect, useRef, useState } from "react";

export type DoctorView = {
  slug: string;
  name: string;
  imageUrl: string | null;
  slot: { day: string; time: string; relative: string } | null;
  checking: boolean;
  callToBook: boolean;
  bookUrl: string;
};

const KEY = "sooner:v1";
type Store = { email?: string; requested?: string[] };

function load(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}
function save(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode etc. — alerts still work, we just can't remember them */
  }
}

const initials = (name: string) =>
  name
    .replace(/^(Dr|Mr|Ms|Mrs)\.?\s+/i, "")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

function BellIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function CheckIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function Photo({ name, src }: { name: string; src: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="photo">
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <span className="initials" aria-hidden="true">{initials(name)}</span>
      )}
    </div>
  );
}

export default function DoctorGrid({ doctors }: { doctors: DoctorView[] }) {
  const [active, setActive] = useState<DoctorView | null>(null);
  const [requested, setRequested] = useState<string[]>([]);
  const [email, setEmail] = useState("");

  useEffect(() => {
    const s = load();
    setRequested(s.requested ?? []);
    setEmail(s.email ?? "");
  }, []);

  function onDone(slug: string, mail: string) {
    const next = Array.from(new Set([...requested, slug]));
    setRequested(next);
    setEmail(mail);
    save({ email: mail, requested: next });
  }

  return (
    <>
      <div className="grid">
        {doctors.map((d) => {
          const on = requested.includes(d.slug);
          return (
            <article className="card" key={d.slug}>
              <Photo name={d.name} src={d.imageUrl} />
              <div className="meta">
                <h2 className="name">{d.name}</h2>
                <div>
                  <div className="label">Next available</div>
                  {d.checking ? (
                    <div className="slot muted">Checking…</div>
                  ) : d.slot ? (
                    <>
                      <a className="slot" href={d.bookUrl} target="_blank" rel="noopener noreferrer">
                        <span className="day">{d.slot.day}</span>
                        <span className="time">{d.slot.time}</span>
                      </a>
                      <div className="rel">{d.slot.relative}</div>
                    </>
                  ) : (
                    <div className="slot muted">{d.callToBook ? "Call the clinic" : "None right now"}</div>
                  )}
                </div>
              </div>
              <button type="button" className={`btn${on ? " on" : ""}`} onClick={() => setActive(d)}>
                {on ? <CheckIcon size={16} /> : <span className="bell"><BellIcon size={16} /></span>}
                {on ? "Alerts requested" : "Notify me if sooner"}
              </button>
            </article>
          );
        })}
      </div>

      {active && <Sheet doctor={active} initialEmail={email} onClose={() => setActive(null)} onDone={onDone} />}
    </>
  );
}

function Sheet({
  doctor,
  initialEmail,
  onClose,
  onDone,
}: {
  doctor: DoctorView;
  initialEmail: string;
  onClose: () => void;
  onDone: (slug: string, email: string) => void;
}) {
  const [mail, setMail] = useState(initialEmail);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [hp, setHp] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    setMsg("");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: mail, slug: doctor.slug, website: hp }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setMsg(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setStatus("sent");
      setMsg(
        data.status === "already"
          ? `You're already getting alerts for ${doctor.name}.`
          : data.status === "throttled"
            ? "We already sent you a confirmation link. Check your inbox and spam folder."
            : "Almost there. Check your inbox for a confirmation link.",
      );
      onDone(doctor.slug, mail.trim().toLowerCase());
    } catch {
      setStatus("error");
      setMsg("Couldn't connect. Check your internet and try again.");
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        {status === "sent" ? (
          <div className="sent">
            <div className="tick"><CheckIcon size={26} /></div>
            <h3 id="sheet-title">Check your email</h3>
            <p>{msg}</p>
            <button type="button" className="btn" onClick={onClose}>Done</button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <h3 id="sheet-title">Notify me if sooner</h3>
            <p className="lead">
              We&rsquo;ll email you when <strong>{doctor.name}</strong> has an earlier appointment
              {doctor.slot ? <> than {doctor.slot.day}, {doctor.slot.time}</> : null}.
            </p>
            <label className="sr" htmlFor="email">Email address</label>
            <input
              id="email"
              ref={inputRef}
              className="input"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={mail}
              onChange={(e) => setMail(e.target.value)}
              required
            />
            <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={hp} onChange={(e) => setHp(e.target.value)} />
            {status === "error" && <p className="err" role="alert">{msg}</p>}
            <button type="submit" className="btn" disabled={status === "sending"}>
              {status === "sending" ? "Sending…" : "Notify me"}
            </button>
            <p className="fine">We&rsquo;ll send one email to confirm. You can unsubscribe from any alert.</p>
          </form>
        )}
      </div>
    </div>
  );
}
