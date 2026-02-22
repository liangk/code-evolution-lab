import type { ScenarioDefinition, MemorySnapshot } from '../run-all';

const leakedRAFs = new Set<NodeJS.Timeout>();

class RAFComponentSimulator {
  private rafTimer: NodeJS.Timeout | null = null;
  private data: number[] = new Array(1000).fill(0).map(() => Math.random());

  mountBad() {
    this.rafTimer = setTimeout(() => {
      this.data.forEach((v, i) => this.data[i] = v * 1.001);
    }, 86_400_000);
    leakedRAFs.add(this.rafTimer);
  }

  unmountBad() {
    // BAD: Does NOT cancel RAF
    this.rafTimer = null;
  }

  mountGood() {
    this.rafTimer = setTimeout(() => {
      this.data.forEach((v, i) => this.data[i] = v * 1.001);
    }, 86_400_000);
  }

  unmountGood() {
    if (this.rafTimer) {
      clearTimeout(this.rafTimer);
      this.rafTimer = null;
    }
    this.data = [];
  }
}

function takeSnapshot(cycle: number): MemorySnapshot {
  if (global.gc) global.gc();
  const mem = process.memoryUsage();
  return { cycle, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, external: mem.external, rss: mem.rss };
}

async function runBadPattern(cycles: number): Promise<MemorySnapshot[]> {
  const snapshots: MemorySnapshot[] = [];
  snapshots.push(takeSnapshot(0));
  for (let i = 1; i <= cycles; i++) {
    const component = new RAFComponentSimulator();
    component.mountBad();
    component.unmountBad();
    if (i % 10 === 0) snapshots.push(takeSnapshot(i));
  }
  for (const timer of leakedRAFs) { clearTimeout(timer); }
  leakedRAFs.clear();
  return snapshots;
}

async function runGoodPattern(cycles: number): Promise<MemorySnapshot[]> {
  const snapshots: MemorySnapshot[] = [];
  snapshots.push(takeSnapshot(0));
  for (let i = 1; i <= cycles; i++) {
    const component = new RAFComponentSimulator();
    component.mountGood();
    component.unmountGood();
    if (i % 10 === 0) snapshots.push(takeSnapshot(i));
  }
  return snapshots;
}

export const rafCancelScenario: ScenarioDefinition = {
  name: 'raf-cancel-leak',
  framework: 'react',
  description: 'requestAnimationFrame without cancelAnimationFrame',
  runBad: runBadPattern,
  runGood: runGoodPattern,
};
