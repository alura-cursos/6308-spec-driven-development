const paymentService = require('./paymentService');

const paymentController = {
    create: async (req, res, next) => {
        try {
            // Normalmente criado automaticamente no checkout, mas rota pedida na spec
            // Payload esperado: { orderId }
            const { orderId } = req.body;
            const payment = await paymentService.createPaymentIntent(orderId);
            res.status(201).json({ data: payment });
        } catch (error) {
            next(error);
        }
    },

    confirm: async (req, res, next) => {
        try {
            const idempotencyKey = req.headers['idempotency-key'];
            const payment = await paymentService.confirmPayment(req.params.id, idempotencyKey);
            res.json({ data: payment });
        } catch (error) {
            next(error);
        }
    },

    cancel: async (req, res, next) => {
        try {
            const result = await paymentService.cancelPayment(
                req.params.id,
                req.user.sub,
                req.user.role
            );
            res.json({ data: result, meta: { timestamp: new Date().toISOString() } });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = paymentController;
