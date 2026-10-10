function loadConfig(env = process.env) {
  const required = ['MONGODB_URI', 'SESSION_SECRET'];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  if (env.SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters long.');
  }
  const port = Number(env.PORT || 3000);
  const sessionMaxAge = Number(env.SESSION_MAX_AGE_MS || 86400000);
  const slaScanInterval = Number(env.SLA_SCAN_INTERVAL_MS || 60000);
  const bcryptRounds = Number(env.BCRYPT_ROUNDS || 12);
  if (![port, sessionMaxAge, slaScanInterval, bcryptRounds].every(Number.isFinite)
    || ![port, sessionMaxAge, slaScanInterval, bcryptRounds].every(Number.isInteger)) {
    throw new Error('PORT, session/SLA intervals, and BCRYPT_ROUNDS must be valid numbers.');
  }
  if (port < 1 || port > 65535 || sessionMaxAge < 60000 || slaScanInterval < 10000 || bcryptRounds < 10 || bcryptRounds > 14) {
    throw new Error('Configuration is outside the supported range.');
  }
  return {
    nodeEnv: env.NODE_ENV || 'development',
    port,
    mongoUri: env.MONGODB_URI,
    sessionSecret: env.SESSION_SECRET,
    sessionMaxAge,
    slaScanInterval,
    bcryptRounds
  };
}

module.exports = { loadConfig };
