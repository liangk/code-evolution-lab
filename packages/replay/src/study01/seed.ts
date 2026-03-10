import { existsSync } from 'fs';
import { join } from 'path';

function resolveGeneratedClientPath(): string {
  const local = join(__dirname, 'prisma', 'generated', 'client');
  if (existsSync(join(local, 'index.js'))) return local;
  return join(__dirname, '..', '..', 'src', 'study01', 'prisma', 'generated', 'client');
}

const { PrismaClient } = require(resolveGeneratedClientPath());
const prisma = new PrismaClient();
const db = prisma as any;

async function seed() {
  console.log('Seeding database for Study 01...');
  
  const userCount = 100;
  const postsPerUser = 5;
  const commentsPerPost = 3;
  const ordersPerUser = 10;

  console.log(`Creating ${userCount} users...`);
  for (let i = 0; i < userCount; i++) {
    const user = await db.user.create({
      data: {
        email: `user${i}@example.com`,
        name: `User ${i}`,
      },
    });

    for (let j = 0; j < postsPerUser; j++) {
      const post = await db.post.create({
        data: {
          title: `Post ${j} by User ${i}`,
          content: `Content for post ${j}`,
          published: Math.random() > 0.3,
          userId: user.id,
        },
      });

      for (let k = 0; k < commentsPerPost; k++) {
        await db.comment.create({
          data: {
            text: `Comment ${k} on post ${j}`,
            postId: post.id,
          },
        });
      }
    }

    for (let o = 0; o < ordersPerUser; o++) {
      await db.order.create({
        data: {
          total: Math.random() * 1000,
          status: Math.random() > 0.5 ? 'active' : 'completed',
          requiresUserData: Math.random() > 0.3,
          userId: user.id,
        },
      });
    }

    if ((i + 1) % 10 === 0) {
      console.log(`  Created ${i + 1} users...`);
    }
  }

  const counts = {
    users: await db.user.count(),
    posts: await db.post.count(),
    comments: await db.comment.count(),
    orders: await db.order.count(),
  };

  console.log('\n✓ Seed complete:');
  console.log(`  Users:    ${counts.users}`);
  console.log(`  Posts:    ${counts.posts}`);
  console.log(`  Comments: ${counts.comments}`);
  console.log(`  Orders:   ${counts.orders}\n`);
}

seed()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
