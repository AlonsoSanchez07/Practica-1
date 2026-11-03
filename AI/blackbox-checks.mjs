// Comprobaciones HTTP de caja negra para la API de jugadores del CB Arganzuela.
// Generadas a partir del contrato (README.md), sin leer el código fuente.
// Uso: node AI/blackbox-checks.mjs   (con la API arrancada)
// Requisitos: Node.js 18+ (fetch global). Sin dependencias.

import assert from 'node:assert/strict';

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');

// Marca única de esta ejecución: todos los jugadores creados la llevan en el nombre,
// así podemos aislarlos con ?search= aunque otras personas usen la API a la vez.
const TAG = 'Qk' + Array.from({ length: 6 }, () => 'bcdfghjkmnpqrstvwxz'[Math.floor(Math.random() * 19)]).join('');

const POSICIONES = ['base', 'escolta', 'alero', 'ala-pivot', 'pivot'];
const CAMPOS = ['id', 'nombre', 'posicion', 'dorsal', 'puntos', 'disponible'];
const NO_EXISTE = 987654321; // id que no debería existir nunca

// Ids creados por este script, para borrarlos al final.
const creados = new Set();

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

// Petición HTTP genérica. Devuelve status, cabeceras, texto y JSON (si lo hay).
async function api(method, path, body, { raw = false, contentType = 'application/json' } = {}) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = contentType;
    opts.body = raw ? body : JSON.stringify(body);
  }
  const res = await fetch(BASE + path, opts);
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
  return { status: res.status, headers: res.headers, text, json };
}

// Comprueba status y que la respuesta sea JSON.
function esperaJSON(r, status) {
  assert.equal(r.status, status, `status ${r.status} (esperado ${status}); cuerpo: ${r.text.slice(0, 300)}`);
  assert.match(r.headers.get('content-type') || '', /application\/json/, 'la respuesta no es JSON');
  assert.notEqual(r.json, undefined, 'cuerpo JSON vacío o ilegible');
}

// Comprueba un 400 con formato { errors: [{ field, message }] } y devuelve los campos.
function espera400(r) {
  esperaJSON(r, 400);
  assert.ok(Array.isArray(r.json.errors), 'falta el array errors');
  assert.ok(r.json.errors.length > 0, 'errors está vacío');
  for (const e of r.json.errors) {
    assert.equal(typeof e.field, 'string', `field no es texto: ${JSON.stringify(e)}`);
    assert.equal(typeof e.message, 'string', `message no es texto: ${JSON.stringify(e)}`);
    assert.ok(e.message.length > 0, 'message vacío');
  }
  return r.json.errors.map((e) => e.field);
}

// Comprueba un 404 con formato { error: "..." }.
function espera404(r) {
  esperaJSON(r, 404);
  assert.equal(typeof r.json.error, 'string', 'falta el campo error');
  assert.ok(r.json.error.length > 0, 'error vacío');
}

// Comprueba que un objeto es un jugador con exactamente los seis campos del contrato.
function esJugador(j) {
  assert.deepEqual(Object.keys(j).sort(), [...CAMPOS].sort(), `campos inesperados: ${JSON.stringify(j)}`);
  assert.ok(Number.isInteger(j.id) && j.id > 0, 'id no es entero positivo');
}

// Crea un jugador propio (lo registra para borrarlo al final).
async function crear(datos) {
  const r = await api('POST', '/jugadores', datos);
  esperaJSON(r, 201);
  creados.add(r.json.id);
  return r.json;
}

// Borra un jugador propio.
async function borrar(id) {
  const r = await api('DELETE', `/jugadores/${id}`);
  if (r.status === 204 || r.status === 404) creados.delete(id);
  return r;
}

// Descarga la colección completa recorriendo todas las páginas.
async function listaCompleta() {
  const items = [];
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const r = await api('GET', `/jugadores?limit=100&offset=${offset}`);
    esperaJSON(r, 200);
    total = r.json.total;
    items.push(...r.json.items);
    if (r.json.items.length === 0) break;
    offset += r.json.items.length;
  }
  return items;
}

// Calcula el resumen esperado a partir de una lista de jugadores.
function resumen(lista) {
  const porPosicion = Object.fromEntries(POSICIONES.map((p) => [p, 0]));
  for (const j of lista) porPosicion[j.posicion] = (porPosicion[j.posicion] || 0) + 1;
  const suma = lista.reduce((s, j) => s + j.puntos, 0);
  const max = lista.length ? Math.max(...lista.map((j) => j.puntos)) : null;
  return {
    total: lista.length,
    disponibles: lista.filter((j) => j.disponible).length,
    mediaPuntos: lista.length ? suma / lista.length : 0,
    max,
    candidatosMax: lista.filter((j) => j.puntos === max),
    porPosicion,
  };
}

