# Registro de revisión del tester agent

Cada entrada recoge qué se pidió al agente, qué devolvió, qué se decidió y por qué. La configuración
y el prompt completo están en `agents.md`.

El agente se lanzó desde Claude Code, el asistente usado durante el desarrollo, y la revisión se hizo
con ese mismo apoyo. Cada decisión de este registro está justificada para que se pueda explicar y
defender.

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

## 7. Resultado final

| Batería | Resultado |
|---|---|
| `node AI/blackbox-checks.mjs` (agente + revisión) | 50/50 |
| `npm test` (Jest + Supertest) | 37/37 |
