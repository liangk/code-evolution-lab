import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seed() {
  console.log('Seeding database for Study 05...');
  
  const userCount = 10000;
  const ordersPerUser = 10;

  console.log(`Creating ${userCount} users with ${ordersPerUser} orders each...`);
  
  for (let i = 0; i < userCount; i++) {
    const user = await prisma.benchUser.create({
      data: {
        email: `user${i}@example.com`,
        name: `User ${i}`,
        age: 20 + (i % 50),
      },
    });

    for (let j = 0; j < ordersPerUser; j++) {
      await prisma.benchOrder.create({
        data: {
          userId: user.id,
          totalAmount: Math.random() * 1000,
          status: Math.random() > 0.5 ? 'completed' : 'pending',
        },
      });
    }

    if ((i + 1) % 1000 === 0) {
      console.log(`  Created ${i + 1} users...`);
    }
  }

  const counts = {
    users: await prisma.benchUser.count(),
    orders: await prisma.benchOrder.count(),
  };

  console.log('\n✓ Seed complete:');
  console.log(`  Users:  ${counts.users}`);
  console.log(`  Orders: ${counts.orders}\n`);
}

seed()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