// Compara las stats de la API con el resumen calculado por nosotros.
function comparaStats(stats, esperado) {
  assert.equal(stats.total, esperado.total, 'total no coincide');
  assert.equal(stats.disponibles, esperado.disponibles, 'disponibles no coincide');
  // El contrato no dice cómo se redondea mediaPuntos: se admite redondeo a 1 decimal.
  assert.ok(Math.abs(stats.mediaPuntos - esperado.mediaPuntos) <= 0.05 + 1e-9,
    `mediaPuntos ${stats.mediaPuntos} vs calculada ${esperado.mediaPuntos}`);
  if (esperado.total === 0) {
    assert.equal(stats.maximoAnotador, null);
  } else {
    assert.equal(stats.maximoAnotador.puntos, esperado.max, 'maximoAnotador.puntos no es el máximo');
    const c = esperado.candidatosMax.find((j) => j.id === stats.maximoAnotador.id);
    assert.ok(c, 'maximoAnotador.id no corresponde a ningún jugador con el máximo de puntos');
    assert.equal(stats.maximoAnotador.nombre, c.nombre, 'maximoAnotador.nombre no coincide');
  }
  for (const p of POSICIONES) {
    assert.equal(stats.porPosicion[p], esperado.porPosicion[p], `porPosicion.${p} no coincide`);
  }
}

// Comprueba que una lista está ordenada según un comparador.
function ordenada(items, cmp, sentido) {
  for (let i = 1; i < items.length; i++) {
    const c = cmp(items[i - 1], items[i]);
    assert.ok(sentido === 'asc' ? c <= 0 : c >= 0,
      `orden ${sentido} roto entre ${JSON.stringify(items[i - 1])} y ${JSON.stringify(items[i])}`);
  }
}
const cmpNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
const cmpNum = (campo) => (a, b) => a[campo] - b[campo];

// Cuerpo válido de partida para variaciones.
const valido = (extra = {}) => ({
  nombre: `Prueba ${TAG}`, posicion: 'alero', dorsal: 10, puntos: 10, disponible: true, ...extra,
});

// ---------------------------------------------------------------------------
// Registro y ejecución de comprobaciones (cada una aislada con try/catch)
// ---------------------------------------------------------------------------

const checks = [];
const check = (nombre, fn) => checks.push({ nombre, fn });

// Jugadores propios de prueba (se rellenan en la preparación).
// Nombres elegidos para que su orden alfabético sea A < B < C < D < E.
const fx = {};
const FIXTURES = {
  A: { nombre: `Abel Núñez ${TAG}`, posicion: 'base', dorsal: 3, puntos: 5.5, disponible: true },
  B: { nombre: `Bruno Ávila ${TAG}`, posicion: 'base', dorsal: 8, puntos: 12.25, disponible: false },
  C: { nombre: `Ciro Gil ${TAG}`, posicion: 'pivot', dorsal: 20, puntos: 0, disponible: true },
  D: { nombre: `Dario Paz ${TAG}`, posicion: 'alero', dorsal: 99, puntos: 59.5, disponible: true },
  E: { nombre: `Eloy Rey ${TAG}`, posicion: 'escolta', dorsal: 0, puntos: 30.5, disponible: false },
};
const ids = (items) => items.map((j) => j.id);
const fxIds = (...letras) => letras.map((l) => fx[l].id);
const q = (params) => `/jugadores?search=${encodeURIComponent(TAG)}${params ? '&' + params : ''}`;

// ===== Preparación ==========================================================

check('preparación: crear jugadores propios', async () => {
  for (const [k, datos] of Object.entries(FIXTURES)) fx[k] = await crear(datos);
  const r = await api('GET', q());
  esperaJSON(r, 200);
  assert.equal(r.json.total, 5, 'no se encuentran los 5 jugadores propios por la marca');
});

// ===== POST /jugadores ======================================================

check('POST: 201, cuerpo con id y cabecera Location', async () => {
  const body = valido({ nombre: `Post ${TAG}` });
  const r = await api('POST', '/jugadores', body);
  esperaJSON(r, 201);
  creados.add(r.json.id);
  esJugador(r.json);
  const { id, ...resto } = r.json;
  assert.deepEqual(resto, body);
  const loc = r.headers.get('location');
  assert.ok(loc, 'falta la cabecera Location');
  assert.equal(new URL(loc, BASE).pathname, `/jugadores/${id}`);
  // La URL de Location devuelve el mismo jugador.
  const g = await api('GET', new URL(loc, BASE).pathname);
  esperaJSON(g, 200);
  assert.deepEqual(g.json, r.json);
  await borrar(id);
});

