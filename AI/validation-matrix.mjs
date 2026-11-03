// Matriz declarativa de validación de entradas de la API /jugadores.
// Escrita solo a partir del contrato (README.md). Node 18+, sin dependencias.
// Uso:  node AI/validation-matrix.mjs            ejecuta todos los casos
//       node AI/validation-matrix.mjs --tabla    imprime la matriz sin ejecutarla
//       node AI/validation-matrix.mjs --cobertura imprime casos por endpoint y entrada
import assert from 'node:assert/strict';

const BASE = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
// Marca aleatoria para encontrar (y borrar) solo nuestros jugadores con ?search=
const MARCA = `vmq${Math.random().toString(36).slice(2, 8)}`;
const AUSENTE = Symbol('ausente');
const CLAVES_RECURSO = ['disponible', 'dorsal', 'id', 'nombre', 'posicion', 'puntos'];
const EDITABLES = ['nombre', 'posicion', 'dorsal', 'puntos', 'disponible'];

// ---------------------------------------------------------------------------
// Datos base. "t" es el token único de cada caso (MARCA + número de caso).
// ---------------------------------------------------------------------------
const nombreDe = (n, t) => { const s = `N${t}`; return s.length <= n ? s.padEnd(n, 'a') : 'N'.padEnd(n, 'a'); };
const JUGADOR = t => ({ nombre: `Jugador ${t}`, posicion: 'escolta', dorsal: 21, puntos: 3.5, disponible: true });
const FIXTURE = t => ({ nombre: `Fixture ${t}`, posicion: 'base', dorsal: 7, puntos: 10, disponible: true });
const OTRO = t => ({ nombre: `Otro ${t}`, posicion: 'pivot', dorsal: 42, puntos: 20.5, disponible: false });
const PLANTILLA = { POST: JUGADOR, PUT: OTRO, PATCH: OTRO };
const ENDPOINT = { POST: 'POST /jugadores', PUT: 'PUT /jugadores/:id', PATCH: 'PATCH /jugadores/:id', GET: 'GET /jugadores/:id', DELETE: 'DELETE /jugadores/:id' };
const EXITO = { POST: 201, PUT: 200, PATCH: 200, GET: 200, DELETE: 204 };

// JSON crudo (para lo que JSON.stringify no puede expresar: 1e2, -0, claves duplicadas, __proto__...)
// cambios: { campo: 'literal JSON' | null (omitir) }, extra: pares "clave":valor añadidos al final
const crudo = (cambios = {}, extra = '') => t => {
  const piezas = { nombre: JSON.stringify(`Jugador ${t}`), posicion: '"base"', dorsal: '5', puntos: '1', disponible: 'true', ...cambios };
  const partes = Object.entries(piezas).filter(([, v]) => v !== null).map(([k, v]) => `"${k}":${v}`);
  if (extra) partes.push(extra);
  return `{${partes.join(',')}}`;
};

// Constructor genérico de un caso de la matriz
const C = (bloque, endpoint, entrada, regla, valor, peticion, status, errores = [], extra = {}) => ({
  bloque, endpoint, entrada, regla, valor,
  metodo: endpoint.split(' ')[0], ruta: endpoint.split(' ')[1].replace(':id', '{{ID}}'),
  ...peticion, status, errores, ...extra,
});
const mostrar = v => v === AUSENTE ? '(ausente)' : typeof v === 'function' ? '(generado)' : recortar(JSON.stringify(v), 40);
const recortar = (s, n) => (s === undefined ? 'undefined' : s.length > n ? `${s.slice(0, n)}…(${s.length})` : s);

// ---------------------------------------------------------------------------
// 1. CAMPOS DEL CUERPO: valores por campo. ok=true -> válido; guardado = valor esperado tras guardar.
// ---------------------------------------------------------------------------
const VALORES = {
  nombre: [
    { regla: 'obligatorio', valor: AUSENTE },
    { regla: 'tipo: número', valor: 123 },
    { regla: 'tipo: booleano', valor: true },
    { regla: 'tipo: null', valor: null },
    { regla: 'tipo: array', valor: t => [`Nombre ${t}`], muestra: '["Nombre …"]' },
    { regla: 'tipo: objeto', valor: t => ({ texto: `Nombre ${t}` }), muestra: '{"texto":"Nombre …"}' },
    { regla: 'texto vacío', valor: '' },
    { regla: 'solo espacios', valor: '      ' },
    { regla: 'longitud 1 (justo fuera)', valor: 'A' },
    { regla: 'longitud 1 tras recortar (justo fuera)', valor: '   A   ' },
    { regla: 'longitud 2 (límite)', valor: 'Ab', ok: true },
    { regla: 'longitud 2 tras recortar (límite)', valor: '   Ab   ', ok: true, guardado: 'Ab' },
    { regla: 'longitud 60 (límite)', valor: t => nombreDe(60, t), ok: true, muestra: '"N…a" (60)' },
    { regla: 'longitud 60 tras recortar (límite)', valor: t => `  ${nombreDe(60, t)}  `, ok: true, guardado: t => nombreDe(60, t), muestra: '"  N…a  " (64 -> 60)' },
    { regla: 'longitud 61 (justo fuera)', valor: t => nombreDe(61, t), muestra: '"N…a" (61)' },
  ],
  posicion: [
    { regla: 'obligatorio', valor: AUSENTE },
    { regla: 'tipo: número', valor: 1 },
    { regla: 'tipo: booleano', valor: true },
    { regla: 'tipo: null', valor: null },
    { regla: 'tipo: array', valor: ['base'] },
    { regla: 'tipo: objeto', valor: { posicion: 'base' } },
    { regla: 'texto vacío', valor: '' },
    { regla: 'fuera de la lista', valor: 'portero' },
    { regla: 'mayúscula inicial', valor: 'Base' },
    { regla: 'todo mayúsculas', valor: 'BASE' },
    { regla: 'con espacios alrededor', valor: ' base ' },
    { regla: 'variante con espacio', valor: 'ala pivot' },
    { regla: 'variante con guion bajo', valor: 'ala_pivot' },
    { regla: 'valor permitido', valor: 'base', ok: true },
    { regla: 'valor permitido', valor: 'escolta', ok: true },
    { regla: 'valor permitido', valor: 'alero', ok: true },
    { regla: 'valor permitido', valor: 'ala-pivot', ok: true },
    { regla: 'valor permitido', valor: 'pivot', ok: true },
  ],
  dorsal: [
    { regla: 'obligatorio', valor: AUSENTE },
    { regla: 'tipo: texto numérico', valor: '7' },
    { regla: 'tipo: texto vacío', valor: '' },
    { regla: 'tipo: booleano', valor: true },
    { regla: 'tipo: null', valor: null },
    { regla: 'tipo: array', valor: [7] },
    { regla: 'tipo: objeto', valor: { valor: 7 } },
    { regla: 'mínimo 0 (límite)', valor: 0, ok: true },
    { regla: 'máximo 99 (límite)', valor: 99, ok: true },
    { regla: 'justo bajo el mínimo', valor: -1 },
    { regla: 'justo sobre el máximo', valor: 100 },
    { regla: 'no entero', valor: 7.5 },
    { regla: 'no entero cerca del máximo', valor: 98.5 },
    { regla: 'no entero cerca del mínimo', valor: 0.5 },
  ],
  puntos: [
    { regla: 'obligatorio', valor: AUSENTE },
    { regla: 'tipo: texto numérico', valor: '14.5' },
    { regla: 'tipo: texto vacío', valor: '' },
    { regla: 'tipo: booleano', valor: true },
    { regla: 'tipo: null', valor: null },
    { regla: 'tipo: array', valor: [14.5] },
    { regla: 'tipo: objeto', valor: { valor: 14.5 } },
    { regla: 'mínimo 0 (límite)', valor: 0, ok: true },
    { regla: 'máximo 60 (límite)', valor: 60, ok: true },
    { regla: 'decimal', valor: 14.5, ok: true },
    { regla: 'decimal cerca del mínimo', valor: 0.1, ok: true },
    { regla: 'decimal cerca del máximo', valor: 59.9, ok: true },
    { regla: 'justo bajo el mínimo (decimal)', valor: -0.1 },
    { regla: 'justo sobre el máximo (decimal)', valor: 60.1 },
    { regla: 'sobre el máximo por poco', valor: 60.0001 },
    { regla: 'bajo el mínimo (entero)', valor: -1 },
    { regla: 'sobre el máximo (entero)', valor: 61 },
  ],
  disponible: [
    { regla: 'obligatorio', valor: AUSENTE },
    { regla: 'tipo: texto "true"', valor: 'true' },
    { regla: 'tipo: texto "false"', valor: 'false' },
    { regla: 'tipo: texto vacío', valor: '' },
    { regla: 'tipo: número 1', valor: 1 },
    { regla: 'tipo: número 0', valor: 0 },
    { regla: 'tipo: null', valor: null },
    { regla: 'tipo: array', valor: [true] },
    { regla: 'tipo: objeto', valor: { valor: true } },
    { regla: 'booleano true', valor: true, ok: true },
    { regla: 'booleano false', valor: false, ok: true },
  ],
};

