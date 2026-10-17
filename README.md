# Sooner

Email alerts for earlier appointments at Rouse Hill Town Medical Centre (HotDoc).
Shows four doctors with their next available slot. Tap **Notify me if sooner** on a doctor, confirm your
email once, and you get an email whenever that doctor's next slot becomes earlier than what you last saw.

## How it works

```
GitHub Actions (every 10 min)          Supabase                     Vercel (Next.js site)
scripts/poll.mjs  ── reads HotDoc ──►  doctors table  ◄── reads ──  page shows doctors + times
                  ── emails people ◄── subscriptions  ◄── writes ── "Notify me" / confirm / unsubscribe
```

- The website never calls HotDoc. Only the poller does, once per run for all doctors, with no polling 10pm to 6am Sydney time.
- Each subscription remembers the earliest slot you last saw. If a new slot is earlier, you get an email and the baseline moves down. If a slot is taken and the doctor's next slot moves later, the baseline follows it, so a later cancellation still alerts you.
- Sign-ups use a confirmation email (so nobody can sign up someone else's address). Every alert has an unsubscribe link.
- Everything is on free tiers: Vercel, Supabase, GitHub Actions (public repo), Gmail SMTP.

## Setup (about 15 minutes)

### 1. Supabase (database)
1. Create a free project at supabase.com.
2. SQL Editor → paste `supabase/schema.sql` → Run.
3. Project Settings → API: copy the **Project URL** and the **service_role** key (keep it secret).

### 2. Gmail (sending email)
1. Turn on 2-Step Verification for the Gmail account that will send the emails.
2. Google Account → Security → App passwords → create one called "Sooner". Copy the 16-character password.
   (Free Gmail can send about 500 emails a day, far more than this needs.)

### 3. GitHub (the poller)
1. Create a **public** repo and push this folder to it. Public repos get unlimited free Actions minutes.
   (Private repos only get 2,000 free minutes a month, which this schedule would exceed.)
2. Repo → Settings → Secrets and variables → Actions → add these secrets:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `SITE_URL`
   (`SITE_URL` is your Vercel address from step 4, no trailing slash; add it after you deploy).
3. Actions tab → **Check HotDoc** → **Run workflow**. Open the run log. You should see each doctor's
   next slot printed. If you see `HotDoc responded 4xx`, see "If HotDoc blocks the poller" below.

### 4. Vercel (the website)
1. Import the repo at vercel.com/new.
2. Add environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `SITE_URL`.
3. Deploy, then put the final address in `SITE_URL` (Vercel and GitHub) and redeploy.

### 5. Install on your phone
Open the site in Chrome on Android → menu → **Install app** (or Add to Home screen).
On iPhone: Safari → Share → Add to Home Screen.

## Try it
1. Open the site and tap **Notify me if sooner** on a doctor, enter your email, tap the link in the email.
2. To test an alert without waiting for a cancellation: in Supabase → Table Editor → `subscriptions`,
   set your row's `last_seen` to a date later than the doctor's current slot, then re-run the workflow.
   You should get an email.

## Adding a doctor later
1. Add `{ "slug": "...", "name": "..." }` to `config/doctors.json`. The slug is the last part of their HotDoc page address.
2. Add the same slug and name to the `insert into public.doctors` list in Supabase (run just that insert).
3. Push. The poller starts tracking them on its next run.

## If HotDoc blocks the poller
The poller calls the same JSON endpoint the HotDoc website itself uses. It's unofficial, so HotDoc can change
it or block automated traffic at any time. The poller exits with an error and leaves existing data alone, so
the site simply stops updating. If it keeps failing, check the run log; the endpoint or its version header
(`application/au.com.hotdoc.v6`) in `scripts/poll.mjs` may need updating. Keep the polling gentle, and
check HotDoc's terms of service if you ever want to share this beyond family and friends.

## Local development
```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev                  # http://localhost:3000
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... GMAIL_USER=... GMAIL_APP_PASSWORD=... SITE_URL=http://localhost:3000 FORCE=true npm run poll
```
