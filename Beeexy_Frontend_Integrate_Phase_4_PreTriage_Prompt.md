# Codex Prompt — Integrate Beeexy Phase 4 Pre-Triage into the Frontend

You are working in the Beeexy frontend repository.

Your task is to implement the **frontend integration for Beeexy Phase 4 — Pre-Triage** using the backend contract documented in:

```text
frontend-api-phase-4.md
```

Treat that file as the primary frontend integration contract for Phase 4.

Do not implement backend behavior in this task.

Do not redesign Phase 2 authentication or Phase 3 My Circle unless a small integration adjustment is required to support the Phase 4 flow.

---

# 1. Mandatory review before coding

Before changing anything:

1. Read `frontend-api-phase-4.md` completely.
2. Inspect the current frontend architecture.
3. Inspect the existing Phase 2 authentication integration.
4. Inspect the existing Phase 3 patient/My Circle integration.
5. Inspect the centralized Beeexy API client and session handling.
6. Inspect current route protection / auth boundaries.
7. Inspect current patient-provider / active-patient state.
8. Inspect the existing onboarding/login flow.
9. Inspect the current Home / My Health / My Circle navigation.
10. Inspect current styling and design conventions.
11. Run the existing frontend test/lint/typecheck/build suite before making changes.

The backend documentation and actual frontend architecture are authoritative.

Do not invent request/response contracts.

Do not hardcode behavior that `frontend-api-phase-4.md` says should come from the backend.

---

# 2. Objective

Implement the complete frontend-facing Phase 4 Pre-Triage experience.

The main flows are:

```text
A. Authenticated Pre-Triage
Home
→ Choose patient
→ Choose symptom
→ Questions
→ Review
→ Complete
→ Result
```

```text
B. Anonymous Pre-Triage
Login
→ Continue as guest
→ Choose symptom
→ Questions
→ Complete
→ Result
→ Sign in to save
```

```text
C. Anonymous → Claim
Anonymous result
→ Sign in / register
→ Claim
→ Result saved to primary profile
```

```text
D. AI-assisted intake
Choose symptom
→ Tell Beeexy what you're feeling
→ backend interprets/validates what it can
→ backend returns deterministic progression
→ frontend asks only missing fields
→ Complete
```

The frontend must support structured intake even when AI is unavailable.

---

# 3. Login screen change — Continue as guest

Update the existing Beeexy login screen so it includes a clearly visible secondary action equivalent to:

```text
Continue as guest
```

or repository-consistent wording.

This is the entry point for anonymous Pre-Triage.

Requirements:

- preserve the existing email login;
- preserve Google login;
- do not bypass auth state incorrectly;
- do not mark the user as authenticated;
- do not create a fake local account;
- do not reset onboarding completion;
- guest mode should route only into the anonymous Pre-Triage flow, not the authenticated application shell.

The login UI should conceptually offer:

```text
Continue with Google
Continue with Email

or

Continue as guest
```

Use the current visual language.

Do not redesign the entire login screen unless needed for clean integration.

---

# 4. Guest routing boundary

Guest mode must not unlock the full authenticated app.

A guest may access only the anonymous Pre-Triage flow and its result/claim transition.

Do not allow guest access to:

- Home
- Settings
- My Circle
- patient demographics
- authenticated-only features
- protected application routes

Create a clear guest-flow route boundary.

Suggested conceptual routes, if consistent with the current router:

```text
/pre-triage
/pre-triage/[sessionId]
/pre-triage/[sessionId]/review
/pre-triage/[sessionId]/result
```

Exact route names may follow the current project structure.

Do not create duplicate authenticated/guest pages if the same flow components can safely support both modes.

---

# 5. Authenticated entry flow

For authenticated users, integrate Pre-Triage from an appropriate existing app entry point.

Prefer the current Home/My Health design rather than inventing a new top-level product section.

The authenticated flow is:

```text
Home / My Health
→ Start Pre-Triage
→ choose patient
→ choose symptom
→ questions
→ review
→ complete
→ result
```

If an `activePatient` is already selected in the Phase 3 patient provider, reuse it.

If multiple accessible patients exist, provide a clear patient selector before creating the session.

Do not reimplement My Circle API logic.

---

# 6. Patient selection

Authenticated Pre-Triage must use the existing Phase 3 patient state.

Support:

- primary patient;
- managed patient with active access.

The frontend should display enough identity to distinguish patients using existing safe data such as first/last name.

Do not use Beeexy ID as authorization logic.

