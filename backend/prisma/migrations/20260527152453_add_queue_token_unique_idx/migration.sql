-- Defense-in-depth: unique constraint on (doctorId, UTC-date, tokenNumber).
-- The FOR UPDATE lock in the application layer prevents duplicate token assignment
-- through the normal code path. This index closes the gap for any path that bypasses
-- the application — direct DB access, bulk inserts, future services.
-- createdAt is timestamp without time zone (Prisma default, stored as UTC).
-- ::date cast is IMMUTABLE in Postgres; AT TIME ZONE would be STABLE and rejected.
CREATE UNIQUE INDEX "QueueToken_doctor_day_token_key"
ON "QueueToken" ("doctorId", ("createdAt"::date), "tokenNumber");