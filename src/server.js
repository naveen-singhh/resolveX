require('dotenv').config();
const { loadConfig } = require('./config/env');
const { connectDatabase } = require('./config/db');
const { ensureDefaultPolicies } = require('./services/slaService');
const { startSlaMonitor } = require('./jobs/slaMonitor');
const { createApp } = require('./app');

async function start() {
  const config = loadConfig();
  await connectDatabase(config.mongoUri);
  await ensureDefaultPolicies();
  const stopMonitor = startSlaMonitor(config.slaScanInterval);
  const app = createApp(config);
  const server = app.listen(config.port, () => console.log(`ResolveX listening on port ${config.port}`));
  const shutdown = () => {
    stopMonitor();
    server.close(async () => {
      await app.locals.sessionStore.close();
      await require('mongoose').disconnect();
      process.exit(0);
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return server;
}

if (require.main === module) {
  start().catch((error) => {
    console.error('ResolveX failed to start:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { start };
