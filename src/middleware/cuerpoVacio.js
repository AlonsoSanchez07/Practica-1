// express.json() convierte un cuerpo vacío en {}, que parecería un objeto sin campos.
// Estas dos funciones lo detectan y lo tratan como si la petición no trajera cuerpo,
// para que el validador responda "El cuerpo debe ser un objeto JSON." (field: "body").

// Se pasa a express.json({ verify }): recibe los bytes reales del cuerpo antes de analizarlos.
function marcarCuerpoVacio(req, res, buffer) {
  req.cuerpoVacio = buffer.length === 0;
}

function descartarCuerpoVacio(req, res, next) {
  if (req.cuerpoVacio) {
    req.body = undefined;
  }
  next();
}

module.exports = { marcarCuerpoVacio, descartarCuerpoVacio };
