# Beeexy Frontend

Beeexy is implemented as a mobile-first Next.js App Router application. Authentication uses the Beeexy Phase 2 API; several existing product-demo data flows still use Supabase or local review fixtures until their later API phases are available.

## Private Demo Access

The deployed demo is wrapped in a separate Private Access boundary before normal Beeexy authentication. On every fresh application load, the browser checks `GET /api/v1/private-access/session`; protected providers and route content do not mount until that endpoint confirms access. The gate sends username, password, and keyword only to the documented login endpoint and never stores them in browser persistence.

After Private Access succeeds, the frontend sends a bodyless `POST /api/v1/private-access/guest-session`. Its normal Beeexy authentication DTO is hydrated through the existing token store and account/profile bootstrap, so private-demo visitors enter the application without Google or email Login. A valid private cookie with no usable Beeexy session automatically requests a new Demo Guest session.

All Beeexy API requests use `credentials: "include"` through the shared API client. A protected request returning `401` with the exact Problem Details title `Private access required.` returns the UI to the gate without treating ordinary Beeexy authentication failures as private-session expiry. The backend contract is documented in `frontend-api-private-access.md`.

The existing email, Google, login, and onboarding implementation remains in the repository. Signing out of the private demo revokes the current normal Beeexy session first, clears its local auth state, and then clears the Private Access cookie. Demo visitors share the same persistent patient data; demo activity is not automatically reset between visitors.

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
2. Start the frontend at `http://localhost:3000`; this exact origin must be present in the backend CORS list.
3. Enter the configured Private Demo Access details and confirm `POST /private-access/guest-session`, `/auth/me`, and `/patients/me` complete without opening normal Login.
4. Refresh with the private cookie present and local Beeexy auth removed; confirm a new Demo Guest session is issued without asking for the shared credentials again.
5. Sign out from Settings and confirm both the normal Beeexy session and Private Access cookie are cleared before the gate returns.
6. Confirm a `503 Demo Guest unavailable.` response shows the non-looping temporary-unavailable state.

Without Supabase variables, later-phase product-demo data continues in local review mode. This does not affect Beeexy API authentication.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Use only synthetic data until privacy, security, compliance, and clinical reviews are complete. The presence of Supabase, HTTPS, or security controls does not constitute HIPAA certification.
