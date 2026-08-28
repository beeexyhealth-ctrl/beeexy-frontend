# Codex Prompt — Frontend Implementation of Database-Backed Private Tester Access

You are working on the Beeexy frontend.

## Goal

Implement the new **Database-Backed Private Tester Access** frontend flow based on the backend integration contract.

The backend has already been redesigned so that each private tester has their own:
- Private Access credential
- Beeexy `Account`
- `PatientProfile`
- `UserPreference`
- normal Beeexy authentication tokens
- isolated patient-scoped clinical data

The frontend must support the new single-step Database login while **temporarily preserving compatibility with the existing Legacy flow** during rollout.

## Mandatory documentation to read first

Before changing any code, read this file completely:

```text
frontend-api-private-tester-access.md
```

Treat it as the **source of truth** for endpoint paths, HTTP status codes, request/response payloads, cookie behavior, auth token behavior, ProblemDetails handling, Legacy vs Database branching, logout/session behavior, and rollout compatibility.

Also inspect the existing frontend implementation for Private Access login, `createDemoGuestSession()` / guest-session, Beeexy API client, auth state/store/provider, token hydration, refresh, logout, `/auth/me`, `/patients/me`, private-access session checks, gate/session expiration handling, and tests related to Private Access.

Do not guess API behavior. If the current frontend implementation conflicts with `frontend-api-private-tester-access.md`, follow the new document and report the discrepancy.

## Required behavior

### 1. Keep the existing login form

Continue using the current Private Access credentials:

```json
{
  "username": "...",
  "password": "...",
  "keyword": "..."
}
```

Submit them to:

```text
POST /api/v1/private-access/login
```

The request must use:

```ts
credentials: "include"
```

Preserve the current polished Beeexy Private Access UI unless a small UX adjustment is required by the new behavior.

Do not persist the username/password/keyword beyond what the existing login UX genuinely requires. Never store password or keyword in localStorage, sessionStorage, IndexedDB, frontend-created cookies, analytics, telemetry, URLs, or logs.

### 2. Implement dual-mode success handling

The backend does not expose the authentication mode explicitly. The frontend must branch on the HTTP status returned from:

```text
POST /api/v1/private-access/login
```

#### Legacy success

If login returns:

```text
204 No Content
```

preserve the existing Legacy behavior:

```text
POST /api/v1/private-access/guest-session
```

Requirements:
- method `POST`
- no body
- no query parameters
- `credentials: "include"`
- expect `200 OK`
- parse the normal `AuthenticationTokenResponse`
- hydrate the existing Beeexy auth state
- continue the normal authenticated application initialization

Do not alter the Legacy flow unnecessarily.

#### Database success

If login returns:

```text
200 OK
```

the response body is the normal Beeexy authentication response:

```ts
interface AuthenticationTokenResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  account: {
    accountId: string;
    profileId: string;
    beeexyId: string;
  };
}
```

For this path:
1. Parse the response.
2. Hydrate the existing Beeexy auth store/state directly.
3. Continue the existing authenticated app initialization.
4. Load normal user/patient state using the frontend's existing mechanisms, including `/api/v1/auth/me` and `/api/v1/patients/me` where already applicable.
5. **Do not call `/api/v1/private-access/guest-session`.**

This is the new single-step login path.

### 3. Model the login result explicitly

Prefer a typed discriminated result rather than returning an ambiguous nullable response.

A shape equivalent to this is acceptable if it fits the existing API client architecture:

```ts
type PrivateAccessLoginOutcome =
  | { kind: "legacy" }
  | {
      kind: "database";
      authentication: AuthenticationTokenResponse;
    };
```

The implementation must determine the branch from the **HTTP status**, not from whether a body happens to exist.

Do not use `any`. Reuse existing shared authentication contracts if they already model the normal Beeexy auth response correctly. Avoid duplicating DTOs unnecessarily.

### 4. Preserve normal Beeexy authentication behavior

Database-backed private testers are normal Beeexy Accounts/Patients after authentication.

Do not add frontend concepts such as:

```ts
isDemoTester
isPrivateTester
demoProfile
testerPatient
```

unless the current backend contract explicitly requires them.

Do not introduce tester-specific behavior into Pre-Triage, Clinical History, FHIR, patient selectors, future patient-scoped features, or general authenticated API calls.

The tester's `Account` and `PatientProfile` should flow through the same normal auth/patient state already used elsewhere.

### 5. Private Access cookie behavior

The backend owns the HTTP-only:

```text
beeexy-private-access
```

cookie.

Frontend JavaScript must never attempt to read it, construct it, persist a copy, or infer tester identity from it.

Cross-origin requests that participate in Private Access must continue using:

```ts
credentials: "include"
```

This includes at minimum login, private-access session checks, private-access logout, Legacy guest-session, and normal API calls that pass through the Private Access gate.

Inspect the shared API client and preserve the existing global credential behavior if it already correctly applies `credentials: "include"`. Do not add redundant per-call hacks if the API client already handles this at the correct abstraction level.

### 6. Error handling

Implement the exact semantics documented by the backend.

#### `400`
Invalid/malformed request. Show a generic form/request validation error.

#### `401` from login
Unknown username, bad password, bad keyword, disabled tester, revoked tester, disabled Account, and invalid identity relationships intentionally resolve to the same generic response.

The UI must show one generic message equivalent to:

```text
The private access credentials are invalid.
```

Do not reveal whether username exists, password was wrong, keyword was wrong, account was disabled, or tester was revoked.

#### `429`
Respect the backend `Retry-After` header. While the retry period is active, prevent accidental repeated submissions, communicate that the user should try again later, and do not hammer the endpoint.