const CASOS = [];

// Expansión: POST y PUT con validación completa (plantilla + campo), PATCH con validación parcial (solo el campo)
for (const [campo, valores] of Object.entries(VALORES)) {
  for (const v of valores) {
    const muestra = v.muestra ?? mostrar(v.valor);
    const guardado = v.ok ? { [campo]: v.guardado ?? v.valor } : undefined;
    for (const m of ['POST', 'PUT']) {
      CASOS.push(C('campos', ENDPOINT[m], campo, v.regla, muestra, { base: m, cuerpo: { [campo]: v.valor } },
        v.ok ? EXITO[m] : 400, v.ok ? [] : [campo], { guardado }));
    }
    if (v.valor === AUSENTE) {
      // En PATCH un campo ausente no es error: se envían los otros cuatro y este se conserva
      CASOS.push(C('campos', ENDPOINT.PATCH, campo, 'ausente (parcial: se conserva)', '(ausente)',
        { base: 'PATCH', cuerpo: { [campo]: AUSENTE } }, 200, []));
    } else {
      CASOS.push(C('campos', ENDPOINT.PATCH, campo, v.regla, muestra, { cuerpo: { [campo]: v.valor } },
        v.ok ? 200 : 400, v.ok ? [] : [campo], { guardado }));
    }
  }
}

// Combinaciones de campos, id en el cuerpo y campos desconocidos
const TODOS_MAL = { nombre: 5, posicion: 5, dorsal: '5', puntos: '5', disponible: 'true' };
CASOS.push(
  C('campos', 'POST /jugadores', 'varios campos', 'objeto vacío: faltan los cinco', '{}', { cuerpo: {} }, 400, EDITABLES),
  C('campos', 'POST /jugadores', 'varios campos', 'ejemplo del README', '{"nombre":"A","posicion":"portero","dorsal":120}',
    { cuerpo: { nombre: 'A', posicion: 'portero', dorsal: 120 } }, 400, EDITABLES),
  C('campos', 'POST /jugadores', 'varios campos', 'los cinco con tipo incorrecto', mostrar(TODOS_MAL), { cuerpo: TODOS_MAL }, 400, EDITABLES),
  C('campos', 'POST /jugadores', 'varios campos', 'solo un campo desconocido', '{"color":"azul"}', { cuerpo: { color: 'azul' } }, 400, EDITABLES),
  C('campos', 'PUT /jugadores/:id', 'varios campos', 'objeto vacío: faltan los cinco', '{}', { cuerpo: {} }, 400, EDITABLES),
  C('campos', 'PUT /jugadores/:id', 'varios campos', 'los cinco con tipo incorrecto', mostrar(TODOS_MAL), { cuerpo: TODOS_MAL }, 400, EDITABLES),
  C('campos', 'PUT /jugadores/:id', 'varios campos', 'solo disponible (no rellena con lo anterior)', '{"disponible":false}',
    { cuerpo: { disponible: false } }, 400, ['nombre', 'posicion', 'dorsal', 'puntos']),
  C('campos', 'PATCH /jugadores/:id', 'varios campos', 'dos campos inválidos', '{"dorsal":100,"puntos":-1}',
    { cuerpo: { dorsal: 100, puntos: -1 } }, 400, ['dorsal', 'puntos']),
  C('campos', 'PATCH /jugadores/:id', 'varios campos', 'uno válido y uno inválido: no se aplica nada', '{"disponible":false,"dorsal":100}',
    { cuerpo: { disponible: false, dorsal: 100 } }, 400, ['dorsal']),
  C('campos', 'PATCH /jugadores/:id', 'varios campos', 'los cinco inválidos', mostrar(TODOS_MAL), { cuerpo: TODOS_MAL }, 400, EDITABLES),
  C('campos', 'PATCH /jugadores/:id', 'varios campos', 'dos campos válidos', '{"dorsal":0,"puntos":60}',
    { cuerpo: { dorsal: 0, puntos: 60 } }, 200, [], { guardado: { dorsal: 0, puntos: 60 } }),
  // id enviado por el cliente: se ignora
  C('campos', 'POST /jugadores', 'id (cuerpo)', 'se ignora (número)', '500', { base: 'POST', cuerpo: { id: 500 } }, 201, [],
    { comprobar: j => assert.notEqual(j.id, 500, 'el id 500 del cliente no debe usarse') }),
  C('campos', 'POST /jugadores', 'id (cuerpo)', 'se ignora (texto)', '"abc"', { base: 'POST', cuerpo: { id: 'abc' } }, 201, [],
    { comprobar: j => assert.equal(Number.isInteger(j.id), true, 'id generado debe ser entero') }),
  C('campos', 'POST /jugadores', 'id (cuerpo)', 'se ignora (null)', 'null', { base: 'POST', cuerpo: { id: null } }, 201, [],
    { comprobar: j => assert.equal(Number.isInteger(j.id), true, 'id generado debe ser entero') }),
  C('campos', 'PUT /jugadores/:id', 'id (cuerpo)', 'se ignora (otro id)', '999999', { base: 'PUT', cuerpo: { id: 999999 } }, 200),
  C('campos', 'PUT /jugadores/:id', 'id (cuerpo)', 'se ignora (texto)', '"abc"', { base: 'PUT', cuerpo: { id: 'abc' } }, 200),
  C('campos', 'PATCH /jugadores/:id', 'id (cuerpo)', 'se ignora junto a un campo válido', '{"id":999999,"disponible":false}',
    { cuerpo: { id: 999999, disponible: false } }, 200, [], { guardado: { disponible: false } }),
  C('campos', 'PATCH /jugadores/:id', 'id (cuerpo)', '¿id cuenta como campo conocido? (no documentado)', '{"id":999999}',
    { cuerpo: { id: 999999 } }, 'observar', null),
  // Campos desconocidos: se descartan sin error
  C('campos', 'POST /jugadores', 'campo desconocido', 'se descarta', '"color":"azul"', { base: 'POST', cuerpo: { color: 'azul' } }, 201),
  C('campos', 'PUT /jugadores/:id', 'campo desconocido', 'se descarta', '"color":"azul"', { base: 'PUT', cuerpo: { color: 'azul' } }, 200),
  C('campos', 'PATCH /jugadores/:id', 'campo desconocido', 'se descarta junto a un campo válido', '{"disponible":false,"color":"azul"}',
    { cuerpo: { disponible: false, color: 'azul' } }, 200, [], { guardado: { disponible: false } }),
  C('campos', 'PATCH /jugadores/:id', 'campo desconocido', 'PATCH sin ningún campo conocido', '{"color":"azul"}',
    { cuerpo: { color: 'azul' } }, 400, ['body']),
);

