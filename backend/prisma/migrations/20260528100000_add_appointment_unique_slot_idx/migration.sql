-- Enforce double-booking prevention at the DB layer.
-- The application normalises appointmentDate to the minute before inserting,
-- so (doctorId, appointmentDate) uniquely identifies a slot.
-- The partial index excludes CANCELLED appointments so a slot can be rebooked
-- after a cancellation — identical semantics to the app-layer check.
-- A partial unique index cannot be expressed in Prisma schema syntax;
-- this migration adds it as raw SQL instead.
CREATE UNIQUE INDEX "Appointment_doctorId_slot_unique"
ON "Appointment" ("doctorId", "appointmentDate")
WHERE status <> 'CANCELLED';