check('POST: ignora el id del cliente y descarta campos desconocidos', async () => {
  const r = await api('POST', '/jugadores', valido({ nombre: `Ignora ${TAG}`, id: NO_EXISTE, color: 'azul' }));
  esperaJSON(r, 201);
  creados.add(r.json.id);
  esJugador(r.json);
  assert.notEqual(r.json.id, NO_EXISTE, 'se ha usado el id enviado por el cliente');
  assert.equal('color' in r.json, false, 'el campo desconocido aparece en la respuesta');
  const g = await api('GET', `/jugadores/${r.json.id}`);
  assert.equal('color' in g.json, false, 'el campo desconocido se ha guardado');
  espera404(await api('GET', `/jugadores/${NO_EXISTE}`));
  await borrar(r.json.id);
});

check('POST: 400 con todas las incidencias (ejemplo del README)', async () => {
  const r = await api('POST', '/jugadores', { nombre: 'A', posicion: 'portero', dorsal: 120 });
  const campos = espera400(r);
  assert.deepEqual([...campos].sort(), ['disponible', 'dorsal', 'nombre', 'posicion', 'puntos']);
});

check('POST: cuerpo vacío {} lista los cinco campos obligatorios', async () => {
  const campos = espera400(await api('POST', '/jugadores', {}));
  assert.deepEqual([...campos].sort(), ['disponible', 'dorsal', 'nombre', 'posicion', 'puntos']);
});

check('POST: tipos estrictos ("7", "true", "3", 5, 7.5)', async () => {
  const casos = [
    [{ dorsal: '7' }, 'dorsal'],
    [{ dorsal: 7.5 }, 'dorsal'],
    [{ disponible: 'true' }, 'disponible'],
    [{ disponible: 1 }, 'disponible'],
    [{ puntos: '3' }, 'puntos'],
    [{ nombre: 5 }, 'nombre'],
    [{ posicion: 'Base' }, 'posicion'],
  ];
  for (const [extra, campo] of casos) {
    const campos = espera400(await api('POST', '/jugadores', valido(extra)));
    assert.deepEqual(campos, [campo], `con ${JSON.stringify(extra)}`);
  }
  // Varios tipos erróneos a la vez: todas las incidencias.
  const campos = espera400(await api('POST', '/jugadores',
    { nombre: 5, posicion: 'Base', dorsal: '7', puntos: '3', disponible: 'true' }));
  assert.deepEqual([...campos].sort(), ['disponible', 'dorsal', 'nombre', 'posicion', 'puntos']);
});

check('POST: valores justo en el límite se aceptan', async () => {
  const casos = [
    { dorsal: 0 }, { dorsal: 99 }, { puntos: 0 }, { puntos: 60 }, { puntos: 0.1 },
    { nombre: 'Zq' }, { nombre: ('Z' + TAG).padEnd(60, 'x') }, { nombre: '   Zq   ' },
    ...POSICIONES.map((posicion) => ({ posicion })),
    { disponible: false },
  ];
  for (const extra of casos) {
    const r = await api('POST', '/jugadores', valido(extra));
    assert.equal(r.status, 201, `con ${JSON.stringify(extra)}: ${r.text}`);
    creados.add(r.json.id);
    await borrar(r.json.id);
  }
});

check('POST: valores justo fuera del límite dan 400 en su campo', async () => {
  const casos = [
    [{ dorsal: -1 }, 'dorsal'], [{ dorsal: 100 }, 'dorsal'],
    [{ puntos: -0.01 }, 'puntos'], [{ puntos: 60.01 }, 'puntos'],
    [{ nombre: 'Z' }, 'nombre'], [{ nombre: 'Z'.repeat(61) }, 'nombre'],
    [{ nombre: '   Z   ' }, 'nombre'], [{ posicion: 'portero' }, 'posicion'],
    [{ disponible: null }, 'disponible'],
  ];
  for (const [extra, campo] of casos) {
    const r = await api('POST', '/jugadores', valido(extra));
    if (r.status === 201) creados.add(r.json.id);
    const campos = espera400(r);
    assert.deepEqual(campos, [campo], `con ${JSON.stringify(extra)}`);
  }
});

check('POST: un 400 no crea el jugador', async () => {
  const nombre = `NoCrear ${TAG}`;
  espera400(await api('POST', '/jugadores', { nombre, posicion: 'base', dorsal: 200, puntos: 1, disponible: true }));
  const r = await api('GET', `/jugadores?search=${encodeURIComponent(nombre)}`);
  esperaJSON(r, 200);
  assert.equal(r.json.total, 0);
});

check('POST: JSON mal formado da 400 con formato errors', async () => {
  espera400(await api('POST', '/jugadores', '{"nombre": ', { raw: true }));
});

