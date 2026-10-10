const { doubleCsrf } = require('csrf-csrf');

function createCsrf(config) {
  const csrf = doubleCsrf({
    getSecret: () => config.sessionSecret,
    getSessionIdentifier: (req) => req.sessionID,
    cookieName: config.nodeEnv === 'production' ? '__Host-resolvex.csrf' : 'resolvex.csrf',
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.nodeEnv === 'production',
      path: '/'
    },
    getCsrfTokenFromRequest: (req) => req.body && req.body._csrf
  });
  return csrf;
}

module.exports = { createCsrf };
