# MTN AFA Portal

Mobile-first AFA Registration portal built with Ionic 7 + React + Supabase.

## Stack

- **Frontend:** Ionic 7 + React 18 + TypeScript
- **Native Shell:** Capacitor (Android/iOS)
- **Backend/Database:** Supabase (PostgreSQL + Auth + RLS)
- **Build:** Vite
- **Deployment:** GitHub Pages (canonical, `cyberblackout.github.io/afa-registration`) — Netlify is a retired mirror only (see below)

## Prerequisites

- Node.js 18+
- Supabase account (free tier)
- GitHub account (GitHub Pages hosts production; free-tier limits are far more generous than Netlify's build minutes — see "GitHub Pages limits" below)

## Setup

1. **Clone and install:**

```bash
npm install
```

2. **Environment variables:**

Copy `.env.example` to `.env` and fill in your Supabase credentials:

```bash
cp .env.example .env
```

Get your credentials from your Supabase project settings → API.

3. **Database:**

Run the migration in `supabase/migrations/001_init.sql` in your Supabase SQL editor.

4. **Run locally:**

```bash
npm run dev
```

## Deployment (GitHub Pages — canonical)

Production is built and published by `.github/workflows/deploy.yml` on every push to
`master` (or manually via **Actions → Deploy to GitHub Pages → Run workflow**).

1. The workflow builds with `BASE_PATH=/afa-registration/` (GitHub project sites are
   served from `https://<owner>.github.io/<repo>/`, not from the domain root).
2. `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_PAYSTACK_PUBLIC_KEY` are
   read from **Settings → Secrets and variables → Actions** (they are not in the
   repo; `.env` is gitignored). If any is missing the build throws at runtime.
3. SPA deep links are handled by `public/404.html` (rewrites the requested path into
   `/?/<path>`) plus the restore script in `index.html`. GitHub Pages has no
   server-side rewrites, so `netlify.toml`'s redirects do not apply here.
4. `index.html` carries the CSP as a `<meta http-equiv>` tag, because GitHub Pages
   cannot serve custom response headers the way `netlify.toml` did.

### GitHub Pages limits (free tier)

- Published site ≤ 1 GB, deploy timeout 10 minutes
- Soft bandwidth limit 100 GB/month
- Soft limit 10 builds/hour — **does not apply** to this workflow (it uses a custom
  GitHub Actions workflow), so the Netlify build-minute problem cannot recur here

### Custom domain (`afaregister.com`) — switch procedure

GitHub Pages serves a project site from the **domain root** when a custom domain is
attached, i.e. the `/afa-registration` prefix disappears. One published artifact can
only be built for one base path, so attaching the domain is a two-step flip (both
bases are covered by tests: deep links and CSP verified at `/afa-registration/` and
at `/`).

1. In **repo → Settings → Pages → Custom domain**, enter `afaregister.com`, Save.
2. At the registrar (Namecheap), add:

   | Type  | Name   | Value                                             |
   | ----- | ------ | ------------------------------------------------- |
   | `A`   | `@`    | `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` |
   | `CNAME` | `www`  | `cyberblackout.github.io`                         |

   (GitHub's published Pages IPs — confirm on the docs page "Managing a custom
   domain for your GitHub Pages site" before adding.)
3. Wait for DNS to propagate, then tick **Enforce HTTPS** in Settings → Pages
   (GitHub provisions a Let's Encrypt certificate automatically; up to ~1h).
4. **Flip the base path:** in `.github/workflows/deploy.yml` change
   `BASE_PATH: /afa-registration/` to `BASE_PATH: ''`, and update
   `public/404.html` + the restore script in `index.html` so legacy
   `cyberblackout.github.io/afa-registration/*` links 301-redirect to
   `https://afaregister.com/*` instead of booting the SPA (the current scripts assume
   the `/afa-registration` prefix). Push to deploy.
5. After SSL is live, set the Supabase Auth **Site URL** to `https://afaregister.com`
   (the redirect allow list already contains every origin — see "Auth redirect URLs").

## Netlify (retired mirror)

`https://afa-register.netlify.app` still serves the last Netlify build and is kept
running as a harmless fallback; it is **not** canonical and will drift from GitHub
Pages until taken down. `netlify.toml` is intentionally kept so the mirror can still
be rebuilt (it also carries the security headers Netlify applies to that mirror only).
`*.netlify.app` stays in the Supabase CORS allow list for the same reason.

To retire it for good: delete the site in the Netlify dashboard, then remove
`netlify.toml` and the `*.netlify.app` entry in `supabase/functions/_shared/auth.ts`.

## Auth redirect URLs

Supabase Auth → URL Configuration currently has:

- **Site URL:** `https://cyberblackout.github.io/afa-registration` (change to
  `https://afaregister.com` after step 4 above)
- **Redirect allow list:** the GitHub Pages origin, `afaregister.com` +
  `www.afaregister.com`, `https://afa-register.netlify.app/**`, localhost dev origins
  and the Capacitor app scheme (`capacitor://localhost`)

Without these entries Supabase silently rewrites password-reset links to the Site URL
(previously `http://localhost:3000`, which made every reset email dead).

## Build for production

```bash
npm run build
```

## Capacitor (Mobile builds)

```bash
npx cap add android
npx cap add ios
npx cap sync
npx cap open android  # or ios
```
