require('dotenv').config();
const bcrypt = require('bcrypt');
const { loadConfig } = require('../src/config/env');
const { connectDatabase } = require('../src/config/db');
const User = require('../src/models/User');
const Complaint = require('../src/models/Complaint');
const ComplaintHistory = require('../src/models/ComplaintHistory');
const { ensureDefaultPolicies, calculateDeadlines } = require('../src/services/slaService');

async function upsertUser({ name, email, password, role, supportedCategories = [] }, rounds) {
  const passwordHash = await bcrypt.hash(password, rounds);
  return User.findOneAndUpdate(
    { email: email.toLowerCase() },
    { $set: { name, passwordHash, role, supportedCategories, isActive: true, isAvailable: true } },
    { upsert: true, new: true, runValidators: true }
  );
}

async function seed() {
  const config = loadConfig();
  await connectDatabase(config.mongoUri);
  await ensureDefaultPolicies();
  const admin = await upsertUser({
    name: 'ResolveX Administrator',
    email: process.env.SEED_ADMIN_EMAIL || 'admin@resolvex.local',
    password: process.env.SEED_ADMIN_PASSWORD || 'ChangeThisAdmin123!',
    role: 'ADMIN'
  }, config.bcryptRounds);
  const technician = await upsertUser({
    name: 'ResolveX Technician',
    email: process.env.SEED_TECH_EMAIL || 'tech@resolvex.local',
    password: process.env.SEED_TECH_PASSWORD || 'ChangeThisTech123!',
    role: 'TECHNICIAN',
    supportedCategories: ['AMENITIES', 'WATER', 'ELECTRICAL', 'CLEANING', 'SECURITY', 'IT', 'OTHER']
  }, config.bcryptRounds);
  const student = await upsertUser({
    name: 'ResolveX Student',
    email: process.env.SEED_STUDENT_EMAIL || 'student@resolvex.local',
    password: process.env.SEED_STUDENT_PASSWORD || 'ChangeThisStudent123!',
    role: 'STUDENT'
  }, config.bcryptRounds);

  let sample = await Complaint.findOne({ createdBy: student._id, title: 'Sample: corridor light needs repair' });
  if (!sample) {
    const createdAt = new Date();
    const deadlines = await calculateDeadlines('MEDIUM', createdAt);
    sample = await Complaint.create({
      title: 'Sample: corridor light needs repair',
      description: 'The light outside the second-floor study room is not working. Please check the fixture.',
      category: 'ELECTRICAL',
      location: 'Block A, second floor',
      priority: 'MEDIUM',
      status: 'ASSIGNED',
      createdBy: student._id,
      assignedTo: technician._id,
      ...deadlines
    });
    await ComplaintHistory.create({ complaint: sample._id, actor: student._id, eventType: 'CREATED', newValue: 'OPEN', note: 'Seeded local demonstration complaint.' });
    await ComplaintHistory.create({ complaint: sample._id, actor: admin._id, eventType: 'ASSIGNED', newValue: String(technician._id), note: 'Seeded local technician assignment.' });
  }
  console.log('ResolveX demo accounts are ready:');
  console.log(`Admin: ${admin.email}`);
  console.log(`Technician: ${technician.email}`);
  console.log(`Student: ${student.email}`);
  console.log('Use the matching credentials configured in .env (local use only).');
  process.exitCode = 0;
  await require('mongoose').disconnect();
}

seed().catch(async (error) => {
  console.error('Seed failed:', error.message);
  await require('mongoose').disconnect();
  process.exitCode = 1;
});
