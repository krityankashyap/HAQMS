const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/appointments
router.get('/', authenticate, async (req, res) => {
  try {
    const { doctorId, status } = req.query;

    const where = {};
    if (doctorId) where.doctorId = doctorId;
    if (status) where.status = status;

    const appointments = await prisma.appointment.findMany({
      where,
      orderBy: { appointmentDate: 'asc' },
      include: {
        patient: { select: { id: true, name: true, phoneNumber: true, age: true, medicalHistory: true } },
        doctor:  { select: { id: true, name: true, specialization: true } },
      },
    });

    res.json({ success: true, count: appointments.length, appointments });
  } catch (error) {
    console.error('[appointments] GET /:', error);
    res.status(500).json({ error: 'Failed to retrieve appointments' });
  }
});

// POST /api/appointments
// Book an appointment
// DESIGN BUG: Duplicate-prone schema. No unique index blocks duplicate appointment bookings.
// In this API, we have a half-hearted verification that is easily bypassed or logically flawed,
// allowing multiple bookings for the exact same date and doctor.
router.post('/', authenticate, async (req, res) => {
  try {
    const { patientId, doctorId, appointmentDate, reason } = req.body;

    if (!patientId || !doctorId || !appointmentDate) {
      return res.status(400).json({ error: 'Patient, Doctor, and Appointment Date are required.' });
    }

    // Normalize to the minute — strip seconds and milliseconds so that
    // "10:00:00.000" and "10:00:00.500" both resolve to the same slot.
    const raw = new Date(appointmentDate);
    const appDate = new Date(Math.floor(raw.getTime() / 60000) * 60000);

    if (isNaN(appDate.getTime())) {
      return res.status(400).json({ error: 'Invalid appointment date.' });
    }

    // Duplicate check covers the full normalized minute so any sub-second
    // variation from the client cannot bypass it.
    const slotEnd = new Date(appDate.getTime() + 60000);
    const existingBooking = await prisma.appointment.findFirst({
      where: {
        doctorId,
        appointmentDate: { gte: appDate, lt: slotEnd },
        status: { not: 'CANCELLED' },
      },
    });

    if (existingBooking) {
      return res.status(409).json({
        error: 'Doctor already has an appointment at this time slot. Please choose a different time.',
      });
    }

    const appointment = await prisma.appointment.create({
      data: {
        patientId,
        doctorId,
        appointmentDate: appDate,
        reason: reason || '',
        status: 'PENDING',
      },
    });

    res.status(201).json({
      message: 'Appointment booked successfully',
      appointment,
    });
  } catch (error) {
    console.error('[appointments] POST /:', error);
    res.status(500).json({ error: 'Failed to book appointment' });
  }
});

// PATCH /api/appointments/:id
// Update appointment status (COMPLETED, CANCELLED, etc.)
router.patch('/:id', authenticate, async (req, res) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const updated = await prisma.appointment.update({
      where: { id: req.params.id },
      data: { status },
    });

    res.json(updated);
  } catch (error) {
    console.error('[appointments] PATCH /:id:', error);
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

module.exports = router;
