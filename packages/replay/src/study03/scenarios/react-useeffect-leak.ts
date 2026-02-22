import { EventEmitter } from 'events';
import type { ScenarioDefinition, MemorySnapshot } from '../run-all';

const windowEmitter = new EventEmitter();
windowEmitter.setMaxListeners(0);

class ComponentSimulator {
  private data: number[] = new Array(1000).fill(0).map(() => Math.random());
  private handler: ((...args: any[]) => void) | null = null;

  mountBad() {
    this.handler = () => {
      this.data.forEach((v, i) => this.data[i] = v * 1.001);
    };
    windowEmitter.on('resize', this.handler);
  }

  unmountBad() {
    // BAD: Does NOT remove the listener
  }

  mountGood() {
    this.handler = () => {
      this.data.forEach((v, i) => this.data[i] = v * 1.001);
    };
    windowEmitter.on('resize', this.handler);
  }

  unmountGood() {
    if (this.handler) {
      windowEmitter.removeListener('resize', this.handler);
      this.handler = null;
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
    const component = new ComponentSimulator();
    component.mountBad();
    component.unmountBad();
    if (i % 10 === 0) snapshots.push(takeSnapshot(i));
  }
  windowEmitter.removeAllListeners('resize');
  return snapshots;
}

async function runGoodPattern(cycles: number): Promise<MemorySnapshot[]> {
  const snapshots: MemorySnapshot[] = [];
  snapshots.push(takeSnapshot(0));
  for (let i = 1; i <= cycles; i++) {
    const component = new ComponentSimulator();
    component.mountGood();
    component.unmountGood();
    if (i % 10 === 0) snapshots.push(takeSnapshot(i));
  }
  return snapshots;
}

export const reactUseEffectScenario: ScenarioDefinition = {
  name: 'react-useeffect-leak',
  framework: 'react',
  description: 'useEffect adds event listener without cleanup return',
  runBad: runBadPattern,
  runGood: runGoodPattern,
};
