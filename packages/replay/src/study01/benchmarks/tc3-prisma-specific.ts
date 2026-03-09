import { createTrackedPrisma, benchmark, BenchmarkResult } from './utils';

export async function tc3Bad(prisma: any): Promise<any[]> {
  const orders = await prisma.order.findMany();
  for (const order of orders) {
    order.user = await prisma.user.findUnique({
      where: { id: order.userId },
    });
  }
  return orders;
}

export async function tc3Good(prisma: any): Promise<any[]> {
  const orders = await prisma.order.findMany({
    include: { user: true },
  });
  return orders;
}

export async function runTC3(): Promise<{ bad: BenchmarkResult; good: BenchmarkResult }> {
  const tracked = createTrackedPrisma();

  const bad = await benchmark('TC3: Prisma Orders->User', 'bad', () => tc3Bad(tracked.prisma), tracked);
  const good = await benchmark('TC3: Prisma Orders->User', 'good', () => tc3Good(tracked.prisma), tracked);

  await tracked.prisma.$disconnect();
  return { bad, good };
}
