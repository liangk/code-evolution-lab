import type { ScenarioDefinition, MemorySnapshot } from '../run-all';

class Observable {
  private subscribers: Array<(value: any) => void> = [];

  subscribe(callback: (value: any) => void): { unsubscribe: () => void } {
    this.subscribers.push(callback);
    return {
      unsubscribe: () => {
        const idx = this.subscribers.indexOf(callback);
        if (idx >= 0) this.subscribers.splice(idx, 1);
      },
    };
  }

  destroy() { this.subscribers = []; }
}

class AngularComponentSimulator {
  constructor(private dataService: Observable) {}
  private subscription: { unsubscribe: () => void } | null = null;
  private componentState: number[] = new Array(1000).fill(0).map(() => Math.random());

  ngOnInitBad() {
    this.dataService.subscribe(() => {
      this.componentState.forEach((v, i) => this.componentState[i] = v * 1.001);
    });
  }

  ngOnDestroyBad() {
    // BAD: Does NOT unsubscribe
  }

  ngOnInitGood() {
    this.subscription = this.dataService.subscribe(() => {
      this.componentState.forEach((v, i) => this.componentState[i] = v * 1.001);
    });
  }

  ngOnDestroyGood() {
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
    this.componentState = [];
  }
}

function takeSnapshot(cycle: number): MemorySnapshot {
  if (global.gc) global.gc();
  const mem = process.memoryUsage();
  return { cycle, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, external: mem.external, rss: mem.rss };
}

async function runBadPattern(cycles: number): Promise<MemorySnapshot[]> {
  const snapshots: MemorySnapshot[] = [];
  const dataService = new Observable();
  snapshots.push(takeSnapshot(0));
  for (let i = 1; i <= cycles; i++) {
    const component = new AngularComponentSimulator(dataService);
    component.ngOnInitBad();
    component.ngOnDestroyBad();
    if (i % 10 === 0) snapshots.push(takeSnapshot(i));
  }
  dataService.destroy();
  return snapshots;
}

async function runGoodPattern(cycles: number): Promise<MemorySnapshot[]> {
  const snapshots: MemorySnapshot[] = [];
  const dataService = new Observable();
  snapshots.push(takeSnapshot(0));
  for (let i = 1; i <= cycles; i++) {
    const component = new AngularComponentSimulator(dataService);
    component.ngOnInitGood();
    component.ngOnDestroyGood();
    if (i % 10 === 0) snapshots.push(takeSnapshot(i));
  }
  dataService.destroy();
  return snapshots;
}

export const angularSubscribeScenario: ScenarioDefinition = {
  name: 'angular-subscribe-leak',
  framework: 'angular',
  description: 'Component subscribes without unsubscribe in ngOnDestroy',
  runBad: runBadPattern,
  runGood: runGoodPattern,
};
