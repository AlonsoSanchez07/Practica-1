# Agentes de IA

El proyecto usa dos agentes de **caja negra**, lanzados como subagentes de Claude Code desde la sesión
de desarrollo. Ninguno de los dos ve la implementación: solo reciben el contrato (`README.md`) y la
API en ejecución. Tienen funciones separadas para no solaparse:

| | Tester agent | Validation agent |
|---|---|---|
| Pregunta que responde | ¿Cada endpoint **se comporta** como dice el contrato? | ¿Cada **entrada** de cada endpoint se valida como dice el contrato? |
| Se centra en | CRUD, status de éxito y error, `Location`, filtros, ordenación, paginación, stats | Cada campo contra cada regla, cada parámetro, el `:id`, el formato del cuerpo, que nada inválido se guarda, robustez (nunca 5xx) |
| Script | `AI/blackbox-checks.mjs` (50 comprobaciones) | `AI/validation-matrix.mjs` (542 casos en una matriz declarativa) |
| Origen | El que pide el enunciado (apartado 9) | Ampliación propia para cubrir la validación de forma exhaustiva |

El enunciado pide un único tester agent. El segundo agente se añadió porque la validación de entradas
(apartado 3.4) tiene muchas combinaciones (5 endpoints × 5 campos × varias reglas, más 7 parámetros
de consulta) que conviene probar de forma sistemática. Se le prohibió leer el script del tester agent
para que no copiara sus casos y aportara una mirada independiente.

## 1. Tester agent

### Configuración

| | |
|---|---|
| Rol | Tester de caja negra de la API `/jugadores` |
| Herramienta | Subagente de Claude Code (tipo `general-purpose`), lanzado desde la sesión de desarrollo |
| Entrada | Solo `README.md` (el contrato) y la API en ejecución en `http://localhost:3000` |
| Sin acceso a | `src/`, `tests/`, `public/` y `package.json`: se le prohíbe leerlos en el prompt |
| Salida | `AI/blackbox-checks.mjs` y un informe con fallos, correcciones y huecos del contrato |
| Ejecución | `node AI/blackbox-checks.mjs` con la API arrancada (`BASE_URL` opcional) |

El agente no ve la implementación: todo lo que sabe de la API sale del README o de las respuestas
HTTP que obtiene. Por eso sus comprobaciones verifican el **contrato**, no el código, y sirven para
detectar diferencias entre lo que el README promete y lo que la API hace.

### Prompt

```text
Eres el TESTER AGENT de un proyecto universitario. Tu trabajo es generar comprobaciones HTTP de CAJA NEGRA para una API REST a partir únicamente de su contrato.

## Lo que recibes
1. El contrato: el fichero README.md del proyecto.
   Lee las secciones "Recurso: jugador", "Endpoints", "PUT frente a PATCH" y "Política de parámetros desconocidos".
2. La API en ejecución en http://localhost:3000 (recurso /jugadores).

## Restricciones estrictas
- NO leas ningún otro fichero del proyecto: ni src/, ni tests/, ni public/, ni package.json. Solo el README.md. Si necesitas saber algo que el contrato no dice, pruébalo contra la API en ejecución y anótalo como "comportamiento observado, no documentado".
- No modifiques ningún fichero salvo el que se te pide crear.
- La API guarda los datos en memoria y otras personas pueden estar usándola: no supongas que los datos iniciales están intactos. Crea tus propios jugadores para las pruebas que modifican datos y elimínalos al terminar. No borres ni modifiques jugadores que no hayas creado tú.

## Lo que debes producir
Crea el fichero AI/blackbox-checks.mjs con estas condiciones:
- Script de Node.js 18+ sin dependencias: usa el fetch global y node:assert/strict.
- La URL base se lee de process.env.BASE_URL, con http://localhost:3000 por defecto.
- Cada comprobación tiene un nombre corto y se ejecuta de forma independiente: si una falla, las demás siguen. Al final imprime "N/M comprobaciones superadas" y sale con código 1 si alguna falla.
- Cubre, como mínimo: los cinco métodos y sus status de éxito; la cabecera Location del POST; el 204 sin cuerpo; 404 JSON de un id inexistente y de una ruta inexistente; 400 con TODAS las incidencias en formato { errors: [{ field, message }] }; que un id enviado por el cliente se ignora y que los campos desconocidos no se guardan; tipos estrictos y límites de rango (valores justo en el límite y justo fuera); PUT exige todos los campos y PATCH solo los enviados; cada filtro de GET /jugadores por separado y combinados; ordenación por al menos dos campos en ambos sentidos; limit/offset y que total no depende de la ventana; la política de parámetros desconocidos y mal formados; que GET /jugadores/stats es coherente con GET /jugadores (calcula tú el resumen a partir de la lista completa y compáralo) y que se recalcula tras un cambio.
- Escribe comentarios breves en español en el script.

Después, ejecuta el script con node AI/blackbox-checks.mjs. Si alguna comprobación falla, decide si el fallo es de la API (incumple el contrato) o de tu comprobación (la escribiste mal o el contrato es ambiguo). Corrige SOLO tus comprobaciones cuando el error sea tuyo; nunca adaptes una comprobación para que pase si la API incumple el contrato.

## Tu respuesta final
Devuelve un informe en español con:
1. La lista de comprobaciones generadas (nombre y qué verifican), agrupadas por endpoint.
2. El resultado de la última ejecución (N/M) y la salida de las que fallen.
3. Cada fallo que atribuyas a la API, con la petición, la respuesta obtenida y la parte del contrato que incumple.
4. Cada corrección que hiciste en tus propias comprobaciones y por qué.
5. Ambigüedades o huecos del contrato que hayas encontrado y comportamientos observados que el README no documenta.
```

