# Registro de revisión de los agentes

Cada entrada recoge qué se pidió al agente, qué devolvió, qué se decidió y por qué. La configuración
y los prompts completos están en `agents.md`.

- Secciones 1 a 6: **tester agent** (`blackbox-checks.mjs`).
- Secciones 7 a 11: **validation agent** (`validation-matrix.mjs`).
- Sección 12: resultado final.

Los agentes se lanzaron desde Claude Code, el asistente usado durante el desarrollo, y la revisión se
hizo con ese mismo apoyo. Cada decisión de este registro está justificada para que se pueda explicar
y defender.

# Tester agent

## 1. Generación de las comprobaciones de caja negra

**Qué se pidió.** Comprobaciones HTTP de caja negra de `/jugadores`, a partir solo de `README.md` y
de la API en ejecución, en un script de Node sin dependencias. También un informe que separara los
fallos de la API de los errores del propio agente.

**Qué devolvió.** `AI/blackbox-checks.mjs`, con 637 líneas y 49 comprobaciones, más un informe. Según
el informe, todas pasaban (49/49), no había fallos atribuibles a la API y había siete ambigüedades del
contrato y una lista de comportamientos no documentados.

**Qué se comprobó antes de aceptarlo.**

- Se ejecutó el script de forma independiente, sin fiarse del informe: 49/49 y código de salida 0.
- Se revisó que solo importa `node:assert/strict` y usa `fetch`. No lee ficheros ni importa nada de
  `src/`, así que es realmente de caja negra.
- Al terminar, la plantilla volvía a tener los mismos 8 jugadores: la limpieza de sus datos de prueba
  funciona.
- Se leyeron a mano las comprobaciones de la política de parámetros y de stats, que son las más
  delicadas.

**Decisión.** Aceptado, con las correcciones de los puntos 2 a 5.

## 2. Parámetros desconocidos y mal formados juntos — fallo real de la API

**Qué detectó el agente.** El README decía que un `400` devuelve "todas las incidencias a la vez",
pero su ejemplo `?limit=abc&color=azul` mostraba solo el error de `color`. La API seguía al ejemplo:
si había algún parámetro desconocido, ya no validaba los demás.

**Qué hizo el agente.** Lo clasificó como ambigüedad del contrato y relajó su comprobación para exigir
solo que `color` estuviera en la lista. Así la comprobación pasaba con cualquiera de las dos lecturas.

**Qué se corrigió.**