// ---------------------------------------------------------------------------
// 2. EL CUERPO EN SÍ: formato y Content-Type (POST, PUT y PATCH)
// ---------------------------------------------------------------------------
const FORMATOS = [
  { regla: 'JSON mal formado (sin cerrar)', raw: t => `{"nombre":"Jugador ${t}",` },
  { regla: 'JSON mal formado (coma final)', raw: t => `{"nombre":"Jugador ${t}","posicion":"base","dorsal":1,"puntos":1,"disponible":true,}` },
  { regla: 'JSON con comillas simples', raw: t => `{'nombre':'Jugador ${t}'}` },
  { regla: 'cuerpo vacío con Content-Type JSON', raw: '' },
  { regla: 'sin cuerpo ni Content-Type', sinCuerpo: true },
  { regla: 'array vacío', raw: '[]' },
  { regla: 'array con un jugador válido', raw: (t, m) => JSON.stringify([PLANTILLA[m](t)]) },
  { regla: 'null', raw: 'null' },
  { regla: 'texto JSON', raw: '"hola"' },
  { regla: 'número JSON', raw: '42' },
  { regla: 'booleano JSON', raw: 'true' },
  { regla: 'Content-Type text/plain con JSON válido', raw: (t, m) => JSON.stringify(PLANTILLA[m](t)), tipo: 'text/plain' },
  { regla: 'sin Content-Type con JSON válido', raw: (t, m) => JSON.stringify(PLANTILLA[m](t)), sinTipo: true },
  { regla: 'Content-Type form-urlencoded', raw: t => `nombre=Jugador+${t}&posicion=base&dorsal=1&puntos=1&disponible=true`, tipo: 'application/x-www-form-urlencoded' },
  { regla: 'Content-Type application/vnd.api+json', raw: (t, m) => JSON.stringify(PLANTILLA[m](t)), tipo: 'application/vnd.api+json' },
  { regla: 'Content-Type application/json; charset=utf-8 (válido)', raw: (t, m) => JSON.stringify(PLANTILLA[m](t)), tipo: 'application/json; charset=utf-8', ok: true },
  { regla: 'Content-Type APPLICATION/JSON (no documentado)', raw: (t, m) => JSON.stringify(PLANTILLA[m](t)), tipo: 'APPLICATION/JSON', observar: true },
];
for (const m of ['POST', 'PUT', 'PATCH']) {
  for (const f of FORMATOS) {
    const raw = f.sinCuerpo ? undefined : typeof f.raw === 'function' ? (t => f.raw(t, m)) : f.raw;
    const valor = f.sinCuerpo ? '(nada)' : `${f.tipo ?? (f.sinTipo ? '(sin tipo)' : 'application/json')} ${typeof f.raw === 'function' ? '(generado)' : JSON.stringify(f.raw)}`;
    CASOS.push(C('cuerpo', ENDPOINT[m], 'cuerpo', f.regla, valor, { raw, tipo: f.tipo, sinTipo: f.sinTipo },
      f.observar ? 'observar' : f.ok ? EXITO[m] : 400, f.observar ? null : f.ok ? [] : ['body']));
  }
}
CASOS.push(
  C('cuerpo', 'PATCH /jugadores/:id', 'cuerpo', 'objeto vacío', '{}', { cuerpo: {} }, 400, ['body']),
  // Primero 404 (existencia) y después 400 (cuerpo)
  C('cuerpo', 'PUT /jugadores/:id', ':id', '404 antes que 400: no existe + cuerpo {}', '/999999999', { ruta: '/jugadores/999999999', cuerpo: {} }, 404),
  // Revisión humana: el JSON se analiza en un middleware global antes de llegar a la ruta, así que un
  // cuerpo ilegible da 400 aunque el id no exista. Decisión documentada en el README.
  C('cuerpo', 'PUT /jugadores/:id', ':id', 'JSON mal formado se rechaza antes de buscar el id', '/999999999', { ruta: '/jugadores/999999999', raw: '{"nombre":' }, 400, ['body']),
  C('cuerpo', 'PATCH /jugadores/:id', ':id', '404 antes que 400: id "abc" + dorsal 500', '/abc', { ruta: '/jugadores/abc', cuerpo: { dorsal: 500 } }, 404),
  C('cuerpo', 'PATCH /jugadores/:id', ':id', '404 antes que 400: no existe + cuerpo vacío', '/999999999', { ruta: '/jugadores/999999999', raw: '' }, 404),
  C('cuerpo', 'PATCH /jugadores/:id', ':id', '404 antes que 400: no existe + array', '/999999999', { ruta: '/jugadores/999999999', raw: '[]' }, 404),
  C('cuerpo', 'PUT /jugadores/:id', ':id', '404 antes que 400: cero a la izquierda + {}', '/0{id}', { ruta: '/jugadores/0{{ID}}', cuerpo: {} }, 404),
);

// ---------------------------------------------------------------------------
// 3. PARÁMETRO :id DE LA RUTA (GET, PUT, PATCH, DELETE)
// ---------------------------------------------------------------------------
const IDS = [
  { regla: 'entero positivo existente', id: '{{ID}}', ok: true },
  { regla: 'entero que no existe', id: '999999999' },
  { regla: 'texto', id: 'abc' },
  { regla: 'cero', id: '0' },
  { regla: 'negativo de uno existente', id: '-{{ID}}' },
  { regla: 'decimal', id: '1.5' },
  { regla: 'decimal .0 de uno existente', id: '{{ID}}.0' },
  { regla: 'cero a la izquierda de uno existente', id: '0{{ID}}' },
  { regla: 'signo + de uno existente', id: '+{{ID}}' },
  { regla: 'espacio delante (%20)', id: '%20{{ID}}' },
  { regla: 'espacio detrás (%20)', id: '{{ID}}%20' },
  { regla: 'notación exponencial', id: '{{ID}}e0' },
  { regla: 'hexadecimal', id: '0x{{IDHEX}}' },
  { regla: 'entero enorme', id: '99999999999999999999999' },
  { regla: 'sufijo de letras', id: '{{ID}}abc' },
  { regla: '"stats" fuera de GET', id: 'stats', metodos: ['PUT', 'PATCH', 'DELETE'] },
];
const CUERPO_ID = { PUT: { base: 'PUT' }, PATCH: { cuerpo: { disponible: false } }, GET: {}, DELETE: {} };
for (const m of ['GET', 'PUT', 'PATCH', 'DELETE']) {
  for (const i of IDS) {
    if (i.metodos && !i.metodos.includes(m)) continue;
    CASOS.push(C('id', ENDPOINT[m], ':id', i.regla, `/${i.id.replace('{{ID}}', '{id}').replace('{{IDHEX}}', '{idhex}')}`,
      { ruta: `/jugadores/${i.id}`, ...CUERPO_ID[m] }, i.ok ? EXITO[m] : 404, []));
  }
}

