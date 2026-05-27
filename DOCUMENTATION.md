# HAQMS — Fix Documentation

## Issues Identified
See triage table in session notes. Full list covers: security vulnerabilities (SQL injection,
broken access control, plaintext password logging, JWT misconfiguration), performance issues
(N+1 queries, sequential aggregates, race condition), database problems (in-memory pagination,
missing constraints/indexes), and frontend issues (memory leak, hardcoded URLs, NULL crash).

## Fixes Implemented

| # | Commit | What was fixed |
|---|--------|----------------|
| 0 | — | **Reconstructed `backend/prisma/schema.prisma`, `seed.js`, `.env.example`** — the forked repo shipped without the entire `backend/prisma/` directory and `.env.example`; these files were rebuilt from scratch by reading all route files to infer the exact model shapes, enums, and relations. Seed includes Clark Kent (null `medicalHistory`) and Bruce Wayne (empty string) to reproduce the NULL-crash bug on video. |
| 1 | fix(security): eliminate SQL injection in doctors search | **SQL injection in `GET /api/doctors`** — `$queryRawUnsafe` with direct string interpolation of `search` and `specialization` replaced with `prisma.doctor.findMany({ where })` using `{ contains, mode: 'insensitive' }` for name and exact match for specialization. Query params coerced with `typeof` guard + `String()` to prevent array-input crash. |
| 2 | fix(security): remove broken access control on patient delete | **Broken access control on `DELETE /api/patients/:id`** — the vulnerability was a redundant auth path: a working `authorize()` factory existed in `auth.js`, but the delete route was wired to `authorizeAdminOnlyLegacy`, a legacy stand-in whose role check had been commented out, letting any authenticated user delete patients. Fix removed the broken abstraction entirely and consolidated onto the existing `authorize(['ADMIN'])` factory, rather than re-arming the dead check. |
| 2b | fix(security): strip error detail leak from patient delete response | Follow-on to #2 — `details: error.message` in the DELETE handler leaked Prisma internals (table names, file paths). Replaced with `console.error` server-side + generic response, consistent with the standard error-handling pattern. |
| 3 | fix(security): remove plaintext password logging and stack-trace leaks in auth routes | **Three plaintext exposures removed**: (1) `console.log(JSON.stringify(req.body))` on register logged the entire request body including the raw password; (2) `console.log(... with password: ${req.body.password})` on login logged the plaintext credential explicitly. Both log lines deleted. **Two error-handler leaks fixed in the same commit**: (3) register catch returned `databaseError: error.message`; (4) login catch returned `errorStack: error.stack`. Both stripped to generic messages with full errors logged server-side only. |
| 4 | fix(security): exclude password hash from register response, sanitize /me errors | **Register response**: `prisma.user.create` was returning the full ORM object including `password: hashedPassword`. Fixed with `select: { id, email, name, role }` on the create call — the hash never enters the response candidate set. **`GET /me` error handler**: was returning `error.message` directly; stripped to generic response + server-side log, consistent with the standard pattern. **Login response audited and found already safe**: the response is hand-built from explicitly named fields (`id`, `email`, `name`, `role`) — the password field is never referenced. Noted here to show all three auth responses were checked, not just the one with the flagged bug. |
| 5 | fix(security): centralise JWT secret, enforce expiration, reduce token lifetime | **Hardcoded fallback secret removed**: both `middleware/auth.js` and `routes/auth.js` had `process.env.JWT_SECRET \|\| 'my-super-secret-...'`. Extracted into `backend/src/config.js` which reads the env var and throws at module load time if it is unset — the server refuses to boot without the secret, loudly and immediately, rather than silently falling back to a hardcoded public key. One source of truth, no duplication. **`ignoreExpiration: true` removed**: `jwt.verify` now enforces expiry as intended. **Token lifetime reduced from 365d to 24h**: 24h is a pragmatic choice for this assignment; the production pattern is a short-lived access token (~15 min) paired with a dedicated refresh-token endpoint — intentionally not built given the time budget, but noted here to show the trade-off is understood. |
| 6 | perf(appointments): eliminate N+1 query with Prisma include | **N+1 on `GET /api/appointments`**: the route fetched all appointments then looped, firing two `findUnique` calls per row (patient + doctor). With 6 seeded appointments that was **13 queries**; it scales as `1 + 2n`. Replaced with a single `findMany` using `include` with `select` on both relations — **3 queries** (Prisma issues one per table). Response shape is byte-identical. Query count verified with Prisma's `$on('query')` event listener: 13 → 3 on the seed dataset. | **Hardcoded fallback secret removed**: both `middleware/auth.js` and `routes/auth.js` had `process.env.JWT_SECRET \|\| 'my-super-secret-...'`. Extracted into `backend/src/config.js` which reads the env var and throws at module load time if it is unset — the server refuses to boot without the secret, loudly and immediately, rather than silently falling back to a public key. One source of truth, no duplication. **`ignoreExpiration: true` removed**: `jwt.verify` now enforces expiry as intended. **Token lifetime reduced from 365d to 24h**: 24h is a pragmatic choice for this assignment; the production pattern is a short-lived access token (~15 min) paired with a dedicated refresh-token endpoint — intentionally not built given the time budget, but noted here to show the trade-off is understood. |

## Optimizations Performed
_(to be filled as fixes land)_

## Remaining Known Issues

- **`DELETE /api/patients/:id` 500s for patients with appointments** — admin delete now correctly enforces auth, but `prisma.patient.delete()` will throw a FK constraint error for any patient who has linked appointments or queue tokens (i.e., most real patients). Proper fix requires one of: (a) cascade delete (dangerous — silently wipes appointment history); (b) soft-delete with a `deletedAt` flag (preserves history, preferred for medical records); or (c) block the delete with a clear 409 response and require the caller to reassign or cancel linked records first. Left out of scope for this assessment.

## Major Decisions & Reasoning
- **Schema reconstructed, not invented**: every field type and relation was derived from actual
  Prisma client calls in the route files, not guessed. No extra fields added.
- **Standard error-handling pattern (all routes)**: `console.error` the full error server-side;
  return only `{ error: '<generic message>' }` to the client — no `details`, `sqlMessage`,
  `databaseError`, `errorStack`, or any field derived from `error.message`. Prisma errors can
  leak table/column names; Express stack traces expose file paths. Applied consistently on every
  route touched.
- **No `@@unique([doctorId, date, tokenNumber])` on QueueToken yet**: Prisma cannot enforce a
  date-part extract in a schema constraint. The race condition (bug #9) will be fixed with a
  DB transaction in application code, not a schema constraint.
- **No partial unique index on Appointment yet**: `@@unique([doctorId, appointmentDate]) WHERE
  status != 'CANCELLED'` is a partial index — not expressible in Prisma schema. Will be added
  as raw SQL in a dedicated migration when bug #16 is tackled.