Decisiones de diseño del prompt:

- **Solo el README.** Si el agente leyera `src/`, escribiría pruebas que confirman lo que el código ya
  hace, aunque eso no coincida con lo prometido en el contrato.
- **Datos propios y limpieza.** La API guarda en memoria y, mientras el agente trabajaba, se estaba
  usando a la vez desde el navegador: las comprobaciones no pueden depender de los ocho jugadores
  iniciales.
- **Prohibido "arreglar" una comprobación para que pase.** Es la forma más habitual de que un agente
  oculte un fallo real de la API.
- **Informe estructurado.** Separa los fallos de la API de los errores del propio agente, para que la
  revisión humana de `review-log.md` sea posible.

### Contrato recibido

El contrato es `README.md`, en concreto las secciones *Recurso: jugador*, *Endpoints*, *PUT frente a
PATCH* y *Política de parámetros desconocidos*, tal como estaba al lanzar el agente, antes del primer
commit. Su revisión cambió después el contrato: el ejemplo de `?limit=abc&color=azul`, la política de
parámetros en `/stats`, los ids con ceros a la izquierda y los huecos que documentó. Esos cambios
están explicados en `review-log.md` (secciones 2 a 5) y ya incorporados al README actual.

### Comprobaciones generadas

El agente generó `AI/blackbox-checks.mjs`, un script de Node.js 18+ sin dependencias que usa solo
`fetch` y `node:assert/strict`. Tiene 49 comprobaciones independientes. Tras la revisión humana
quedan 50: se añadió una y se endurecieron dos (ver `review-log.md`). Las líneas modificadas
llevan el comentario `// Revisión humana:`.

Antes de empezar, cada ejecución genera una marca aleatoria (`Qk` + 6 letras). Todos los jugadores
que crea llevan esa marca en el nombre, así que puede aislarlos con `?search=` aunque otras personas
estén usando la API, y al terminar los borra.

