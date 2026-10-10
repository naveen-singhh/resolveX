require('dotenv').config();
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const { loadConfig } = require('../src/config/env');
const { connectDatabase } = require('../src/config/db');
const User = require('../src/models/User');
const Complaint = require('../src/models/Complaint');
const ComplaintHistory = require('../src/models/ComplaintHistory');
const Comment = require('../src/models/Comment');
const Notification = require('../src/models/Notification');
const { ensureDefaultPolicies, calculateDeadlines } = require('../src/services/slaService');

async function upsertUser({ name, email, password, role, supportedCategories = [] }, rounds) {
  const passwordHash = await bcrypt.hash(password, rounds);
  return User.findOneAndUpdate(
    { email: email.toLowerCase() },
    { $set: { name, passwordHash, role, supportedCategories, isActive: true, isAvailable: true } },
    { upsert: true, new: true, runValidators: true }
  );
}

const categories = ['AMENITIES', 'WATER', 'ELECTRICAL', 'CLEANING', 'SECURITY', 'IT', 'OTHER'];

const studentDefinitions = [
  { name: 'Aarav Sharma', email: null },
  { name: 'Riya Mehta', email: 'riya.mehta@resolvex.local' },
  { name: 'Kabir Patel', email: 'kabir.patel@resolvex.local' },
  { name: 'Ananya Iyer', email: 'ananya.iyer@resolvex.local' },
  { name: 'Dev Malhotra', email: 'dev.malhotra@resolvex.local' },
  { name: 'Ishita Rao', email: 'ishita.rao@resolvex.local' },
  { name: 'Neel Gupta', email: 'neel.gupta@resolvex.local' },
  { name: 'Sara Khan', email: 'sara.khan@resolvex.local' }
];

