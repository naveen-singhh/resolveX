const { monitorOverdueComplaints } = require('../services/slaService');

function startSlaMonitor(intervalMs, logger = console) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await monitorOverdueComplaints();
    } catch (error) {
      logger.error('SLA monitor failed:', error);
    } finally {
      running = false;
    }
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

module.exports = { startSlaMonitor };
