// Pruebas de la API importando app.js, sin levantar el servidor.
const request = require('supertest');
const app = require('../src/app');
const store = require('../src/data/store');
const { errorHandler } = require('../src/middleware/errors');

const NUEVO = { nombre: 'Iker Sanz', posicion: 'escolta', dorsal: 21, puntos: 3.5, disponible: true };

beforeEach(() => {
  store.reset();
});

describe('GET /jugadores', () => {
  test('devuelve la lista paginada con los valores por defecto', async () => {
    const res = await request(app).get('/jugadores');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 8, limit: 20, offset: 0 });
    expect(res.body.items).toHaveLength(8);
    expect(res.body.items[0]).toEqual({
      id: 1, nombre: 'Daniel Ortega', posicion: 'base', dorsal: 7, puntos: 14.5, disponible: true,
    });
  });

  test('search es parcial y no distingue mayúsculas ni tildes', async () => {
    const res = await request(app).get('/jugadores?search=NZE');
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].nombre).toBe('Samuel Nzé');
  });

  test('combina filtros, ordenación y ventana', async () => {
    const res = await request(app).get('/jugadores?posicion=base&disponible=true&sort=puntos&order=desc&limit=1');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items.map((j) => j.nombre)).toEqual(['Daniel Ortega']);
  });

  test('ordena por nombre y por dorsal', async () => {
    const porNombre = await request(app).get('/jugadores?sort=nombre');
    expect(porNombre.body.items[0].nombre).toBe('Álvaro Ríos');
    const porDorsal = await request(app).get('/jugadores?sort=dorsal&order=desc');
    expect(porDorsal.body.items.map((j) => j.dorsal)).toEqual([23, 15, 14, 11, 9, 7, 5, 4]);
  });

  test('offset salta elementos y total no depende de la ventana', async () => {
    const res = await request(app).get('/jugadores?limit=3&offset=6');
    expect(res.body.total).toBe(8);
    expect(res.body.items.map((j) => j.id)).toEqual([7, 8]);
  });

  test('responde 400 ante parámetros desconocidos', async () => {
    const res = await request(app).get('/jugadores?color=azul');
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([{ field: 'color', message: expect.any(String) }]);
  });

  test('responde 400 con todos los parámetros mal formados', async () => {
    const res = await request(app).get('/jugadores?limit=abc&offset=-1&order=arriba&sort=edad&disponible=quizas&posicion=portero');
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field).sort())
      .toEqual(['disponible', 'limit', 'offset', 'order', 'posicion', 'sort']);
  });

  test('informa a la vez de parámetros desconocidos y mal formados', async () => {
    const res = await request(app).get('/jugadores?limit=abc&color=azul');
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field)).toEqual(['color', 'limit']);
  });

  test('limit y offset no admiten ceros a la izquierda', async () => {
    const res = await request(app).get('/jugadores?limit=05&offset=00');
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field)).toEqual(['limit', 'offset']);
  });

  test('responde 400 si un parámetro se repite', async () => {
    const res = await request(app).get('/jugadores?sort=nombre&sort=dorsal');
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('sort');
  });
});

describe('GET /jugadores/stats', () => {
  test('calcula el resumen con los datos actuales', async () => {
    const res = await request(app).get('/jugadores/stats');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      total: 8,
      disponibles: 6,
      mediaPuntos: 9.5,
      maximoAnotador: { id: 1, nombre: 'Daniel Ortega', puntos: 14.5 },
      porPosicion: { base: 2, escolta: 2, alero: 2, 'ala-pivot': 1, pivot: 1 },
    });
  });

  test('aplica la misma política de parámetros desconocidos', async () => {
    const res = await request(app).get('/jugadores/stats?x=1');
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([{ field: 'x', message: expect.any(String) }]);
  });

  test('se recalcula tras un cambio y no se confunde con un id', async () => {
    await request(app).delete('/jugadores/1');
    const res = await request(app).get('/jugadores/stats');
    expect(res.body.total).toBe(7);
    expect(res.body.maximoAnotador.nombre).toBe('Samuel Nzé');
  });
});