const complaintFixtures = [
  { title: 'Water leaking under the washbasin', description: 'There is a steady drip from the cold-water pipe below the washbasin. The cabinet floor is getting wet, so please inspect the joint and seal it.', category: 'WATER', location: 'Cedar Hostel, Room 214', priority: 'HIGH', status: 'OPEN', student: 0, tech: null, daysAgo: 0, comments: [['student', 'I placed a tray underneath for now; it is still dripping.']] },
  { title: 'Corridor light flickers near the stairwell', description: 'The ceiling light outside the east stairwell flickers every few seconds after sunset. The stairs become difficult to see clearly.', category: 'ELECTRICAL', location: 'North Block, East stairwell - Floor 2', priority: 'MEDIUM', status: 'ASSIGNED', student: 1, tech: 0, daysAgo: 1, comments: [['student', 'This is the light next to the fire door.']] },
  { title: 'Laundry room dryer stops mid-cycle', description: 'Dryer number 3 starts normally but stops after about ten minutes and displays no error code. The clothes are still damp.', category: 'AMENITIES', location: 'Cedar Hostel, Laundry Room', priority: 'MEDIUM', status: 'IN_PROGRESS', student: 2, tech: 1, daysAgo: 2, comments: [['student', 'I tried a smaller load; it stopped again.'], ['technician', 'I am checking the lint path and power connection.']] },
  { title: 'Study room door does not latch', description: 'The second-floor quiet study room door swings open after it is closed. It does not latch unless pulled firmly.', category: 'AMENITIES', location: 'Library Annex, Study Room 2B', priority: 'LOW', status: 'RESOLVED', student: 3, tech: 0, daysAgo: 4, comments: [['student', 'The latch now catches properly. Thank you.']] },
  { title: 'Water purifier showing service indicator', description: 'The purifier beside the dining hall has a red service light. Water is dispensing, but the indicator has been on since yesterday.', category: 'WATER', location: 'Dining Hall, Ground Floor', priority: 'MEDIUM', status: 'CLOSED', student: 4, tech: 1, daysAgo: 7, comments: [['technician', 'The filter was replaced and the indicator reset.'], ['student', 'Water tastes normal and the service light is off.']] },
  { title: 'Bathroom exhaust fan is unusually loud', description: 'The exhaust fan makes a rattling sound when switched on and vibrates against the ceiling grille. It still runs but is noisy.', category: 'ELECTRICAL', location: 'Maple Hostel, Room 108', priority: 'LOW', status: 'REOPENED', student: 5, tech: 0, daysAgo: 3, comments: [['student', 'The rattling came back this morning after the repair.']] },
  { title: 'Access card reader slow at west entrance', description: 'The west entrance reader takes several attempts to recognize valid student cards during evening return time.', category: 'SECURITY', location: 'West Residence Gate', priority: 'HIGH', status: 'IN_PROGRESS', student: 6, tech: 1, daysAgo: 1, comments: [['student', 'There was a short queue around 8:30 pm.'], ['technician', 'We are checking the reader logs and network connection.']] },
  { title: 'Classroom projector has a blue tint', description: 'The projector image in classroom C-204 has a strong blue tint, including when using a different HDMI cable and laptop.', category: 'IT', location: 'Academic Block C, Room 204', priority: 'MEDIUM', status: 'ASSIGNED', student: 7, tech: 1, daysAgo: 0, comments: [['student', 'The issue is visible on the opening slide as well.']] },
  { title: 'Waste bin not collected outside room', description: 'The common-area waste bin has not been emptied since the previous collection round and is now full.', category: 'CLEANING', location: 'Cedar Hostel, Floor 3, East wing', priority: 'LOW', status: 'RESOLVED', student: 0, tech: 0, daysAgo: 2, comments: [['student', 'The bin has been emptied. Much appreciated.']] },
  { title: 'Ceiling panel damp after rain', description: 'A small damp patch appeared on the ceiling after last night’s rain. There is no active dripping, but it should be checked before it spreads.', category: 'AMENITIES', location: 'Academic Block A, Room 118', priority: 'HIGH', status: 'OPEN', student: 1, tech: null, daysAgo: 0, comments: [['student', 'I have moved the nearby books away from the wall.']] },
  { title: 'Dining hall tap handle is loose', description: 'The tap handle at the north-side handwashing station moves freely and is difficult to turn off fully.', category: 'WATER', location: 'Dining Hall, North wash station', priority: 'MEDIUM', status: 'CLOSED', student: 2, tech: 0, daysAgo: 8, comments: [['technician', 'Handle tightened and water flow checked.'], ['student', 'Everything is working normally now.']] },
  { title: 'Wi-Fi access point offline on fourth floor', description: 'The residence network is unavailable in the west corridor on the fourth floor. Nearby floors are connecting normally.', category: 'IT', location: 'Maple Hostel, Floor 4, West corridor', priority: 'HIGH', status: 'IN_PROGRESS', student: 3, tech: 1, daysAgo: 1, comments: [['student', 'The signal disappeared around lunchtime.'], ['technician', 'The access point has power; I am checking its uplink.']] },
  { title: 'Window handle difficult to lock', description: 'The latch on the room window sticks and needs extra force to turn. Please adjust it so it closes securely.', category: 'AMENITIES', location: 'Cedar Hostel, Room 327', priority: 'MEDIUM', status: 'ASSIGNED', student: 4, tech: 0, daysAgo: 2, comments: [['student', 'The window currently closes but the handle is stiff.']] },
  { title: 'Recycling area needs a second collection', description: 'Cardboard has accumulated beside the recycling containers after move-in deliveries. The marked walkway should remain clear.', category: 'CLEANING', location: 'South Residence, Recycling point', priority: 'LOW', status: 'CANCELLED', student: 5, tech: null, daysAgo: 5, comments: [['student', 'We cleared the boxes with the floor representative; this request can be closed.']] },
  { title: 'Hot water takes too long to reach the shower', description: 'The shower in the shared bathroom takes several minutes to warm up, longer than it did earlier this week.', category: 'WATER', location: 'Maple Hostel, Shared bathroom - Floor 2', priority: 'HIGH', status: 'OPEN', student: 6, tech: null, daysAgo: 1, comments: [['student', 'The other shower on this floor seems normal.']] },
  { title: 'Printer leaves a faint line on each page', description: 'The shared printer in the student lounge prints a faint vertical line near the right edge on every page.', category: 'IT', location: 'Student Centre, Lounge printer station', priority: 'LOW', status: 'RESOLVED', student: 7, tech: 1, daysAgo: 3, comments: [['technician', 'Printer rollers cleaned and a test page checked.'], ['student', 'Test page is clean now.']] },
  { title: 'Dining hall floor drain smells after cleaning', description: 'An unpleasant drain smell remains near the east serving counter even after the area is cleaned. No standing water is visible.', category: 'CLEANING', location: 'Dining Hall, East serving counter', priority: 'MEDIUM', status: 'REOPENED', student: 0, tech: 1, daysAgo: 4, comments: [['student', 'The smell returned the day after the first cleaning.']] },
  { title: 'Emergency exit sign not illuminated', description: 'The emergency exit sign at the corridor junction is dark. Please check the sign and its backup power promptly.', category: 'SECURITY', location: 'Academic Block B, Floor 1 junction', priority: 'CRITICAL', status: 'ASSIGNED', student: 1, tech: 0, daysAgo: 0, comments: [['student', 'The nearby corridor lights are on; only the exit sign is out.']] },
  { title: 'Desk chair height adjustment not holding', description: 'The height lever on the library desk chair drops unexpectedly after adjustment, making it uncomfortable to use.', category: 'AMENITIES', location: 'Main Library, Reading Area Seat 34', priority: 'LOW', status: 'CLOSED', student: 2, tech: 1, daysAgo: 10, comments: [['technician', 'Chair replaced with a working unit.'], ['student', 'The replacement chair is fine.']] },
  { title: 'Water dispenser button stuck', description: 'The cold-water button on the dispenser beside the seminar rooms sticks after use and needs to be released manually.', category: 'WATER', location: 'Academic Block C, Seminar lobby', priority: 'MEDIUM', status: 'IN_PROGRESS', student: 3, tech: 0, daysAgo: 2, comments: [['student', 'The button is sticking more often this afternoon.'], ['technician', 'I have isolated the dispenser while checking the valve.']] },
  { title: 'Parking gate arm descends too quickly', description: 'The residence parking gate arm begins descending almost immediately after a vehicle passes. Please review its timing and sensor.', category: 'SECURITY', location: 'North Residence, Vehicle entrance', priority: 'HIGH', status: 'OPEN', student: 4, tech: null, daysAgo: 0, comments: [['student', 'It nearly came down on the next car in the queue.']] },
  { title: 'Lecture room microphone cuts out', description: 'The lectern microphone works for a few minutes and then loses audio until its cable is reseated.', category: 'IT', location: 'Academic Block A, Lecture Hall 1', priority: 'MEDIUM', status: 'RESOLVED', student: 5, tech: 1, daysAgo: 5, comments: [['technician', 'Cable connection replaced and audio tested.'], ['student', 'Audio stayed consistent through the full lecture today.']] },
  { title: 'Bathroom basin drains very slowly', description: 'Water pools in the basin for several minutes after washing. The drain cover is clear from visible debris.', category: 'WATER', location: 'Cedar Hostel, Room 119', priority: 'MEDIUM', status: 'CANCELLED', student: 6, tech: null, daysAgo: 3, comments: [['student', 'A floor plumber resolved this during the scheduled inspection.']] },
  { title: 'Common room air conditioner not cooling', description: 'The common-room air conditioner runs and the fan is blowing, but the room remains warm even after being on for an hour.', category: 'ELECTRICAL', location: 'South Residence, Common room', priority: 'HIGH', status: 'REOPENED', student: 7, tech: 0, daysAgo: 6, comments: [['student', 'Cooling improved briefly but the room is warm again.']] }
];

