const express = require('express');
const controller = require('../controllers/jugadoresController');

const router = express.Router();

// /stats va antes de /:id; si no, Express interpretaría "stats" como un id.
router.get('/stats', controller.stats);

router.route('/')
  .get(controller.list)
  .post(controller.create);

router.route('/:id')
  .get(controller.getById)
  .put(controller.replace)
  .patch(controller.update)
  .delete(controller.remove);

module.exports = router;