Do not locally decide whether a patient is authorized beyond using backend-provided accessible-patient state.

Backend authorization remains authoritative.

---

# 7. Symptom selection

Provide the exact supported symptom options:

```text
Headache
Stomach pain
Fever
```

Map them exactly to backend codes:

```text
Headache     → HEADACHE
Stomach pain → ABDOMINAL_PAIN
Fever        → FEVER
```

Do not show unsupported Phase 4 pathways as selectable demo options.

Do not expose:

- CHEST_PAIN
- OTHER_SYMPTOMS
- RESPIRATORY_SYMPTOMS
- BACK_PAIN

unless they are explicitly meant to appear in the UI as disabled/non-supported content, and only if that is already part of current product design.

Prefer not to show unsupported pathways in the main demo flow.

---

# 8. Start session API integration

Implement the frontend client integration for:

```http
POST /api/v1/pre-triage/sessions
```

Use the exact contract from `frontend-api-phase-4.md`.

Support:

## Authenticated

Use the centralized Bearer/session API client.

Use the selected patient according to the documented contract.

## Anonymous

Call without Bearer.

Store the returned:

```text
sessionId
anonymous capability
expiresAt
```

using the exact response field names.

The capability is returned only once.

Never log it.

Never put it into a URL.

Never send it to analytics/error reporting.

---

# 9. Anonymous Pre-Triage local state

Create a small dedicated frontend state/storage layer for anonymous Pre-Triage.

It should track only what the guest flow needs, conceptually:

```ts
type AnonymousPreTriageState = {
  sessionId: string
  capability: string
  expiresAt: string
  pathway: ...
}
```

Use exact API types where possible.

The state should survive the route changes required to:

```text
questions
→ result
→ login
→ claim
```

If persistence across page refresh is required, use the smallest existing client-storage convention.

Do not store extra health data unnecessarily if it can be fetched from backend state.

Never mix the anonymous capability into the authenticated Beeexy token storage.

---

# 10. Anonymous state cleanup

Clear anonymous local state when:

- the flow expires;
- backend returns the documented unavailable/expired state;
- claim succeeds;
- user explicitly abandons/restarts the anonymous flow.

Do not accidentally clear it when the user is sent to login for the purpose of claiming.

The capability must survive the authentication transition long enough to perform claim.

---

# 11. Answer endpoint integration

Implement:

```http
POST /api/v1/pre-triage/sessions/{id}/answers
```

according to `frontend-api-phase-4.md`.

Support both:

```text
structured mode
natural-language mode
```

through the centralized API layer.

For anonymous requests:

```text
X-Pre-Triage-Capability
```

must be attached exactly as documented.

For authenticated requests:

use the existing Bearer client.

Do not create ad-hoc fetch logic scattered across components.

---

# 12. Structured intake UI

Implement a clean structured intake experience for the current minimum dataset.

The frontend must be capable of rendering:

## Duration

Use:

```text
numeric value
+
unit
```

Allowed units are exactly the values documented by the backend, currently expected to be:

```text
MINUTES
HOURS
DAYS
WEEKS
MONTHS
```

Render user-friendly labels while sending exact API codes.

## Intensity

Support only:

```text
1–10
```

Use an accessible selector suitable for the existing design.

Do not map visual intensity to clinical urgency.

## Additional symptoms

Use only:

```text
Nausea
Diarrhea
Fever
```

mapped to:

```text
NAUSEA
DIARRHEA
FEVER
```

For primary `FEVER`, do not show `FEVER` as an applicable additional option.

The frontend should also handle backend rejection safely if stale UI somehow submits it.

---

# 13. Backend-driven progression

This is critical.

Do not hardcode frontend questionnaire progression as the primary source of truth.

Use the Phase 4.6 response metadata documented in `frontend-api-phase-4.md`.

The backend determines:

- what has been accepted;
- what is missing;
- what question comes next;
- which options are valid;
- whether clarification is required;
- whether the session is `READY_TO_COMPLETE`.

The frontend should render the next step from backend progression metadata.

You may use the known demo question types to choose UI widgets, but do not locally decide clinical/questionnaire sequencing independently.

---

# 14. Natural-language input

Implement an optional natural-language input experience.

Example:

```text
Tell Beeexy what you're feeling
```

The user may enter something like:

```text
I've had stomach pain since yesterday, it's about a 6 out of 10 and I feel nauseous.
```

Send it using the exact natural-language request contract.

The frontend must handle:

