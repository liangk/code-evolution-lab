import type { ScenarioDefinition, MemorySnapshot } from '../run-all';

class ReactiveWatcher {
  private watchers: Array<{ callback: () => void }> = [];

  watch(callback: () => void): () => void {
    const entry = { callback };
    this.watchers.push(entry);
    return () => {
      const idx = this.watchers.indexOf(entry);
      if (idx >= 0) this.watchers.splice(idx, 1);
    };
  }

  destroy() { this.watchers = []; }
}

class VueWatchComponentSimulator {
  private stopHandles: Array<() => void> = [];
  private data: number[] = new Array(1000).fill(0).map(() => Math.random());

  constructor(private watcher: ReactiveWatcher) {}

  mountBad() {
    this.watcher.watch(() => {
      this.data.forEach((v, i) => this.data[i] = v * 1.001);
    });
  }

  unmountBad() {
    // BAD: Does NOT call stop handle
  }

  mountGood() {
    const stop = this.watcher.watch(() => {
      this.data.forEach((v, i) => this.data[i] = v * 1.001);
    });
    this.stopHandles.push(stop);
  }

  unmountGood() {
    for (const stop of this.stopHandles) { stop(); }
    this.stopHandles = [];
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
  const watcher = new ReactiveWatcher();
  snapshots.push(takeSnapshot(0));
  for (let i = 1; i <= cycles; i++) {
    const component = new VueWatchComponentSimulator(watcher);
    component.mountBad();
    component.unmountBad();
    if (i % 10 === 0) snapshots.push(takeSnapshot(i));
  }
  watcher.destroy();
  return snapshots;
}

async function runGoodPattern(cycles: number): Promise<MemorySnapshot[]> {
  const snapshots: MemorySnapshot[] = [];
  const watcher = new ReactiveWatcher();
  snapshots.push(takeSnapshot(0));
  for (let i = 1; i <= cycles; i++) {
    const component = new VueWatchComponentSimulator(watcher);
    component.mountGood();
    component.unmountGood();
    if (i % 10 === 0) snapshots.push(takeSnapshot(i));
  }
  watcher.destroy();
  return snapshots;
}

export const vueWatchStopScenario: ScenarioDefinition = {
  name: 'vue-watch-stop-leak',
  framework: 'vue',
  description: 'watch/watchEffect without stop handle cleanup',
  runBad: runBadPattern,
  runGood: runGoodPattern,
};