// ===== GET /jugadores/:id ===================================================

check('GET /:id: 200 con el jugador', async () => {
  const r = await api('GET', `/jugadores/${fx.A.id}`);
  esperaJSON(r, 200);
  esJugador(r.json);
  assert.deepEqual(r.json, fx.A);
});

check('GET /:id: 404 JSON si no existe', async () => {
  espera404(await api('GET', `/jugadores/${NO_EXISTE}`));
});

check('GET /:id: id no entero positivo se trata como inexistente (404)', async () => {
  // Revisión humana: '01' añadido tras el informe del agente (antes devolvía el jugador 1).
  for (const id of ['abc', '0', '-1', '1.5', '01']) espera404(await api('GET', `/jugadores/${id}`));
});

check('Ruta inexistente: 404 JSON con error', async () => {
  espera404(await api('GET', '/ruta-que-no-existe'));
  espera404(await api('POST', '/jugadores/1/otra'));
  espera404(await api('DELETE', '/jugadores'));
});

// ===== PUT /jugadores/:id ===================================================

check('PUT: 200 sustituye el jugador completo', async () => {
  const j = await crear(valido({ nombre: `Put ${TAG}` }));
  const nuevo = { nombre: `Put Cambiado ${TAG}`, posicion: 'pivot', dorsal: 44, puntos: 22.2, disponible: false };
  const r = await api('PUT', `/jugadores/${j.id}`, nuevo);
  esperaJSON(r, 200);
  assert.deepEqual(r.json, { id: j.id, ...nuevo });
  const g = await api('GET', `/jugadores/${j.id}`);
  assert.deepEqual(g.json, { id: j.id, ...nuevo });
  await borrar(j.id);
});

check('PUT: ignora id del cuerpo y campos desconocidos', async () => {
  const j = await crear(valido({ nombre: `PutId ${TAG}` }));
  const r = await api('PUT', `/jugadores/${j.id}`, valido({ nombre: `PutId2 ${TAG}`, id: NO_EXISTE, color: 'rojo' }));
  esperaJSON(r, 200);
  assert.equal(r.json.id, j.id);
  esJugador(r.json);
  espera404(await api('GET', `/jugadores/${NO_EXISTE}`));
  await borrar(j.id);
});

check('PUT: exige todos los campos (400 y no rellena con el anterior)', async () => {
  const j = await crear(valido({ nombre: `PutFalta ${TAG}` }));
  const { disponible, ...sinDisponible } = valido({ nombre: `PutFalta2 ${TAG}` });
  const campos = espera400(await api('PUT', `/jugadores/${j.id}`, sinDisponible));
  assert.deepEqual(campos, ['disponible']);
  // Solo un campo: faltan los otros cuatro.
  const campos2 = espera400(await api('PUT', `/jugadores/${j.id}`, { dorsal: 5 }));
  assert.deepEqual([...campos2].sort(), ['disponible', 'nombre', 'posicion', 'puntos']);
  // El jugador no ha cambiado.
  const g = await api('GET', `/jugadores/${j.id}`);
  assert.deepEqual(g.json, j);
  await borrar(j.id);
});

check('PUT: validación completa con todas las incidencias', async () => {
  const j = await crear(valido({ nombre: `PutVal ${TAG}` }));
  const campos = espera400(await api('PUT', `/jugadores/${j.id}`,
    { nombre: 'A', posicion: 'portero', dorsal: 100, puntos: 61, disponible: 'no' }));
  assert.deepEqual([...campos].sort(), ['disponible', 'dorsal', 'nombre', 'posicion', 'puntos']);
  await borrar(j.id);
});

check('PUT: 404 si no existe, antes de validar el cuerpo', async () => {
  espera404(await api('PUT', `/jugadores/${NO_EXISTE}`, valido()));
  espera404(await api('PUT', `/jugadores/${NO_EXISTE}`, { dorsal: 'x' }));
  espera404(await api('PUT', '/jugadores/abc', valido()));
});

// ===== PATCH /jugadores/:id =================================================

check('PATCH: 200 modifica solo los campos enviados', async () => {
  const j = await crear(valido({ nombre: `Patch ${TAG}` }));
  const r = await api('PATCH', `/jugadores/${j.id}`, { disponible: false });
  esperaJSON(r, 200);
  assert.deepEqual(r.json, { ...j, disponible: false });
  const r2 = await api('PATCH', `/jugadores/${j.id}`, { dorsal: 0, puntos: 60 });
  esperaJSON(r2, 200);
  assert.deepEqual(r2.json, { ...j, disponible: false, dorsal: 0, puntos: 60 });
  const g = await api('GET', `/jugadores/${j.id}`);
  assert.deepEqual(g.json, r2.json);
  await borrar(j.id);
});

