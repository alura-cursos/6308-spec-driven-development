const paymentRepository = require('./paymentRepository');
const orderRepository = require('../orders/orderRepository');
const AppError = require('../../utils/AppError');
const logger = require('../../config/logger');

const CANCELABLE_STATUSES = ['PENDING', 'PAID'];

const paymentService = {
    createPaymentIntent: async (orderId) => {
        // Verifica se já existe
        const existing = await paymentRepository.findByOrderId(orderId);
        if (existing) return existing;

        return await paymentRepository.create({
            orderId,
            status: 'AWAITING_CONFIRMATION'
        });
    },

    confirmPayment: async (paymentId, idempotencyKey) => {
        if (!idempotencyKey) {
            throw new AppError('Header Idempotency-Key obrigatório', 400, 'INVALID_PAYLOAD');
        }

        const payment = await paymentRepository.findById(paymentId);
        if (!payment) {
            throw new AppError('Pagamento não encontrado', 404, 'RESOURCE_NOT_FOUND');
        }

        if (payment.status === 'PAID') {
            return payment; // Idempotência simples
        }

        const prisma = require('../../config/database');
        const result = await prisma.$transaction(async (tx) => {
            const updatedPayment = await tx.payment.update({
                where: { id: paymentId },
                data: { status: 'PAID' },
            });

            await tx.order.update({
                where: { id: payment.orderId },
                data: { status: 'PAID' },
            });

            return updatedPayment;
        });

        logger.info(`Evento Emitido: order.paid { orderId: ${payment.orderId} }`);
        return result;
    },

    cancelPayment: async (paymentId, userId, userRole) => {
        const payment = await paymentRepository.findById(paymentId);
        if (!payment) {
            throw new AppError('Pagamento não encontrado', 404, 'RESOURCE_NOT_FOUND');
        }

        const order = payment.order;

        if (order.userId !== userId && userRole !== 'ADMIN') {
            throw new AppError('Acesso negado', 403, 'FORBIDDEN');
        }

        if (!CANCELABLE_STATUSES.includes(order.status)) {
            throw new AppError('Pedido não pode ser cancelado', 422, 'ORDER_CANNOT_BE_CANCELED');
        }

        return await orderRepository.cancelOrderTransaction(order.id);
    }
};

module.exports = paymentService;