// ---------------------------------------------------------------------------
// 4. PARÁMETROS DE CONSULTA: GET /jugadores y GET /jugadores/stats
// ---------------------------------------------------------------------------
const Q = (entrada, regla, query, status, errores = [], extra = {}) =>
  C('consulta', 'GET /jugadores', entrada, regla, `?${query}`, { query }, status, errores, extra);
const S = (entrada, regla, query, status, errores = []) =>
  C('consulta', 'GET /jugadores/stats', entrada, regla, query ? `?${query}` : '(sin consulta)', { query }, status, errores);
const malos = (p, lista) => lista.map(([regla, v]) => Q(p, regla, `${p}=${v}`, 400, [p]));

CASOS.push(
  // search
  Q('search', 'texto', 'search=ortega', 200),
  Q('search', 'tildes y mayúsculas', 'search=%C3%81LVARO', 200),
  Q('search', 'vacío (no filtra)', 'search=', 200),
  Q('search', 'solo espacios (no filtra)', 'search=%20%20%20', 200),
  Q('search', 'sin "=" (vacío)', 'search', 200),
  Q('search', 'marca propia sin resultados', 'search={{T}}', 200, [], { cuerpoEsperado: { total: 0, items: [] } }),
  Q('search', 'repetido', 'search=a&search=b', 400, ['search']),
  Q('search', 'repetido con el mismo valor', 'search=a&search=a', 400, ['search']),
  Q('search', 'repetido vacío', 'search=&search=', 400, ['search']),
  // disponible
  Q('disponible', 'true', 'disponible=true', 200),
  Q('disponible', 'false', 'disponible=false', 200),
  ...malos('disponible', [['mayúsculas TRUE', 'TRUE'], ['True', 'True'], ['texto quizas', 'quizas'], ['número 1', '1'],
    ['número 0', '0'], ['vacío', ''], ['espacio delante', '%20true']]),
  Q('disponible', 'repetido', 'disponible=true&disponible=false', 400, ['disponible']),
  // posicion
  ...['base', 'escolta', 'alero', 'ala-pivot', 'pivot'].map(p => Q('posicion', `valor permitido ${p}`, `posicion=${p}`, 200)),
  ...malos('posicion', [['mayúscula inicial', 'Base'], ['fuera de la lista', 'portero'], ['vacío', ''], ['con espacio', 'ala%20pivot']]),
  Q('posicion', 'repetido', 'posicion=base&posicion=pivot', 400, ['posicion']),
  Q('posicion', 'repetido con el mismo valor', 'posicion=base&posicion=base', 400, ['posicion']),
  // sort
  ...['nombre', 'dorsal', 'puntos'].map(s => Q('sort', `valor permitido ${s}`, `sort=${s}`, 200)),
  ...malos('sort', [['id no permitido', 'id'], ['mayúsculas', 'NOMBRE'], ['vacío', ''], ['campo no ordenable', 'disponible'],
    ['campo no ordenable', 'posicion'], ['prefijo -', '-nombre']]),
  Q('sort', 'repetido (README)', 'sort=nombre&sort=dorsal', 400, ['sort']),
  // order
  Q('order', 'asc', 'sort=nombre&order=asc', 200),
  Q('order', 'desc', 'sort=nombre&order=desc', 200),
  Q('order', 'desc sin sort', 'order=desc', 200),
  ...malos('order', [['mayúsculas DESC', 'DESC'], ['texto arriba', 'arriba'], ['vacío', '']]),
  Q('order', 'repetido', 'order=asc&order=desc', 400, ['order']),
  // limit
  Q('limit', 'mínimo 1 (límite)', 'limit=1', 200, [], { cuerpoEsperado: { limit: 1 } }),
  Q('limit', 'máximo 100 (límite)', 'limit=100', 200, [], { cuerpoEsperado: { limit: 100 } }),
  ...malos('limit', [['0 (justo fuera)', '0'], ['101 (justo fuera)', '101'], ['negativo', '-1'], ['texto', 'abc'],
    ['decimal', '1.5'], ['decimal .0', '5.0'], ['vacío', ''], ['exponencial', '1e1'], ['espacio delante', '%201'],
    ['signo +', '%2B5'], ['hexadecimal', '0x10'], ['enorme', '99999999999999999999']]),
  // Revisión humana: limit y offset sin ceros a la izquierda, mismo criterio que el :id.
  Q('limit', 'cero a la izquierda', 'limit=05', 400, ['limit']),
  Q('limit', 'repetido', 'limit=1&limit=1', 400, ['limit']),
  // offset
  Q('offset', 'mínimo 0 (límite)', 'offset=0', 200, [], { cuerpoEsperado: { offset: 0 } }),
  Q('offset', 'valor intermedio', 'offset=5', 200, [], { cuerpoEsperado: { offset: 5 } }),
  Q('offset', 'mayor que total', 'offset=1000000', 200, [], { cuerpoEsperado: { offset: 1000000, items: [] } }),
  ...malos('offset', [['-1 (justo fuera)', '-1'], ['texto', 'abc'], ['decimal', '1.5'], ['vacío', ''],
    ['exponencial', '1e1'], ['signo +', '%2B1'], ['espacio delante', '%201']]),
  Q('offset', 'ceros a la izquierda', 'offset=00', 400, ['offset']),
  Q('offset', 'repetido', 'offset=0&offset=0', 400, ['offset']),
  // desconocidos y combinaciones
  Q('desconocido', 'parámetro desconocido', 'color=azul', 400, ['color']),
  Q('desconocido', 'desconocido sin valor', 'color', 400, ['color']),
  Q('desconocido', 'nombre conocido con otra capitalización', 'Search=x', 400, ['Search']),
  Q('desconocido', 'LIMIT en mayúsculas', 'LIMIT=5', 400, ['LIMIT']),
  Q('desconocido', 'id no es parámetro', 'id=1', 400, ['id']),
  Q('desconocido', 'page no es parámetro', 'page=1', 400, ['page']),
  Q('desconocido', 'dos desconocidos', 'color=azul&talla=xl', 400, ['color', 'talla']),
  Q('desconocido', 'notación de array posicion[]', 'posicion%5B%5D=base', 400, null),
  Q('desconocido', 'notación de objeto posicion[a]', 'posicion%5Ba%5D=base', 400, null),
  Q('desconocido', 'clave vacía (no documentado)', '=x', 'observar', null),
  Q('desconocido', 'solo separadores (no documentado)', '&&', 'observar', null),
  Q('combinación', 'ejemplo README limit=abc&color=azul', 'limit=abc&color=azul', 400, ['color', 'limit']),
  Q('combinación', 'desconocido + mal formados', 'sort=id&order=DESC&foo=1', 400, ['sort', 'order', 'foo']),
  Q('combinación', 'todos los parámetros mal', 'disponible=quizas&posicion=portero&sort=id&order=arriba&limit=0&offset=-1&x=1', 400,
    ['disponible', 'posicion', 'sort', 'order', 'limit', 'offset', 'x']),
  Q('combinación', 'todos válidos', 'search=a&disponible=true&posicion=base&sort=puntos&order=desc&limit=2&offset=0', 200, [],
    { cuerpoEsperado: { limit: 2, offset: 0 } }),
  // stats: no admite ningún parámetro
  S('ninguno', 'sin parámetros', '', 200),
  S('desconocido', 'parámetro cualquiera', 'a=1', 400, ['a']),
  S('limit', 'parámetro válido en la lista', 'limit=5', 400, ['limit']),
  S('search', 'search vacío', 'search=', 400, ['search']),
  S('disponible', 'filtro válido en la lista', 'disponible=true', 400, ['disponible']),
  S('desconocido', 'sin valor', 'x', 400, ['x']),
  S('desconocido', 'repetido', 'a=1&a=2', 400, ['a']),
  S('combinación', 'dos parámetros', 'a=1&b=2', 400, ['a', 'b']),
  S('combinación', 'sort y order', 'sort=nombre&order=desc', 400, ['sort', 'order']),
);

