# Run Janaki School on Phones (free) — Deploy Guide

This hosts the app online as an **installable web app (PWA)**. Phones open a URL, tap
**"Add to Home Screen"**, and it behaves like an installed app — sharing the **same Neon
database** as the Windows desktop app. Total cost: **₹0**.

> Your Windows 7 / desktop app is **not affected**. This only *adds* phone + browser access.
> Both point at the same Neon database, so all data and edits stay in sync everywhere.

---

## How it works (already built)

- The React app calls the API at a relative `/api`, and the Express server serves **both**
  the built web app *and* the API on **one HTTPS origin** (`CLIENT_DIST` + SPA fallback).
- The layout is responsive (mobile hamburger menu), and a **PWA manifest + service worker +
  icons** make it installable.
- `render.yaml` describes the whole service. You just connect the repo and paste 3 secrets.

Verified locally: production build serves `/`, `/manifest.webmanifest`, `/sw.js`, icons,
`/api/*`, SPA routes, and login — all on one origin.

---

## One-time deploy (Render free tier — no credit card)

### 1. Push the code to GitHub
Make sure this repo (with the new `render.yaml`) is pushed to your GitHub
(`mission-yadav/School-management-System`).

### 2. Create a Render account
Go to <https://render.com> → **Get Started** → sign in with GitHub. Free, no card needed.

### 3. Deploy from the blueprint
- In Render: **New +** → **Blueprint**.
- Pick your repo. Render reads `render.yaml` and proposes a web service named
  **janaki-school** on the **free** plan in the **Singapore** region.
- Click **Apply**.

### 4. Set the 3 secret environment variables
Render will ask for the values marked "secret" (they are **not** stored in git). Open
`server/.env` on your computer and copy each value exactly:

| Env var | Copy from `server/.env` |
|---|---|
| `DATABASE_URL` | the `DATABASE_URL=` line (the **direct** Neon URL) |
| `JWT_ACCESS_SECRET` | the `JWT_ACCESS_SECRET=` line |
| `JWT_REFRESH_SECRET` | the `JWT_REFRESH_SECRET=` line |

(The other two — `NODE_ENV=production` and `CLIENT_DIST=client/dist` — are set automatically
by `render.yaml`.)

### 5. Wait for the first build (~3–5 min)
Render runs `npm run build` then `npm start`. When it says **Live**, you get a URL like
`https://janaki-school.onrender.com`.

Open it in a browser and log in with **janaki@school.in / janaki@123** — you should see
your real data (138 students).

---

## Install on a phone

**Android (Chrome):** open the URL → menu (⋮) → **Install app** / **Add to Home screen**.

**iPhone (Safari):** open the URL → **Share** → **Add to Home Screen**.

It gets its own icon and opens full-screen, like a native app.

---

## Good to know

- **Cold start (free tier):** if nobody has used it for ~15 min, the server sleeps. The next
  open takes **~30–50s** to wake, then it's fast. (Removing this later = ~$7/mo "Starter"
  plan — flip the plan in Render, nothing else changes.)
- **Updates are automatic:** push to GitHub → Render rebuilds and redeploys. Phones get the
  new version on next open (the service worker fetches fresh app files).
- **Same login, same data** as the desktop app. Changes on a phone show up on desktop and
  vice-versa, anywhere in the world.
- **Security:** the API is now public on the internet, protected by the same login/JWT the
  desktop uses. Keep the admin password strong.

---

## Alternative hosts (same files work)

`render.yaml` is Render-specific, but the app is a standard Node service, so it also runs on
Railway, Fly.io, Koyeb, etc. Any host just needs: build `npm run build`, start `npm start`,
and env vars `NODE_ENV=production`, `CLIENT_DIST=client/dist`, `DATABASE_URL`,
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`.
