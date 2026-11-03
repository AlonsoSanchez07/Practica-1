# Práctica 1 · CB Arganzuela — Gestión de la plantilla

Aplicación cliente-servidor para gestionar los **jugadores** del primer equipo del Club Baloncesto
Arganzuela, el club ficticio de los laboratorios del bloque I. Una API REST con Node.js y Express
guarda los jugadores en memoria, y una página en HTML, CSS y JavaScript vanilla la consume con `fetch`.

## Autor

- Alonso Sánchez Moscoso (trabajo individual)

## Puesta en marcha

Requisitos: Node.js 18 o superior.

```bash
npm install
npm start
```

La aplicación queda en <http://localhost:3000>: la página en `/` y la API en `/jugadores`.
El puerto se puede cambiar con la variable de entorno `PORT`.

```bash
npm test
```

Ejecuta la suite opcional de Jest y Supertest, que importa `src/app.js` sin levantar el servidor.

## Estructura

```
practice1-cbarganzuela/
  package.json
  README.md
  src/
    app.js                         Configura Express: middlewares, estáticos, rutas y errores
    server.js                      Arranca el servidor (app.listen)
    middleware/logger.js           Registra método, ruta, status y duración de cada petición
    middleware/errors.js           404 JSON y manejador centralizado de errores
    routes/jugadores.js            Rutas ligeras: solo asocian método y ruta con el controlador
    controllers/jugadoresController.js  Lógica HTTP: valida, llama al almacenamiento y responde
    data/store.js                  Almacenamiento en memoria detrás de un módulo sustituible
    validators/jugadorValidator.js Validación del cuerpo y de los parámetros de consulta
  tests/jugadores.test.js          Pruebas automatizadas (opcional)
  AI/
    agents.md                      Configuración del tester agent, contrato y comprobaciones
    review-log.md                  Revisión crítica de lo que devolvió el agente
    blackbox-checks.mjs            Comprobaciones HTTP de caja negra generadas por el agente
  public/
    index.html, styles.css, app.js, img/escudo.svg
```

El controlador nunca toca el array de datos: solo llama a las funciones de `data/store.js`
(`findAll`, `findById`, `create`, `replace`, `update`, `remove`). Para pasar a una base de datos
bastaría con sustituir ese módulo por otro con las mismas funciones.

## Recurso: jugador

```json
{
  "id": 1,
  "nombre": "Daniel Ortega",
  "posicion": "base",
  "dorsal": 7,
  "puntos": 14.5,
  "disponible": true
}
```

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | entero | Lo genera el servidor. Si el cliente envía un `id`, se ignora. |
| `nombre` | texto | Obligatorio. Entre 2 y 60 caracteres tras quitar espacios al principio y al final; se guarda ya sin ellos. |
| `posicion` | valores cerrados | Obligatorio. Uno de: `base`, `escolta`, `alero`, `ala-pivot`, `pivot`. |
| `dorsal` | entero | Obligatorio. Número entero entre 0 y 99. |
| `puntos` | número | Obligatorio. Puntos por partido, entre 0 y 60. Admite decimales. |
| `disponible` | booleano | Obligatorio. `true` si puede jugar, `false` si está lesionado o sancionado. |

- Los tipos son estrictos: `"7"` (texto) no es un dorsal válido y `"true"` no es un booleano.
- Los campos desconocidos del cuerpo no se guardan ni producen error: simplemente se descartan.
- El servidor arranca con ocho jugadores de ejemplo. Al ser memoria, los cambios se pierden al reiniciarlo.

## Endpoints

Base: `http://localhost:3000`. Todas las respuestas son JSON salvo el `204` de `DELETE`.

| Método | Ruta | Consulta / cuerpo | Éxito | Errores |
|---|---|---|---|---|
| GET | `/jugadores` | `search`, `disponible`, `posicion`, `sort`, `order`, `limit`, `offset` | `200` lista paginada | `400` parámetro desconocido o mal formado |
| GET | `/jugadores/stats` | ninguno | `200` resumen calculado | `400` si llega cualquier parámetro |
| POST | `/jugadores` | jugador completo | `201` + cabecera `Location` | `400` validación o JSON mal formado |
| GET | `/jugadores/:id` | — | `200` jugador | `404` no existe |
| PUT | `/jugadores/:id` | jugador completo | `200` jugador sustituido | `404` no existe, `400` validación |
| PATCH | `/jugadores/:id` | uno o más campos | `200` jugador actualizado | `404` no existe, `400` validación |
| DELETE | `/jugadores/:id` | — | `204` sin cuerpo | `404` no existe |
| cualquiera | otra ruta | — | — | `404` `{ "error": "..." }` |

Formato de los errores:

