const orderService = require('./orderService');

const orderController = {
    cancel: async (req, res, next) => {
        try {
            const order = await orderService.cancelOrder(
                req.params.id,
                req.user.sub,
                req.user.role
            );
            res.json({
                data: order,
                meta: { timestamp: new Date().toISOString() },
            });
        } catch (error) {
            next(error);
        }
    },

    updateStatus: async (req, res, next) => {
        try {
            const order = await orderService.advanceStatus(
                req.params.id,
                req.body.status,
                req.user.role
            );
            res.json({
                data: order,
                meta: { timestamp: new Date().toISOString() },
            });
        } catch (error) {
            next(error);
        }
    },

    list: async (req, res, next) => {
        try {
            const orders = await orderService.listOrders(req.user.sub);
            res.json({ data: orders });
        } catch (error) {
            next(error);
        }
    },

    checkout: async (req, res, next) => {
        try {
            const order = await orderService.checkout(req.user.sub);
            res.status(201).json({
                data: order,
                message: 'Pedido criado com sucesso'
            });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = orderController;