- accepted extraction;
- multiple accepted fields;
- clarification required;
- ambiguous input;
- provider unavailable;
- provider failure;
- unsafe/out-of-scope input.

Do not display raw provider details.

---

# 15. AI fallback

AI-assisted input must not be required for the flow to work.

If the backend returns the documented provider-unavailable or clarification state:

show a neutral fallback such as:

```text
Let's continue with a few quick questions.
```

Then continue using structured controls.

Do not show technical provider names or errors.

Do not block the user from completing Pre-Triage merely because AI is unavailable.

---

# 16. Safety UX

Map backend safety outcomes into calm, non-clinical UI messages.

For examples such as:

```text
OUT_OF_SCOPE
PRESCRIPTION_REQUEST
PROHIBITED_MEDICAL_ADVICE
POTENTIAL_PROMPT_INJECTION
UNSUPPORTED_CLINICAL_REQUEST
AMBIGUOUS
```

use the exact stable public response semantics exposed by the backend.

Do not attempt to reproduce backend safety classification locally.

Do not provide medication recommendations or diagnoses in frontend fallback copy.

---

# 17. Review screen

When backend progression reaches:

```text
READY_TO_COMPLETE
```

show a review screen before completion.

Display:

```text
Primary symptom
Duration
Intensity
Additional symptoms
```

using the current backend-confirmed state.

Example:

```text
Stomach pain

Duration
2 days

Intensity
6/10

Additional symptoms
Nausea
```

The review is informational.

Do not add urgency or diagnostic interpretation.

Provide:

```text
Complete Pre-Triage
```

as the primary action.

---

# 18. Completion API

Integrate:

```http
POST /api/v1/pre-triage/sessions/{id}/complete
```

according to the documented authentication/capability rules.

Handle:

- first completion;
- idempotent repeated completion;
- incomplete flow;
- expired/unavailable flow;
- authorization/capability errors;
- validation failures.

Do not locally create a result before the backend confirms completion.

---

# 19. Result screen

Use:

```http
GET /api/v1/pre-triage/sessions/{id}/result
```

or the completion response if `frontend-api-phase-4.md` confirms the full canonical result is returned directly.

Render the canonical neutral result.

At minimum show user-friendly versions of:

- primary symptom;
- duration;
- intensity;
- additional symptoms;
- completion time where useful.

Do not show technical package/provenance fields to the user unless existing product design explicitly wants them.

Those fields should remain available in API types/state for traceability if needed.

---

# 20. No unsupported clinical result UI

Do not display:

- urgency badge;
- risk level;
- disposition;
- diagnosis;
- possible-condition percentages;
- medication recommendation;
- treatment plan;
- emergency recommendation;
- red-flag status.

The backend does not produce these in the current Phase 4 demo.

Do not infer them from intensity, duration, symptom selection, or AI output.

---

# 21. Authenticated result experience

For authenticated Pre-Triage, after completion/result:

provide a clean action back into the authenticated Beeexy experience.

Examples consistent with current app design might include:

```text
Done
Back to Home
Continue
```

Do not invent Clinical History navigation unless such a route/API actually exists.

Phase 4.10 only prepares data internally; there is no Phase 4 Clinical History read API.

---

# 22. Anonymous result screen

For guest Pre-Triage, after result show the neutral summary plus a clear save action:

```text
Save this Pre-Triage to Beeexy
```

or:

```text
Sign in to save
```

The primary action should route the guest through the existing authentication flow.

Do not immediately destroy the guest session/capability.

---

# 23. Preserve pending anonymous claim through login

This is one of the most important integration requirements.

When an anonymous user chooses:

```text
Sign in to save
```

preserve enough local pending-claim state to survive:

```text
anonymous result
→ login
→ email OTP or Google authentication
→ authenticated bootstrap
```

After successful authentication and bootstrap, detect the pending anonymous Pre-Triage claim and continue to the claim step.

Do not ask the user to manually enter the capability.

Do not expose it in the URL.

---

# 24. Claim API integration

Integrate:

```http
POST /api/v1/pre-triage/sessions/{id}/claim
```

The request must include:

```text
Bearer token
+
anonymous capability
```

There is no patient selector.

Do not send:

```text
patientId
profileId
beeexyId
```

The backend always claims to the authenticated account's primary patient.

---

# 25. Claim success UX

On successful claim:

1. clear pending anonymous capability/claim state;
2. retain the normal authenticated Beeexy session;
3. refresh any relevant patient/application state if needed;
4. show confirmation such as:
   ```text
   Pre-Triage saved to your Beeexy profile.
   ```
