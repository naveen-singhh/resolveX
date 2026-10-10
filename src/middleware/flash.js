function flashMiddleware(req, res, next) {
  req.flash = (type, message) => {
    if (message === undefined) {
      const messages = req.session.flash && req.session.flash[type] ? req.session.flash[type] : [];
      if (req.session.flash) delete req.session.flash[type];
      return messages;
    }
    req.session.flash = req.session.flash || {};
    req.session.flash[type] = req.session.flash[type] || [];
    req.session.flash[type].push(message);
    return req.session.flash[type].length;
  };
  res.locals.flash = {
    success: req.flash('success'),
    error: req.flash('error')
  };
  next();
}

module.exports = { flashMiddleware };