function daysBack(days, hour = 10) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

async function seedComplaint(item, students, technicians, admin) {
  const student = students[item.student];
  const technician = item.tech === null ? null : technicians[item.tech];
  const title = `Demo: ${item.title}`;
  const existing = await Complaint.findOne({ createdBy: student._id, title }).select('createdAt');
  const createdAt = existing ? existing.createdAt : daysBack(item.daysAgo, 8 + (item.student % 9));
  const assignedAt = new Date(createdAt.getTime() + 30 * 60000);
  const startedAt = new Date(createdAt.getTime() + 50 * 60000);
  const resolvedAt = ['RESOLVED', 'CLOSED'].includes(item.status)
    ? new Date(createdAt.getTime() + 3 * 60 * 60000)
    : null;
  const closedAt = item.status === 'CLOSED' ? new Date(createdAt.getTime() + 4 * 60 * 60000) : null;
  const reopenedAt = item.status === 'REOPENED' ? new Date(createdAt.getTime() + 5 * 60 * 60000) : null;
  const cancelledAt = item.status === 'CANCELLED' ? new Date(createdAt.getTime() + 2 * 60 * 60000) : null;
  const activeDates = { ASSIGNED: assignedAt, IN_PROGRESS: startedAt, REOPENED: reopenedAt };
  const deadlines = await calculateDeadlines(item.priority, createdAt);

  const complaint = await Complaint.findOneAndUpdate(
    { createdBy: student._id, title },
    {
      $set: {
        title,
        description: item.description,
        category: item.category,
        location: item.location,
        priority: item.priority,
        status: item.status,
        createdBy: student._id,
        assignedTo: technician ? technician._id : null,
        ...deadlines,
        firstResponseAt: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(item.status) ? startedAt : null,
        resolvedAt,
        closedAt,
        resolutionSummary: resolvedAt
          ? 'The issue was inspected, repaired or corrected, and checked again before closing the work.'
          : null,
        responseEscalationRecordedAt: null,
        resolutionEscalationRecordedAt: null,
        escalationRecordedAt: null,
        updatedAt: closedAt || resolvedAt || reopenedAt || cancelledAt || activeDates[item.status] || createdAt
      },
      $setOnInsert: { createdAt }
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true, timestamps: false }
  );

  await Promise.all([
    ComplaintHistory.deleteMany({ complaint: complaint._id }),
    Comment.deleteMany({ complaint: complaint._id }),
    Notification.deleteMany({ complaint: complaint._id })
  ]);

  const history = [
    {
      complaint: complaint._id,
      actor: student._id,
      eventType: 'CREATED',
      newValue: 'OPEN',
      note: 'Complaint submitted through the student service desk.',
      createdAt
    }
  ];
  if (technician) {
    history.push({
      complaint: complaint._id,
      actor: admin._id,
      eventType: 'ASSIGNED',
      oldValue: null,
      newValue: String(technician._id),
      note: `Assigned to ${technician.name} based on the service category and current workload.`,
      createdAt: assignedAt
    });
  }
  if (['IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED'].includes(item.status)) {
    history.push({
      complaint: complaint._id,
      actor: technician._id,
      eventType: 'STATUS_CHANGED',
      oldValue: 'ASSIGNED',
      newValue: 'IN_PROGRESS',
      note: 'Technician acknowledged the request and started inspection.',
      createdAt: startedAt
    });
  }
  if (['RESOLVED', 'CLOSED', 'REOPENED'].includes(item.status)) {
    const resolutionDate = new Date(createdAt.getTime() + 3 * 60 * 60000);
    history.push({
      complaint: complaint._id,
      actor: technician._id,
      eventType: 'STATUS_CHANGED',
      oldValue: 'IN_PROGRESS',
      newValue: 'RESOLVED',
      note: 'Repair or service work completed; outcome shared with the student.',
      createdAt: resolutionDate
    });
    if (item.status === 'CLOSED') {
      history.push({
        complaint: complaint._id,
        actor: student._id,
        eventType: 'STATUS_CHANGED',
        oldValue: 'RESOLVED',
        newValue: 'CLOSED',
        note: 'Student confirmed the issue was resolved.',
        createdAt: closedAt
      });
    }
    if (item.status === 'REOPENED') {
      history.push({
        complaint: complaint._id,
        actor: student._id,
        eventType: 'STATUS_CHANGED',
        oldValue: 'RESOLVED',
        newValue: 'REOPENED',
        note: 'Student reported that the issue returned and requested follow-up.',
        createdAt: reopenedAt
      });
    }
  } else if (item.status === 'CANCELLED') {
    history.push({
      complaint: complaint._id,
      actor: admin._id,
      eventType: 'STATUS_CHANGED',
      oldValue: 'OPEN',
      newValue: 'CANCELLED',
      note: 'Request cancelled after the issue was handled through another service channel.',
      createdAt: cancelledAt
    });
  }
  await ComplaintHistory.insertMany(history);

  const comments = item.comments.map(([authorType, message], index) => {
    const commentDate = new Date(createdAt.getTime() + (index + 1) * 45 * 60000);
    return {
      complaint: complaint._id,
      author: authorType === 'technician' && technician ? technician._id : student._id,
      message,
      createdAt: commentDate,
      updatedAt: commentDate
    };
  });
  if (comments.length) await Comment.insertMany(comments);

  if (technician && ['ASSIGNED', 'IN_PROGRESS', 'REOPENED'].includes(item.status)) {
    await Notification.create({
      recipient: technician._id,
      complaint: complaint._id,
      type: 'COMPLAINT_ASSIGNED',
      title: 'Complaint assigned to you',
      message: item.title,
      isRead: item.status !== 'ASSIGNED',
      createdAt: assignedAt
    });
  }
  if (['RESOLVED', 'REOPENED'].includes(item.status)) {
    await Notification.create({
      recipient: student._id,
      complaint: complaint._id,
      type: item.status === 'REOPENED' ? 'STATUS_REOPENED' : 'STATUS_RESOLVED',
      title: item.status === 'REOPENED' ? 'Complaint reopened' : 'Complaint resolved',
      message: item.status === 'REOPENED' ? 'Your follow-up request is back in the service queue.' : item.title,
      isRead: false,
      createdAt: reopenedAt || resolvedAt
    });
  }
  return complaint;
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
  const technicianDefinitions = [
    { name: 'Rohan Verma', email: process.env.SEED_TECH_EMAIL || 'tech@resolvex.local' },
    { name: 'Priya Nair', email: process.env.SEED_TECH2_EMAIL || 'tech2@resolvex.local' }
  ];
  const technicians = [];
  for (const definition of technicianDefinitions) {
    technicians.push(await upsertUser({
      ...definition,
      password: process.env.SEED_TECH_PASSWORD || 'ChangeThisTech123!',
      role: 'TECHNICIAN',
      supportedCategories: categories
    }, config.bcryptRounds));
  }

  const students = [];
  for (let index = 0; index < studentDefinitions.length; index += 1) {
    const definition = studentDefinitions[index];
    students.push(await upsertUser({
      name: definition.name,
      email: definition.email || process.env.SEED_STUDENT_EMAIL || 'student@resolvex.local',
      password: process.env.SEED_STUDENT_PASSWORD || 'ChangeThisStudent123!',
      role: 'STUDENT'
    }, config.bcryptRounds));
  }

  const complaints = [];
  for (const fixture of complaintFixtures) {
    complaints.push(await seedComplaint(fixture, students, technicians, admin));
  }

  console.log('ResolveX demo accounts are ready:');
  console.log(`Admin: ${admin.email}`);
  console.log(`Technicians: ${technicians.map((user) => user.email).join(', ')}`);
  console.log(`Students: ${students.length} accounts`);
  console.log(`Realistic demo complaints: ${complaints.length} (plus existing non-demo records)`);
  console.log('Seeded student and technician accounts use the matching passwords configured in .env (local use only).');
}

if (require.main === module) {
  seed()
    .catch((error) => {
      console.error('Seed failed:', error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect();
    });
}

module.exports = { seed, complaintFixtures, studentDefinitions };
