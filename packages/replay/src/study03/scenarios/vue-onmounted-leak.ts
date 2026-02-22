import type { ScenarioDefinition, MemorySnapshot } from '../run-all';

const leakedTimers = new Set<NodeJS.Timeout>();

class VueComponentSimulator {
  private timerId: NodeJS.Timeout | null = null;
  private data: number[] = new Array(1000).fill(0).map(() => Math.random());

  mountBad() {
    this.timerId = setInterval(() => {
      this.data.forEach((v, i) => this.data[i] = v * 1.001);
    }, 86_400_000);
    leakedTimers.add(this.timerId);
  }

  unmountBad() {
    // BAD: Does NOT clear the interval
    this.timerId = null;
  }

  mountGood() {
    this.timerId = setInterval(() => {
      this.data.forEach((v, i) => this.data[i] = v * 1.001);
    }, 86_400_000);
  }

  unmountGood() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
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
    const component = new VueComponentSimulator();
    component.mountBad();
    component.unmountBad();
    if (i % 10 === 0) snapshots.push(takeSnapshot(i));
  }
  for (const timer of leakedTimers) { clearInterval(timer); }
  leakedTimers.clear();
  return snapshots;
}

async function runGoodPattern(cycles: number): Promise<MemorySnapshot[]> {
  const snapshots: MemorySnapshot[] = [];
  snapshots.push(takeSnapshot(0));
  for (let i = 1; i <= cycles; i++) {
    const component = new VueComponentSimulator();
    component.mountGood();
    component.unmountGood();
    if (i % 10 === 0) snapshots.push(takeSnapshot(i));
  }
  return snapshots;
}

export const vueOnMountedScenario: ScenarioDefinition = {
  name: 'vue-onmounted-leak',
  framework: 'vue',
  description: 'onMounted sets timer without onUnmounted cleanup',
  runBad: runBadPattern,
  runGood: runGoodPattern,
};
