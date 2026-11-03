/*
  Práctica 1 - Cliente de la API /jugadores
  Autor: Alonso Sánchez Moscoso
  JavaScript vanilla: fetch para hablar con la API y DOM para pintar los resultados.
*/

const API = "/jugadores";
const POR_PAGINA = 6;
const CAMPOS = ["nombre", "posicion", "dorsal", "puntos", "disponible"];
const NOMBRES_POSICION = {
  base: "Base",
  escolta: "Escolta",
  alero: "Alero",
  "ala-pivot": "Ala-pívot",
  pivot: "Pívot",
};

// ---------- Estado de la página ----------

const estado = {
  offset: 0,
  total: 0,
  editandoId: null,     // null = creando; un número = editando ese jugador
  peticionesEnCurso: 0,
  ultimaConsulta: 0,    // descarta respuestas de listados antiguos que lleguen tarde
};

// ---------- Referencias al DOM ----------

const $ = (id) => document.getElementById(id);

const formJugador = $("form-jugador");
const formTitulo = $("form-titulo");
const botonEnviar = $("boton-enviar");
const botonCancelar = $("boton-cancelar");
const formFiltros = $("filtros");
const lista = $("lista");
const cargando = $("cargando");
const aviso = $("aviso");
const mensajeError = $("mensaje-error");
const vacio = $("vacio");
const rango = $("rango");
const anterior = $("anterior");
const siguiente = $("siguiente");

// ---------- Comunicación con la API ----------

class ApiError extends Error {
  constructor(status, datos) {
    super(mensajeDeError(status, datos));
    this.status = status;
    this.datos = datos;
  }
}

function mensajeDeError(status, datos) {
  if (datos && datos.error) return datos.error;
  if (status === 400) return "Hay datos que no son válidos. Revisa los campos marcados.";
  if (status === 404) return "El jugador ya no existe. Puede que otra persona lo haya eliminado.";
  if (status >= 500) return "El servidor ha tenido un problema. Inténtalo de nuevo en unos segundos.";
  return `Error inesperado (${status}).`;
}

// Envuelve fetch: marca la petición como en curso, comprueba response.ok y devuelve el JSON.
// fetch solo rechaza la promesa si no hay red; un 404 o un 500 hay que detectarlo con response.ok.
async function pedir(url, { method = "GET", body } = {}) {
  estado.peticionesEnCurso++;
  actualizarCargando();
  try {
    let respuesta;
    try {
      respuesta = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error("No se ha podido conectar con el servidor. ¿Está arrancado?");
    }

    // 204 No Content no trae cuerpo: no se intenta leer JSON.
    const datos = respuesta.status === 204 ? null : await respuesta.json().catch(() => null);
    if (!respuesta.ok) {
      throw new ApiError(respuesta.status, datos);
    }
    return datos;
  } finally {
    estado.peticionesEnCurso--;
    actualizarCargando();
  }
}

function actualizarCargando() {
  const ocupado = estado.peticionesEnCurso > 0;
  cargando.hidden = !ocupado;
  lista.setAttribute("aria-busy", String(ocupado));
  botonEnviar.disabled = ocupado;
}

// ---------- Mensajes ----------

function mostrarError(texto) {
  mensajeError.textContent = texto;
  mensajeError.hidden = false;
}

function ocultarError() {
  mensajeError.hidden = true;
  mensajeError.textContent = "";
}

let temporizadorAviso;
function mostrarAviso(texto) {
  aviso.textContent = texto;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => { aviso.textContent = ""; }, 4000);
}

// ---------- Listado ----------

// Construye la consulta para la API a partir de los filtros. El filtrado lo hace el servidor.
function construirConsulta() {
  const params = new URLSearchParams();
  const buscar = $("buscar").value.trim();
  const posicion = $("filtro-posicion").value;
  const disponible = $("filtro-disponible").value;
  const orden = $("orden").value;

  if (buscar) params.set("search", buscar);
  if (posicion) params.set("posicion", posicion);
  if (disponible) params.set("disponible", disponible);
  if (orden) {
    const [campo, sentido] = orden.split(":");
    params.set("sort", campo);
    params.set("order", sentido);
  }
  params.set("limit", String(POR_PAGINA));
  params.set("offset", String(estado.offset));
  return params;
}

async function cargarJugadores() {
  const consulta = ++estado.ultimaConsulta;
  try {
    const datos = await pedir(`${API}?${construirConsulta()}`);
    if (consulta !== estado.ultimaConsulta) return;

    // Si la página actual se ha quedado vacía (por ejemplo, tras borrar su último jugador), se retrocede una.
    if (datos.items.length === 0 && datos.total > 0 && estado.offset > 0) {
      estado.offset = Math.max(0, estado.offset - POR_PAGINA);
      return cargarJugadores();
    }

    ocultarError();
    estado.total = datos.total;
    pintarLista(datos.items);
    pintarPaginacion(datos.items.length);
  } catch (error) {
    if (consulta !== estado.ultimaConsulta) return;
    mostrarError(`No se ha podido cargar la plantilla. ${error.message}`);
  }
}

