// Almacenamiento en memoria. Es el único módulo que conoce el array de jugadores.
// Para usar una base de datos basta con sustituir este fichero por otro que exporte
// las mismas funciones; el controlador no cambiaría.

const JUGADORES_INICIALES = [
  { nombre: 'Daniel Ortega', posicion: 'base', dorsal: 7, puntos: 14.5, disponible: true },
  { nombre: 'Samuel Nzé', posicion: 'pivot', dorsal: 15, puntos: 12.8, disponible: true },
  { nombre: 'Hugo Llorente', posicion: 'alero', dorsal: 11, puntos: 11.2, disponible: true },
  { nombre: 'Álvaro Ríos', posicion: 'escolta', dorsal: 9, puntos: 10.4, disponible: false },
  { nombre: 'Pablo Ferrer', posicion: 'ala-pivot', dorsal: 14, puntos: 9.3, disponible: true },
  { nombre: 'Mario Pastor', posicion: 'base', dorsal: 4, puntos: 6.1, disponible: true },
  { nombre: 'Rubén Calvo', posicion: 'escolta', dorsal: 5, puntos: 7.0, disponible: true },
  { nombre: 'Jorge Medina', posicion: 'alero', dorsal: 23, puntos: 4.7, disponible: false },
];

let jugadores = [];
let siguienteId = 1;

// Se devuelven copias para que nadie fuera de este módulo modifique los datos guardados.
const copia = (jugador) => ({ ...jugador });

// Minúsculas y sin tildes, para que "nze" encuentre "Nzé".
function normalizar(texto) {
  return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function comparar(a, b) {
  if (typeof a === 'string') {
    return a.localeCompare(b, 'es', { sensitivity: 'base' });
  }
  return a - b;
}

/** Vuelve al estado inicial. Lo usan el arranque y las pruebas. */
function reset() {
  siguienteId = 1;
  jugadores = JUGADORES_INICIALES.map((datos) => ({ id: siguienteId++, ...datos }));
}

/**
 * Filtra, ordena y pagina, en ese orden.
 * Sin argumentos devuelve todos los jugadores.
 */
function findAll({ search, disponible, posicion, sort = 'id', order = 'asc', limit, offset = 0 } = {}) {
  let resultado = jugadores;

  if (search !== undefined) {
    const buscado = normalizar(search);
    resultado = resultado.filter((j) => normalizar(j.nombre).includes(buscado));
  }
  if (disponible !== undefined) {
    resultado = resultado.filter((j) => j.disponible === disponible);
  }
  if (posicion !== undefined) {
    resultado = resultado.filter((j) => j.posicion === posicion);
  }

  const sentido = order === 'desc' ? -1 : 1;
  resultado = [...resultado].sort((a, b) => comparar(a[sort], b[sort]) * sentido);

  const total = resultado.length;
  const fin = limit === undefined ? undefined : offset + limit;
  const items = resultado.slice(offset, fin).map(copia);

  return { total, items };
}

function findById(id) {
  const jugador = jugadores.find((j) => j.id === id);
  return jugador ? copia(jugador) : null;
}

function create(datos) {
  const jugador = { id: siguienteId++, ...datos };
  jugadores.push(jugador);
  return copia(jugador);
}

/** Sustituye todos los campos menos el id. Devuelve null si no existe. */
function replace(id, datos) {
  const indice = jugadores.findIndex((j) => j.id === id);
  if (indice === -1) return null;
  jugadores[indice] = { id, ...datos };
  return copia(jugadores[indice]);
}

/** Cambia solo los campos recibidos. Devuelve null si no existe. */
function update(id, cambios) {
  const indice = jugadores.findIndex((j) => j.id === id);
  if (indice === -1) return null;
  jugadores[indice] = { ...jugadores[indice], ...cambios, id };
  return copia(jugadores[indice]);
}

/** Devuelve true si se ha eliminado y false si no existía. */
function remove(id) {
  const indice = jugadores.findIndex((j) => j.id === id);
  if (indice === -1) return false;
  jugadores.splice(indice, 1);
  return true;
}

reset();

module.exports = { findAll, findById, create, replace, update, remove, reset };
