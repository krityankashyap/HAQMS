const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/reports/doctor-stats
router.get('/doctor-stats', authenticate, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [doctors, appointmentGroups, queueGroups] = await Promise.all([
      prisma.doctor.findMany(),
      prisma.appointment.groupBy({
        by: ['doctorId', 'status'],
        _count: { id: true },
      }),
      prisma.queueToken.groupBy({
        by: ['doctorId'],
        where: { createdAt: { gte: today } },
        _count: { id: true },
      }),
    ]);

    // Build lookup: doctorId → { status → count }
    const apptMap = new Map();
    for (const row of appointmentGroups) {
      if (!apptMap.has(row.doctorId)) apptMap.set(row.doctorId, {});
      apptMap.get(row.doctorId)[row.status] = row._count.id;
    }

    // Build lookup: doctorId → todayQueueCount
    const queueMap = new Map(queueGroups.map(r => [r.doctorId, r._count.id]));

    // Merge against full doctor list — doctors with zero appointments still appear with zeroes
    const reportData = doctors.map(doc => {
      const appts      = apptMap.get(doc.id) || {};
      const completed  = appts['COMPLETED'] || 0;
      const cancelled  = appts['CANCELLED'] || 0;
      const total      = Object.values(appts).reduce((sum, n) => sum + n, 0);

      return {
        id:                    doc.id,
        name:                  doc.name,
        specialization:        doc.specialization,
        department:            doc.department,
        totalAppointments:     total,
        completedAppointments: completed,
        cancelledAppointments: cancelled,
        todayQueueSize:        queueMap.get(doc.id) || 0,
        revenue:               completed * doc.consultationFee,
      };
    });

    res.json({ success: true, data: reportData });
  } catch (error) {
    console.error('[reports] GET /doctor-stats:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

module.exports = router;
