# Beeexy Frontend

Beeexy is implemented as a mobile-first Next.js App Router application. Authentication uses the Beeexy Phase 2 API; several existing product-demo data flows still use Supabase or local review fixtures until their later API phases are available.

## Included in the first vertical slice

- PWA manifest, installable shell, safe offline page, and public-asset-only service worker
- Beeexy email OTP and Google authentication with rotating sessions
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
3. Copy `.env.example` to `.env.local`.
4. Set `NEXT_PUBLIC_API_BASE_URL=http://localhost:5105` and the development `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
5. If working on the legacy demo-data flows, add the optional Supabase URL and anon key and apply `supabase/migrations/202608180001_initial_beeexy.sql`.
6. Start the Beeexy backend on `http://localhost:5105` and run `npm run dev` for the frontend on `http://localhost:3000`.

The backend returns its access and refresh tokens in JSON. The current browser client stores only the active token pair, expirations, and account summary under `beeexy:session` in local storage, atomically replaces both tokens after rotation, and removes the session on invalid refresh or logout. Account and patient objects are always reloaded from `/auth/me` and `/patients/me`; locally stored identity data is not treated as authoritative.

## Manual authentication verification

1. Start the backend and confirm `http://localhost:5105/health/ready` is healthy.
2. Start the frontend at `http://localhost:3000`; this is the origin the backend CORS list must allow.
3. Complete onboarding, request a code using a real inbox, enter the delivered OTP, and confirm `/auth/me` then `/patients/me` complete before `/home` opens.
4. Sign out from Settings and confirm local session storage is removed and `/login` opens.
5. For Google, use the rendered Google Identity Services button, complete the account chooser, and confirm the returned ID credential is exchanged before the same Beeexy bootstrap runs.

Without Supabase variables, later-phase product-demo data continues in local review mode. This does not affect Beeexy API authentication.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Use only synthetic data until privacy, security, compliance, and clinical reviews are complete. The presence of Supabase, HTTPS, or security controls does not constitute HIPAA certification.