describe('GET /jugadores/:id', () => {
  test('devuelve el jugador', async () => {
    const res = await request(app).get('/jugadores/3');
    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe('Hugo Llorente');
  });

  test.each(['999', 'abc', '0', '1.5', '01', '-1'])('responde 404 JSON para el id %s', async (id) => {
    const res = await request(app).get(`/jugadores/${id}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toEqual(expect.any(String));
  });
});

describe('POST /jugadores', () => {
  test('crea el jugador con 201 y cabecera Location', async () => {
    const res = await request(app).post('/jugadores').send(NUEVO);
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe('/jugadores/9');
    expect(res.body).toEqual({ id: 9, ...NUEVO });

    const creado = await request(app).get(res.headers.location);
    expect(creado.body).toEqual(res.body);
  });

  test('ignora el id del cliente y no guarda campos desconocidos', async () => {
    const res = await request(app).post('/jugadores').send({ ...NUEVO, id: 500, color: 'azul' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(9);
    expect(res.body).not.toHaveProperty('color');
  });

  test('quita los espacios del nombre', async () => {
    const res = await request(app).post('/jugadores').send({ ...NUEVO, nombre: '  Iker Sanz  ' });
    expect(res.body.nombre).toBe('Iker Sanz');
  });

  test('devuelve todas las incidencias a la vez', async () => {
    const res = await request(app).post('/jugadores').send({ nombre: 'A', posicion: 'portero', dorsal: 120 });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field)).toEqual(['nombre', 'posicion', 'dorsal', 'puntos', 'disponible']);
    for (const error of res.body.errors) {
      expect(error.message).toEqual(expect.any(String));
    }
  });

  test('los tipos son estrictos', async () => {
    const res = await request(app).post('/jugadores')
      .send({ nombre: 'Iker Sanz', posicion: 'escolta', dorsal: '21', puntos: '3.5', disponible: 'true' });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field)).toEqual(['dorsal', 'puntos', 'disponible']);
  });

  test('comprueba los rangos numéricos', async () => {
    const fuera = await request(app).post('/jugadores').send({ ...NUEVO, dorsal: 7.5, puntos: 61 });
    expect(fuera.body.errors.map((e) => e.field)).toEqual(['dorsal', 'puntos']);
    const limites = await request(app).post('/jugadores').send({ ...NUEVO, dorsal: 0, puntos: 60 });
    expect(limites.status).toBe(201);
  });

  test('responde 400 si el JSON está mal formado', async () => {
    const res = await request(app).post('/jugadores')
      .set('Content-Type', 'application/json')
      .send('{"nombre": ');
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('body');
  });

  test('responde 400 si el cuerpo no es un objeto', async () => {
    const res = await request(app).post('/jugadores').send([NUEVO]);
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('body');
  });

  test('un cuerpo vacío con Content-Type JSON se trata como ausente', async () => {
    const res = await request(app).post('/jugadores').set('Content-Type', 'application/json').send('');
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([{ field: 'body', message: expect.any(String) }]);
  });

  test('el nombre no admite caracteres de control ni invisibles', async () => {
    for (const nombre of ['Ab\u0000cd', '​​', 'Iker​Sanz']) {
      const res = await request(app).post('/jugadores').send({ ...NUEVO, nombre });
      expect(res.status).toBe(400);
      expect(res.body.errors.map((e) => e.field)).toEqual(['nombre']);
    }
  });

  test('la longitud del nombre se cuenta en caracteres reales', async () => {
    const unEmoji = await request(app).post('/jugadores').send({ ...NUEVO, nombre: '\u{1F3C0}' });
    expect(unEmoji.status).toBe(400);
    const sesentaEmojis = await request(app).post('/jugadores').send({ ...NUEVO, nombre: '\u{1F3C0}'.repeat(60) });
    expect(sesentaEmojis.status).toBe(201);
  });
});

describe('PUT /jugadores/:id', () => {
  test('sustituye el jugador completo y conserva el id', async () => {
    const res = await request(app).put('/jugadores/2').send({ ...NUEVO, id: 77 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 2, ...NUEVO });
  });

  test('exige todos los campos', async () => {
    const res = await request(app).put('/jugadores/2').send({ disponible: false });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field)).toEqual(['nombre', 'posicion', 'dorsal', 'puntos']);
  });

  test('responde 404 si no existe', async () => {
    const res = await request(app).put('/jugadores/999').send(NUEVO);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /jugadores/:id', () => {
  test('cambia solo los campos recibidos', async () => {
    const res = await request(app).patch('/jugadores/3').send({ disponible: false });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 3, nombre: 'Hugo Llorente', posicion: 'alero', dorsal: 11, puntos: 11.2, disponible: false,
    });
  });

  test('valida los campos presentes', async () => {
    const res = await request(app).patch('/jugadores/3').send({ dorsal: -1 });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([{ field: 'dorsal', message: expect.any(String) }]);
  });

  test('responde 400 si no llega ningún campo conocido', async () => {
    const res = await request(app).patch('/jugadores/3').send({ id: 50, color: 'azul' });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('body');
  });

  test('responde 404 si no existe', async () => {
    const res = await request(app).patch('/jugadores/999').send({ disponible: false });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /jugadores/:id', () => {
  test('elimina con 204 sin cuerpo y después responde 404', async () => {
    const res = await request(app).delete('/jugadores/4');
    expect(res.status).toBe(204);
    expect(res.text).toBe('');

    const despues = await request(app).get('/jugadores/4');
    expect(despues.status).toBe(404);
    const otraVez = await request(app).delete('/jugadores/4');
    expect(otraVez.status).toBe(404);
  });
});

describe('errores', () => {
  test('un PATCH con cuerpo vacío a un id inexistente responde 404', async () => {
    const res = await request(app).patch('/jugadores/999').set('Content-Type', 'application/json').send('');
    expect(res.status).toBe(404);
  });

  test('una URL con codificación % inválida responde 404 JSON, no 500', async () => {
    const res = await request(app).get('/jugadores/%E0%A4%A');
    expect(res.status).toBe(404);
    expect(res.body.error).toEqual(expect.any(String));
  });

  test('el manejador responde 500 JSON sin enviar la traza', () => {
    const res = { headersSent: false, status: jest.fn().mockReturnThis(), json: jest.fn() };
    const espia = jest.spyOn(console, 'error').mockImplementation(() => {});
    errorHandler(new Error('fallo inesperado'), {}, res, () => {});
    espia.mockRestore();

    expect(res.status).toHaveBeenCalledWith(500);
    const cuerpo = res.json.mock.calls[0][0];
    expect(cuerpo).toEqual({ error: 'Error interno del servidor.' });
    expect(JSON.stringify(cuerpo)).not.toMatch(/fallo inesperado|at /);
  });
});

describe('rutas generales', () => {
  test('una ruta inexistente responde 404 JSON', async () => {
    const res = await request(app).get('/no-existe');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.error).toEqual(expect.any(String));
  });

  test('express.static sirve la página en /', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });
});
