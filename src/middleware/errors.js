// Cualquier petición que llega hasta aquí no coincide con ningún fichero ni ruta.
function notFound(req, res) {
  res.status(404).json({ error: `No existe la ruta ${req.method} ${req.originalUrl}.` });
}

// Manejador centralizado: siempre responde JSON y nunca envía la traza al cliente.
// Express lo reconoce como manejador de errores porque recibe cuatro argumentos.
function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  // express.json() lanza este error cuando el cuerpo no es JSON válido.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ errors: [{ field: 'body', message: 'El cuerpo no es un JSON válido.' }] });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'El cuerpo de la petición es demasiado grande.' });
  }

  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
}

module.exports = { notFound, errorHandler };