check('PATCH: validación parcial (solo el campo enviado)', async () => {
  const j = await crear(valido({ nombre: `PatchVal ${TAG}` }));
  const casos = [
    [{ dorsal: 100 }, 'dorsal'], [{ dorsal: -1 }, 'dorsal'], [{ dorsal: '7' }, 'dorsal'],
    [{ puntos: 60.01 }, 'puntos'], [{ disponible: 'true' }, 'disponible'],
    [{ nombre: 'Z' }, 'nombre'], [{ posicion: 'portero' }, 'posicion'],
  ];
  for (const [body, campo] of casos) {
    const campos = espera400(await api('PATCH', `/jugadores/${j.id}`, body));
    assert.deepEqual(campos, [campo], `con ${JSON.stringify(body)}`);
  }
  // Varios inválidos a la vez: todas las incidencias.
  const campos = espera400(await api('PATCH', `/jugadores/${j.id}`, { dorsal: 100, puntos: -1 }));
  assert.deepEqual([...campos].sort(), ['dorsal', 'puntos']);
  // El jugador no ha cambiado.
  const g = await api('GET', `/jugadores/${j.id}`);
  assert.deepEqual(g.json, j);
  await borrar(j.id);
});

check('PATCH: cuerpo sin ningún campo conocido da 400', async () => {
  const j = await crear(valido({ nombre: `PatchVacio ${TAG}` }));
  espera400(await api('PATCH', `/jugadores/${j.id}`, {}));
  espera400(await api('PATCH', `/jugadores/${j.id}`, { color: 'azul' }));
  espera400(await api('PATCH', `/jugadores/${j.id}`, { id: 5 }));
  await borrar(j.id);
});

check('PATCH: ignora id y descarta campos desconocidos', async () => {
  const j = await crear(valido({ nombre: `PatchId ${TAG}` }));
  const r = await api('PATCH', `/jugadores/${j.id}`, { dorsal: 50, id: NO_EXISTE, color: 'verde' });
  esperaJSON(r, 200);
  assert.deepEqual(r.json, { ...j, dorsal: 50 });
  await borrar(j.id);
});

check('PATCH: 404 si no existe, antes de validar el cuerpo', async () => {
  espera404(await api('PATCH', `/jugadores/${NO_EXISTE}`, { disponible: false }));
  espera404(await api('PATCH', `/jugadores/${NO_EXISTE}`, { dorsal: 'x' }));
  espera404(await api('PATCH', '/jugadores/abc', { dorsal: 1 }));
});

// ===== DELETE /jugadores/:id ================================================

check('DELETE: 204 sin cuerpo y después 404', async () => {
  const j = await crear(valido({ nombre: `Delete ${TAG}` }));
  const r = await api('DELETE', `/jugadores/${j.id}`);
  assert.equal(r.status, 204);
  assert.equal(r.text, '', 'el 204 trae cuerpo');
  creados.delete(j.id);
  espera404(await api('GET', `/jugadores/${j.id}`));
  espera404(await api('DELETE', `/jugadores/${j.id}`));
});

check('DELETE: 404 JSON si no existe o el id no es válido', async () => {
  espera404(await api('DELETE', `/jugadores/${NO_EXISTE}`));
  espera404(await api('DELETE', '/jugadores/abc'));
});

// ===== GET /jugadores: forma, filtros, orden y ventana ======================

check('GET lista: 200 con total, limit, offset e items por defecto', async () => {
  const r = await api('GET', '/jugadores');
  esperaJSON(r, 200);
  assert.deepEqual(Object.keys(r.json).sort(), ['items', 'limit', 'offset', 'total']);
  assert.equal(r.json.limit, 20);
  assert.equal(r.json.offset, 0);
  assert.ok(Array.isArray(r.json.items));
  assert.ok(r.json.items.length <= 20);
  assert.ok(r.json.total >= r.json.items.length);
  r.json.items.forEach(esJugador);
  // Sin sort se ordena por id ascendente.
  ordenada(r.json.items, cmpNum('id'), 'asc');
});

check('Filtro search: parcial, sin mayúsculas ni tildes', async () => {
  let r = await api('GET', `/jugadores?search=${encodeURIComponent(TAG.toUpperCase())}`);
  esperaJSON(r, 200);
  assert.deepEqual(ids(r.json.items), fxIds('A', 'B', 'C', 'D', 'E'));
  // "AVILA" encuentra "Ávila"; "nunez" encuentra "Núñez".
  r = await api('GET', `/jugadores?search=${encodeURIComponent('AVILA ' + TAG.toLowerCase())}`);
  assert.deepEqual(ids(r.json.items), fxIds('B'));
  r = await api('GET', `/jugadores?search=${encodeURIComponent('nunez ' + TAG)}`);
  assert.deepEqual(ids(r.json.items), fxIds('A'));
  // Búsqueda parcial en mitad del nombre.
  r = await api('GET', `/jugadores?search=${encodeURIComponent(TAG.slice(1, 6))}`);
  assert.ok(fxIds('A', 'B', 'C', 'D', 'E').every((id) => ids(r.json.items).includes(id)));
});

