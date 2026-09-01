# Beeexy Frontend --- Phase 8.1 Implementation Prompt

## Phase 8.1 --- Phase 8 API Client & TypeScript Contracts

Implement **Frontend Phase 8.1: Phase 8 API Client & TypeScript
Contracts** for Beeexy.

This subphase is the frontend integration foundation for the complete
backend **Phase 8 --- Availability and Appointment Requests**.

Before modifying code, read the generated backend/frontend integration
documentation:

`frontend-api-phase-8.md`

Treat that document, the current backend OpenAPI/contracts, and the
existing frontend architecture as the source of truth.

Also inspect the existing frontend API layer, shared TypeScript
contracts, authentication helpers, cancellation/AbortSignal conventions,
ProblemDetails mapping, patient context, Phase 7 doctor/clinic API
integration, tests, and route organization before implementing anything.

Do not proceed to Frontend Phase 8.2 automatically.

------------------------------------------------------------------------

# 1. Objective

Build the reusable frontend integration layer required by later Phase 8
UI work.

Implement:

-   exact TypeScript contracts for all Phase 8 frontend-relevant backend
    DTOs;
-   exact serialized appointment status types;
-   exact serialized appointment modality types;
-   availability slot contracts;
-   appointment summary/detail contracts;
-   status-history contracts;
-   reschedule-history contracts;
-   request contracts;
-   paginated appointment contracts;
-   Phase 8 ProblemDetails/error-code typing where appropriate;
-   API client functions for all eight Phase 8 backend endpoints;
-   safe query serialization;
-   bearer-auth integration;
-   AbortSignal/cancellation support consistent with the existing
    frontend client;
-   normalized frontend error handling;
-   focused tests for client/contracts.

This phase must **not build the Phase 8 UI yet**.

------------------------------------------------------------------------

# 2. Required repository inspection

Before coding inspect:

1.  `frontend-api-phase-8.md`.
2.  Current frontend API client architecture.
3.  Existing shared contract files.
4.  Existing authentication/token attachment.
5.  Existing `ProblemDetails` handling.
6.  Existing `AbortSignal` / request cancellation behavior.
7.  Existing Phase 4--7 API integration patterns.
8.  Existing Phase 7 doctor/clinic contracts and functions.
9.  Existing PatientProfile contracts/context.
10. Existing cursor pagination utilities.
11. Existing test conventions and mocked HTTP helpers.
12. Existing naming/export conventions.

Reuse existing abstractions.

Do not introduce:

-   a second HTTP client;
-   a second error model;
-   a second auth mechanism;
-   a second pagination framework;
-   duplicate Doctor/Clinic domain contracts already available in the
    frontend.

------------------------------------------------------------------------

# 3. Backend Phase 8 endpoint coverage

Implement frontend client support for exactly these eight backend
endpoints:

1.  `GET /api/v1/doctors/{doctorId}/slots`
2.  `POST /api/v1/appointments`
3.  `GET /api/v1/appointments`
4.  `GET /api/v1/appointments/{id}`
5.  `POST /api/v1/appointments/{id}/confirm`
6.  `POST /api/v1/appointments/{id}/reject`
7.  `POST /api/v1/appointments/{id}/cancel`
8.  `POST /api/v1/appointments/{id}/reschedule`

Do not add speculative Phase 9 or POST-MVP endpoints.

------------------------------------------------------------------------

# 4. Contracts

Create or extend the appropriate shared TypeScript contract module.

Use **exact backend JSON property names and serialized enum values**.

Do not invent frontend-only fields inside transport DTOs.

At minimum include the actual equivalents of:

-   `AppointmentStatus`
-   `AppointmentModality`
-   availability slot response
-   appointment summary response
-   appointment detail response
-   appointment status-history item
-   appointment reschedule-history item
-   appointment list/page response
-   create appointment request
-   reschedule appointment request
-   any exact query/filter contracts useful to the client layer
-   ProblemDetails/error response typing if not already shared

Prefer string literal unions when that matches the current frontend
style.

For example, only if it matches the real backend serialization:

``` ts
export type AppointmentStatus =
  | "requested"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "noShow"
  | "rejected";
```

Do **not** assume these exact spellings without verifying
`frontend-api-phase-8.md` and the backend.

The actual backend contract wins.

------------------------------------------------------------------------

# 5. Availability client

Implement a function equivalent to:

``` ts
listDoctorSlots(...)
```

Use the project's actual naming conventions.

It must call:

`GET /api/v1/doctors/{doctorId}/slots`

Support the exact implemented query parameters, including:

-   `from`
-   `to`

where applicable.

Requirements:

-   anonymous request;
-   no bearer requirement unless existing client infrastructure safely
    attaches optional auth by default;
-   correct ISO-8601 serialization;
-   omit undefined query parameters;
-   support AbortSignal;
-   return typed availability-slot data;
-   propagate normalized backend errors.

Do not transform UTC timestamps into browser-local values inside the
transport client.

Transport layer returns backend values as received.

------------------------------------------------------------------------

# 6. Create appointment client

Implement a function equivalent to:

``` ts
createAppointment(...)
```

Call:

`POST /api/v1/appointments`

Requirements:

-   bearer authentication;
-   exact request body;
-   exact response type;
-   support AbortSignal;
-   preserve caller-supplied idempotency key;
-   do not generate backend fingerprint;
-   do not retry automatically with a different idempotency key.

The API function should accept the idempotency key as part of the
request contract or a clearly documented argument, consistent with the
backend contract.

Do not create automatic hidden retry behavior that could accidentally
turn one logical booking attempt into multiple different idempotency
operations.

------------------------------------------------------------------------

# 7. Appointment list client

Implement a function equivalent to:

``` ts
listAppointments(...)
```

Call:

`GET /api/v1/appointments`

Support the exact backend filters documented in
`frontend-api-phase-8.md`, including where implemented:

-   patientId;
-   status;
-   time range;
-   cursor;
-   page-size/limit only if actually supported.

Requirements:

-   bearer authentication;
-   opaque cursor handling;
-   never parse/reconstruct cursor;
-   omit undefined filters;
-   deterministic query serialization;
-   support AbortSignal;
-   typed page response.

Do not add offset/page-number support unless the backend actually
exposes it.

------------------------------------------------------------------------

# 8. Appointment detail client

Implement a function equivalent to:

``` ts
getAppointment(...)
```

Call:

`GET /api/v1/appointments/{id}`

Requirements:

-   bearer authentication;
-   typed detail response;
-   status history included exactly as backend returns it;
-   reschedule history included exactly as backend returns it;
-   support AbortSignal;
-   preserve concealed `404` behavior through normalized error handling.

Do not fetch clinical-history or Pre-Triage data as part of this
function.

------------------------------------------------------------------------

# 9. Confirm client

Implement a function equivalent to:

``` ts
confirmAppointment(...)
```

Call:

`POST /api/v1/appointments/{id}/confirm`

Requirements:

-   bearer authentication;
-   exact response type;
-   no request body unless backend requires one;
-   support AbortSignal;
-   preserve `403`, `404`, and `409` error semantics.

This is a scheduler operation.

Do not expose it as a patient action in this phase.

This phase only builds the client function.

------------------------------------------------------------------------

# 10. Reject client

Implement a function equivalent to:

``` ts
rejectAppointment(...)
```

Call:

`POST /api/v1/appointments/{id}/reject`

Requirements mirror confirm:

-   bearer authentication;
-   exact response type;
-   no speculative body;
-   AbortSignal support;
-   preserve `403`, `404`, `409`.

Do not build scheduler UI.

------------------------------------------------------------------------

# 11. Cancel client

Implement a function equivalent to:

``` ts
cancelAppointment(...)
```

Call:

`POST /api/v1/appointments/{id}/cancel`

Requirements:

-   bearer authentication;
-   exact response type;
-   no invented cancellation reason;
-   support AbortSignal;
-   preserve concealed `404`;
-   preserve `409` invalid-transition behavior.

Do not add cancellation policy logic in the client.

The backend remains authoritative.

