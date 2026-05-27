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

## Optimizations Performed
_(to be filled as fixes land)_

## Remaining Known Issues
_(to be filled as work progresses)_

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