- `400`: `{ "errors": [{ "field": "dorsal", "message": "..." }, ...] }` con **todas** las incidencias a la vez.
- `404`: `{ "error": "No existe ningún jugador con id 99." }`.
- `500`: `{ "error": "Error interno del servidor." }`. La traza solo se escribe en la consola del servidor.

En `PUT`, `PATCH` y `DELETE` se comprueba primero que el jugador existe (`404`) y después el cuerpo (`400`).
Un `:id` que no está escrito como entero positivo sin ceros a la izquierda (`/jugadores/abc`, `/0`,
`/1.5`, `/01`) se trata como inexistente: `404`.

Los cuerpos que no son un objeto JSON producen un `400` con `field: "body"`: JSON mal formado, un
array, un cuerpo vacío o un `Content-Type` distinto de `application/json`. También lo produce un
`PATCH` sin ningún campo conocido.

### GET /jugadores

| Parámetro | Valores | Efecto |
|---|---|---|
| `search` | texto | Búsqueda parcial en `nombre`, sin distinguir mayúsculas ni tildes. |
| `disponible` | `true` \| `false` | Filtra por el campo booleano. |
| `posicion` | `base` \| `escolta` \| `alero` \| `ala-pivot` \| `pivot` | Filtra por posición. |
| `sort` | `nombre` \| `dorsal` \| `puntos` | Campo de ordenación. Sin `sort`, se ordena por `id`. |
| `order` | `asc` \| `desc` | Sentido de la ordenación. Por defecto `asc`. |
| `limit` | entero de 1 a 100 | Tamaño de la ventana. Por defecto `20`. |
| `offset` | entero ≥ 0 | Elementos que se saltan. Por defecto `0`. |

Todos los parámetros se pueden combinar. Primero se filtra, después se ordena y al final se aplica la ventana.
`total` es el número de jugadores que cumplen los filtros, antes de aplicar `limit` y `offset`.

Detalles:

- Los valores distinguen mayúsculas: `order=DESC` o `disponible=TRUE` responden `400`.
- Un `search` vacío o solo con espacios no filtra.
- `order` sin `sort` invierte el orden por `id`. `sort=id` no está permitido: es el orden por defecto.
- `nombre` se ordena alfabéticamente en español, sin distinguir mayúsculas ni tildes
  ("Álvaro" va antes que "Daniel").
- En caso de empate se mantiene el orden por `id`.
- Un `offset` mayor que `total` responde `200` con `items: []`.

```http
GET /jugadores?posicion=base&disponible=true&sort=puntos&order=desc&limit=2
```

```json
{
  "total": 2,
  "limit": 2,
  "offset": 0,
  "items": [
    { "id": 1, "nombre": "Daniel Ortega", "posicion": "base", "dorsal": 7, "puntos": 14.5, "disponible": true },
    { "id": 6, "nombre": "Mario Pastor", "posicion": "base", "dorsal": 4, "puntos": 6.1, "disponible": true }
  ]
}
```

```http
GET /jugadores?limit=abc&color=azul
```

```json
{
  "errors": [
    { "field": "color", "message": "Parámetro de consulta desconocido." },
    { "field": "limit", "message": "limit debe ser un entero entre 1 y 100." }
  ]
}
```

### GET /jugadores/stats

Se calcula en cada petición a partir de los datos actuales; no se guarda en ningún sitio.
Está declarada antes de `/jugadores/:id` para que `stats` no se interprete como un identificador.

```json
{
  "total": 8,
  "disponibles": 6,
  "mediaPuntos": 9.5,
  "maximoAnotador": { "id": 1, "nombre": "Daniel Ortega", "puntos": 14.5 },
  "porPosicion": { "base": 2, "escolta": 2, "alero": 2, "ala-pivot": 1, "pivot": 1 }
}
```

- `mediaPuntos` se redondea a un decimal.
- `porPosicion` incluye siempre las cinco posiciones, también las que tienen 0 jugadores.
- Si hay empate en `maximoAnotador`, se elige el de menor `id`.
- Con la plantilla vacía, `mediaPuntos` es `0` y `maximoAnotador` es `null`.
- No admite parámetros de consulta: cualquiera responde `400`, igual que en `GET /jugadores`.

### POST /jugadores

```http
POST /jugadores
Content-Type: application/json

{ "nombre": "Iker Sanz", "posicion": "escolta", "dorsal": 21, "puntos": 3.5, "disponible": true, "id": 500, "color": "azul" }
```

```http
HTTP/1.1 201 Created
Location: /jugadores/9

{ "id": 9, "nombre": "Iker Sanz", "posicion": "escolta", "dorsal": 21, "puntos": 3.5, "disponible": true }
```

El `id` 500 y el campo `color` se descartan.

```http
POST /jugadores
Content-Type: application/json

{ "nombre": "A", "posicion": "portero", "dorsal": 120 }
```

