// Reglas del recurso jugador. Funciones puras: no tocan req, res ni el almacenamiento.

const POSICIONES = ['base', 'escolta', 'alero', 'ala-pivot', 'pivot'];
const CAMPOS = ['nombre', 'posicion', 'dorsal', 'puntos', 'disponible'];
const CAMPOS_ORDENABLES = ['nombre', 'dorsal', 'puntos'];
const PARAMETROS_CONSULTA = ['search', 'disponible', 'posicion', 'sort', 'order', 'limit', 'offset'];
const LIMIT_POR_DEFECTO = 20;
const LIMIT_MAXIMO = 100;

const MENSAJES_OBLIGATORIO = {
  nombre: 'El nombre es obligatorio.',
  posicion: 'La posición es obligatoria.',
  dorsal: 'El dorsal es obligatorio.',
  puntos: 'Los puntos por partido son obligatorios.',
  disponible: 'La disponibilidad es obligatoria.',
};

// Cada función recibe el valor y devuelve un mensaje de error o null si es válido.
const REGLAS = {
  nombre(valor) {
    if (typeof valor !== 'string') return 'El nombre debe ser texto.';
    const limpio = valor.trim();
    // Cc = caracteres de control (como \u0000), Cf = invisibles (como el espacio de ancho cero).
    if (/[\p{Cc}\p{Cf}]/u.test(limpio)) return 'El nombre no puede contener caracteres de control ni invisibles.';
    // Se cuentan caracteres reales: un emoji cuenta como uno, aunque ocupe dos unidades UTF-16.
    const longitud = [...limpio].length;
    if (longitud < 2 || longitud > 60) return 'El nombre debe tener entre 2 y 60 caracteres.';
    return null;
  },
  posicion(valor) {
    if (!POSICIONES.includes(valor)) return `La posición debe ser una de: ${POSICIONES.join(', ')}.`;
    return null;
  },
  dorsal(valor) {
    if (!Number.isInteger(valor) || valor < 0 || valor > 99) {
      return 'El dorsal debe ser un número entero entre 0 y 99.';
    }
    return null;
  },
  puntos(valor) {
    if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0 || valor > 60) {
      return 'Los puntos por partido deben ser un número entre 0 y 60.';
    }
    return null;
  },
  disponible(valor) {
    if (typeof valor !== 'boolean') return 'La disponibilidad debe ser true o false.';
    return null;
  },
};

/**
 * Valida el cuerpo de una petición.
 * - partial: false (POST y PUT) exige los cinco campos.
 * - partial: true (PATCH) solo valida los campos presentes, pero exige al menos uno.
 * Devuelve { errors, value }. value contiene solo campos conocidos y válidos:
 * así el id del cliente y los campos desconocidos nunca llegan al almacenamiento.
 */
function validateJugador(body, { partial = false } = {}) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: [{ field: 'body', message: 'El cuerpo debe ser un objeto JSON.' }], value: {} };
  }

  const errors = [];
  const value = {};

  for (const campo of CAMPOS) {
    const presente = Object.prototype.hasOwnProperty.call(body, campo);
    if (!presente) {
      if (!partial) errors.push({ field: campo, message: MENSAJES_OBLIGATORIO[campo] });
      continue;
    }
    const mensaje = REGLAS[campo](body[campo]);
    if (mensaje) {
      errors.push({ field: campo, message: mensaje });
    } else {
      value[campo] = campo === 'nombre' ? body[campo].trim() : body[campo];
    }
  }

  if (partial && errors.length === 0 && Object.keys(value).length === 0) {
    errors.push({ field: 'body', message: `Envía al menos uno de estos campos: ${CAMPOS.join(', ')}.` });
  }

  return { errors, value };
}

// Entero escrito en su forma canónica, sin ceros a la izquierda ("0", "5", "20"; no "05").
// Es el mismo criterio que se aplica al :id de la ruta.
function esEnteroNoNegativo(texto) {
  return /^(0|[1-9]\d*)$/.test(texto);
}

/**
 * Valida los parámetros de GET /jugadores.
 * Política única: cualquier parámetro desconocido, repetido o mal formado produce un 400.
 * Devuelve { errors, filters } con los valores ya convertidos a su tipo.
 */
function validateJugadorQuery(query) {
  const errors = [];
  const valores = {};

  // Primero los parámetros desconocidos o repetidos. Los demás se siguen validando
  // para devolver todas las incidencias en la misma respuesta.
  for (const clave of Object.keys(query)) {
    if (!PARAMETROS_CONSULTA.includes(clave)) {
      errors.push({ field: clave, message: 'Parámetro de consulta desconocido.' });
    } else if (typeof query[clave] !== 'string') {
      errors.push({ field: clave, message: 'El parámetro solo puede aparecer una vez.' });
    } else {
      valores[clave] = query[clave];
    }
  }

  const { search, disponible, posicion, sort, order, limit, offset } = valores;
  const filters = { limit: LIMIT_POR_DEFECTO, offset: 0 };

  if (search !== undefined && search.trim() !== '') {
    filters.search = search.trim();
  }

  if (disponible !== undefined) {
    if (disponible === 'true' || disponible === 'false') {
      filters.disponible = disponible === 'true';
    } else {
      errors.push({ field: 'disponible', message: 'disponible debe ser true o false.' });
    }
  }

  if (posicion !== undefined) {
    if (POSICIONES.includes(posicion)) {
      filters.posicion = posicion;
    } else {
      errors.push({ field: 'posicion', message: `posicion debe ser una de: ${POSICIONES.join(', ')}.` });
    }
  }

  if (sort !== undefined) {
    if (CAMPOS_ORDENABLES.includes(sort)) {
      filters.sort = sort;
    } else {
      errors.push({ field: 'sort', message: `sort debe ser uno de: ${CAMPOS_ORDENABLES.join(', ')}.` });
    }
  }

  if (order !== undefined) {
    if (order === 'asc' || order === 'desc') {
      filters.order = order;
    } else {
      errors.push({ field: 'order', message: 'order debe ser asc o desc.' });
    }
  }

  if (limit !== undefined) {
    const n = Number(limit);
    if (esEnteroNoNegativo(limit) && n >= 1 && n <= LIMIT_MAXIMO) {
      filters.limit = n;
    } else {
      errors.push({ field: 'limit', message: `limit debe ser un entero entre 1 y ${LIMIT_MAXIMO}.` });
    }
  }

  if (offset !== undefined) {
    if (esEnteroNoNegativo(offset)) {
      filters.offset = Number(offset);
    } else {
      errors.push({ field: 'offset', message: 'offset debe ser un entero mayor o igual que 0.' });
    }
  }

  return { errors, filters };
}

/** GET /jugadores/stats no admite parámetros: se aplica la misma política (400). */
function validateStatsQuery(query) {
  const errors = Object.keys(query).map((clave) => ({ field: clave, message: 'Parámetro de consulta desconocido.' }));
  return { errors };
}

module.exports = { validateJugador, validateJugadorQuery, validateStatsQuery, POSICIONES };
