import { createTrackedPrisma, benchmark, BenchmarkResult } from './utils';

export async function tc2Bad(prisma: any): Promise<any[]> {
  const users = await prisma.user.findMany();
  for (const user of users) {
    user.posts = await prisma.post.findMany({
      where: { userId: user.id },
    });
    for (const post of user.posts) {
      post.comments = await prisma.comment.findMany({
        where: { postId: post.id },
      });
    }
  }
  return users;
}

export async function tc2Good(prisma: any): Promise<any[]> {
  const users = await prisma.user.findMany({
    include: {
      posts: {
        include: { comments: true },
      },
    },
  });
  return users;
}

export async function runTC2(): Promise<{ bad: BenchmarkResult; good: BenchmarkResult }> {
  const tracked = createTrackedPrisma();

  const bad = await benchmark('TC2: Nested Relationships', 'bad', () => tc2Bad(tracked.prisma), tracked);
  const good = await benchmark('TC2: Nested Relationships', 'good', () => tc2Good(tracked.prisma), tracked);

  await tracked.prisma.$disconnect();
  return { bad, good };
}
