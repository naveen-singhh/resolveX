const AuditLog = require('../models/AuditLog');

function recordAudit({ actor, action, entityType, entityId, details = {} }) {
  return AuditLog.create({ actor: actor ? actor._id : null, action, entityType, entityId, details });
}

module.exports = { recordAudit };
