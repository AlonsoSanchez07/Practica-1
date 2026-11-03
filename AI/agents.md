# Tester agent

## Configuración

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

## Prompt

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

## Contrato recibido

El contrato es `README.md`, en concreto las secciones *Recurso: jugador*, *Endpoints*, *PUT frente a
PATCH* y *Política de parámetros desconocidos*, en la versión del mismo commit que este fichero.

## Comprobaciones generadas

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
