export function notFound(req, res) {
  res.status(404).json({ message: 'Route not found.' });
}

export function errorHandler(error, req, res, next) {
  console.error('[server]', error);
  const status = Number(error.status) >= 400 && Number(error.status) < 600 ? Number(error.status) : 500;
  res.status(status).json({
    message: status === 500 ? 'Internal server error.' : error.message || 'Request failed.'
  });
}
