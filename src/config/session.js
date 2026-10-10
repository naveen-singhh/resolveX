const session = require('express-session');
const MongoStore = require('connect-mongo');

function createSessionMiddleware(config) {
  const store = MongoStore.create({
    mongoUrl: config.mongoUri,
    collectionName: 'sessions',
    ttl: Math.floor(config.sessionMaxAge / 1000),
    autoRemove: 'native'
  });
  const middleware = session({
    name: 'resolvex.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.nodeEnv === 'production',
      maxAge: config.sessionMaxAge
    }
  });
  middleware.store = store;
  return middleware;
}

module.exports = { createSessionMiddleware };
