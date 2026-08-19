# Beeexy Frontend

Beeexy is implemented as a mobile-first Next.js App Router application with a Supabase-backed vertical demo journey.

## Included in the first vertical slice

- PWA manifest, installable shell, safe offline page, and public-asset-only service worker
- Real Supabase email OTP integration
- Resumable Pre-Triage intake
- Explicitly labeled, versioned demo assessment result
- Database-backed synthetic doctor directory and availability
- Conflict-safe appointment booking
- Appointments, notifications, and assessment History
- Minimal My Health and My Circle ownership flow

AI Second Opinion, Care Guide, Symptom Diary, and real My Visit audio processing are intentionally unavailable until their clinical or external-service requirements are approved.

## Local setup

1. Use Node.js 22 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and add a Supabase URL and anon key.
4. Apply `supabase/migrations/202608180001_initial_beeexy.sql` to the Supabase project.
5. Configure email OTP in Supabase Auth and add `http://localhost:3000/auth/callback` plus the deployed callback URL.
6. Run `npm run dev`.

Without Supabase variables, the UI runs in local review mode using browser storage. This is not the production persistence path.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Use only synthetic data until privacy, security, compliance, and clinical reviews are complete. The presence of Supabase, HTTPS, or security controls does not constitute HIPAA certification.
