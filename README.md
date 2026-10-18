# Sooner

Email alerts for earlier appointments at Rouse Hill Town Medical Centre (HotDoc).
Shows four featured doctors with their next available slot, plus a list of everyone else at the clinic.
Tap **Notify me if sooner** on a doctor, confirm your email once, and you get an email whenever that
doctor's next slot becomes earlier than what you last saw.

## How it works

```
cron-job.org (every 10 min)              Supabase                     Vercel (Next.js site)
  └─► GET /api/poll ── reads HotDoc ──►  doctors table  ◄── reads ──  page shows doctors + times
                    ── emails people ◄── subscriptions  ◄── writes ── "Notify me" / confirm / unsubscribe
                    ── outage email  ◄── poller_status
```

- The website pages never call HotDoc. Only `/api/poll` does, once per run for the whole clinic, every 10 minutes
  around the clock. It is protected by `CRON_SECRET`. (GitHub's own schedules arrived hours apart, so an external
  cron service calls it instead; the GitHub **Check HotDoc** workflow is a manual "check now" button.)
- The four doctors in `config/doctors.json` are shown as cards. Everyone else listed on the clinic's HotDoc page
  appears in the **Other doctors at this clinic** dropdown (A–Z); picking one shows their card.
- Each subscription remembers the earliest slot you last saw. If a new slot is earlier, you get an email and the baseline moves down. If a slot is taken and the doctor's next slot moves later, the baseline follows it, so a later cancellation still alerts you.
- Sign-ups use a confirmation email (so nobody can sign up someone else's address). Every alert has an unsubscribe link.
- If HotDoc can't be reached on 2 checks in a row (~20 minutes), `ADMIN_EMAIL` gets an email, a reminder every
  24 hours while it stays down, and an "all clear" when it recovers.
- Everything is on free tiers: Vercel, Supabase, cron-job.org, Gmail SMTP.

## Setup

### 1. Supabase (database)
1. Create a free project at supabase.com.
2. SQL Editor → paste `supabase/schema.sql` → Run. Then do the same with `supabase/v1.1.sql`.
3. Project Settings → API: copy the **Project URL** and the **service_role** key (keep it secret).

### 2. Gmail (sending email)
1. Turn on 2-Step Verification for the Gmail account that will send the emails.
2. Google Account → Security → App passwords → create one called "Sooner". Copy the 16-character password.
   (Free Gmail can send about 500 emails a day, far more than this needs.)

### 3. Vercel (the website and the poller)
1. Push this folder to a GitHub repo and import it at vercel.com/new.
2. Add environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`,
   `SITE_URL` (the site's address, no trailing slash), `CRON_SECRET` (make one with `openssl rand -hex 32`)
   and `ADMIN_EMAIL` (who hears about outages).
3. Deploy (redeploy after changing any variable).

### 4. cron-job.org (every 10 minutes)
1. Create a free account at cron-job.org → **Create cronjob**.
2. URL: `https://<your-site>/api/poll`. Schedule: every 10 minutes.
3. Advanced → Headers → add `Authorization` with the value `Bearer <CRON_SECRET>`.
4. Turn on failure notifications, save, then use **Test run**: the response should start with `{"ok":true`.

### 5. GitHub "check now" button (optional)
Repo → Settings → Secrets and variables → Actions → add `SITE_URL` and `CRON_SECRET`.
Then Actions → **Check HotDoc** → **Run workflow** runs one check on demand.

### 6. Install on your phone
Open the site in Chrome on Android → menu → **Install app** (or Add to Home screen).
On iPhone: Safari → Share → Add to Home Screen.

## Try it
1. Open the site and tap **Notify me if sooner** on a doctor, enter your email, tap the link in the email.
2. To test an alert without waiting for a cancellation: in Supabase → Table Editor → `subscriptions`,
   set your row's `last_seen` to a date later than the doctor's current slot, then run a check.
   You should get an email.

## Changing the featured doctors
Edit `config/doctors.json` (`slug` is the last part of the doctor's HotDoc page address) and push.
Everyone at the clinic is stored automatically, so a doctor moves between the cards and the dropdown without
any database changes, and existing alerts keep working.

## If HotDoc blocks the poller
The poller calls the same JSON endpoint the HotDoc website itself uses. It's unofficial, so HotDoc can change
it or block automated traffic at any time. The poller then leaves existing data alone (the site stops updating)
and emails `ADMIN_EMAIL`. The endpoint and its version header (`application/au.com.hotdoc.v6`) are in
`lib/poll.ts`. Keep the polling gentle, and check HotDoc's terms of service if you ever want to share this beyond
family and friends.

## Local development
```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev                  # http://localhost:3000
npm run poll                 # runs one check against the dev server
```