// ---------------------------------------------------------------------------
// 5. ROBUSTEZ: nunca 5xx, siempre JSON, nunca se guarda un campo desconocido.
//    status 'observar' = el contrato no fija el resultado; solo se exige lo anterior.
// ---------------------------------------------------------------------------
const R = (endpoint, entrada, regla, valor, peticion, status, errores = [], extra = {}) =>
  C('robustez', endpoint, entrada, regla, valor, peticion, status, errores, extra);
const emoji = n => '\u{1F3C0}'.repeat(n);
const P = 'POST /jugadores';
CASOS.push(
  // Textos raros en nombre
  R(P, 'nombre', 'texto muy largo (10 000)', '"N…" (10000)', { base: 'POST', cuerpo: { nombre: t => nombreDe(10000, t) } }, 400, ['nombre']),
  R(P, 'nombre', 'tildes y eñes', '"Ñúñez Ángel …"', { base: 'POST', cuerpo: { nombre: t => `Ñúñez Ángel ${t}` } }, 201, [],
    { guardado: { nombre: t => `Ñúñez Ángel ${t}` } }),
  R(P, 'nombre', 'caracteres CJK (3)', '"李小龙"', { base: 'POST', cuerpo: { nombre: '李小龙' } }, 201, [], { guardado: { nombre: '李小龙' } }),
  R(P, 'nombre', 'emojis con texto', '"🏀 … 🏀"', { base: 'POST', cuerpo: { nombre: t => `${emoji(1)} ${t} ${emoji(1)}` } }, 201, [],
    { guardado: { nombre: t => `${emoji(1)} ${t} ${emoji(1)}` } }),
  // Revisión humana: la longitud se cuenta en caracteres reales y se rechazan los de control (Cc)
  // y los invisibles (Cf). Los casos de un emoji, 31 emojis, carácter nulo y ancho cero pasan
  // de "observar" a una regla fija.
  R(P, 'nombre', 'un emoji (1 carácter)', '"🏀"', { base: 'POST', cuerpo: { nombre: emoji(1) } }, 400, ['nombre']),
  R(P, 'nombre', '30 emojis (30 caracteres, 60 UTF-16)', '"🏀"x30', { base: 'POST', cuerpo: { nombre: emoji(30) } }, 201, []),
  R(P, 'nombre', '31 emojis (31 caracteres)', '"🏀"x31', { base: 'POST', cuerpo: { nombre: emoji(31) } }, 201, []),
  R(P, 'nombre', 'carácter combinante (e + tilde)', '"e\\u0301"', { base: 'POST', cuerpo: { nombre: 'e\u0301' } }, 'observar', null),
  R(P, 'nombre', 'carácter nulo dentro', '"Ab\\u0000 …"', { base: 'POST', cuerpo: { nombre: t => `Ab\u0000 ${t}` } }, 400, ['nombre']),
  R(P, 'nombre', 'tabuladores y saltos alrededor', '"\\t\\n Ab … \\r\\n"', { base: 'POST', cuerpo: { nombre: t => `\t\n Ab ${t} \r\n` } }, 'observar', null),
  R(P, 'nombre', 'espacios duros (NBSP) alrededor', '"\\u00A0Ab …\\u00A0"', { base: 'POST', cuerpo: { nombre: t => ` Ab ${t} ` } }, 'observar', null),
  R(P, 'nombre', 'dos espacios de ancho cero', '"\\u200B\\u200B"', { base: 'POST', cuerpo: { nombre: '\u200B\u200B' } }, 400, ['nombre']),
  R(P, 'nombre', 'HTML/script se guarda tal cual', '"<script>…"', { base: 'POST', cuerpo: { nombre: t => `<script>alert(1)</script> ${t}` } }, 201, [],
    { guardado: { nombre: t => `<script>alert(1)</script> ${t}` } }),
  R(P, 'nombre', 'inyección tipo SQL se guarda tal cual', `"Robert'); DROP…"`, { base: 'POST', cuerpo: { nombre: t => `Robert'); DROP TABLE x;-- ${t}` } }, 201, [],
    { guardado: { nombre: t => `Robert'); DROP TABLE x;-- ${t}` } }),
  R(P, 'nombre', 'objeto anidado', '{"nombre":{"nombre":"Ab"}}', { raw: crudo({ nombre: '{"nombre":{"nombre":"Ab"}}' }) }, 400, ['nombre']),
  R(P, 'posicion', 'carácter nulo al final', '"base\\u0000"', { base: 'POST', cuerpo: { posicion: 'base\u0000' } }, 400, ['posicion']),
  // Números en notaciones raras (JSON crudo)
  R(P, 'dorsal', '1e2 = 100 (fuera)', '1e2', { raw: crudo({ dorsal: '1e2' }) }, 400, ['dorsal']),
  R(P, 'dorsal', '1e1 = 10 (válido)', '1e1', { raw: crudo({ dorsal: '1e1' }) }, 201, [], { guardado: { dorsal: 10 } }),
  R(P, 'dorsal', '-0 (igual a 0)', '-0', { raw: crudo({ dorsal: '-0' }) }, 201, [], { guardado: { dorsal: 0 } }),
  R(P, 'dorsal', '7.0 (entero en JSON)', '7.0', { raw: crudo({ dorsal: '7.0' }) }, 201, [], { guardado: { dorsal: 7 } }),
  R(P, 'dorsal', '"Infinity" como texto', '"Infinity"', { raw: crudo({ dorsal: '"Infinity"' }) }, 400, ['dorsal']),
  R(P, 'dorsal', '1e400 (Infinity al parsear)', '1e400', { raw: crudo({ dorsal: '1e400' }) }, 400, ['dorsal']),
  R(P, 'dorsal', 'NaN (no es JSON)', 'NaN', { raw: crudo({ dorsal: 'NaN' }) }, 400, ['body']),
  R(P, 'dorsal', '2^53+1', '9007199254740993', { raw: crudo({ dorsal: '9007199254740993' }) }, 400, ['dorsal']),
  R(P, 'dorsal', '"0x10" como texto', '"0x10"', { raw: crudo({ dorsal: '"0x10"' }) }, 400, ['dorsal']),
  R(P, 'puntos', '-0 (igual a 0)', '-0', { raw: crudo({ puntos: '-0' }) }, 201, [], { guardado: { puntos: 0 } }),
  R(P, 'puntos', '"Infinity" como texto', '"Infinity"', { raw: crudo({ puntos: '"Infinity"' }) }, 400, ['puntos']),
  R(P, 'puntos', '1e400 (Infinity al parsear)', '1e400', { raw: crudo({ puntos: '1e400' }) }, 400, ['puntos']),
  R(P, 'puntos', '-1e400 (-Infinity al parsear)', '-1e400', { raw: crudo({ puntos: '-1e400' }) }, 400, ['puntos']),
  R(P, 'puntos', 'Infinity sin comillas (no es JSON)', 'Infinity', { raw: crudo({ puntos: 'Infinity' }) }, 400, ['body']),
  R(P, 'puntos', '6e1 = 60 (límite)', '6e1', { raw: crudo({ puntos: '6e1' }) }, 201, [], { guardado: { puntos: 60 } }),
  R(P, 'puntos', '1e-400 (0 al parsear)', '1e-400', { raw: crudo({ puntos: '1e-400' }) }, 201, [], { guardado: { puntos: 0 } }),
  // Claves peligrosas y anidamiento
  R(P, '__proto__', '__proto__ con campo extra', '"__proto__":{"admin":true}', { raw: crudo({}, '"__proto__":{"admin":true}') }, 201),
  R(P, '__proto__', '__proto__ aporta disponible que falta', '"__proto__":{"disponible":true}', { raw: crudo({ disponible: null }, '"__proto__":{"disponible":true}') }, 400, ['disponible']),
  R(P, '__proto__', 'después: falta disponible (sin contaminación global)', '(sin disponible)', { raw: crudo({ disponible: null }) }, 400, ['disponible']),
  R('PUT /jugadores/:id', '__proto__', '__proto__ aporta nombre que falta', '"__proto__":{"nombre":"Xx"}', { raw: crudo({ nombre: null }, '"__proto__":{"nombre":"Xx Yy"}') }, 400, ['nombre']),
  R(P, 'constructor', 'constructor.prototype', '"constructor":{"prototype":{"admin":true}}', { raw: crudo({}, '"constructor":{"prototype":{"admin":true}}') }, 201),
  R(P, 'constructor', 'constructor como texto', '"constructor":"x"', { raw: crudo({}, '"constructor":"x"') }, 201),
  R(P, 'campo desconocido', 'toString / valueOf / hasOwnProperty', '"toString":"x",...', { raw: crudo({}, '"toString":"x","valueOf":1,"hasOwnProperty":1') }, 201),
  R(P, 'campo desconocido', 'objeto anidado desconocido', '"extra":{"a":{"b":{...}}}', { raw: crudo({}, '"extra":{"a":{"b":{"c":[1,{"d":2}]}}}') }, 201),
  R(P, 'campo desconocido', 'anidamiento profundo (20 000 niveles)', '"profundo":[[[…]]]', { raw: crudo({}, `"profundo":${'['.repeat(20000)}${']'.repeat(20000)}`) }, 'observar', null),
  R('PATCH /jugadores/:id', '__proto__', 'solo __proto__ (sin campos conocidos)', '{"__proto__":{"disponible":false}}', { raw: '{"__proto__":{"disponible":false}}' }, 400, ['body']),
  R('PATCH /jugadores/:id', '__proto__', '__proto__ + campo válido', '{"__proto__":{"disponible":false},"dorsal":5}', { raw: '{"__proto__":{"disponible":false},"dorsal":5}' }, 200, [],
    { guardado: { dorsal: 5, disponible: true } }),
  R('PATCH /jugadores/:id', 'constructor', 'solo constructor.prototype', '{"constructor":{"prototype":{"dorsal":5}}}', { raw: '{"constructor":{"prototype":{"dorsal":5}}}' }, 400, ['body']),
  R('PATCH /jugadores/:id', 'campo desconocido', 'solo hasOwnProperty', '{"hasOwnProperty":1}', { raw: '{"hasOwnProperty":1}' }, 400, ['body']),
  R('PATCH /jugadores/:id', 'campo desconocido', 'solo toString', '{"toString":"x"}', { raw: '{"toString":"x"}' }, 400, ['body']),
  // Claves duplicadas: JSON.parse se queda con la última
  R(P, 'dorsal', 'duplicado: 5 y luego 150', '"dorsal":5,"dorsal":150', { raw: crudo({}, '"dorsal":150') }, 400, ['dorsal']),
  R(P, 'dorsal', 'duplicado: 150 y luego 5', '"dorsal":150,"dorsal":5', { raw: crudo({ dorsal: '150' }, '"dorsal":5') }, 201, [], { guardado: { dorsal: 5 } }),
  R(P, 'nombre', 'duplicado: válido y luego "A"', '"nombre":"…","nombre":"A"', { raw: crudo({}, '"nombre":"A"') }, 400, ['nombre']),
  R('PATCH /jugadores/:id', 'dorsal', 'duplicado: 5 y luego 500', '{"dorsal":5,"dorsal":500}', { raw: '{"dorsal":5,"dorsal":500}' }, 400, ['dorsal']),
  // Tamaño del cuerpo
  R(P, 'cuerpo', 'cuerpo de ~90 KB (relleno desconocido)', '"relleno":"x"x92160', { raw: crudo({}, `"relleno":"${'x'.repeat(90 * 1024)}"`) }, 201),
  R(P, 'cuerpo', 'cuerpo de ~150 KB (> 100 KB)', '"relleno":"x"x153600', { raw: crudo({}, `"relleno":"${'x'.repeat(150 * 1024)}"`) }, 'observar', null),
  R(P, 'cuerpo', 'nombre de ~150 KB (> 100 KB)', '"nombre":"N…" (153600)', { raw: t => crudo({ nombre: JSON.stringify(nombreDe(150 * 1024, t)) })(t) }, 'observar', null),
  R(P, 'cuerpo', 'cuerpo de 1 MB', '"relleno":"x"x1048576', { raw: crudo({}, `"relleno":"${'x'.repeat(1024 * 1024)}"`) }, 'observar', null),
  R('PATCH /jugadores/:id', 'cuerpo', 'cuerpo de ~150 KB (> 100 KB)', '{"disponible":false,"relleno":…}', { raw: `{"disponible":false,"relleno":"${'x'.repeat(150 * 1024)}"}` }, 'observar', null),
  // Consultas raras
  R('GET /jugadores', 'search', 'texto muy largo (5000)', '?search=aaaa…', { query: `search=${'a'.repeat(5000)}` }, 200),
  R('GET /jugadores', 'search', 'emoji', '?search=🏀', { query: 'search=%F0%9F%8F%80' }, 200),
  R('GET /jugadores', 'search', 'carácter nulo', '?search=%00', { query: 'search=%00' }, 200),
  R('GET /jugadores', 'search', 'corchete de regex sin cerrar', '?search=[', { query: 'search=%5B' }, 200),
  R('GET /jugadores', 'search', 'paréntesis de regex sin cerrar', '?search=(', { query: 'search=(' }, 200),
  R('GET /jugadores', 'search', '".*" se busca literal', '?search=.*', { query: 'search=.*' }, 200, [], { cuerpoEsperado: { total: 0 } }),
  R('GET /jugadores', 'search', 'codificación % mal formada', '?search=%E0%A4%A', { query: 'search=%E0%A4%A' }, 'observar', null),
  R('GET /jugadores', 'desconocido', '__proto__', '?__proto__=x', { query: '__proto__=x' }, 400, ['__proto__']),
  R('GET /jugadores', 'desconocido', 'constructor', '?constructor=x', { query: 'constructor=x' }, 400, ['constructor']),
  R('GET /jugadores', 'desconocido', 'toString', '?toString=x', { query: 'toString=x' }, 400, ['toString']),
  R('GET /jugadores', 'desconocido', 'hasOwnProperty', '?hasOwnProperty=x', { query: 'hasOwnProperty=x' }, 400, ['hasOwnProperty']),
  R('GET /jugadores/stats', 'desconocido', '__proto__', '?__proto__=1', { query: '__proto__=1' }, 400, ['__proto__']),
  // Rutas raras
  // Revisión humana: la API respondía 500. Corregida; ahora se exige 404 como con cualquier id mal formado.
  R('GET /jugadores/:id', ':id', 'codificación % mal formada', '/%E0%A4%A', { ruta: '/jugadores/%E0%A4%A' }, 404),
  R('GET /jugadores/:id', ':id', '__proto__', '/__proto__', { ruta: '/jugadores/__proto__' }, 404),
  R('GET /jugadores/:id', ':id', 'constructor', '/constructor', { ruta: '/jugadores/constructor' }, 404),
  R('GET /jugadores/:id', ':id', 'toString', '/toString', { ruta: '/jugadores/toString' }, 404),
  R('GET /jugadores/:id', ':id', 'existente + carácter nulo', '/{id}%00', { ruta: '/jugadores/{{ID}}%00' }, 404),
  R('GET /jugadores/:id', ':id', '5000 dígitos', '/999…', { ruta: `/jugadores/${'9'.repeat(5000)}` }, 404),
  R('PATCH /jugadores/:id', ':id', '__proto__', '/__proto__', { ruta: '/jugadores/__proto__', cuerpo: { disponible: false } }, 404),
  R('DELETE /jugadores/:id', ':id', 'constructor', '/constructor', { ruta: '/jugadores/constructor' }, 404),
);