------------------------------------------------------------------------

# 12. Reschedule client

Implement a function equivalent to:

``` ts
rescheduleAppointment(...)
```

Call:

`POST /api/v1/appointments/{id}/reschedule`

Use the exact request contract from `frontend-api-phase-8.md`.

Requirements:

-   bearer authentication;
-   exact target-slot request;
-   exact response type;
-   support AbortSignal;
-   preserve `404`, `409`, `422`;
-   do not synthesize scheduling metadata from client time values;
-   target selection must be based on backend `slotId`.

Do not add optimistic local slot mutation inside the transport client.

------------------------------------------------------------------------

# 13. Error handling

Reuse the existing Beeexy frontend error model.

Do not create a second generic API error class unless the current
architecture clearly requires it.

Ensure Phase 8 callers can distinguish important backend outcomes using
the existing normalized error shape and/or machine-readable `errorCode`.

At minimum preserve enough information to distinguish:

-   unauthenticated `401`;
-   scheduler forbidden `403`;
-   concealed/missing resource `404`;
-   slot reservation conflict `409`;
-   incompatible idempotency reuse `409`;
-   invalid transition `409`;
-   reschedule target conflict `409`;
-   concurrency conflict `409`;
-   semantic validation `422`;
-   unexpected `500`.

Use the **exact backend error codes** from `frontend-api-phase-8.md`.

Do not match UI behavior against raw English error messages.

Do not expose backend exception text.

------------------------------------------------------------------------

# 14. Idempotency helper

If the frontend already has a UUID helper, reuse it.

If not, introduce the smallest safe utility needed for later booking UI
to generate a UUID using browser/platform capabilities such as:

``` ts
crypto.randomUUID()
```

Only do this if supported by the project's target/runtime conventions.

Important semantics:

-   a new logical booking attempt gets a new idempotency key;
-   retry of the same logical booking request must reuse the same key;
-   Phase 8.1 should expose the utility/client capability but must not
    implement the booking UI workflow yet.

Do not generate SHA-256 fingerprints in the frontend.

------------------------------------------------------------------------

# 15. Query serialization

Use a single consistent query serialization approach matching the
existing frontend.

Requirements:

-   no `undefined` query values;
-   preserve opaque cursor exactly;
-   ISO timestamps remain explicit strings;
-   do not accidentally serialize local `Date.toString()` values;
-   URL-encode values safely;
-   do not duplicate existing query helper logic if one already exists.

Add tests around Phase 8 filter serialization where useful.

------------------------------------------------------------------------

# 16. Time handling

The API layer must remain timezone-neutral.

Contracts should retain:

-   `startsAt`;
-   `endsAt`;
-   `clinicTimeZone`;

as backend-provided values.

Do not format times for display inside the API layer.

Do not convert appointment times into browser-local strings.

Presentation formatting belongs to later UI subphases.

If helper parsing is necessary, keep the authoritative original
transport value intact.

------------------------------------------------------------------------

# 17. Phase 7 reuse

Do not redefine Doctor/Clinic/Location models already provided by Phase
7 unless Phase 8 transport DTOs have distinct exact structures.

Where Phase 8 only references IDs:

-   use the IDs from the Phase 8 response;
-   let later UI combine them with existing Phase 7 state/API as needed.

Do not create duplicate directory caches in this phase.

------------------------------------------------------------------------

# 18. File organization

Follow the existing frontend architecture.

Prefer extending existing locations such as:

-   shared API contracts;
-   Beeexy API client modules;
-   phase-specific API module;
-   existing test folders.

Do not create a large new parallel folder hierarchy unless current
project organization clearly calls for it.

Keep Phase 8 transport contracts easy to discover.

------------------------------------------------------------------------

# 19. No UI in Phase 8.1

Do NOT implement:

-   slot picker UI;
-   booking modal/page;
-   appointment list page;
-   appointment detail page;
-   cancellation buttons;
-   rescheduling flow;
-   scheduler screen;
-   confirm/reject buttons;
-   toast UX;
-   timeline UI;
-   loading skeletons specific to scheduling.