- **Se trató como un fallo de la API, no como una ambigüedad.** La regla general ("todas las
  incidencias") es la que pide el enunciado, y el ejemplo del README era el que estaba mal.
- **API:** `validateJugadorQuery` ya no termina en cuanto encuentra un parámetro desconocido. Sigue
  validando los parámetros conocidos y devuelve todas las incidencias juntas.
- **README:** el ejemplo muestra ahora los dos errores, `color` y `limit`.
- **Comprobación del agente:** se endureció para exigir exactamente `['color', 'limit']`.
- **Jest:** se añadió el caso `informa a la vez de parámetros desconocidos y mal formados`.

**Lección.** El agente cumplió la norma de no adaptar una comprobación para que pasara un fallo, pero
ante una contradicción del contrato eligió la lectura que no fallaba. Decidir qué lectura es la
correcta corresponde a quien conoce los requisitos, no al agente.

## 3. `GET /jugadores/stats?x=1` respondía 200 — corregido en la API

**Qué detectó el agente.** Lo anotó como comportamiento observado y no documentado: stats ignoraba los
parámetros desconocidos.

**Qué se corrigió.** El enunciado pide una política única para los parámetros desconocidos, así que
`/stats` debía aplicarla también.

- **API:** `validateStatsQuery` responde `400` ante cualquier parámetro.
- **README:** la tabla de endpoints y la sección de política lo indican.
- **Comprobaciones:** se añadió `Stats: aplica la política de parámetros desconocidos (400)` al script
  del agente y el caso equivalente a Jest.

## 4. `GET /jugadores/01` devolvía el jugador 1 — corregido en la API

**Qué detectó el agente.** Lo anotó como comportamiento no documentado: la API aceptaba ceros a la
izquierda en el id.

**Qué se corrigió.** El problema es que una misma URL de recurso tenía dos formas válidas, y además era
incoherente con `limit` y `offset`, que sí son estrictos.

- **API:** `leerId` acepta solo `/^[1-9]\d*$/`.
- **README:** documenta que `/01` responde `404`.
- **Comprobaciones:** se añadió `01` a la lista de ids inválidos del script y a la de Jest.

## 5. Huecos del contrato que se documentaron sin cambiar la API

El agente señaló comportamientos correctos pero no escritos en el contrato. Se añadieron al README
porque una persona que use la API no los puede adivinar:

| Detectado por el agente | Qué se documentó |
|---|---|
| `order` sin `sort` | Invierte el orden por `id`; `sort=id` no está permitido. |
| Orden de los nombres | Alfabético en español, sin distinguir mayúsculas ni tildes. |
| Desempates | En la ordenación se mantiene el orden por `id`; en `maximoAnotador` gana el de menor `id`. |
| Redondeo de `mediaPuntos` | Un decimal. |
| Nombre con espacios | Se valida y se guarda sin los espacios del principio y del final. |
| `porPosicion` | Incluye siempre las cinco posiciones, también con 0. |
| `offset` > `total`, `search` vacío y mayúsculas en los valores | `items: []`; no filtra; `DESC` y `TRUE` dan `400`. |
| Errores con `field: "body"` | Se listan los casos: JSON mal formado, array, cuerpo vacío, otro `Content-Type` y PATCH sin campos conocidos. |

## 6. Decisiones del agente que se aceptaron sin cambios

- **Tolerancia de ±0,05 al comparar `mediaPuntos`.** Se mantuvo: el redondeo ya está documentado, y
  calcular la media exacta desde el cliente con datos compartidos puede dar diferencias mínimas.
- **Reintentos (hasta 3) en las comprobaciones de stats.** Se mantuvieron. Mientras el agente
  trabajaba, el cliente se estaba probando en el navegador sobre la misma API: se creó, editó y borró
  a "Iker Sanz". El agente lo detectó y lo mencionó en su informe.
- **Aceptar cualquier jugador empatado en `maximoAnotador`.** Se mantuvo: probar el desempate exacto
  exigiría vaciar la plantilla, y el agente tenía prohibido tocar datos ajenos.

# Validation agent

## 7. Generación de la matriz de validación

**Qué se pidió.** Comprobar la validación de **cada entrada** de cada endpoint (los 5 campos en POST,
PUT y PATCH, los 7 parámetros de consulta, el `:id` y el formato del cuerpo), más un bloque de
robustez con entradas raras o maliciosas. Igual que el tester agent, solo podía leer `README.md`, y
además tenía prohibido leer la carpeta `AI/` para no copiar al otro agente. Se le pidió expresamente
no relajar ningún caso ante una ambigüedad.

**Qué devolvió.** `AI/validation-matrix.mjs`, con 663 líneas y una matriz declarativa de 542 casos,
más un informe con tabla de cobertura. Resultado: **538/542**. El informe atribuía 3 fallos a la API y
dejaba 1 caso ambiguo para que lo decidiera una persona.

**Qué se comprobó antes de aceptarlo.**

- Se ejecutó el script de forma independiente: los mismos 4 fallos y el mismo 538/542.
- Se reprodujo cada fallo a mano con `curl`. Los cuatro son reales.
- Solo importa `node:assert/strict` y usa `fetch`. No lee ficheros.
- Al terminar, la plantilla vuelve a tener los 8 jugadores: la limpieza de sus 298 jugadores de prueba
  funciona.
- El agente encontró y corrigió un fallo en su propio script: contaba la cobertura con un objeto `{}`,
  y las claves `__proto__` y `constructor` chocaban con el prototipo. Lo cambió a `Map`. Es justo el
  tipo de fallo que la matriz busca en la API. Se aceptó.

**Decisión.** Aceptado. Los fallos se corrigieron en la API (puntos 8 y 9), el caso ambiguo lo
decidió una persona (punto 10) y varias observaciones pasaron a ser reglas (punto 11).

## 8. Cuerpo vacío en POST y PUT — fallo real de la API

**Qué detectó el agente.** Con `Content-Type: application/json` y cuerpo vacío, la API devolvía los
cinco errores por campo en lugar de `field: "body"`, aunque el README dice expresamente que un cuerpo
vacío da `field: "body"`.

**Causa.** `express.json()` convierte un cuerpo vacío en `{}`, y el validador no podía distinguirlo de
un objeto sin campos. Se comprobó con un script de prueba aparte antes de tocar el código.

**Qué se corrigió.**

- **API:** nuevo middleware `src/middleware/cuerpoVacio.js`. La opción `verify` de `express.json`
  recibe los bytes reales del cuerpo; si hay 0 bytes, el cuerpo se descarta y el validador responde
  `field: "body"`, igual que cuando no hay cuerpo.
- **Jest:** casos `un cuerpo vacío con Content-Type JSON se trata como ausente` y `un PATCH con cuerpo
  vacío a un id inexistente responde 404`.

## 9. `GET /jugadores/%E0%A4%A` respondía 500 — fallo real y el más grave

**Qué detectó el agente.** Una URL con una codificación `%` inválida provocaba un **500**. Era el
único 5xx de los 542 casos.

**Causa.** Express no puede decodificar el `:id` y lanza un `URIError` con status 400. El manejador
de errores no lo reconocía y respondía 500. No había traza en la respuesta, pero sí un error interno
provocado desde fuera con una simple URL.

**Qué se corrigió.**

- **API:** `src/middleware/errors.js` responde `404` ante un `URIError`, igual que con cualquier `:id`
  mal formado. Además, cualquier otro error del cliente (status 4xx) que llegue al manejador conserva
  su status en lugar de convertirse en 500.
- **Matriz:** el caso pasó de `observar` a exigir `404`.
- **Jest:** caso `una URL con codificación % inválida responde 404 JSON, no 500`.

## 10. JSON mal formado a un id inexistente — ambigüedad decidida por una persona

**Qué detectó el agente.** El README decía que en PUT, PATCH y DELETE se comprueba primero el id
(`404`) y después el cuerpo (`400`). Pero `PUT /jugadores/999999999` con un JSON mal formado daba
`400`. El agente mantuvo su caso en estricto (404) y lo dejó como decisión humana, tal como se le
pidió.

**Decisión: no se cambia la API, se corrige el contrato.** El JSON se analiza en un middleware global
(`express.json`) antes de llegar a la ruta, así que un cuerpo ilegible se rechaza antes de poder
buscar el id. Cambiarlo obligaría a analizar el JSON a mano dentro de cada ruta, solo para cambiar el
status de una petición que de todas formas es incorrecta.

- **README:** nueva sección "Orden de las comprobaciones": primero JSON mal formado (`400`), después id
  inexistente (`404`) y después reglas del contenido (`400`).
- **Matriz:** el caso exige ahora `400` con `field: "body"`, con un comentario que explica la decisión.

**Lección.** Esta vez el agente hizo lo correcto ante la ambigüedad: no relajó su caso y lo señaló.
Fue posible porque el prompt se escribió con lo aprendido del tester agent (sección 2).

## 11. Observaciones que pasaron a ser reglas

El agente marcó como `observar` varios comportamientos que el contrato no fijaba. Revisados uno a uno:

| Observación del agente | Decisión | Cambio |
|---|---|---|
| `limit=05` y `offset=00` se aceptaban, pero `/jugadores/01` daba 404 | **Incoherente.** Mismo criterio para todos los números de la URL. | `limit` y `offset` sin ceros a la izquierda. Casos de la matriz y Jest a `400`. |
| Un nombre con `\u0000` dentro se guardaba | **Inaceptable** en un nombre. | Se rechazan los caracteres de control (`\p{Cc}`). |
| Un nombre de dos espacios de ancho cero (invisible) era válido | **Inaceptable:** el nombre se ve vacío. | Se rechazan los caracteres invisibles (`\p{Cf}`). |
| La longitud se contaba en unidades UTF-16: 31 emojis daban 400 y un solo emoji contaba como 2 | **Error:** el límite es de caracteres. | Se cuenta con `[...texto].length`. Un emoji pasa a dar 400 y 31 emojis, 201. El cliente cuenta igual. |
| El recorte quita también tabuladores, saltos de línea y espacios duros | Correcto. | Solo se documentó en el README. |
| Cuerpo > 100 KB: `413` con formato `{ error }` | Correcto. | Se añadió el 413 al README. |
| `PATCH { "id": 999999 }` daba 400 `body` | Correcto: el `id` nunca se puede cambiar. | Se documentó que el `id` no cuenta como campo modificable. |
| `__proto__` y `constructor` en el cuerpo, claves duplicadas, anidamiento de 20 000 niveles | Correcto: no se guardan ni contaminan nada. | Ninguno; la matriz los sigue comprobando. |
| `?=x` da 400 con `field: ""`; `?&&` da 200 | Coherente con la política: `""` es un parámetro desconocido, y `&&` no envía ninguno. | Ninguno. |

**Limitación aceptada.** En algunos POST inválidos sin la marca en el nombre, "no se ha guardado" se
comprueba comparando `total` antes y después. Si alguien usa la API a la vez, ese caso podría fallar
sin culpa de la API. Se aceptó porque la alternativa sería no comprobar esos casos.

# Resultado final

## 12. Las tres baterías, con la API corregida

| Batería | Resultado |
|---|---|
| `node AI/blackbox-checks.mjs` (tester agent + revisión) | 50/50 |
| `node AI/validation-matrix.mjs` (validation agent + revisión) | 542/542 |
| `npm test` (Jest + Supertest) | 44/44 |
