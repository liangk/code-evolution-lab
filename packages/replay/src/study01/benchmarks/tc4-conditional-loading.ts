import { createTrackedPrisma, benchmark, BenchmarkResult } from './utils';

export async function tc4Bad(prisma: any): Promise<any[]> {
  const orders = await prisma.order.findMany({
    where: { status: 'active' },
  });
  for (const order of orders) {
    if (order.requiresUserData) {
      order.user = await prisma.user.findUnique({
        where: { id: order.userId },
      });
    }
  }
  return orders;
}

export async function tc4Good(prisma: any): Promise<any[]> {
  const orders = await prisma.order.findMany({
    where: { status: 'active' },
  });

  const userIdsNeeded = [
    ...new Set(
      orders
        .filter((o: any) => o.requiresUserData)
        .map((o: any) => o.userId)
    ),
  ] as number[];

  const users = await prisma.user.findMany({
    where: { id: { in: userIdsNeeded } },
  });
  const userMap = new Map(users.map((u: any) => [u.id, u]));

  for (const order of orders) {
    if (order.requiresUserData) {
      order.user = userMap.get(order.userId) || null;
    }
  }
  return orders;
}

export async function runTC4(): Promise<{ bad: BenchmarkResult; good: BenchmarkResult }> {
  const tracked = createTrackedPrisma();

  const bad = await benchmark('TC4: Conditional Loading', 'bad', () => tc4Bad(tracked.prisma), tracked);
  const good = await benchmark('TC4: Conditional Loading', 'good', () => tc4Good(tracked.prisma), tracked);

  await tracked.prisma.$disconnect();
  return { bad, good };
}