This phase is only contracts + API integration foundation.

Do not prematurely implement Frontend 8.2+.

------------------------------------------------------------------------

# 20. Tests

Add focused tests using existing frontend test infrastructure.

At minimum cover:

### Contracts/serialization

Where runtime validation/helpers exist, verify exact serialized
enum/query behavior.

### `listDoctorSlots`

-   correct route;
-   from/to serialization;
-   omitted undefined query;
-   typed success;
-   AbortSignal propagation.

### `createAppointment`

-   POST route;
-   bearer auth through existing client;
-   exact body;
-   idempotency key preserved;
-   success response;
-   409 normalized correctly.

### `listAppointments`

-   filters serialized correctly;
-   cursor preserved opaque;
-   typed page;
-   AbortSignal propagation.

### `getAppointment`

-   correct path;
-   detail/history mapping untouched;
-   concealed 404 propagated normally.

### confirm/reject/cancel/reschedule

-   correct methods/routes;
-   correct body/no-body behavior;
-   auth;
-   relevant `403`/`409`/`422` propagation.

Do not test backend business logic in frontend unit tests.

Test the frontend transport contract.

------------------------------------------------------------------------

# 21. Existing frontend compatibility

The implementation must preserve all existing frontend behavior from
prior phases.

Do not break:

-   authentication;
-   PatientProfile switching;
-   Pre-Triage;
-   Clinical History;
-   FHIR;
-   Phase 7 Doctor/Clinic directory;
-   existing API cancellation semantics;
-   existing tests.

Do not change public UI routes in this phase.

------------------------------------------------------------------------

# 22. Definition of Done

Frontend Phase 8.1 is complete only when:

1.  all frontend-relevant Phase 8 transport contracts exist;
2.  contract field names match backend exactly;
3.  serialized statuses match backend exactly;
4.  serialized modalities match backend exactly;
5.  availability slot contract exists;
6.  appointment summary contract exists;
7.  appointment detail contract exists;
8.  status history contract exists;
9.  reschedule history contract exists;
10. appointment page/cursor contract exists;
11. create request contract exists;
12. reschedule request contract exists;
13. all eight endpoint client functions exist;
14. authentication behavior matches backend;
15. anonymous slots call works correctly;
16. query serialization matches backend;
17. opaque cursors are preserved;
18. AbortSignal behavior follows current frontend conventions;
19. booking idempotency key can be preserved across a retry;
20. frontend does not generate backend fingerprint;
21. Phase 8 error codes/statuses remain available to later UI;
22. no clinical data contracts are added to scheduling;
23. no duplicate Phase 7 directory models are introduced unnecessarily;
24. focused client tests pass;
25. full frontend test suite passes;
26. lint/typecheck/build pass according to repository scripts;
27. no Phase 8 UI was implemented;
28. no Frontend Phase 8.2+ work was implemented.

------------------------------------------------------------------------

# 23. Required final report

When finished report:

1.  files created;
2.  files modified;
3.  exact Phase 8 TypeScript contracts added;
4.  exact serialized AppointmentStatus type;
5.  exact serialized AppointmentModality type;
6.  availability response contract;
7.  appointment summary contract;
8.  appointment detail contract;
9.  status-history contract;
10. reschedule-history contract;
11. page/cursor contract;
12. create request contract;
13. reschedule request contract;
14. all eight API client function signatures;
15. auth behavior per function;
16. query serialization behavior;
17. AbortSignal/cancellation support;
18. idempotency-key handling;
19. normalized error handling and exact Phase 8 error codes supported;
20. any reuse of Phase 7/shared contracts;
21. tests added;
22. focused test results;
23. full frontend test-suite result;
24. typecheck result;
25. lint result if configured;
26. build result;
27. confirmation no scheduling UI was implemented;
28. confirmation no Frontend Phase 8.2+ work was implemented;
29. discrepancies found between `frontend-api-phase-8.md`,
    backend/OpenAPI, and existing frontend assumptions;
30. blockers before Frontend Phase 8.2, if any.

Do not proceed to Frontend Phase 8.2 automatically.