5. route to the authenticated result or an appropriate authenticated screen.

Do not imply it was clinically reviewed.

Do not attempt to move it to a managed patient.

---

# 26. Claim conflict / expiry UX

Handle documented claim errors.

## Already claimed by another patient / `409`

Show a neutral message such as:

```text
This Pre-Triage can no longer be saved to this profile.
```

Do not reveal another patient's existence or identity.

## Expired / unavailable

Clear pending claim state and offer:

```text
Start a new Pre-Triage
```

Do not repeatedly retry a permanently unavailable claim.

---

# 27. Guest expiry behavior

Use the backend-provided expiry as authoritative.

If the local anonymous state is clearly past expiry, avoid presenting stale "resume/save" affordances.

Backend remains authoritative, so still handle server-side concealed `404` or equivalent safely.

On expiry/unavailability:

- clear anonymous flow state;
- route to a safe restart screen;
- do not expose cleanup internals.

---

# 28. Route protection

Ensure protected application routes still require authenticated bootstrap.

Ensure anonymous Pre-Triage routes do not accidentally depend on authenticated patient-provider initialization.

The shared Pre-Triage components should accept an explicit execution mode where appropriate:

```text
anonymous
authenticated
```

Avoid fragile assumptions such as:

```text
auth user always exists
```

inside reusable Pre-Triage UI.

---

# 29. API module

Create a focused Phase 4 API module under the existing Beeexy API structure, for example:

```text
src/lib/beeexy-api/phase-4-api.ts
```

or repository-equivalent.

Include typed functions equivalent to:

```ts
startPreTriage(...)
submitPreTriageAnswers(...)
completePreTriage(...)
getPreTriageResult(...)
claimAnonymousPreTriage(...)
```

Reuse the centralized client.

Do not duplicate auth refresh/retry behavior.

---

# 30. TypeScript contracts

Translate the documented Phase 4 contracts into frontend TypeScript types.

Prefer extending the existing central contracts file if that is the repository convention.

At minimum support:

- primary pathway code;
- additional symptom code;
- duration unit;
- session start request/response;
- structured answer request;
- natural-language answer request;
- progression response;
- next-question metadata;
- clarification/provider-unavailable state;
- completion response;
- canonical result response;
- claim response;
- public/stable Problem Details fields.

Do not expose backend-only domain entities.

---

# 31. Pre-Triage state layer

Create a focused state/provider/controller appropriate to current architecture.

It should manage:

- current session ID;
- anonymous vs authenticated mode;
- selected patient for authenticated mode;
- primary pathway;
- anonymous capability if guest;
- expiry;
- current progression;
- accepted current answer state for rendering;
- current result;
- pending claim state;
- loading/error state.

Avoid mixing this state into the Phase 2 auth provider unless a tiny pending-claim handoff flag is necessary.

---

# 32. Do not duplicate backend state unnecessarily

The backend is authoritative for session progress.

Do not build a large independent frontend copy of the questionnaire state machine.

Frontend state should be primarily:

```text
what is needed to render the current backend state
```

rather than:

```text
a second clinical/questionnaire engine
```

---

# 33. Reload/resume behavior

The current MVP explicitly does not support general resume-after-abandonment.

Do not invent backend resume APIs.

For a currently active same-browser anonymous flow, preserving enough local `sessionId + capability` to continue route navigation/reload may be acceptable if the documented endpoint behavior supports it.

For authenticated flow, do not invent a session-list/resume feature if no API exists.

If reload restoration is limited by available API contracts, fail safely and restart rather than fabricating progress.

Document any limitation in the completion report.

---

# 34. Error handling

Use the existing centralized Problem Details parser.

Do not branch on raw human-readable `detail` when stable status/code fields exist.

Handle:

- `400`
- `401`
- concealed `404`
- `409`
- `422`
- `429` only if actually documented for a Phase 4 route
- `500`

according to `frontend-api-phase-4.md`.

Provide neutral user-facing messages.

Do not expose backend internals.

---

# 35. Auth refresh behavior

Authenticated Phase 4 requests must use the existing centralized Bearer refresh/retry system from Phase 2.

Do not implement a second refresh mechanism.

For claim:

- Bearer should still use central auth handling;
- anonymous capability must remain attached through the retry if the centralized client retries the request.

Make sure a refresh does not drop the capability header.

Add tests.

---

# 36. Anonymous requests and centralized client

Extend the centralized client cleanly so anonymous Phase 4 requests can:

```text
omit Bearer
+
include X-Pre-Triage-Capability when needed
```

without globally disabling authentication behavior for other requests.

Do not make anonymous mode a global app state that leaks into unrelated API calls.

---

# 37. UI reuse

Use existing Beeexy UI primitives, typography, buttons, cards, fields, spacing, animations, and mobile layout.

Do not introduce a second design system.

The Pre-Triage experience should feel like part of the current Beeexy frontend.

Preserve responsive/mobile-first behavior.

---

# 38. Accessibility

Ensure:

- form controls have labels;
- intensity control is keyboard accessible;
- multi-select symptoms have clear selected states;
- loading states are announced where appropriate;
- errors are associated with relevant fields;
- buttons are disabled during duplicate submission;
- focus moves sensibly on next-step/clarification changes.

Do not sacrifice accessibility for animation.

---

# 39. Loading / duplicate submission protection

Prevent accidental double submissions for:

- session start;
- answer submission;
- completion;
- claim.

The backend is idempotent in important places, but frontend should still provide proper loading/disabled states.

Do not create spinner loops on idempotent success responses.

---

# 40. Tests — API contracts

Add tests for all five Phase 4 API client functions.

Verify:

- exact paths;
- methods;
- request bodies;
- Bearer behavior;
- capability header behavior;
- claim dual credentials;
- no patient selector in claim;
- exact response parsing;
- Problem Details parsing.

---

# 41. Tests — login guest entry

Test:

- `Continue as guest` is visible;
- selecting it does not authenticate;
- user enters anonymous Pre-Triage flow;
- protected app routes remain protected;
- email/Google auth still work.

---

# 42. Tests — supported symptoms

Verify UI shows exactly:

```text
Headache
Stomach pain
Fever
```

and sends exact codes:

```text
HEADACHE
ABDOMINAL_PAIN
FEVER
```

No unsupported pathway should appear as a normal selectable demo option.

---

# 43. Tests — additional symptoms

Verify:

## HEADACHE

Allowed UI options:

```text
Nausea
Diarrhea
Fever
```

## STOMACH PAIN

Allowed:

```text
Nausea
Diarrhea
Fever
```

## FEVER

Allowed:

```text
Nausea
Diarrhea
```

No fourth option.

Backend error should also be handled if stale data attempts invalid FEVER self-addition.

---

# 44. Tests — progression

Mock real backend response contracts.

Verify:

- next question comes from backend response;
- accepted answer updates UI;
- already answered field is skipped when backend progression says so;
- multi-field natural-language acceptance can skip multiple controls;
- `READY_TO_COMPLETE` transitions to review;
- frontend does not independently infer clinical completeness.

---

# 45. Tests — structured fallback

Simulate AI unavailable.

Verify:

- natural-language attempt receives provider-unavailable/clarification state;
- user gets structured controls;
- structured intake continues successfully;
- completion remains available.

---

# 46. Tests — anonymous complete journey

Test:

```text
Login
→ Continue as guest
→ choose symptom
→ start
→ answer
→ review
→ complete
→ result
```

Verify:

- capability persists only in intended local state;
- correct header is sent;
- no Bearer required;
- result is neutral.

---

# 47. Tests — anonymous claim journey

Test:

```text
anonymous result
→ Sign in to save
→ existing login flow
→ successful auth bootstrap
→ automatic/explicit claim continuation
→ claim success
```

Verify:

- pending claim state survives login;
- claim sends Bearer + capability;
- no patient ID is sent;
- pending capability cleared on success;
- authenticated session remains;
- success confirmation appears.

---

# 48. Tests — claim errors

Cover:

- expired claim;
- conflict `409`;
- missing pending capability;
- invalid capability;
- auth failure;
- network/server failure.

Ensure privacy-safe messaging.

---

# 49. Tests — result limitations

Verify result UI does not render:

```text
urgency
risk level
diagnosis
probability
treatment
prescription
recommendation
red flags
```

Do not add placeholder UI for these.

---

# 50. Tests — logout / anonymous interaction

Preserve existing logout behavior.

If an authenticated user logs out while not in a pending anonymous claim flow, do not create guest Pre-Triage state automatically.

If a pending anonymous claim exists during an auth transition failure, preserve only what is necessary to let the user retry safely until expiry.

Do not leak capability into logs.

---

# 51. Phase 4.10 / History boundary

Do not implement Clinical History API integration.

The backend only creates an internal projection record.

Do not add:

```text
History list
History detail
Timeline
```

unless those already exist for unrelated frontend demo data and can remain untouched.

