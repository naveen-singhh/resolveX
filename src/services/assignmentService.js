const User = require('../models/User');
const Complaint = require('../models/Complaint');

async function recommendTechnician(category) {
  const technicians = await User.find({ role: 'TECHNICIAN', isActive: true, isAvailable: true })
    .select('name supportedCategories');
  const candidates = technicians.filter((tech) => !tech.supportedCategories.length || tech.supportedCategories.includes(category));
  if (!candidates.length) return null;
  const loads = await Complaint.aggregate([
    { $match: { assignedTo: { $in: candidates.map((tech) => tech._id) }, status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'REOPENED'] } } },
    { $group: { _id: '$assignedTo', count: { $sum: 1 } } }
  ]);
  const loadMap = new Map(loads.map((load) => [String(load._id), load.count]));
  candidates.sort((a, b) => (loadMap.get(String(a._id)) || 0) - (loadMap.get(String(b._id)) || 0) || a.name.localeCompare(b.name));
  return candidates[0];
}

module.exports = { recommendTechnician };
