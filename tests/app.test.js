const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../src/app');
const { ensureDefaultPolicies, calculateDeadlines, monitorOverdueComplaints } = require('../src/services/slaService');
const User = require('../src/models/User');
const Complaint = require('../src/models/Complaint');
const ComplaintHistory = require('../src/models/ComplaintHistory');
const Notification = require('../src/models/Notification');

let mongo;
let app;
let server;
let student;
let otherStudent;
let technician;
let secondTechnician;
let admin;

const config = {
  nodeEnv: 'test',
  mongoUri: '',
  sessionSecret: 'test-session-secret-that-is-long-enough-32',
  sessionMaxAge: 3600000,
  bcryptRounds: 10,
  slaScanInterval: 60000
};

function tokenFrom(response) {
  const match = response.text.match(/name="_csrf" value="([^"]+)"/);
  if (!match) throw new Error('CSRF token was not rendered.');
  return match[1];
}

async function postWithCsrf(agent, path, data = {}) {
  const page = await agent.get('/login');
  return agent.post(path).set('Accept', 'text/html').type('form').send({ ...data, _csrf: tokenFrom(page) });
}

async function loggedIn(user) {
  const agent = request.agent(server);
  const response = await postWithCsrf(agent, '/login', { email: user.email, password: 'Password1234!' });
  expect(response.status).toBe(302);
  return agent;
}