| Grupo | Comprobaciones |
|---|---|
| Preparación y limpieza | Crea cinco jugadores marcados y comprueba que `search` los encuentra. Al terminar los borra y comprueba que no queda ninguno. |
| POST | `201` con `Location` que apunta a un GET válido. Ignora el `id` del cliente y descarta campos desconocidos. Con el ejemplo del README devuelve las cinco incidencias. Con `{}` exige los cinco campos. Tipos estrictos (`"7"`, `7.5`, `"true"`, `1`…). Valores justo en el límite se aceptan y valores justo fuera dan `400` en su campo. Un `400` no crea nada. JSON mal formado da `400`. |
| GET /:id y rutas | `200` con el jugador. `404` JSON para un id inexistente o mal formado (`abc`, `0`, `-1`, `1.5`, `01`). `404` JSON para rutas y métodos inexistentes. |
| PUT | Sustituye el jugador completo e ignora el `id` y los campos desconocidos. Si falta un campo, `400` y el jugador queda sin cambios. Con cinco campos inválidos devuelve cinco incidencias. `404` antes de validar el cuerpo. |
| PATCH | Cambia solo lo enviado y un GET posterior lo confirma. Validación parcial campo a campo. `400` si no llega ningún campo conocido. `404` antes de validar. |
| DELETE | `204` sin cuerpo; después GET y un segundo DELETE dan `404`. `404` si el id no existe o no es válido. |
| GET /jugadores | Valores por defecto (`limit` 20, `offset` 0, orden por id). `search` parcial que no distingue mayúsculas ni tildes. Filtros `disponible` y `posicion` (las cinco), solos y combinados. Ordenación por `nombre`, `dorsal` y `puntos` en los dos sentidos, y `order` sin `sort`. Siete ventanas `limit`/`offset` con `total` constante. Todo combinado. Límites 1, 100 y 0. |
| Política de parámetros | Parámetros desconocidos (uno y dos). El ejemplo `?limit=abc&color=azul` con las dos incidencias. Quince valores mal formados, cada uno con su campo. Seis a la vez dan seis incidencias. Parámetros repetidos. El servidor sigue respondiendo después. |
| Stats | Forma del contrato y que `stats` no se interpreta como id. Coherencia con la colección completa: el agente pagina `GET /jugadores` y calcula él mismo el resumen. Se recalcula tras POST, PATCH y DELETE. `maximoAnotador` cambia con un jugador de 60 puntos. `400` con parámetros. |

Última ejecución, con la API corregida: **50/50 comprobaciones superadas**.

```bash
npm start
node AI/blackbox-checks.mjs
```

#### Lista completa de comprobaciones

Las 50 comprobaciones de `AI/blackbox-checks.mjs`, en el orden en que se ejecutan:

```text
 1. preparación: crear jugadores propios
 2. POST: 201, cuerpo con id y cabecera Location
 3. POST: ignora el id del cliente y descarta campos desconocidos
 4. POST: 400 con todas las incidencias (ejemplo del README)
 5. POST: cuerpo vacío {} lista los cinco campos obligatorios
 6. POST: tipos estrictos ("7", "true", "3", 5, 7.5)
 7. POST: valores justo en el límite se aceptan
 8. POST: valores justo fuera del límite dan 400 en su campo
 9. POST: un 400 no crea el jugador
10. POST: JSON mal formado da 400 con formato errors
11. GET /:id: 200 con el jugador
12. GET /:id: 404 JSON si no existe
13. GET /:id: id no entero positivo se trata como inexistente (404)
14. Ruta inexistente: 404 JSON con error
15. PUT: 200 sustituye el jugador completo
16. PUT: ignora id del cuerpo y campos desconocidos
17. PUT: exige todos los campos (400 y no rellena con el anterior)
18. PUT: validación completa con todas las incidencias
19. PUT: 404 si no existe, antes de validar el cuerpo
20. PATCH: 200 modifica solo los campos enviados
21. PATCH: validación parcial (solo el campo enviado)
22. PATCH: cuerpo sin ningún campo conocido da 400
23. PATCH: ignora id y descarta campos desconocidos
24. PATCH: 404 si no existe, antes de validar el cuerpo
25. DELETE: 204 sin cuerpo y después 404
26. DELETE: 404 JSON si no existe o el id no es válido
27. GET lista: 200 con total, limit, offset e items por defecto
28. Filtro search: parcial, sin mayúsculas ni tildes
29. Filtro disponible (true y false)
30. Filtro posicion (las cinco posiciones)
31. Filtros combinados (search + posicion + disponible)
32. Ordenación por nombre asc/desc
33. Ordenación por dorsal asc/desc (asc por defecto)
34. Ordenación por puntos asc/desc
35. Sin sort: orden por id (también con order=desc)
36. limit/offset: ventanas y total independiente de la ventana
37. Todo combinado: filtrar, ordenar y después ventana
38. limit y offset en sus límites (1, 100, 0) se aceptan
39. Parámetro desconocido: 400 con field = nombre del parámetro
40. Ejemplo del README: ?limit=abc&color=azul da 400 con color y limit
41. Stats: aplica la política de parámetros desconocidos (400)
42. Valores mal formados o fuera de rango: 400 en su campo
43. Varios valores mal formados: todas las incidencias a la vez
44. Parámetros repetidos: 400
45. Los errores de parámetros no detienen el servidor
46. Stats: 200 con la forma del contrato y no se trata como id
47. Stats: coherente con la lista completa de GET /jugadores
48. Stats: se recalcula tras crear, modificar y borrar
49. Stats: maximoAnotador cambia al crear un jugador con 60 puntos
50. limpieza: borrar los jugadores propios
```

