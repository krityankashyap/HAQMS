const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/patients
router.get('/', authenticate, async (req, res) => {
  try {
    const { search, gender } = req.query;
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 5;

    const where = {};
    if (search && typeof search === 'string') {
      where.OR = [
        { name:        { contains: search, mode: 'insensitive' } },
        { phoneNumber: { contains: search } },
        { email:       { contains: search, mode: 'insensitive' } },
      ];
    }
    if (gender && typeof gender === 'string' && gender !== 'All') {
      where.gender = { equals: gender, mode: 'insensitive' };
    }

    const [patients, totalPatients] = await Promise.all([
      prisma.patient.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.patient.count({ where }),
    ]);

    res.json({
      success: true,
      patients,
      pagination: {
        page,
        limit,
        totalPatients,
        totalPages: Math.ceil(totalPatients / limit),
      },
    });
  } catch (error) {
    console.error('[patients] GET /:', error);
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

// GET /api/patients/:id
// Get patient details by ID. Notice N+1 issue could be placed here or in appointments,
// but let's make it fetch the patient with their appointments and tokens.
router.get('/:id', authenticate, async (req, res) => {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: req.params.id },
      include: {
        appointments: true, // Fetching relation direct
      },
    });

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    res.json(patient);
  } catch (error) {
    console.error('[patients] GET /:id:', error);
    res.status(500).json({ error: 'Failed to fetch patient' });
  }
});

// POST /api/patients (Register patient)
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, email, phoneNumber, age, gender, medicalHistory } = req.body;

    // INCONSISTENT VALIDATION:
    // Email is nullable in schema, but here we only check missing fields.
    // No regex to check telephone number formats, allowing random strings like "abc" to be stored!
    if (!name || !phoneNumber || !age || !gender) {
      return res.status(400).json({ error: 'Name, phoneNumber, age, and gender are required.' });
    }

    const patient = await prisma.patient.create({
      data: {
        name,
        email: email || null,
        phoneNumber,
        age: parseInt(age),
        gender,
        medicalHistory: medicalHistory || null, // Can be null, will crash UI without optional chaining
      },
    });

    res.status(201).json(patient);
  } catch (error) {
    console.error('[patients] POST /:', error);
    res.status(500).json({ error: 'Failed to register patient' });
  }
});

// DELETE /api/patients/:id
router.delete('/:id', authenticate, authorize(['ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;

    const patient = await prisma.patient.findUnique({ where: { id } });
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    await prisma.patient.delete({ where: { id } });

    res.json({ message: `Successfully deleted patient ${patient.name}` });
  } catch (error) {
    console.error('[patients] DELETE /:id:', error);
    res.status(500).json({ error: 'Failed to delete patient' });
  }
});

module.exports = router;