// Crea un elemento con atributos y texto. Se usa textContent, nunca innerHTML con datos de la API.
function crear(etiqueta, atributos = {}, texto) {
  const elemento = document.createElement(etiqueta);
  for (const [nombre, valor] of Object.entries(atributos)) {
    elemento.setAttribute(nombre, valor);
  }
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}

function pintarLista(jugadores) {
  lista.replaceChildren();
  vacio.hidden = jugadores.length > 0;

  for (const jugador of jugadores) {
    const tarjeta = crear("li", { class: "tarjeta" });

    const cabecera = crear("div", { class: "tarjeta-cabecera" });
    cabecera.append(
      crear("span", { class: "dorsal", title: "Dorsal" }, String(jugador.dorsal)),
      crear("h3", {}, jugador.nombre)
    );

    const datos = crear("dl", { class: "tarjeta-datos" });
    const estadoTexto = jugador.disponible ? "Disponible" : "No disponible";
    datos.append(
      crear("dt", {}, "Posición"), crear("dd", {}, NOMBRES_POSICION[jugador.posicion] || jugador.posicion),
      crear("dt", {}, "Puntos/partido"), crear("dd", {}, jugador.puntos.toLocaleString("es-ES")),
      crear("dt", {}, "Estado")
    );
    const ddEstado = crear("dd");
    ddEstado.append(crear("span", { class: `etiqueta ${jugador.disponible ? "si" : "no"}` }, estadoTexto));
    datos.append(ddEstado);

    const acciones = crear("div", { class: "tarjeta-acciones" });
    const editar = crear("button", { type: "button", class: "boton" }, "Editar");
    const alternar = crear("button", { type: "button", class: "boton" },
      jugador.disponible ? "Marcar no disponible" : "Marcar disponible");
    const eliminar = crear("button", { type: "button", class: "boton boton-peligro" }, "Eliminar");
    editar.setAttribute("aria-label", `Editar a ${jugador.nombre}`);
    alternar.setAttribute("aria-label", `Cambiar disponibilidad de ${jugador.nombre}`);
    eliminar.setAttribute("aria-label", `Eliminar a ${jugador.nombre}`);

    editar.addEventListener("click", () => empezarEdicion(jugador));
    alternar.addEventListener("click", () => cambiarDisponibilidad(jugador));
    eliminar.addEventListener("click", () => eliminarJugador(jugador));
    acciones.append(editar, alternar, eliminar);

    tarjeta.append(cabecera, datos, acciones);
    lista.append(tarjeta);
  }
}

function pintarPaginacion(enPagina) {
  if (estado.total === 0) {
    rango.textContent = "";
  } else {
    const desde = estado.offset + 1;
    const hasta = estado.offset + enPagina;
    rango.textContent = `${desde}–${hasta} de ${estado.total}`;
  }
  anterior.disabled = estado.offset === 0;
  siguiente.disabled = estado.offset + POR_PAGINA >= estado.total;
}

// ---------- Estadísticas ----------

async function cargarEstadisticas() {
  try {
    const stats = await pedir(`${API}/stats`);
    $("stat-total").textContent = stats.total;
    $("stat-disponibles").textContent = stats.disponibles;
    $("stat-media").textContent = stats.mediaPuntos.toLocaleString("es-ES");
    $("stat-maximo").textContent = stats.maximoAnotador
      ? `${stats.maximoAnotador.nombre} (${stats.maximoAnotador.puntos.toLocaleString("es-ES")})`
      : "—";

    const posiciones = $("stat-posiciones");
    posiciones.replaceChildren();
    for (const [posicion, cantidad] of Object.entries(stats.porPosicion)) {
      const li = crear("li");
      li.append(crear("span", {}, NOMBRES_POSICION[posicion] || posicion), crear("strong", {}, String(cantidad)));
      posiciones.append(li);
    }
  } catch (error) {
    mostrarError(`No se han podido cargar las estadísticas. ${error.message}`);
  }
}

function recargarTodo() {
  return Promise.all([cargarJugadores(), cargarEstadisticas()]);
}

// ---------- Formulario: lectura, validación y errores por campo ----------

function leerFormulario() {
  const numero = (id) => {
    const texto = $(id).value.trim();
    return texto === "" ? undefined : Number(texto);
  };
  return {
    nombre: $("nombre").value.trim(),
    posicion: $("posicion").value,
    dorsal: numero("dorsal"),
    puntos: numero("puntos"),
    disponible: $("disponible").checked,
  };
}

// Validación inicial en el cliente: campos obligatorios y longitud del nombre.
// Las reglas de dominio (rangos, posición permitida) las decide el servidor y llegan en el 400.
function validarEnCliente(datos) {
  const errores = [];
  if (datos.nombre.length === 0) {
    errores.push({ field: "nombre", message: "Escribe el nombre del jugador." });
  } else if ([...datos.nombre].length < 2) {
    errores.push({ field: "nombre", message: "El nombre debe tener al menos 2 caracteres." });
  }
  if (!datos.posicion) errores.push({ field: "posicion", message: "Elige una posición." });
  if (datos.dorsal === undefined || Number.isNaN(datos.dorsal)) {
    errores.push({ field: "dorsal", message: "Escribe el dorsal." });
  }
  if (datos.puntos === undefined || Number.isNaN(datos.puntos)) {
    errores.push({ field: "puntos", message: "Escribe los puntos por partido." });
  }
  return errores;
}

