// Lógica HTTP del recurso: lee la petición, valida, llama al almacenamiento y elige el status.
// No conoce cómo se guardan los datos: solo usa las funciones que exporta data/store.js.
const store = require('../data/store');
const {
  validateJugador, validateJugadorQuery, validateStatsQuery, POSICIONES,
} = require('../validators/jugadorValidator');

// Solo se acepta la forma canónica de un entero positivo ("7", no "07", "abc" ni "1.5").
// Cualquier otra cosa no puede existir: se responde 404 como con cualquier id desconocido.
function leerId(req) {
  return /^[1-9]\d*$/.test(req.params.id) ? Number(req.params.id) : null;
}

function noEncontrado(req, res) {
  return res.status(404).json({ error: `No existe ningún jugador con id ${req.params.id}.` });
}

// GET /jugadores
function list(req, res) {
  const { errors, filters } = validateJugadorQuery(req.query);
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }
  const { total, items } = store.findAll(filters);
  res.json({ total, limit: filters.limit, offset: filters.offset, items });
}

// GET /jugadores/stats — se calcula en cada petición, nunca se guarda.
function stats(req, res) {
  const { errors } = validateStatsQuery(req.query);
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  const { items } = store.findAll();
  const total = items.length;

  const porPosicion = {};
  for (const posicion of POSICIONES) {
    porPosicion[posicion] = 0;
  }

  let disponibles = 0;
  let sumaPuntos = 0;
  let maximo = null;
  for (const jugador of items) {
    porPosicion[jugador.posicion]++;
    sumaPuntos += jugador.puntos;
    if (jugador.disponible) disponibles++;
    if (maximo === null || jugador.puntos > maximo.puntos) maximo = jugador;
  }

  res.json({
    total,
    disponibles,
    mediaPuntos: total === 0 ? 0 : Math.round((sumaPuntos / total) * 10) / 10,
    maximoAnotador: maximo && { id: maximo.id, nombre: maximo.nombre, puntos: maximo.puntos },
    porPosicion,
  });
}

// GET /jugadores/:id
function getById(req, res) {
  const id = leerId(req);
  const jugador = id && store.findById(id);
  if (!jugador) return noEncontrado(req, res);
  res.json(jugador);
}

// POST /jugadores — validación completa
function create(req, res) {
  const { errors, value } = validateJugador(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }
  const jugador = store.create(value);
  res.status(201).location(`${req.baseUrl}/${jugador.id}`).json(jugador);
}

// PUT /jugadores/:id — sustituye el jugador entero, validación completa
function replace(req, res) {
  const id = leerId(req);
  if (!id || !store.findById(id)) return noEncontrado(req, res);

  const { errors, value } = validateJugador(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }
  res.json(store.replace(id, value));
}

// PATCH /jugadores/:id — solo los campos recibidos, validación parcial
function update(req, res) {
  const id = leerId(req);
  if (!id || !store.findById(id)) return noEncontrado(req, res);

  const { errors, value } = validateJugador(req.body, { partial: true });
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }
  res.json(store.update(id, value));
}

// DELETE /jugadores/:id — 204 sin cuerpo
function remove(req, res) {
  const id = leerId(req);
  if (!id || !store.remove(id)) return noEncontrado(req, res);
  res.status(204).end();
}

module.exports = { list, stats, getById, create, replace, update, remove };
