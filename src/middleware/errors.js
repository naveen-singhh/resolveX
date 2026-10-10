function notFound(req, res) {
  res.status(404).render('errors/error', {
    title: 'Page not found',
    status: 404,
    message: 'The page or record you requested could not be found.'
  });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.code === 'EBADCSRFTOKEN') {
    return res.status(403).render('errors/error', { title: 'Request expired', status: 403, message: 'The form security token is invalid or expired. Please go back and try again.' });
  }
  if (error.name === 'ValidationError') {
    req.flash('error', Object.values(error.errors).map((item) => item.message).join(' '));
    return res.redirect('back');
  }
  if (error.name === 'VersionError') {
    req.flash('error', 'This record changed while you were editing it. Reload and try again.');
    return res.redirect('back');
  }
  if (error.code === 11000) {
    req.flash('error', 'That value is already in use.');
    return res.redirect('back');
  }
  const status = Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) console.error(error);
  return res.status(status).render('errors/error', {
    title: status === 404 ? 'Not found' : 'Something went wrong',
    status,
    message: process.env.NODE_ENV === 'production' && status >= 500
      ? 'An unexpected error occurred. Please try again later.'
      : (error.message || 'An unexpected error occurred.')
  });
}

module.exports = { notFound, errorHandler };