## 2. Validation agent

### Configuración

| | |
|---|---|
| Rol | Validador de caja negra de las **entradas** de la API `/jugadores` |
| Herramienta | Subagente de Claude Code (tipo `general-purpose`), lanzado desde la sesión de desarrollo |
| Entrada | Solo `README.md` (el contrato) y la API en ejecución en `http://localhost:3000` |
| Sin acceso a | `src/`, `tests/`, `public/`, `package.json` y toda la carpeta `AI/`, incluido el script del tester agent |
| Salida | `AI/validation-matrix.mjs` y un informe con cobertura, fallos, correcciones y ambigüedades |
| Ejecución | `node AI/validation-matrix.mjs` con la API arrancada (`--tabla` y `--cobertura` opcionales) |

### Prompt

```text
Eres el VALIDATION AGENT de un proyecto universitario. Tu único trabajo es comprobar la VALIDACIÓN DE ENTRADAS de una API REST, endpoint por endpoint y entrada por entrada, a partir solo de su contrato. Otro agente distinto ya prueba el comportamiento general (CRUD, filtros, ordenación, stats); tú no repites eso: te centras en qué pasa con cada dato que entra a la API.

## Lo que recibes
1. El contrato: el fichero README.md del proyecto.
   Lee sobre todo "Recurso: jugador", "Endpoints" y "Política de parámetros desconocidos".
2. La API en ejecución en http://localhost:3000 (recurso /jugadores).

## Restricciones estrictas
- NO leas ningún otro fichero del proyecto: ni src/, ni tests/, ni public/, ni package.json, ni nada de la carpeta AI/ (allí están las comprobaciones del otro agente y no debes copiarlas). Solo el README.md. Lo que el contrato no diga, pruébalo contra la API y anótalo como "comportamiento observado, no documentado".
- No modifiques ningún fichero salvo el que se te pide crear.
- La API guarda los datos en memoria y otras personas pueden estar usándola. Crea tus propios jugadores (con una marca aleatoria en el nombre para poder encontrarlos con ?search=) y bórralos al terminar. No borres ni modifiques jugadores que no hayas creado tú.

## Lo que debes producir
Crea el fichero AI/validation-matrix.mjs con estas condiciones:
- Script de Node.js 18+ sin dependencias: fetch global y node:assert/strict. URL base en process.env.BASE_URL, por defecto http://localhost:3000.
- Organízalo como una MATRIZ DECLARATIVA: un array de casos, cada uno con { endpoint, entrada (campo o parámetro), regla, valor enviado, status esperado, campos de error esperados }. Un bucle ejecuta todos los casos. Así cualquiera puede leer la matriz como una tabla y añadir casos sin tocar la lógica.
- Cubre, para cada endpoint que recibe datos:
  · POST /jugadores, PUT /jugadores/:id y PATCH /jugadores/:id: cada uno de los cinco campos (nombre, posicion, dorsal, puntos, disponible) contra cada regla del contrato: ausente, tipo incorrecto (texto, número, booleano, null, array, objeto), valor justo en el límite (válido) y justo fuera (inválido). Ten en cuenta la diferencia entre validación completa (POST y PUT) y parcial (PATCH).
  · GET /jugadores: cada parámetro de consulta (search, disponible, posicion, sort, order, limit, offset) con valores válidos, mal formados, vacíos y repetidos; parámetros desconocidos; y GET /jugadores/stats con parámetros.
  · El parámetro :id de la ruta en GET, PUT, PATCH y DELETE: formatos válidos e inválidos.
  · El cuerpo en sí: JSON mal formado, cuerpo vacío, array, null, texto plano, Content-Type distinto de application/json.
- Para cada caso inválido comprueba tres cosas: (1) el status es el esperado; (2) el 400 trae { errors: [{ field, message }] } y el field señala la entrada correcta; (3) el dato inválido NO se ha guardado (para POST, que no aparece con ?search=; para PUT y PATCH, que un GET posterior devuelve el jugador sin cambios).
- Añade un bloque de ROBUSTEZ con entradas raras o maliciosas: textos muy largos, unicode y emojis en el nombre, espacios y caracteres de control, números como 1e2, -0, Infinity enviado como texto, claves "__proto__" y "constructor" en el cuerpo, objetos anidados, campos duplicados en el JSON, un cuerpo de más de 100 KB. Aquí la regla es: la API nunca responde 5xx, siempre responde JSON y nunca guarda un campo desconocido.
- Al terminar imprime un resumen por endpoint (casos superados / totales) y la línea final "N/M casos superados". Sale con código 1 si alguno falla.
- Comentarios breves en español.

Después ejecútalo con node AI/validation-matrix.mjs. Si un caso falla, decide si el fallo es de la API (incumple el contrato) o tuyo (caso mal escrito o contrato ambiguo). Corrige SOLO tus casos cuando el error sea tuyo. Nunca cambies un caso para que pase si la API incumple el contrato; tampoco relajes un caso ante una ambigüedad: déjalo indicado en el informe para que lo decida una persona.

## Tu respuesta final
Un informe en español con:
1. Una tabla de cobertura: filas = endpoints, columnas = entradas, con cuántos casos tiene cada celda.
2. El resultado de la última ejecución (N/M) y la salida de los casos que fallen.
3. Cada fallo que atribuyas a la API: petición, respuesta y regla del contrato que incumple.
4. Cada corrección que hiciste en tus propios casos y por qué.
5. Ambigüedades del contrato y comportamientos observados no documentados, sin resolverlos tú.
```

