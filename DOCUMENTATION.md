# HAQMS — Fix Documentation

## Issues Identified

The repo contained deliberately planted bugs across five challenge areas:

- **Security**: SQL injection, broken access control, plaintext password logging, password hash in API response, hardcoded JWT fallback secret, `ignoreExpiration: true`, 365-day tokens, CORS open to `*`, stack traces in error responses
- **Performance**: N+1 queries on appointments, sequential DB aggregates on doctor stats and reports, queue check-in race condition with artificial sleep
- **Database**: In-memory pagination, missing indexes on FK and status columns, exact-millisecond double-booking check with no DB constraint
- **Frontend**: `setInterval` without cleanup, Rules of Hooks violation (early return before all hooks), `console.error` calls surfacing as Turbopack overlays, hardcoded `API_BASE_URL`, null crash on `medicalHistory.toUpperCase()`
- **Incomplete feature**: `/patients/[id]/history-records` page missing (links 404'd)

Additionally: the forked repo shipped without `backend/prisma/` (schema, seed, migrations) and `backend/.env.example` entirely — these were reconstructed from scratch by reading every route file to infer model shapes, enums, and relations before any other work could begin.

---

## Fixes Implemented

| # | Commit | What was fixed |
|---|--------|----------------|
| 0 | — | **Reconstructed `prisma/schema.prisma`, `seed.js`, `.env.example`** — repo shipped without the entire `backend/prisma/` directory. Rebuilt from route file analysis; no fields invented. Seed includes Clark Kent (null `medicalHistory`) and Bruce Wayne (empty string) to reproduce the NULL crash on video. |
| 1 | `fix(security): eliminate SQL injection in doctors search` | `$queryRawUnsafe` with direct string interpolation on `search` and `specialization` replaced with `prisma.doctor.findMany({ where })` using `contains`/`mode: 'insensitive'`. Params coerced with `typeof` + `String()` guards to prevent array-input crash. |
| 2 | `fix(security): remove broken access control on patient delete` | `DELETE /api/patients/:id` was wired to `authorizeAdminOnlyLegacy` whose role check was commented out, letting any authenticated user delete patients. Removed the dead abstraction; consolidated onto the existing `authorize(['ADMIN'])` factory already used elsewhere. |
| 3 | `fix(security): remove plaintext password logging and stack-trace leaks in auth routes` | Removed `console.log(JSON.stringify(req.body))` (logged raw password on register) and `console.log(... with password: ${req.body.password})` (logged plaintext on login). Stripped `databaseError: error.message` and `errorStack: error.stack` from register/login error responses. |
| 4 | `fix(security): exclude password hash from register response, sanitize /me errors` | `prisma.user.create` was returning the full ORM object including the hash. Fixed with `select: { id, email, name, role }`. `GET /me` error handler stripped from `error.message` to generic. Login response audited — already safe (hand-built from named fields). |
| 5 | `fix(security): centralise JWT secret, enforce expiration, reduce token lifetime` | Both `middleware/auth.js` and `routes/auth.js` had `process.env.JWT_SECRET \|\| 'my-super-secret-...'`. Extracted to `backend/src/config.js` which throws at module load if unset — server refuses to boot without the secret. `ignoreExpiration: true` removed. Token lifetime reduced from 365d → 24h. |
| 6 | `fix(security): restrict CORS to env-configured origins, strip global error stack leak` | `app.use(cors())` replaced with `cors({ origin: CORS_ALLOWED_ORIGINS })` where the value comes from a comma-separated env var validated at boot. Global error handler previously returned `error.stack` under `NODE_ENV === 'development'` — removed unconditionally; wrong env config in production would have leaked stack traces silently. |
| 7 | `fix(queue): close race condition on token assignment with transaction and row lock` | Read-max + 350ms artificial sleep + bare create allowed concurrent check-ins to produce duplicate token numbers. Fixed with `prisma.$transaction` + `SELECT FOR UPDATE` on the Doctor row. Second request blocks at the lock, reads the correct max after first commits, gets the next token. Artificial sleep removed. 404 guard added for invalid doctorId. Unique index `(doctorId, createdAt::date, tokenNumber)` added as migration for defense-in-depth. |
| 8 | `fix(queue): make GET /queue public, fix error detail leak` | `authenticate` middleware was on the public queue board read endpoint, causing 401 for unauthenticated displays. Removed from `GET /`. `details: error.message` leak in PATCH handler stripped. |
| 9 | `perf(appointments): eliminate N+1 query with Prisma include` | `GET /api/appointments` ran 2 `findUnique` calls per appointment row (patient + doctor). Replaced with single `findMany` + `include` with `select`. 13 → 3 queries on seed data (verified with Prisma `$on('query')` listener). |
| 10 | `perf(doctors): parallelise stats aggregates with Promise.all` | `GET /api/doctors/stats` ran four independent count/aggregate calls sequentially. Wrapped in `Promise.all`. Wall-clock gain scales with DB RTT; at 10ms RTT: ~40ms → ~10ms. `debugInfo.executionTimeMs` removed — timing instrumentation is not a client concern. |
| 11 | `perf(reports): replace per-doctor query loop with set-based groupBy aggregation` | `GET /api/reports/doctor-stats` ran 5 queries per doctor + `setTimeout(80ms)` per doctor. With 5 doctors: 26 queries + ~400ms artificial sleep ≈ 435ms total. Rewritten as 3 total queries (`doctor.findMany`, `appointment.groupBy`, `queueToken.groupBy`) in `Promise.all`, merged in JS. ~435ms → ~20ms warm. `timeTakenMs` removed from response. |
| 12 | `perf(patients): push pagination, filtering, and search into the DB query` | `GET /api/patients` loaded the entire patients table into Node memory then filtered and sliced in JS. Rewritten with conditional `where`, `skip`/`take`, and `count({ where })` in `Promise.all`. Three `error.message` leaks in the same file standardized to `console.error` + generic response. |
| 13 | `fix(appointments): enforce double-booking prevention at DB layer` | Duplicate check matched exact millisecond — any sub-second variation bypassed it. Fix: normalize `appointmentDate` to the minute (floor to 60s boundary) before insert; duplicate check uses a 1-minute window (`gte`/`lt`). Partial unique index `(doctorId, appointmentDate) WHERE status <> 'CANCELLED'` added via raw migration (Prisma schema cannot express partial indexes) — enforces the constraint even if the application layer is bypassed. Response changed from 400 → 409 for conflicts. `details: error.message` leaks stripped from POST and PATCH handlers. |
| 14 | `fix(queue): add clearInterval cleanup, remove stale-closure log` | `setInterval` in queue monitor had no return cleanup — interval kept firing after component unmount. Added `return () => clearInterval(intervalId)` to the effect. `console.error` in the poll catch removed (Turbopack surfaces all `console.error` calls as overlay popups). |
| 15 | `fix(dashboard): move early return after hooks to fix Rules of Hooks violation` | `if (!user) return null` appeared before several `useState` and `useEffect` calls. React's Rules of Hooks require all hooks to be called unconditionally before any conditional return. Moved guard after all hooks; each `useEffect` guards internally with `if (!user) return`. |
| 16 | `fix(frontend): remove console.error from auth login catch` | Login error already stored in component state (`setError`). The redundant `console.error` caused Turbopack to render an "Invalid credentials" overlay popup on every failed login attempt. |
| 17 | `fix(frontend): move hardcoded API_BASE_URL to NEXT_PUBLIC_API_URL env var` | `'http://localhost:5000/api'` was hardcoded in `AuthContext.js` and `queue/page.js`. Moved to `NEXT_PUBLIC_API_URL` in `frontend/.env.local` (and `.env.example`). All consumers now read `process.env.NEXT_PUBLIC_API_URL`. Required for deployment — the production backend URL is different from localhost. |
| 18 | `feat(patients): add history-records page and fix null crash` | `/patients/[id]/history-records` was a dead link (404). Built the page using `useParams()` from `next/navigation`, fetching patient data with the auth token and rendering a patient info banner, clinical background section, and appointment history table with doctor details. Backend `GET /api/patients/:id` updated to include nested doctor info inside appointments. Null crash fixed: `medicalHistory.toUpperCase()` → `medicalHistory?.toUpperCase() ?? 'No medical history recorded.'` |

---

## Optimizations Performed

**Core pattern: per-row queries → set-based operations.** The N+1 smell appears wherever a result set is iterated and a DB query is issued per row. Eliminating it consistently across three separate endpoints (appointments list, doctor stats, report aggregation) is the engineering story — not three isolated wins.

| Endpoint | Before | After | Gain |
|----------|--------|-------|------|
| `GET /api/appointments` | 1 + 2N queries (findUnique per row × 2) | 3 queries (findMany + include) | 13 → 3 on seed |
| `GET /api/doctors/stats` | 4 sequential aggregates | 4 in Promise.all | ~4× at non-trivial RTT |
| `GET /api/reports/doctor-stats` | (1 + 5N) sequential + 80ms sleep/doctor | 3 queries in Promise.all | ~435ms → ~20ms |
| `GET /api/patients` | findMany() entire table → JS slice | findMany with skip/take/where | O(N) → O(page size) |

---

## Major Decisions & Reasoning

- **Schema reconstructed, not invented**: every field, type, and relation was derived from actual `prisma.model.*` calls in route files. No extra fields added, no guesses.

- **Standard error-handling pattern applied codebase-wide**: `console.error` the full error server-side; return only `{ error: '<generic message>' }` to the client. No `details`, `sqlMessage`, `databaseError`, `errorStack`, or any field derived from `error.message`. Applied to all six route files plus the global handler in `index.js`. Consistency is the engineering decision — not six isolated fixes.

- **`config.js` as centralized environment validation**: `JWT_SECRET` and `CORS_ALLOWED_ORIGINS` are read and validated at module load time. Server refuses to boot if either is unset. `dotenv.config()` must run before `require('./config')` — enforced by load order in `index.js`. Adding a new required env var = one line in `config.js`.

- **CORS origins from env, not hardcoded**: `cors({ origin: CORS_ALLOWED_ORIGINS })` parses a comma-separated env var at boot. `http://localhost:3000` locally; the deployed frontend URL in production. Misconfiguration fails loudly at startup rather than silently breaking CORS in prod.

- **JWT: 24h lifetime, no refresh token**: 24h is a pragmatic compromise for a 4–8h assignment. Production pattern is short-lived access token (~15 min) + dedicated refresh-token endpoint. Not built — noted here to show the trade-off is understood.

- **Queue lock strategy — FOR UPDATE, not Serializable**: `SELECT FOR UPDATE` on the Doctor row serializes concurrent check-ins for the same doctor without elevating the whole transaction to Serializable isolation. The unique index is defense-in-depth, not the primary mechanism.

- **Appointment slot normalization**: `appointmentDate` is floored to the minute before insert, not rounded, so "10:00:59" maps to the "10:00" slot rather than "10:01". The partial unique index and the app-layer check are redundant by design — the index is the authoritative constraint.

- **Partial indexes via raw migration**: `CREATE UNIQUE INDEX ... WHERE status <> 'CANCELLED'` cannot be expressed in Prisma schema syntax. Added as raw SQL in timestamped migration files. Two such indexes exist: queue token uniqueness and appointment slot uniqueness.

---

## Remaining Known Issues

- **`react-hooks/exhaustive-deps` warning on queue page**: `fetchQueueData` is not in the `useEffect` deps array. Full fix: wrap in `useCallback` + add to deps. The interval behavior is correct (fires every 3s, cleans up on unmount, uses functional updater for `setRefreshCount`) — this is a lint warning, not a runtime bug. Left out of scope.

- **Search inputs fire on every keystroke**: Patient and doctor search in the dashboard trigger a fetch on each keypress with no debounce. Fix: `useCallback` + `setTimeout`/`clearTimeout` debounce or a `useDeferredValue`. Left out of scope.

- **Auth token in `localStorage`**: JWT stored in `localStorage` is readable by any JavaScript on the page (XSS-exfiltratable). Proper fix: `HttpOnly` cookie. Requires backend changes to set/clear the cookie and frontend changes to stop passing the `Authorization` header manually. Left out of scope — `sessionStorage` would be a minimal intermediate improvement but does not fully close the XSS vector.

- **Appointment duplicate check is application-layer only for concurrent requests**: The `findFirst` + `create` is not atomic. Two simultaneous POSTs could both pass the check before either inserts. The unique index catches the second insert with a constraint violation and returns a 500 (not a 409) in that scenario. Full fix: wrap the check + create in a `$transaction` with `FOR UPDATE` (same pattern as queue check-in). Left out of scope.

- **TypeScript migration**: The entire codebase is JavaScript. TypeScript would catch most of the null-access bugs (like `medicalHistory.toUpperCase()`) at compile time. Out of scope per assignment guidelines.
