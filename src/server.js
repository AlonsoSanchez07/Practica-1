// Punto de arranque: separado de app.js para que las pruebas importen la app sin abrir un puerto.
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`CB Arganzuela escuchando en http://localhost:${PORT}`);
});
