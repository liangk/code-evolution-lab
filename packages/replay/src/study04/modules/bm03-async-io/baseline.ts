const _cache = new Map<number, number[]>();

function getData(n: number): number[] {
  if (!_cache.has(n)) {
    _cache.set(n, Array.from({ length: n }, (_, i) => i + 1));
  }
  return _cache.get(n)!;
}

function fakeAsyncIo(value: number): Promise<number> {
  return new Promise(resolve => setTimeout(() => resolve(value * 2), 1));
}

export async function runBaseline(n: number): Promise<number[]> {
  const items = getData(n);
  const results: number[] = [];
  for (const item of items) {
    results.push(await fakeAsyncIo(item));
  }
  return results;
}
