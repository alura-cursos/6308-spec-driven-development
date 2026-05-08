jest.mock('../orderRepository', () => ({
    findManyByUser: jest.fn(),
    createOrderTransaction: jest.fn(),
    findById: jest.fn(),
    cancelOrderTransaction: jest.fn(),
}));

jest.mock('../../../config/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
}));

jest.mock('../../cart/cartService', () => ({}));
jest.mock('../../products/productRepository', () => ({}));

const orderRepository = require('../orderRepository');
const orderService = require('../orderService');

describe('orderService.cancelOrder', () => {
    const OWNER_ID = 'user-owner-aaa-111';
    const OTHER_ID = 'user-other-bbb-222';
    const ADMIN_ID = 'user-admin-ccc-333';
    const ORDER_ID = 'order-ddd-444';

    const makeOrder = (status) => ({
        id: ORDER_ID,
        userId: OWNER_ID,
        status,
        totalValue: 100,
        items: [
            { id: 'item-111', productId: 'prod-111', quantity: 2, price: 50 },
        ],
        payment: { id: 'pay-111', orderId: ORDER_ID, status: 'AWAITING_CONFIRMATION' },
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ─── Caminho feliz ────────────────────────────────────────────────────────

    describe('caminho feliz — cancelamento bem-sucedido', () => {
        it('cancela pedido PENDING quando chamado pelo dono', async () => {
            const canceledOrder = { ...makeOrder('PENDING'), status: 'CANCELED' };
            orderRepository.findById.mockResolvedValue(makeOrder('PENDING'));
            orderRepository.cancelOrderTransaction.mockResolvedValue(canceledOrder);

            const result = await orderService.cancelOrder(ORDER_ID, OWNER_ID, 'USER');

            expect(orderRepository.findById).toHaveBeenCalledWith(ORDER_ID);
            expect(orderRepository.cancelOrderTransaction).toHaveBeenCalledWith(ORDER_ID);
            expect(result.status).toBe('CANCELED');
        });

        it('cancela pedido PAID quando chamado pelo dono', async () => {
            const canceledOrder = { ...makeOrder('PAID'), status: 'CANCELED' };
            orderRepository.findById.mockResolvedValue(makeOrder('PAID'));
            orderRepository.cancelOrderTransaction.mockResolvedValue(canceledOrder);

            const result = await orderService.cancelOrder(ORDER_ID, OWNER_ID, 'USER');

            expect(orderRepository.cancelOrderTransaction).toHaveBeenCalledWith(ORDER_ID);
            expect(result.status).toBe('CANCELED');
        });

        it('ADMIN pode cancelar pedido de outro usuário', async () => {
            const canceledOrder = { ...makeOrder('PENDING'), status: 'CANCELED' };
            orderRepository.findById.mockResolvedValue(makeOrder('PENDING'));
            orderRepository.cancelOrderTransaction.mockResolvedValue(canceledOrder);

            const result = await orderService.cancelOrder(ORDER_ID, ADMIN_ID, 'ADMIN');

            expect(orderRepository.cancelOrderTransaction).toHaveBeenCalledWith(ORDER_ID);
            expect(result.status).toBe('CANCELED');
        });
    });

    // ─── Bloqueio por status ──────────────────────────────────────────────────

    describe('bloqueio por status — ORDER_CANNOT_BE_CANCELED', () => {
        it.each(['PACKING', 'SHIPPED', 'DELIVERED', 'CANCELED'])(
            'lança 422 ORDER_CANNOT_BE_CANCELED para pedido com status %s',
            async (status) => {
                orderRepository.findById.mockResolvedValue(makeOrder(status));

                await expect(orderService.cancelOrder(ORDER_ID, OWNER_ID, 'USER'))
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
            orderRepository.findById.mockResolvedValue(makeOrder('PENDING'));

            await expect(orderService.cancelOrder(ORDER_ID, OTHER_ID, 'USER'))
                .rejects.toMatchObject({
                    statusCode: 403,
                    code: 'FORBIDDEN',
                });

            expect(orderRepository.cancelOrderTransaction).not.toHaveBeenCalled();
        });
    });

    // ─── Pedido não encontrado ────────────────────────────────────────────────

    describe('pedido não encontrado', () => {
        it('lança 404 RESOURCE_NOT_FOUND quando pedido não existe', async () => {
            orderRepository.findById.mockResolvedValue(null);

            await expect(orderService.cancelOrder(ORDER_ID, OWNER_ID, 'USER'))
                .rejects.toMatchObject({
                    statusCode: 404,
                    code: 'RESOURCE_NOT_FOUND',
                });

            expect(orderRepository.cancelOrderTransaction).not.toHaveBeenCalled();
        });
    });
});