function limpiarErroresCampo() {
  for (const campo of [...CAMPOS, "body"]) {
    $(`error-${campo}`).textContent = "";
    const input = $(campo);
    if (input) input.removeAttribute("aria-invalid");
  }
}

// Pinta cada { field, message } debajo de su campo, venga del cliente o de un 400 del servidor.
function mostrarErroresCampo(errores) {
  limpiarErroresCampo();
  for (const { field, message } of errores) {
    const destino = $(`error-${field}`) || $("error-body");
    destino.textContent = destino.textContent ? `${destino.textContent} ${message}` : message;
    const input = $(field);
    if (input) input.setAttribute("aria-invalid", "true");
  }
  const primero = errores.find((e) => $(e.field));
  if (primero) $(primero.field).focus();
}

function empezarEdicion(jugador) {
  estado.editandoId = jugador.id;
  limpiarErroresCampo();
  $("nombre").value = jugador.nombre;
  $("posicion").value = jugador.posicion;
  $("dorsal").value = jugador.dorsal;
  $("puntos").value = jugador.puntos;
  $("disponible").checked = jugador.disponible;
  formTitulo.textContent = `Editar a ${jugador.nombre}`;
  botonEnviar.textContent = "Guardar cambios";
  botonCancelar.hidden = false;
  $("formulario").scrollIntoView({ behavior: "smooth", block: "start" });
  $("nombre").focus({ preventScroll: true });
}

function terminarEdicion() {
  estado.editandoId = null;
  formJugador.reset();
  limpiarErroresCampo();
  formTitulo.textContent = "Nuevo jugador";
  botonEnviar.textContent = "Crear jugador";
  botonCancelar.hidden = true;
}

async function enviarFormulario(evento) {
  evento.preventDefault();
  const datos = leerFormulario();

  const erroresCliente = validarEnCliente(datos);
  if (erroresCliente.length > 0) {
    mostrarErroresCampo(erroresCliente);
    return;
  }
  limpiarErroresCampo();

  const editando = estado.editandoId !== null;
  try {
    // Edición: PUT con el jugador completo, porque el formulario siempre tiene los cinco campos.
    const jugador = editando
      ? await pedir(`${API}/${estado.editandoId}`, { method: "PUT", body: datos })
      : await pedir(API, { method: "POST", body: datos });

    terminarEdicion();
    ocultarError();
    mostrarAviso(editando ? `Se han guardado los cambios de ${jugador.nombre}.` : `${jugador.nombre} se ha añadido a la plantilla.`);
    await recargarTodo();
  } catch (error) {
    if (error.status === 400 && error.datos && Array.isArray(error.datos.errors)) {
      mostrarErroresCampo(error.datos.errors);
    } else {
      mostrarError(error.message);
      if (error.status === 404) {
        terminarEdicion();
        recargarTodo();
      }
    }
  }
}

// ---------- Acciones de cada tarjeta ----------

// PATCH: solo se envía el campo que cambia.
async function cambiarDisponibilidad(jugador) {
  try {
    const actualizado = await pedir(`${API}/${jugador.id}`, {
      method: "PATCH",
      body: { disponible: !jugador.disponible },
    });
    ocultarError();
    mostrarAviso(`${actualizado.nombre}: ${actualizado.disponible ? "disponible" : "no disponible"}.`);
    await recargarTodo();
  } catch (error) {
    mostrarError(error.message);
    if (error.status === 404) recargarTodo();
  }
}

async function eliminarJugador(jugador) {
  if (!confirm(`¿Eliminar a ${jugador.nombre} de la plantilla?`)) return;
  try {
    await pedir(`${API}/${jugador.id}`, { method: "DELETE" });
    if (estado.editandoId === jugador.id) terminarEdicion();
    ocultarError();
    mostrarAviso(`${jugador.nombre} se ha eliminado de la plantilla.`);
    await recargarTodo();
  } catch (error) {
    mostrarError(error.message);
    if (error.status === 404) recargarTodo();
  }
}

// ---------- Eventos ----------

formJugador.addEventListener("submit", enviarFormulario);
botonCancelar.addEventListener("click", terminarEdicion);

// Cualquier cambio de filtro vuelve a la primera página. La búsqueda espera a que se deje de escribir.
let temporizadorBusqueda;
formFiltros.addEventListener("input", (evento) => {
  estado.offset = 0;
  clearTimeout(temporizadorBusqueda);
  const espera = evento.target.id === "buscar" ? 300 : 0;
  temporizadorBusqueda = setTimeout(cargarJugadores, espera);
});
formFiltros.addEventListener("submit", (evento) => evento.preventDefault());

anterior.addEventListener("click", () => {
  estado.offset = Math.max(0, estado.offset - POR_PAGINA);
  cargarJugadores();
});
siguiente.addEventListener("click", () => {
  estado.offset += POR_PAGINA;
  cargarJugadores();
});

recargarTodo();