// ---------------------------------------------------------------------------
// Utilidades HTTP
// ---------------------------------------------------------------------------
async function http(metodo, ruta, { cuerpo, tipo, sinTipo } = {}) {
  const opciones = { method: metodo, headers: {} };
  if (cuerpo !== undefined) {
    // Uint8Array: fetch no añade Content-Type
    if (sinTipo) opciones.body = new TextEncoder().encode(cuerpo);
    else { opciones.body = cuerpo; opciones.headers['content-type'] = tipo ?? 'application/json'; }
  }
  const res = await fetch(BASE + ruta, opciones);
  const texto = await res.text();
  let json; let esJSON = false;
  try { json = JSON.parse(texto); esJSON = true; } catch { /* no es JSON */ }
  return { status: res.status, tipo: res.headers.get('content-type') ?? '', location: res.headers.get('location'), texto, json, esJSON };
}

const creados = new Map(); // id -> última representación conocida (para limpiar solo lo nuestro)
const anotar = j => { if (j && Number.isInteger(j.id)) creados.set(j.id, j); };
const totalActual = async () => (await http('GET', '/jugadores?limit=1')).json?.total;
const buscarTotal = async t => (await http('GET', `/jugadores?search=${encodeURIComponent(t)}`)).json?.total;

async function crearFixture(t) {
  const r = await http('POST', '/jugadores', { cuerpo: JSON.stringify(FIXTURE(t)) });
  if (r.status !== 201) throw new Error(`no se pudo crear el jugador de prueba (status ${r.status})`);
  anotar(r.json);
  return r.json;
}

