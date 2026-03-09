import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seed() {
  console.log('Seeding database for Study 01...');
  
  const userCount = 100;
  const postsPerUser = 5;
  const commentsPerPost = 3;
  const ordersPerUser = 10;

  console.log(`Creating ${userCount} users...`);
  for (let i = 0; i < userCount; i++) {
    const user = await prisma.user.create({
      data: {
        email: `user${i}@example.com`,
        name: `User ${i}`,
      },
    });

    for (let j = 0; j < postsPerUser; j++) {
      const post = await prisma.post.create({
        data: {
          title: `Post ${j} by User ${i}`,
          content: `Content for post ${j}`,
          published: Math.random() > 0.3,
          userId: user.id,
        },
      });

      for (let k = 0; k < commentsPerPost; k++) {
        await prisma.comment.create({
          data: {
            text: `Comment ${k} on post ${j}`,
            postId: post.id,
          },
        });
      }
    }

    for (let o = 0; o < ordersPerUser; o++) {
      await prisma.order.create({
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
    users: await prisma.user.count(),
    posts: await prisma.post.count(),
    comments: await prisma.comment.count(),
    orders: await prisma.order.count(),
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
