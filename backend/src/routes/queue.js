const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/queue
// List all active queue tokens
router.get('/', async (req, res) => {
  try {
    const { doctorId, status } = req.query;

    const where = {};
    if (doctorId) where.doctorId = doctorId;
    if (status) where.status = status;

    const tokens = await prisma.queueToken.findMany({
      where,
      include: {
        patient: true,
        doctor: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json(tokens);
  } catch (error) {
    console.error('[queue] GET /:', error);
    res.status(500).json({ error: 'Failed to retrieve queue' });
  }
});

// POST /api/queue/checkin
router.post('/checkin', authenticate, async (req, res) => {
  try {
    const { patientId, doctorId, appointmentId } = req.body;

    if (!patientId || !doctorId) {
      return res.status(400).json({ error: 'Patient and Doctor ID are required for check-in.' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const newToken = await prisma.$transaction(async (tx) => {
      // FOR UPDATE locks the doctor row for this transaction's duration.
      // A concurrent check-in for the same doctor blocks here until we commit,
      // then reads the correct max and gets the next token — no phantom, no 409.
      // Correct at Read Committed (Postgres default); no isolation override needed.
      const locked = await tx.$queryRaw`SELECT id FROM "Doctor" WHERE id = ${doctorId} FOR UPDATE`;
      if (locked.length === 0) {
        const err = new Error('Doctor not found');
        err.statusCode = 404;
        throw err;
      }

      const latest = await tx.queueToken.findFirst({
        where: { doctorId, createdAt: { gte: today } },
        orderBy: { tokenNumber: 'desc' },
      });
      const nextTokenNumber = (latest?.tokenNumber ?? 0) + 1;

      return tx.queueToken.create({
        data: {
          tokenNumber: nextTokenNumber,
          patientId,
          doctorId,
          appointmentId: appointmentId || null,
          status: 'WAITING',
        },
        include: { patient: true, doctor: true },
      });
    });

    res.status(201).json({ message: 'Checked in successfully. Token generated.', token: newToken });
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ error: error.message });
    }
    console.error('[queue] POST /checkin:', error);
    res.status(500).json({ error: 'Check-in failed' });
  }
});

// PATCH /api/queue/:id
// Update token status (WAITING -> CALLING -> COMPLETED / SKIPPED)
router.patch('/:id', authenticate, async (req, res) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const updatedToken = await prisma.queueToken.update({
      where: { id: req.params.id },
      data: { status },
      include: {
        patient: true,
        doctor: true,
      },
    });

    res.json(updatedToken);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update queue token', details: error.message });
  }
});

module.exports = router;
