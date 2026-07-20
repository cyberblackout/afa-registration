# MTN AFA Portal

Mobile-first AFA Registration portal built with Ionic 7 + React + Supabase.

## Stack

- **Frontend:** Ionic 7 + React 18 + TypeScript
- **Native Shell:** Capacitor (Android/iOS)
- **Backend/Database:** Supabase (PostgreSQL + Auth + RLS)
- **Build:** Vite
- **Deployment:** Netlify

## Prerequisites

- Node.js 18+
- Supabase account (free tier)
- Netlify account (free tier)

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

## Deployment (Netlify)

1. Push to GitHub.
2. Connect repo to Netlify.
3. Set build command: `npm run build`
4. Set publish directory: `dist`
5. Add environment variables in Netlify dashboard.

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
