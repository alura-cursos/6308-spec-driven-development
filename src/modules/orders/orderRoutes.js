const express = require('express');
const { param, body } = require('express-validator');
const orderController = require('./orderController');
const authMiddleware = require('../../middlewares/authMiddleware');
const validateRequest = require('../../middlewares/validateRequest');

const router = express.Router();

router.use(authMiddleware);

const uuidParam = [
    param('id').isUUID().withMessage('ID inválido'),
    validateRequest,
];

router.get('/', orderController.list);
router.post('/', orderController.checkout);
router.delete('/:id', uuidParam, orderController.cancel);
router.patch('/:id/status', uuidParam, [
    body('status').notEmpty().withMessage('Status é obrigatório'),
    validateRequest,
], orderController.updateStatus);

module.exports = router;
