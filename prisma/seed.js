const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcrypt');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
    const category = await prisma.category.upsert({
        where: { id: 'seed-category-001' },
        update: {},
        create: {
            id: 'seed-category-001',
            name: 'Eletrônicos',
        },
    });

    await prisma.product.upsert({
        where: { sku: 'SEED-PROD-001' },
        update: { stock: 50 },
        create: {
            id: 'seed-product-001',
            name: 'Produto Teste',
            description: 'Produto criado pelo seed para testes automatizados',
            sku: 'SEED-PROD-001',
            price: 99.90,
            stock: 50,
            status: 'ACTIVE',
            categoryId: category.id,
        },
    });

    const hashedPassword = await bcrypt.hash('Senha123!', 10);

    await prisma.user.upsert({
        where: { email: 'seed_admin@test.com' },
        update: {},
        create: {
            name: 'Admin Seed',
            email: 'seed_admin@test.com',
            password: hashedPassword,
            role: 'ADMIN',
        },
    });

    console.log('Seed concluído: categoria, produto e admin criados.');
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