check('Filtro disponible (true y false)', async () => {
  for (const v of [true, false]) {
    const r = await api('GET', `/jugadores?disponible=${v}&limit=100`);
    esperaJSON(r, 200);
    assert.ok(r.json.items.every((j) => j.disponible === v), `hay jugadores con disponible != ${v}`);
    const mios = Object.values(fx).filter((j) => j.disponible === v).map((j) => j.id);
    if (r.json.total <= 100) assert.ok(mios.every((id) => ids(r.json.items).includes(id)), 'faltan jugadores propios');
  }
});

check('Filtro posicion (las cinco posiciones)', async () => {
  for (const p of POSICIONES) {
    const r = await api('GET', `/jugadores?posicion=${p}&limit=100`);
    esperaJSON(r, 200);
    assert.ok(r.json.items.every((j) => j.posicion === p), `hay jugadores con posicion != ${p}`);
    const mios = Object.values(fx).filter((j) => j.posicion === p).map((j) => j.id);
    if (r.json.total <= 100) assert.ok(mios.every((id) => ids(r.json.items).includes(id)), `faltan jugadores propios (${p})`);
  }
});

check('Filtros combinados (search + posicion + disponible)', async () => {
  let r = await api('GET', q('posicion=base'));
  assert.deepEqual(ids(r.json.items), fxIds('A', 'B'));
  r = await api('GET', q('disponible=false'));
  assert.deepEqual(ids(r.json.items), fxIds('B', 'E'));
  r = await api('GET', q('posicion=base&disponible=true'));
  assert.deepEqual(ids(r.json.items), fxIds('A'));
  assert.equal(r.json.total, 1);
  r = await api('GET', q('posicion=pivot&disponible=false'));
  assert.equal(r.json.total, 0);
  assert.deepEqual(r.json.items, []);
});

check('Ordenación por nombre asc/desc', async () => {
  let r = await api('GET', q('sort=nombre'));
  assert.deepEqual(ids(r.json.items), fxIds('A', 'B', 'C', 'D', 'E'));
  r = await api('GET', q('sort=nombre&order=desc'));
  assert.deepEqual(ids(r.json.items), fxIds('E', 'D', 'C', 'B', 'A'));
  // Sobre toda la colección también se respeta el orden.
  r = await api('GET', '/jugadores?sort=nombre&order=desc&limit=100');
  ordenada(r.json.items, cmpNombre, 'desc');
});

check('Ordenación por dorsal asc/desc (asc por defecto)', async () => {
  let r = await api('GET', q('sort=dorsal'));
  assert.deepEqual(ids(r.json.items), fxIds('E', 'A', 'B', 'C', 'D'));
  r = await api('GET', q('sort=dorsal&order=asc'));
  assert.deepEqual(ids(r.json.items), fxIds('E', 'A', 'B', 'C', 'D'));
  r = await api('GET', q('sort=dorsal&order=desc'));
  assert.deepEqual(ids(r.json.items), fxIds('D', 'C', 'B', 'A', 'E'));
  r = await api('GET', '/jugadores?sort=dorsal&limit=100');
  ordenada(r.json.items, cmpNum('dorsal'), 'asc');
});

check('Ordenación por puntos asc/desc', async () => {
  let r = await api('GET', q('sort=puntos&order=asc'));
  assert.deepEqual(ids(r.json.items), fxIds('C', 'A', 'B', 'E', 'D'));
  r = await api('GET', q('sort=puntos&order=desc'));
  assert.deepEqual(ids(r.json.items), fxIds('D', 'E', 'B', 'A', 'C'));
  r = await api('GET', '/jugadores?sort=puntos&order=desc&limit=100');
  ordenada(r.json.items, cmpNum('puntos'), 'desc');
});

check('Sin sort: orden por id (también con order=desc)', async () => {
  let r = await api('GET', q());
  assert.deepEqual(ids(r.json.items), fxIds('A', 'B', 'C', 'D', 'E'));
  r = await api('GET', q('order=desc'));
  assert.deepEqual(ids(r.json.items), fxIds('E', 'D', 'C', 'B', 'A'));
});