const resolver = (v, t) => (typeof v === 'function' ? v(t) : typeof v === 'string' ? v.replaceAll('{{T}}', t) : v);

function construirCuerpo(c, t) {
  if (c.raw !== undefined) return { texto: resolver(c.raw, t) };
  if (!c.base && c.cuerpo === undefined) return { texto: undefined };
  const obj = c.base ? { ...PLANTILLA[c.base](t) } : {};
  for (const [k, v] of Object.entries(c.cuerpo ?? {})) {
    const r = resolver(v, t);
    if (r === AUSENTE) delete obj[k]; else obj[k] = r;
  }
  return { texto: JSON.stringify(obj), obj };
}

// ---------------------------------------------------------------------------
// Ejecución de un caso: devuelve la lista de fallos y lo observado
// ---------------------------------------------------------------------------
async function ejecutar(c, n) {
  const t = `${MARCA}c${n}x`;
  const fallos = [];
  const comprobar = async (desc, fn) => { try { await fn(); } catch (e) { fallos.push(`${desc}: ${String(e.message).split('\n')[0]}`); } };

  // Jugador propio si la ruta lo necesita
  let fixture = null;
  let ruta = c.ruta;
  if (ruta.includes('{{ID')) {
    try { fixture = await crearFixture(t); } catch (e) { return { fallos: [e.message], ruta, r: null }; }
    ruta = ruta.replaceAll('{{IDHEX}}', fixture.id.toString(16)).replaceAll('{{ID}}', String(fixture.id));
  }
  if (c.query) ruta += `?${resolver(c.query, t)}`;

  const { texto: cuerpo, obj } = construirCuerpo(c, t);
  const conMarca = cuerpo?.includes(t) ?? false;
  const antes = c.metodo === 'POST' && !conMarca ? await totalActual() : null;

  const r = await http(c.metodo, ruta, { cuerpo, tipo: c.tipo, sinTipo: c.sinTipo });
  const exito = r.status >= 200 && r.status < 300;
  if (exito && c.metodo === 'POST') anotar(r.json);

  // Reglas generales
  await comprobar('nunca 5xx', () => assert.ok(r.status < 500, `status ${r.status}`));
  if (c.status !== 'observar') {
    await comprobar('status', () => assert.ok([].concat(c.status).includes(r.status), `esperado ${c.status}, recibido ${r.status}`));
  }
  if (r.status === 204) await comprobar('204 sin cuerpo', () => assert.equal(r.texto, ''));
  else await comprobar('respuesta JSON', () => assert.ok(r.esJSON && r.tipo.includes('application/json'), `content-type "${r.tipo}", cuerpo ${recortar(r.texto, 60)}`));

  // Formato del 400 y campos señalados
  if (r.status === 400) {
    await comprobar('formato { errors: [{ field, message }] }', () => {
      assert.ok(Array.isArray(r.json?.errors) && r.json.errors.length > 0, 'falta errors[]');
      for (const e of r.json.errors) {
        assert.equal(typeof e.field, 'string', 'field no es texto');
        assert.ok(typeof e.message === 'string' && e.message.length > 0, 'message vacío');
      }
    });
    if (Array.isArray(c.errores) && c.errores.length > 0) {
      const recibidos = [...new Set((r.json?.errors ?? []).map(e => e.field))].sort();
      const esperados = [...c.errores].sort();
      await comprobar('campos de error', () => assert.deepEqual(recibidos, esperados,
        `esperado ${JSON.stringify(esperados)}, recibido ${JSON.stringify(recibidos)}`));
    }
  }
  if (r.status === 404) await comprobar('formato { error }', () => assert.equal(typeof r.json?.error, 'string'));

  // El dato inválido no se guarda
  if (c.metodo === 'POST' && !exito) {
    if (conMarca) await comprobar('no guardado (search)', async () => assert.equal(await buscarTotal(t), 0));
    else await comprobar('no guardado (total)', async () => assert.equal(await totalActual(), antes));
  }
  if (fixture && !exito) {
    await comprobar('jugador sin cambios', async () => assert.deepEqual((await http('GET', `/jugadores/${fixture.id}`)).json, fixture));
  }

  // Éxito con cuerpo: solo las seis claves, persistido igual que la respuesta, valores esperados
  if (exito && ['POST', 'PUT', 'PATCH'].includes(c.metodo)) {
    anotar(r.json);
    await comprobar('solo campos del recurso', () => assert.deepEqual(Object.keys(r.json ?? {}).sort(), CLAVES_RECURSO));
    const g = await http('GET', `/jugadores/${r.json?.id}`);
    await comprobar('GET posterior igual a la respuesta', () => assert.deepEqual(g.json, r.json));
    for (const [k, v] of Object.entries(c.guardado ?? {})) {
      await comprobar(`guardado ${k}`, () => assert.deepEqual(g.json?.[k], resolver(v, t)));
    }
    if (fixture) await comprobar('id sin cambios', () => assert.equal(r.json?.id, fixture.id));
    if (c.metodo === 'POST') await comprobar('cabecera Location', () => assert.ok(r.location?.endsWith(`/jugadores/${r.json?.id}`), `Location ${r.location}`));
    if (c.metodo === 'PATCH' && fixture && obj) {
      for (const k of EDITABLES.filter(k => !Object.hasOwn(obj, k))) {
        await comprobar(`PATCH conserva ${k}`, () => assert.deepEqual(g.json?.[k], fixture[k]));
      }
    }
    if (c.comprobar) await comprobar('comprobación específica', () => c.comprobar(r.json));
  }
  if (c.metodo === 'GET' && fixture && exito) await comprobar('GET devuelve el jugador', () => assert.deepEqual(r.json, fixture));
  if (c.metodo === 'DELETE' && fixture && exito) {
    await comprobar('borrado de verdad', async () => assert.equal((await http('GET', `/jugadores/${fixture.id}`)).status, 404));
  }
  // Lista paginada
  if (c.endpoint === 'GET /jugadores' && r.status === 200) {
    await comprobar('forma de la lista', () => {
      assert.equal(typeof r.json?.total, 'number'); assert.equal(typeof r.json?.limit, 'number');
      assert.equal(typeof r.json?.offset, 'number'); assert.ok(Array.isArray(r.json?.items));
    });
    for (const [k, v] of Object.entries(c.cuerpoEsperado ?? {})) {
      await comprobar(`lista.${k}`, () => assert.deepEqual(r.json?.[k], v));
    }
  }

  const observado = r.status === 400 ? `errors=${JSON.stringify((r.json?.errors ?? []).map(e => e.field))}`
    : exito && r.json && c.entrada in r.json ? `${c.entrada} guardado=${recortar(JSON.stringify(r.json[c.entrada]), 50)}`
    : recortar(r.texto, 80);
  return { fallos, ruta, cuerpo, r, observado };
}

