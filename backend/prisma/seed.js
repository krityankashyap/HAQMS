const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Clear in dependency order
  await prisma.queueToken.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.doctor.deleteMany();
  await prisma.user.deleteMany();

  const hashedPassword = await bcrypt.hash('password123', 10);

  // Users (seeded logins per assignment spec)
  await prisma.user.createMany({
    data: [
      { email: 'admin@haqms.com',       password: hashedPassword, name: 'Admin User',       role: 'ADMIN'        },
      { email: 'reception1@haqms.com',  password: hashedPassword, name: 'Reception Staff',  role: 'RECEPTIONIST' },
      { email: 'doctor1@haqms.com',     password: hashedPassword, name: 'Dr. System User',  role: 'DOCTOR'       },
    ],
  });

  // Doctors
  const doctors = await Promise.all([
    prisma.doctor.create({ data: { name: 'Dr. Emily Carter',   specialization: 'Cardiology',       department: 'Cardiology',       consultationFee: 150, experience: 12, startTime: '09:00', endTime: '17:00' } }),
    prisma.doctor.create({ data: { name: 'Dr. James Wilson',   specialization: 'Neurology',         department: 'Neurology',         consultationFee: 180, experience: 15, startTime: '10:00', endTime: '18:00' } }),
    prisma.doctor.create({ data: { name: 'Dr. Sarah Chen',     specialization: 'General Surgery',   department: 'Surgery',           consultationFee: 200, experience: 10, startTime: '08:00', endTime: '16:00' } }),
    prisma.doctor.create({ data: { name: 'Dr. Michael Scott',  specialization: 'General Medicine',  department: 'General Medicine',  consultationFee: 100, experience:  8, startTime: '09:00', endTime: '17:00' } }),
    prisma.doctor.create({ data: { name: 'Dr. Lisa Park',      specialization: 'Orthopedics',       department: 'Orthopedics',       consultationFee: 160, experience: 20, startTime: '09:00', endTime: '17:00' } }),
  ]);

  // Patients
  // Clark Kent (null medicalHistory) and Bruce Wayne (empty string) are required to reproduce
  // the NULL-crash bug in the doctor worklist — do not remove or populate their medicalHistory.
  const patients = await Promise.all([
    prisma.patient.create({ data: { name: 'Clark Kent',       email: 'clark@dailyplanet.com',    phoneNumber: '555-0101', age: 32, gender: 'Male',   medicalHistory: null          } }),
    prisma.patient.create({ data: { name: 'Bruce Wayne',      email: 'bruce@wayne.com',          phoneNumber: '555-0102', age: 40, gender: 'Male',   medicalHistory: ''            } }),
    prisma.patient.create({ data: { name: 'Peter Parker',     email: 'peter@dailybugle.com',     phoneNumber: '555-0103', age: 22, gender: 'Male',   medicalHistory: 'Mild asthma' } }),
    prisma.patient.create({ data: { name: 'Tony Stark',       email: 'tony@starkindustries.com', phoneNumber: '555-0104', age: 48, gender: 'Male',   medicalHistory: 'Shrapnel injury, mild anxiety' } }),
    prisma.patient.create({ data: { name: 'Diana Prince',     email: 'diana@themyscira.com',     phoneNumber: '555-0105', age: 28, gender: 'Female', medicalHistory: 'No known conditions'          } }),
    prisma.patient.create({ data: { name: 'Mary Jane Watson', email: null,                       phoneNumber: '555-0106', age: 25, gender: 'Female', medicalHistory: 'Seasonal allergies'           } }),
  ]);

  // Appointments
  const now = new Date();
  const tomorrow  = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);

  const appointments = await Promise.all([
    prisma.appointment.create({ data: { patientId: patients[0].id, doctorId: doctors[0].id, appointmentDate: new Date(tomorrow.setHours(9,  0, 0, 0)), reason: 'Chest pain checkup',    status: 'PENDING'   } }),
    prisma.appointment.create({ data: { patientId: patients[1].id, doctorId: doctors[1].id, appointmentDate: new Date(tomorrow.setHours(10, 0, 0, 0)), reason: 'Migraine follow-up',    status: 'PENDING'   } }),
    prisma.appointment.create({ data: { patientId: patients[2].id, doctorId: doctors[0].id, appointmentDate: new Date(yesterday.setHours(9, 0, 0, 0)), reason: 'Annual checkup',         status: 'COMPLETED' } }),
    prisma.appointment.create({ data: { patientId: patients[3].id, doctorId: doctors[2].id, appointmentDate: new Date(yesterday.setHours(11,0, 0, 0)), reason: 'Post-op review',         status: 'COMPLETED' } }),
    prisma.appointment.create({ data: { patientId: patients[4].id, doctorId: doctors[3].id, appointmentDate: new Date(tomorrow.setHours(14, 0, 0, 0)), reason: 'General consultation',   status: 'PENDING'   } }),
    prisma.appointment.create({ data: { patientId: patients[5].id, doctorId: doctors[4].id, appointmentDate: new Date(yesterday.setHours(15,0, 0, 0)), reason: 'Knee pain assessment',   status: 'CANCELLED' } }),
  ]);

  // Queue tokens (today, so they appear on the live queue monitor board)
  await Promise.all([
    prisma.queueToken.create({ data: { tokenNumber: 1, patientId: patients[0].id, doctorId: doctors[0].id, appointmentId: appointments[0].id, status: 'CALLING' } }),
    prisma.queueToken.create({ data: { tokenNumber: 2, patientId: patients[2].id, doctorId: doctors[0].id, status: 'WAITING' } }),
    prisma.queueToken.create({ data: { tokenNumber: 1, patientId: patients[1].id, doctorId: doctors[1].id, appointmentId: appointments[1].id, status: 'WAITING' } }),
  ]);

  console.log('Seeding complete.');
  console.log('  Users: 3 (admin@haqms.com, reception1@haqms.com, doctor1@haqms.com — all password: password123)');
  console.log(`  Doctors: ${doctors.length}`);
  console.log(`  Patients: ${patients.length} (Clark Kent null medicalHistory, Bruce Wayne empty string — for NULL-crash bug)`);
  console.log(`  Appointments: ${appointments.length}`);
  console.log('  Queue tokens: 3');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