check('limit/offset: ventanas y total independiente de la ventana', async () => {
  const ventanas = [
    ['limit=2&offset=0', ['A', 'B']],
    ['limit=2&offset=2', ['C', 'D']],
    ['limit=2&offset=4', ['E']],
    ['limit=2&offset=5', []],
    ['limit=1', ['A']],
    ['offset=3', ['D', 'E']],
    ['limit=100&offset=0', ['A', 'B', 'C', 'D', 'E']],
  ];
  for (const [params, esperado] of ventanas) {
    const r = await api('GET', q(params));
    esperaJSON(r, 200);
    assert.equal(r.json.total, 5, `total con ${params}`);
    assert.deepEqual(ids(r.json.items), fxIds(...esperado), `items con ${params}`);
    const p = new URLSearchParams(params);
    assert.equal(r.json.limit, Number(p.get('limit') ?? 20), `limit con ${params}`);
    assert.equal(r.json.offset, Number(p.get('offset') ?? 0), `offset con ${params}`);
  }
});

check('Todo combinado: filtrar, ordenar y después ventana', async () => {
  // Disponibles propios: A(5.5), C(0), D(59.5). Por puntos desc: D, A, C. Ventana offset=1 limit=1 -> A.
  const r = await api('GET', q('disponible=true&sort=puntos&order=desc&limit=1&offset=1'));
  esperaJSON(r, 200);
  assert.equal(r.json.total, 3);
  assert.deepEqual(ids(r.json.items), fxIds('A'));
  // Ejemplo del contrato con filtros y orden sobre los jugadores propios.
  const r2 = await api('GET', q('posicion=base&disponible=false&sort=puntos&order=desc&limit=2'));
  assert.equal(r2.json.total, 1);
  assert.deepEqual(ids(r2.json.items), fxIds('B'));
});

check('limit y offset en sus límites (1, 100, 0) se aceptan', async () => {
  for (const params of ['limit=1', 'limit=100', 'offset=0', 'limit=100&offset=0']) {
    esperaJSON(await api('GET', `/jugadores?${params}`), 200);
  }
});

// ===== Política de parámetros desconocidos y mal formados ===================

check('Parámetro desconocido: 400 con field = nombre del parámetro', async () => {
  const campos = espera400(await api('GET', '/jugadores?color=azul'));
  assert.deepEqual(campos, ['color']);
  const campos2 = espera400(await api('GET', '/jugadores?color=azul&talla=xl'));
  assert.deepEqual([...campos2].sort(), ['color', 'talla']);
});

// Revisión humana: el agente solo exigía "color" porque el ejemplo antiguo del README contradecía
// la regla de "todas las incidencias". Se corrigió la API y el ejemplo, y se exige la lista exacta.
check('Ejemplo del README: ?limit=abc&color=azul da 400 con color y limit', async () => {
  const campos = espera400(await api('GET', '/jugadores?limit=abc&color=azul'));
  assert.deepEqual([...campos].sort(), ['color', 'limit']);
});

// Revisión humana: añadida tras el informe del agente (stats?x=1 respondía 200).
check('Stats: aplica la política de parámetros desconocidos (400)', async () => {
  const campos = espera400(await api('GET', '/jugadores/stats?x=1'));
  assert.deepEqual(campos, ['x']);
});

check('Valores mal formados o fuera de rango: 400 en su campo', async () => {
  const casos = [
    ['limit=abc', 'limit'], ['limit=0', 'limit'], ['limit=101', 'limit'], ['limit=1.5', 'limit'],
    ['limit=-1', 'limit'], ['limit=', 'limit'],
    ['offset=-1', 'offset'], ['offset=abc', 'offset'], ['offset=1.5', 'offset'],
    ['order=arriba', 'order'], ['sort=id', 'sort'], ['sort=color', 'sort'],
    ['posicion=portero', 'posicion'], ['disponible=quizas', 'disponible'], ['disponible=1', 'disponible'],
  ];
  for (const [params, campo] of casos) {
    const campos = espera400(await api('GET', `/jugadores?${params}`));
    assert.deepEqual(campos, [campo], `con ?${params}`);
  }
});

check('Varios valores mal formados: todas las incidencias a la vez', async () => {
  const campos = espera400(await api('GET',
    '/jugadores?limit=abc&order=arriba&posicion=portero&disponible=quizas&sort=id&offset=-2'));
  assert.deepEqual([...campos].sort(), ['disponible', 'limit', 'offset', 'order', 'posicion', 'sort']);
});

check('Parámetros repetidos: 400', async () => {
  const campos = espera400(await api('GET', '/jugadores?sort=nombre&sort=dorsal'));
  assert.ok(campos.includes('sort'));
  espera400(await api('GET', '/jugadores?limit=5&limit=5'));
});

check('Los errores de parámetros no detienen el servidor', async () => {
  await api('GET', '/jugadores?limit=abc&color=azul&order=arriba');
  esperaJSON(await api('GET', '/jugadores'), 200);
});