#### Gate `401`
If an authenticated application request is rejected because the Private Access gate is no longer valid:
- clear the normal frontend auth state
- return the user to the Private Access screen
- do not attempt to distinguish expiry vs revocation vs deactivation vs malformed cookie

#### Legacy guest-session `503`
This must not occur in the normal Database `200` path because that path must never call guest-session. If received during the transitional Legacy branch, handle it as an unavailable demo/session condition using the existing UX, but do not retry guest-session from a Database login.

### 7. Authentication lifecycle must remain intact

Preserve the current normal Beeexy auth lifecycle.

Refresh continues through:

```text
POST /api/v1/auth/refresh
```

Normal authenticated API requests continue using:

```text
Authorization: Bearer <accessToken>
```

The Private Tester Access logout should call:

```text
POST /api/v1/private-access/logout
```

with:

```ts
credentials: "include"
```

On success:
- clear frontend normal auth state
- clear any private-access UI/session state owned by the frontend
- return to the Private Access screen as appropriate

Do not try to manually clear the HTTP-only backend cookie.

### 8. Existing frontend UX must continue working

Preserve the current Private Demo / Private Access UX as much as possible. This should be primarily behavioral/API integration work, not a redesign.

Do not break login UI, loading states, validation, mobile behavior, existing animations/styles, navigation after authentication, refresh behavior, logout, patient/profile bootstrap, Pre-Triage, Clinical History, FHIR, or other existing application routes.

Do not introduce a second login page for Database mode. The user should not need to know whether the backend is in Legacy or Database mode.

### 9. Remove incorrect assumptions around the shared Demo Guest

Search the frontend for assumptions that successful Private Access always means:

```text
login -> guest-session -> shared Demo Guest
```

Update only what is necessary so the frontend instead supports:

```text
login
  -> 204 => Legacy guest-session
  -> 200 => direct normal Beeexy auth
```

Do not aggressively delete the Legacy flow yet. Legacy support is required temporarily for production rollback compatibility.

### 10. API client implementation

Inspect the existing Beeexy API client before editing.

Ensure the client can represent:
- `204` without authentication body
- `200` with `AuthenticationTokenResponse`

from the same login endpoint.

Do not hide the distinction by converting both into the same shape before the caller can determine the correct next action.

Preserve AbortSignal/cancellation behavior, stale-request protection, existing error parsing, ProblemDetails handling, correlation IDs where already surfaced, credentials inclusion, and existing Bearer-token injection rules.

Avoid creating a second fetch abstraction solely for this feature.

### 11. Session bootstrap / page load behavior

Inspect the current Private Access bootstrap/session check.

The backend endpoint:

```text
GET /api/v1/private-access/session
```

still returns:

```ts
interface PrivateAccessSessionStatusResponse {
  authenticated: boolean;
  expiresAt: string | null;
}
```

Do not assume this endpoint returns normal Beeexy JWT tokens.

Preserve the intended relationship between the Private Access gate session and normal Beeexy authentication state.

Avoid redirect loops.

Avoid automatically calling Legacy guest-session merely because a private-access cookie exists when production is in Database mode.

Use the new backend documentation to determine the correct recovery/bootstrap behavior and align it with the frontend's existing auth store.

If an architectural ambiguity exists around reload/bootstrap in Database mode, inspect the existing auth persistence/refresh implementation and solve it using current Beeexy auth behavior rather than inventing a new tester-specific mechanism. Report any ambiguity clearly in the final result.

### 12. Tests

Add or update regression tests covering at least:

#### API client / contract
- login request uses the exact three fields
- login uses credentials include
- `204` maps to Legacy outcome
- `200` parses Database authentication response
- malformed/unexpected successful responses fail safely
- no `any`-based parsing

#### Legacy path
- `204` login triggers exactly one guest-session request
- guest-session request has no body
- guest-session uses credentials include
- returned tokens hydrate existing auth state
- no duplicate guest-session request occurs

#### Database path
- `200` login hydrates auth directly
- guest-session is never called
- returned account/profile identity is preserved
- existing normal application bootstrap continues

#### Errors
- generic login `401`
- `400`
- `429` with Retry-After behavior
- gate `401` clears auth and returns to Private Access

#### Regression
- refresh still works
- logout still works
- existing Private Access session checking still works
- patient bootstrap still works
- existing authenticated/public request behavior is unchanged

Use the repository's current testing patterns.

### 13. Verification

After implementation run the repository's actual equivalents of:
- Vitest / frontend test suite
- TypeScript typecheck
- ESLint
- production build

Fix issues caused by this change. Do not suppress errors with broad type assertions or lint disables.

### 14. Scope

This task is **frontend only**.

Do not modify the backend.
Do not alter backend endpoint contracts.
Do not modify provisioning behavior.
Do not modify tester database models.
Do not implement admin UI for creating/deactivating testers unless such UI already exists and is explicitly required by the integration contract.
Do not remove Legacy compatibility yet.

### 15. Final report

When finished, report:

1. Exact files changed.
2. Exact TypeScript contract used for the login result.
3. Where `204` vs `200` branching is implemented.
4. How the Legacy flow is preserved.
5. How Database mode avoids `guest-session`.
6. How the normal Beeexy auth store is hydrated from Database login.
7. How page reload/session bootstrap behaves in Database mode.
8. How gate `401` is handled.
9. How `429 Retry-After` is handled.
10. Confirmation that password/keyword are not persisted.
11. Confirmation that no tester-specific branches were added to clinical modules.
12. Tests added/updated.
13. Exact test/typecheck/lint/build results.
14. Any discrepancy found between the frontend codebase and `frontend-api-private-tester-access.md`.
15. Any remaining rollout risk before changing production to:

```text
PrivateAccess__AuthenticationMode=Database
```

Do not claim production readiness unless the implementation and verification results actually support it.
