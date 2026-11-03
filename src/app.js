const path = require('path');
const express = require('express');

const logger = require('./middleware/logger');
const { notFound, errorHandler } = require('./middleware/errors');
const jugadoresRouter = require('./routes/jugadores');

const app = express();

app.use(logger);
app.use(express.json());

// Estáticos antes que la API: la página y la API comparten origen, así que fetch("/jugadores")
// funciona sin CORS. Lo que no sea un fichero de public/ sigue hacia las rutas siguientes.
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/jugadores', jugadoresRouter);

// Siempre al final: primero el 404 de rutas inexistentes y después el manejador de errores.
app.use(notFound);
app.use(errorHandler);

module.exports = app;