// ===== GET /jugadores/stats =================================================

check('Stats: 200 con la forma del contrato y no se trata como id', async () => {
  const r = await api('GET', '/jugadores/stats');
  esperaJSON(r, 200);
  assert.deepEqual(Object.keys(r.json).sort(), ['disponibles', 'maximoAnotador', 'mediaPuntos', 'porPosicion', 'total']);
  assert.ok(Number.isInteger(r.json.total));
  assert.ok(Number.isInteger(r.json.disponibles));
  assert.equal(typeof r.json.mediaPuntos, 'number');
  if (r.json.maximoAnotador !== null) {
    assert.deepEqual(Object.keys(r.json.maximoAnotador).sort(), ['id', 'nombre', 'puntos']);
  }
  assert.deepEqual(Object.keys(r.json.porPosicion).sort(), [...POSICIONES].sort());
});

check('Stats: coherente con la lista completa de GET /jugadores', async () => {
  // Se reintenta por si otra persona modifica los datos entre las dos peticiones.
  let ultimoError;
  for (let intento = 0; intento < 3; intento++) {
    try {
      const lista = await listaCompleta();
      const s = await api('GET', '/jugadores/stats');
      esperaJSON(s, 200);
      comparaStats(s.json, resumen(lista));
      return;
    } catch (e) { ultimoError = e; }
  }
  throw ultimoError;
});

check('Stats: se recalcula tras crear, modificar y borrar', async () => {
  let ultimoError;
  for (let intento = 0; intento < 3; intento++) {
    let j;
    try {
      const s1 = (await api('GET', '/jugadores/stats')).json;
      j = await crear({ nombre: `Stats ${TAG}`, posicion: 'pivot', dorsal: 1, puntos: 1, disponible: true });
      const s2 = (await api('GET', '/jugadores/stats')).json;
      assert.equal(s2.total, s1.total + 1, 'total no sube tras crear');
      assert.equal(s2.disponibles, s1.disponibles + 1, 'disponibles no sube tras crear');
      assert.equal(s2.porPosicion.pivot, s1.porPosicion.pivot + 1, 'porPosicion.pivot no sube');
      await api('PATCH', `/jugadores/${j.id}`, { disponible: false, posicion: 'base' });
      const s3 = (await api('GET', '/jugadores/stats')).json;
      assert.equal(s3.disponibles, s2.disponibles - 1, 'disponibles no baja tras PATCH');
      assert.equal(s3.porPosicion.pivot, s2.porPosicion.pivot - 1, 'pivot no baja tras PATCH');
      assert.equal(s3.porPosicion.base, s2.porPosicion.base + 1, 'base no sube tras PATCH');
      // Coherencia completa tras el cambio.
      comparaStats(s3, resumen(await listaCompleta()));
      await borrar(j.id);
      const s4 = (await api('GET', '/jugadores/stats')).json;
      assert.equal(s4.total, s3.total - 1, 'total no baja tras borrar');
      return;
    } catch (e) {
      ultimoError = e;
      if (j) await borrar(j.id);
    }
  }
  throw ultimoError;
});

check('Stats: maximoAnotador cambia al crear un jugador con 60 puntos', async () => {
  const j = await crear({ nombre: `Maximo ${TAG}`, posicion: 'base', dorsal: 2, puntos: 60, disponible: true });
  const s = (await api('GET', '/jugadores/stats')).json;
  assert.equal(s.maximoAnotador.puntos, 60);
  await borrar(j.id);
});

// ===== Limpieza =============================================================

check('limpieza: borrar los jugadores propios', async () => {
  for (const id of [...creados]) {
    const r = await borrar(id);
    assert.ok(r.status === 204 || r.status === 404, `DELETE ${id} devolvió ${r.status}`);
  }
  const r = await api('GET', `/jugadores?search=${encodeURIComponent(TAG)}`);
  assert.equal(r.json.total, 0, 'quedan jugadores propios sin borrar');
});

// ---------------------------------------------------------------------------
// Ejecución
// ---------------------------------------------------------------------------

let ok = 0;
for (const { nombre, fn } of checks) {
  try {
    await fn();
    ok++;
    console.log(`  OK    ${nombre}`);
  } catch (e) {
    console.log(`  FALLO ${nombre}\n        ${String(e.message).split('\n').join('\n        ')}`);
  }
}
// Red de seguridad: borra lo que haya quedado si la limpieza falló.
for (const id of creados) { try { await api('DELETE', `/jugadores/${id}`); } catch {} }

console.log(`\n${ok}/${checks.length} comprobaciones superadas`);
process.exit(ok === checks.length ? 0 : 1);