async function createComplaint(owner = student, assigned = null, status = 'OPEN', title = 'Leaking sink in room') {
  const now = new Date();
  const deadlines = await calculateDeadlines('MEDIUM', now);
  return Complaint.create({
    title,
    description: 'Water is leaking below the sink and needs repair soon.',
    category: 'WATER',
    location: 'Hostel room 212',
    priority: 'MEDIUM',
    status,
    createdBy: owner._id,
    assignedTo: assigned ? assigned._id : null,
    ...deadlines
  });
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  config.mongoUri = mongo.getUri();
  await mongoose.connect(config.mongoUri);
  app = createApp(config);
  server = app.listen(0);
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  await ensureDefaultPolicies();
  const passwordHash = await bcrypt.hash('Password1234!', 10);
  [student, otherStudent, technician, secondTechnician, admin] = await User.create([
    { name: 'Student One', email: 'student@example.test', passwordHash, role: 'STUDENT' },
    { name: 'Student Two', email: 'other@example.test', passwordHash, role: 'STUDENT' },
    { name: 'Technician One', email: 'tech@example.test', passwordHash, role: 'TECHNICIAN', supportedCategories: ['WATER'] },
    { name: 'Technician Two', email: 'tech2@example.test', passwordHash, role: 'TECHNICIAN', supportedCategories: ['WATER'] },
    { name: 'Admin One', email: 'admin@example.test', passwordHash, role: 'ADMIN' }
  ]);
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await app.locals.sessionStore.close();
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('registers a student, rejects duplicate email, and hashes the password', async () => {
  const agent = request.agent(server);
  const page = await agent.get('/register');
  const payload = { name: 'New Student', email: 'New.Student@example.test', password: 'SecurePassword123!', _csrf: tokenFrom(page) };
  expect((await agent.post('/register').type('form').send(payload)).status).toBe(302);
  const created = await User.findOne({ email: 'new.student@example.test' }).select('+passwordHash');
  expect(created.role).toBe('STUDENT');
  expect(created.passwordHash).not.toBe(payload.password);
  expect(await bcrypt.compare(payload.password, created.passwordHash)).toBe(true);
  const duplicatePage = await agent.get('/register');
  const duplicate = await agent.post('/register').type('form').send({ ...payload, _csrf: tokenFrom(duplicatePage) });
  expect(duplicate.status).toBe(409);
});

test('student complaint submission trusts no browser-supplied ownership, status, assignment, or priority', async () => {
  const agent = await loggedIn(student);
  const response = await postWithCsrf(agent, '/complaints', {
    title: 'Broken window in room',
    description: 'The window latch is broken and the room gets cold at night.',
    category: 'AMENITIES',
    location: 'Hostel room 212',
    createdBy: String(otherStudent._id),
    assignedTo: String(technician._id),
    role: 'ADMIN',
    status: 'RESOLVED',
    priority: 'CRITICAL',
    resolutionDeadlineAt: new Date(0).toISOString()
  });
  expect(response.status).toBe(302);
  const complaint = await Complaint.findOne({ title: 'Broken window in room' });
  expect(String(complaint.createdBy)).toBe(String(student._id));
  expect(complaint.assignedTo).toBeNull();
  expect(complaint.role).toBeUndefined();
  expect(complaint.status).toBe('OPEN');
  expect(complaint.priority).toBe('MEDIUM');
});

test('student, technician, and admin dashboards and management pages render', async () => {
  await createComplaint(student, technician, 'ASSIGNED');
  const studentAgent = await loggedIn(student);
  expect((await studentAgent.get('/complaints')).status).toBe(200);
  expect((await studentAgent.get('/complaints/new')).status).toBe(200);
  const technicianAgent = await loggedIn(technician);
  expect((await technicianAgent.get('/technician/dashboard')).status).toBe(200);
  const adminAgent = await loggedIn(admin);
  for (const path of ['/admin/dashboard', '/admin/complaints', '/admin/staff', '/admin/sla-policies', '/admin/audit-logs', '/notifications']) {
    expect((await adminAgent.get(path)).status).toBe(200);
  }
});

test('requires authentication and scopes a student to their own complaints', async () => {
  const complaint = await createComplaint();
  const outsider = await loggedIn(otherStudent);
  const forbidden = await outsider.get(`/complaints/${complaint._id}`);
  expect(forbidden.status).toBe(404);
  const own = await loggedIn(student);
  expect((await own.get('/dashboard')).status).toBe(200);
  expect((await own.get(`/complaints/${complaint._id}`)).status).toBe(200);
  expect((await request(server).get('/dashboard')).status).toBe(302);
});

test('login regenerates session, logout destroys it, and inactive users cannot sign in', async () => {
  const agent = request.agent(server);
  const page = await agent.get('/login');
  const login = await agent.post('/login').type('form').send({ email: student.email, password: 'Password1234!', _csrf: tokenFrom(page) });
  expect(login.status).toBe(302);
  expect((await agent.get('/dashboard')).status).toBe(200);
  const logout = await postWithCsrf(agent, '/logout');
  expect(logout.status).toBe(302);
  expect((await agent.get('/dashboard')).status).toBe(302);
  student.isActive = false;
  await student.save();
  const inactiveAgent = request.agent(server);
  const loginPage = await inactiveAgent.get('/login');
  expect((await inactiveAgent.post('/login').type('form').send({ email: student.email, password: 'Password1234!', _csrf: tokenFrom(loginPage) })).status).toBe(401);
});

test('rejects student admin operations and technician actions on unassigned complaints', async () => {
  const complaint = await createComplaint(student, secondTechnician);
  const studentAgent = await loggedIn(student);
  const studentCsrf = tokenFrom(await studentAgent.get('/login'));
  expect((await studentAgent.post(`/admin/complaints/${complaint._id}/assign`).type('form').send({ technicianId: technician._id, _csrf: studentCsrf })).status).toBe(403);
  const technicianAgent = await loggedIn(technician);
  const techCsrf = tokenFrom(await technicianAgent.get('/login'));
  const start = await technicianAgent.post(`/technician/complaints/${complaint._id}/start`).type('form').send({ _csrf: techCsrf });
  expect(start.status).toBe(404);
});

test('admin assignment, technician resolution, student confirmation and history work end to end', async () => {
  const complaint = await createComplaint();
  const adminAgent = await loggedIn(admin);
  const assigned = await postWithCsrf(adminAgent, `/admin/complaints/${complaint._id}/assign`, { technicianId: String(technician._id) });
  expect(assigned.status).toBe(302);
  expect(String((await Complaint.findById(complaint._id)).assignedTo)).toBe(String(technician._id));
  const techAgent = await loggedIn(technician);
  expect((await postWithCsrf(techAgent, `/technician/complaints/${complaint._id}/start`)).status).toBe(302);
  const resolved = await postWithCsrf(techAgent, `/technician/complaints/${complaint._id}/resolve`, { resolutionSummary: 'Replaced the damaged pipe under the sink.' });
  expect(resolved.status).toBe(302);
  const studentAgent = await loggedIn(student);
  expect((await studentAgent.get(`/complaints/${complaint._id}`)).status).toBe(200);
  expect((await postWithCsrf(studentAgent, `/complaints/${complaint._id}/close`)).status).toBe(302);
  expect((await Complaint.findById(complaint._id)).status).toBe('CLOSED');
  expect(await ComplaintHistory.countDocuments({ complaint: complaint._id })).toBeGreaterThanOrEqual(5);
  expect(await Notification.countDocuments({ recipient: student._id })).toBeGreaterThan(0);
});

test('rejects invalid status transitions and invalid or missing MongoDB IDs', async () => {
  const complaint = await createComplaint(student, technician);
  const technicianAgent = await loggedIn(technician);
  const response = await postWithCsrf(technicianAgent, `/technician/complaints/${complaint._id}/resolve`, { resolutionSummary: 'Resolved this issue properly.' });
  expect(response.status).toBe(400);
  expect((await technicianAgent.get('/complaints/not-an-id')).status).toBe(404);
  const adminAgent = await loggedIn(admin);
  expect((await adminAgent.get('/complaints/64b64c123456789012345678')).status).toBe(404);
});

test('calculates SLA deadlines and escalation scans are idempotent', async () => {
  const start = new Date('2025-01-01T00:00:00.000Z');
  const critical = await calculateDeadlines('CRITICAL', start);
  expect(critical.responseDeadlineAt.getTime() - start.getTime()).toBe(15 * 60000);
  expect(critical.resolutionDeadlineAt.getTime() - start.getTime()).toBe(2 * 60 * 60000);
  const complaint = await createComplaint();
  const past = new Date(Date.now() - 1000);
  complaint.responseDeadlineAt = past;
  complaint.resolutionDeadlineAt = past;
  await complaint.save();
  expect(await monitorOverdueComplaints(new Date())).toBe(2);
  expect(await monitorOverdueComplaints(new Date())).toBe(0);
  expect(await ComplaintHistory.countDocuments({ complaint: complaint._id, eventType: 'SLA_ESCALATION' })).toBe(2);
  expect(await Notification.countDocuments({ complaint: complaint._id, type: 'SLA_ESCALATION' })).toBe(2);
});

test('CSRF tokens are required for state-changing forms and notifications are recipient scoped', async () => {
  expect((await request(server).post('/notifications/read-all').type('form').send({})).status).toBe(403);
  const studentAgent = await loggedIn(student);
  const notification = await Notification.create({ recipient: otherStudent._id, type: 'TEST', title: 'Private', message: 'Private update' });
  const page = await studentAgent.get('/login');
  const response = await studentAgent.post(`/notifications/${notification._id}/read`).type('form').send({ _csrf: tokenFrom(page) });
  expect(response.status).toBe(404);
  expect((await Notification.findById(notification._id)).isRead).toBe(false);
});
