// Registra cada petición cuando termina: método, ruta, status y duración.
function logger(req, res, next) {
  if (process.env.NODE_ENV === 'test') {
    return next();
  }
  const inicio = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - inicio;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
}

module.exports = logger;
