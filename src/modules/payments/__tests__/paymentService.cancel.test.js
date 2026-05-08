jest.mock('../paymentRepository', () => ({
    create: jest.fn(),
    findByOrderId: jest.fn(),
    findById: jest.fn(),
    updateStatus: jest.fn(),
}));

jest.mock('../../orders/orderRepository', () => ({
    findManyByUser: jest.fn(),
    createOrderTransaction: jest.fn(),
    findById: jest.fn(),
    cancelOrderTransaction: jest.fn(),
}));

jest.mock('../../../config/database', () => ({
    $transaction: jest.fn(),
    payment: { update: jest.fn() },
    order: { update: jest.fn() },
}));

jest.mock('../../../config/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
}));

const paymentRepository = require('../paymentRepository');
const orderRepository = require('../../orders/orderRepository');
const paymentService = require('../paymentService');

describe('paymentService.cancelPayment', () => {
    const OWNER_ID = 'user-owner-aaa-111';
    const OTHER_ID = 'user-other-bbb-222';
    const ADMIN_ID = 'user-admin-ccc-333';
    const PAYMENT_ID = 'pay-eee-555';
    const ORDER_ID = 'order-ddd-444';

    const makePayment = (orderStatus) => ({
        id: PAYMENT_ID,
        orderId: ORDER_ID,
        status: 'AWAITING_CONFIRMATION',
        order: {
            id: ORDER_ID,
            userId: OWNER_ID,
            status: orderStatus,
        },
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ─── Caminho feliz ────────────────────────────────────────────────────────

    describe('caminho feliz — cancelamento bem-sucedido', () => {
        it('cancela payment de pedido PENDING quando chamado pelo dono', async () => {
            paymentRepository.findById.mockResolvedValue(makePayment('PENDING'));
            orderRepository.cancelOrderTransaction.mockResolvedValue({
                id: ORDER_ID,
                status: 'CANCELED',
            });

            await paymentService.cancelPayment(PAYMENT_ID, OWNER_ID, 'USER');

            expect(orderRepository.cancelOrderTransaction).toHaveBeenCalledWith(ORDER_ID);
        });

        it('cancela payment de pedido PAID quando chamado pelo dono', async () => {
            paymentRepository.findById.mockResolvedValue(makePayment('PAID'));
            orderRepository.cancelOrderTransaction.mockResolvedValue({
                id: ORDER_ID,
                status: 'CANCELED',
            });

            await paymentService.cancelPayment(PAYMENT_ID, OWNER_ID, 'USER');

            expect(orderRepository.cancelOrderTransaction).toHaveBeenCalledWith(ORDER_ID);
        });

        it('ADMIN pode cancelar payment de qualquer usuário', async () => {
            paymentRepository.findById.mockResolvedValue(makePayment('PENDING'));
            orderRepository.cancelOrderTransaction.mockResolvedValue({
                id: ORDER_ID,
                status: 'CANCELED',
            });

            await paymentService.cancelPayment(PAYMENT_ID, ADMIN_ID, 'ADMIN');

            expect(orderRepository.cancelOrderTransaction).toHaveBeenCalledWith(ORDER_ID);
        });
    });

    // ─── Bloqueio por status do pedido ────────────────────────────────────────

    describe('bloqueio por status do pedido — ORDER_CANNOT_BE_CANCELED', () => {
        it.each(['PACKING', 'SHIPPED', 'DELIVERED', 'CANCELED'])(
            'lança 422 ORDER_CANNOT_BE_CANCELED quando order está em %s',
            async (orderStatus) => {
                paymentRepository.findById.mockResolvedValue(makePayment(orderStatus));

                await expect(paymentService.cancelPayment(PAYMENT_ID, OWNER_ID, 'USER'))
                    .rejects.toMatchObject({
                        statusCode: 422,
                        code: 'ORDER_CANNOT_BE_CANCELED',
                    });

                expect(orderRepository.cancelOrderTransaction).not.toHaveBeenCalled();
            }
        );
    });

    // ─── Controle de acesso ───────────────────────────────────────────────────

    describe('controle de acesso — ownership', () => {
        it('lança 403 FORBIDDEN quando usuário não é o dono e não é ADMIN', async () => {
            paymentRepository.findById.mockResolvedValue(makePayment('PENDING'));

            await expect(paymentService.cancelPayment(PAYMENT_ID, OTHER_ID, 'USER'))
                .rejects.toMatchObject({
                    statusCode: 403,
                    code: 'FORBIDDEN',
                });

            expect(orderRepository.cancelOrderTransaction).not.toHaveBeenCalled();
        });
    });

    // ─── Payment não encontrado ───────────────────────────────────────────────

    describe('payment não encontrado', () => {
        it('lança 404 RESOURCE_NOT_FOUND quando payment não existe', async () => {
            paymentRepository.findById.mockResolvedValue(null);

            await expect(paymentService.cancelPayment(PAYMENT_ID, OWNER_ID, 'USER'))
                .rejects.toMatchObject({
                    statusCode: 404,
                    code: 'RESOURCE_NOT_FOUND',
                });

            expect(orderRepository.cancelOrderTransaction).not.toHaveBeenCalled();
        });
    });
});