```json
{
  "errors": [
    { "field": "nombre", "message": "El nombre debe tener entre 2 y 60 caracteres." },
    { "field": "posicion", "message": "La posición debe ser una de: base, escolta, alero, ala-pivot, pivot." },
    { "field": "dorsal", "message": "El dorsal debe ser un número entero entre 0 y 99." },
    { "field": "puntos", "message": "Los puntos por partido son obligatorios." },
    { "field": "disponible", "message": "La disponibilidad es obligatoria." }
  ]
}
```

### GET, PUT, PATCH y DELETE /jugadores/:id

```http
PATCH /jugadores/3
Content-Type: application/json

{ "disponible": false }
```

```json
{ "id": 3, "nombre": "Hugo Llorente", "posicion": "alero", "dorsal": 11, "puntos": 11.2, "disponible": false }
```

```http
DELETE /jugadores/3
```

```http
HTTP/1.1 204 No Content
```

## PUT frente a PATCH

- **PUT** sustituye el jugador entero. Exige los cinco campos con validación completa, igual que `POST`.
  Si falta alguno, responde `400`: no se rellena con el valor anterior.
- **PATCH** modifica solo los campos que llegan en el cuerpo, con validación parcial. Los demás se
  conservan. Un cuerpo sin ningún campo conocido responde `400`.

El cliente usa los dos:

- El botón **Editar** carga el jugador en el formulario y lo envía con **PUT**, porque el formulario
  siempre tiene los cinco campos y representa el jugador completo.
- El botón **Marcar como no disponible / disponible** de cada tarjeta envía un **PATCH** con solo
  `{ "disponible": ... }`. Cambiar un único dato no requiere reenviar el resto.

## Política de parámetros desconocidos

Política única: **responder `400`**, en `GET /jugadores` y en `GET /jugadores/stats`. Producen `400`:

- los parámetros que la API no conoce (`?color=azul`);
- los valores mal formados (`limit=abc`, `order=arriba`, `posicion=portero`, `disponible=quizas`);
- los parámetros repetidos (`?sort=nombre&sort=dorsal`).

La respuesta incluye todas las incidencias a la vez, aunque se mezclen parámetros desconocidos y mal
formados. Ninguno de estos casos detiene el servidor.

Se eligió `400` en lugar de ignorarlos para que un error de escritura en la URL no devuelva en
silencio una lista sin filtrar que parezca correcta.

## Contenido estático

`src/app.js` instala `express.static` sobre la carpeta `public/`, **antes** de las rutas de la API y
del manejador de 404. Así:

- la página y la API comparten origen (`http://localhost:3000`), y `fetch("/jugadores")` funciona
  sin configurar CORS;
- las peticiones a `/`, `/styles.css` o `/app.js` las resuelve `express.static`, y solo las que no
  corresponden a ningún fichero continúan hacia la API o hacia el 404 JSON.

## Por qué el filtrado se hace en el servidor

- El cliente solo recibe la página de resultados que va a mostrar, no la colección entera.
- `total`, `limit` y `offset` solo son coherentes si se calculan sobre los datos ya filtrados.
- Las reglas de búsqueda, filtros y ordenación están en un único sitio. Cualquier otro cliente
  (curl, el tester agent, una futura app) obtiene exactamente los mismos resultados.

El cliente solo construye la URL de consulta con `URLSearchParams` a partir del buscador y los filtros.

## Cliente web

`public/index.html` es la única página:

- listado en tarjetas con botones de edición, cambio de disponibilidad y eliminación en cada una;
- formulario de creación que también se usa para editar;
- buscador, filtros por posición y disponibilidad, ordenación y paginación, todo resuelto en el servidor;
- indicador "Cargando…" mientras hay peticiones en curso, mensaje de error legible y estado de lista vacía;
- panel de estadísticas que se recarga tras cada cambio;
- todo se actualiza sin recargar la página.

`fetch` no rechaza la promesa ante un `404` o un `500`: `public/app.js` comprueba siempre `response.ok`
y convierte la respuesta en un mensaje de error.

**Validación en dos niveles.** El cliente hace una validación inicial antes de enviar: campos
obligatorios y longitud del nombre. Las reglas de dominio (rangos de dorsal y puntos, posición
permitida) las decide el servidor. Cuando responde `400`, cada `{ field, message }` se muestra debajo
de su campo. Por ejemplo, un dorsal 120 pasa la validación del cliente y el error del servidor aparece
bajo el campo Dorsal.

## Componente de IA agéntica

En la carpeta `AI/` está la configuración del tester agent. Recibió solo este contrato y la URL de la
API en ejecución, sin acceso a `src/`. También está el registro de la revisión de lo que generó. Las
comprobaciones de caja negra se ejecutan con la API arrancada:

```bash
node AI/blackbox-checks.mjs
```
