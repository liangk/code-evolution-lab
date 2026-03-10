import { existsSync } from 'fs';
import { join } from 'path';

function resolveGeneratedClientPath(): string {
  const local = join(__dirname, 'prisma', 'generated', 'client');
  if (existsSync(local)) return local;
  return join(__dirname, '..', '..', 'src', 'study05', 'prisma', 'generated', 'client');
}

const { PrismaClient } = require(resolveGeneratedClientPath());
const prisma = new PrismaClient();
const db = prisma as any;

async function seed() {
  console.log('Seeding database for Study 05...');
  
  const userCount = 10000;
  const ordersPerUser = 10;

  console.log(`Creating ${userCount} users with ${ordersPerUser} orders each...`);
  
  for (let i = 0; i < userCount; i++) {
    const user = await db.benchUser.create({
      data: {
        email: `user${i}@example.com`,
        name: `User ${i}`,
        age: 20 + (i % 50),
      },
    });

    for (let j = 0; j < ordersPerUser; j++) {
      await db.benchOrder.create({
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
    users: await db.benchUser.count(),
    orders: await db.benchOrder.count(),
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