Do not pretend Phase 4 results are retrievable through a History API.

---

# 52. No backend changes

This task is frontend integration only.

Do not modify backend source.

If `frontend-api-phase-4.md` reveals a backend contract issue, report it rather than silently changing frontend expectations.

---

# 53. No production AI-provider setup

Do not configure OpenAI/Gemini/NVIDIA/Ollama credentials in the frontend.

Do not call external AI providers directly from the browser.

All natural-language interpretation goes through the Beeexy backend.

The frontend must remain provider-agnostic.

---

# 54. No FHIR

Do not implement FHIR UI or API integration.

---

# 55. Verification

Before completion run:

1. existing tests;
2. new Phase 4 API tests;
3. guest-entry tests;
4. authenticated Pre-Triage flow tests;
5. anonymous flow tests;
6. pending-claim-through-login tests;
7. AI unavailable fallback tests;
8. FEVER exclusion tests;
9. error handling tests;
10. TypeScript check;
11. ESLint;
12. production build;
13. repository formatting checks if configured;
14. `git diff --check`;
15. scan Phase 4 frontend code for accidental logging of:
   - capability;
   - Bearer/access/refresh token;
   - OTP;
   - Google credential;
   - patient medical answers where not needed.

Do not require a live AI provider for automated tests.

---

# 56. Acceptance criteria

The implementation is complete only if:

1. Login includes a working `Continue as guest`.
2. Guest mode does not unlock protected app routes.
3. Authenticated users can start Pre-Triage for an authorized current/selected patient.
4. Anonymous users can start Pre-Triage without an account.
5. Supported symptoms are exactly Headache, Stomach pain, Fever.
6. Session start integrates with backend correctly.
7. Anonymous capability is stored safely and sent only where required.
8. Structured intake works end-to-end.
9. Natural-language input uses backend integration.
10. AI unavailable falls back to structured intake.
11. Backend progression drives the question flow.
12. FEVER additional-symptom exclusion is correctly rendered.
13. No fourth additional symptom exists.
14. Review screen appears at backend `READY_TO_COMPLETE`.
15. Completion endpoint is integrated.
16. Result endpoint/contract is integrated.
17. Result UI is neutral and contains no unsupported clinical authority.
18. Anonymous result offers sign-in/save action.
19. Pending anonymous claim survives email/Google authentication flow.
20. Claim sends Bearer + capability and no patient selector.
21. Successful claim clears guest claim state.
22. Expired/unavailable guest flow resets safely.
23. Existing Phase 2 login/session/refresh/logout behavior remains intact.
24. Existing Phase 3 patient/My Circle behavior remains intact.
25. No Clinical History API is assumed.
26. No external AI provider is called from frontend.
27. TypeScript, ESLint, tests, and production build pass.

---

# 57. Completion report

When done report:

## Implemented flow

Show the final routes/screens and transitions for:

### Authenticated
```text
Home/My Health
→ patient
→ symptom
→ intake
→ review
→ result
```

### Anonymous
```text
Login
→ Continue as guest
→ symptom
→ intake
→ review
→ result
→ Sign in to save
```

### Claim
```text
anonymous result
→ login
→ auth bootstrap
→ claim
→ saved
```

## API integration
List all five integrated endpoints.

## Guest state
Explain capability storage/lifecycle.

## Patient state
Explain how active/selected patient is used.

## Intake
Explain structured + natural-language modes.

## AI fallback
Explain provider-unavailable behavior.

## Progression
Confirm backend controls next-question/readiness.

## Result
Confirm neutral summary and forbidden UI not present.

## Claim
Explain login handoff and dual credential request.

## Errors
Summarize key UX handling.

## Files changed
List all created/modified files.

## Tests
Provide exact:
- total tests;
- new Phase 4 tests;
- TypeScript result;
- ESLint result;
- production build result;
- `git diff --check`.

## Backend discrepancies
If `frontend-api-phase-4.md` and implementation disagree, list them.

If none:

```text
No backend contract discrepancy found.
```

## Remaining work
Explicitly mention:
- production AI provider still backend-side/deferred if not configured;
- Clinical History frontend API is not yet available;
- urgency/diagnosis/recommendation UI remains unsupported.

---

# STOP CONDITION

STOP after integrating the existing Phase 4 API into the frontend.

Do not implement Phase 5.

Do not implement Clinical History API/UI.

Do not add clinical urgency, diagnosis, treatment, or recommendation UI.

Do not call external AI providers directly.

Do not modify backend code.
