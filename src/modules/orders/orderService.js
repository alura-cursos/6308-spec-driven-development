const orderRepository = require('./orderRepository');
const cartService = require('../cart/cartService');
const productRepository = require('../products/productRepository');
const AppError = require('../../utils/AppError');
const logger = require('../../config/logger');

const CANCELABLE_STATUSES = ['PENDING', 'PAID'];
const ADMIN_SETTABLE_STATUSES = ['PACKING', 'SHIPPED', 'DELIVERED'];

const orderService = {
    cancelOrder: async (orderId, userId, userRole) => {
        const order = await orderRepository.findById(orderId);

        if (!order) {
            throw new AppError('Pedido não encontrado', 404, 'RESOURCE_NOT_FOUND');
        }

        if (order.userId !== userId && userRole !== 'ADMIN') {
            throw new AppError('Acesso negado', 403, 'FORBIDDEN');
        }

        if (!CANCELABLE_STATUSES.includes(order.status)) {
            throw new AppError('Pedido não pode ser cancelado', 422, 'ORDER_CANNOT_BE_CANCELED');
        }

        return await orderRepository.cancelOrderTransaction(orderId);
    },

    advanceStatus: async (orderId, newStatus, userRole) => {
        if (userRole !== 'ADMIN') {
            throw new AppError('Acesso negado', 403, 'FORBIDDEN');
        }

        if (!ADMIN_SETTABLE_STATUSES.includes(newStatus)) {
            throw new AppError('Status inválido', 422, 'INVALID_PAYLOAD');
        }

        const order = await orderRepository.findById(orderId);
        if (!order) {
            throw new AppError('Pedido não encontrado', 404, 'RESOURCE_NOT_FOUND');
        }

        return await orderRepository.updateStatus(orderId, newStatus);
    },

    listOrders: async (userId) => {
        return await orderRepository.findManyByUser(userId);
    },

    checkout: async (userId) => {
        // 1. Recuperar Carrinho
        const cart = await cartService.getCart(userId);
        if (!cart || cart.items.length === 0) {
            throw new AppError('Carrinho vazio', 400, 'INVALID_PAYLOAD');
        }

        // 2. Recalcular Preços e Validar (Snapshot)
        let totalValue = 0;
        const validItems = [];

        for (const item of cart.items) {
            const product = await productRepository.findById(item.productId);
            if (!product) {
                throw new AppError(`Produto ${item.productId} não existe mais`, 409, 'CONFLICT');
            }
            if (product.stock < item.quantity) {
                throw new AppError(`Estoque insuficiente para ${product.name}`, 409, 'OUT_OF_STOCK');
            }
            if (product.status !== 'ACTIVE') {
                throw new AppError(`Produto ${product.name} indisponível`, 409, 'CONFLICT');
            }

            validItems.push({
                productId: product.id,
                quantity: item.quantity,
                price: Number(product.price)
            });
            totalValue += Number(product.price) * item.quantity;
        }

        // 3. Executar Transação no Banco
        let order;
        try {
            order = await orderRepository.createOrderTransaction(userId, validItems, totalValue);
        } catch (error) {
            logger.error(`Checkout falhou: ${error.message}`);
            throw new AppError('Erro ao processar pedido ou estoque', 500, 'INTERNAL_SERVER_ERROR');
        }

        // 4. Limpar Carrinho
        // Como o redis remove item a item, seria bom ter um clearCart.
        // Vou simular um clear setando vazio ou iterando.
        // O ideal é implementar clear no cartService.
        // Por hora, vou expirar a chave ou deletar.
        const redisClient = require('../../config/redis');
        await redisClient.del(`cart:default:${userId}`);

        // 5. Emitir Evento (Simulado)
        logger.info(`Evento Emitido: order.created { orderId: ${order.id} }`);

        return order;
    }
};

module.exports = orderService;