Decisiones de diseño del prompt, además de las del tester agent:

- **Prohibido leer `AI/`.** Si viera las comprobaciones del tester agent, tendería a repetirlas. Sin
  ellas, sus casos son una segunda opinión independiente.
- **Matriz declarativa.** Cada caso es una fila de datos (`endpoint`, `entrada`, `regla`, `valor`,
  `status`, `errores`), no código. Se puede leer como una tabla, revisar caso a caso y ampliar sin
  tocar la lógica.
- **Tres comprobaciones por caso inválido:** status, campo del error y que nada se ha guardado. Un
  `400` correcto no basta si el dato inválido llegó a almacenarse.
- **No relajar ante una ambigüedad.** Aprendido del tester agent, que en un caso ambiguo eligió la
  lectura que no fallaba (ver `review-log.md`). Al validation agent se le pidió marcarlo como
  `observar` y dejar la decisión a una persona.

### Contrato recibido

`README.md` del commit `95d61c0`, el último antes de lanzar el agente, que ya incluía las
correcciones del tester agent. Las reglas que su revisión cambió después (nombre, `limit`/`offset`,
cuerpo vacío, URL mal codificada, orden de las comprobaciones) están explicadas en `review-log.md`
(secciones 8 a 11) y ya incorporadas al README actual.

### Comprobaciones generadas

`AI/validation-matrix.mjs`: 542 casos. Cada caso crea su propio jugador, marcado con un token
aleatorio en el nombre, y al terminar se borran todos. En la ejecución del agente fueron 298
jugadores.

| Endpoint | Entradas probadas | Casos |
|---|---|---|
| POST /jugadores | Los 5 campos (ausente, cada tipo incorrecto, límites), `id` del cliente, campos desconocidos, formato y tamaño del cuerpo, `__proto__`/`constructor` | 147 |
| PUT /jugadores/:id | Los 5 campos con validación completa, `:id` en todos sus formatos, cuerpo | 118 |
| PATCH /jugadores/:id | Los 5 campos con validación parcial (los no enviados se conservan), `:id`, cuerpo | 128 |
| GET /jugadores/:id | `:id`: inexistente, `0`, negativos, decimales, ceros a la izquierda, texto, `%` mal codificado | 21 |
| DELETE /jugadores/:id | `:id` en todos sus formatos | 17 |
| GET /jugadores | Los 7 parámetros (válidos, mal formados, vacíos, repetidos), desconocidos, combinaciones | 101 |
| GET /jugadores/stats | Cualquier parámetro debe dar `400` | 10 |

Cada caso **inválido** comprueba el status, que el conjunto de `field` del `400` es exactamente el
esperado y que el dato no se ha guardado. Cada caso **válido** comprueba que la respuesta tiene las 6
claves del recurso, que un GET posterior devuelve lo mismo y que los valores guardados son los
esperados (por ejemplo, el nombre recortado).

Los casos que el contrato no fija llevan `status: 'observar'`: solo se exige que no haya 5xx y que la
respuesta sea JSON, y el resultado se imprime para revisarlo. Las líneas que cambió la revisión llevan
el comentario `// Revisión humana:`.

Última ejecución, con la API corregida: **542/542 casos superados**.

```bash
npm start
node AI/validation-matrix.mjs
node AI/validation-matrix.mjs --cobertura
```