// Limpieza: borra solo jugadores nuestros (creados en esta ejecución o con la marca en el nombre)
async function limpiar() {
  let borrados = 0;
  for (const [id, ultimo] of creados) {
    const g = await http('GET', `/jugadores/${id}`);
    if (g.status === 200 && JSON.stringify(g.json) === JSON.stringify(ultimo)) {
      if ((await http('DELETE', `/jugadores/${id}`)).status === 204) borrados++;
    }
  }
  for (;;) {
    const l = await http('GET', `/jugadores?search=${MARCA}&limit=100`);
    const nuestros = (l.json?.items ?? []).filter(j => typeof j.nombre === 'string' && j.nombre.includes(MARCA));
    if (nuestros.length === 0) break;
    for (const j of nuestros) if ((await http('DELETE', `/jugadores/${j.id}`)).status === 204) borrados++;
  }
  return borrados;
}

// ---------------------------------------------------------------------------
// Programa principal
// ---------------------------------------------------------------------------
const fila = c => ({ bloque: c.bloque, endpoint: c.endpoint, entrada: c.entrada, regla: c.regla, valor: c.valor,
  status: Array.isArray(c.status) ? c.status.join('|') : c.status, errores: c.errores === null ? '(no se comprueba)' : c.errores.join(',') });

if (process.argv.includes('--tabla')) { console.table(CASOS.map(fila)); process.exit(0); }
if (process.argv.includes('--cobertura')) {
  // Map y no {}: entradas como "constructor" o "__proto__" chocarían con el prototipo
  const tabla = new Map();
  for (const c of CASOS) {
    const cols = tabla.get(c.endpoint) ?? new Map();
    cols.set(c.entrada, (cols.get(c.entrada) ?? 0) + 1);
    tabla.set(c.endpoint, cols);
  }
  for (const [e, cols] of tabla) console.log(`${e.padEnd(24)} ${[...cols].map(([k, v]) => `${k}=${v}`).join('  ')}`);
  process.exit(0);
}

console.log(`Matriz de validación contra ${BASE} (marca ${MARCA}) — ${CASOS.length} casos\n`);
const resumen = new Map();
const observaciones = [];
let superados = 0;
try {
  for (const [i, c] of CASOS.entries()) {
    const n = i + 1;
    let res;
    try { res = await ejecutar(c, n); } catch (e) { res = { fallos: [`error de red o del script: ${e.message}`], ruta: c.ruta, r: null }; }
    const s = resumen.get(c.endpoint) ?? { ok: 0, total: 0 };
    s.total++;
    if (res.fallos.length === 0) { s.ok++; superados++; } else {
      console.log(`FALLO #${n} [${c.endpoint}] ${c.entrada} · ${c.regla} · valor ${c.valor}`);
      console.log(`  petición : ${c.metodo} ${recortar(res.ruta, 90)} ${c.sinTipo ? '(sin Content-Type)' : c.tipo ?? ''} ${res.cuerpo !== undefined ? recortar(res.cuerpo, 140) : ''}`);
      if (res.r) console.log(`  respuesta: ${res.r.status} ${recortar(res.r.texto, 220)}`);
      for (const f of res.fallos) console.log(`  - ${f}`);
    }
    resumen.set(c.endpoint, s);
    if (c.status === 'observar' && res.r) observaciones.push(`#${n} [${c.endpoint}] ${c.entrada} · ${c.regla}: ${res.r.status} ${res.observado}`);
  }
} finally {
  const borrados = await limpiar().catch(e => `error al limpiar: ${e.message}`);
  console.log(`\nLimpieza: ${borrados} jugadores propios borrados.`);
}

console.log('\nComportamiento observado (no fijado por el contrato):');
for (const o of observaciones) console.log(`  ${o}`);
console.log('\nResumen por endpoint:');
for (const [e, s] of resumen) console.log(`  ${e.padEnd(24)} ${s.ok}/${s.total}`);
console.log(`\n${superados}/${CASOS.length} casos superados`);
process.exit(superados === CASOS.length ? 0 : 1);
