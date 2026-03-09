/**
 * Simple Load Test Runner
 * 
 * Lightweight HTTP load tester without external dependencies.
 * Measures latency, throughput, and basic event loop delay.
 */

import * as http from 'http';
import { monitorEventLoopDelay } from 'perf_hooks';

export interface LoadTestConfig {
  url: string;
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  duration: number;
  concurrency: number;
}

export interface LoadTestResult {
  requests: number;
  throughput: number;
  latencies: number[];
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  latencyAvg: number;
  latencyMax: number;
  errors: number;
  timeouts: number;
  eventLoopDelayAvg: number;
  eventLoopDelayMax: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

export async function runLoadTest(config: LoadTestConfig): Promise<LoadTestResult> {
  const { url, method = 'GET', body, headers = {}, duration, concurrency } = config;
  
  const parsedUrl = new URL(url);
  const latencies: number[] = [];
  let requests = 0;
  let errors = 0;
  let timeouts = 0;
  
  const elMonitor = monitorEventLoopDelay({ resolution: 10 });
  elMonitor.enable();
  
  const startTime = Date.now();
  const endTime = startTime + duration * 1000;
  
  const makeRequest = (): Promise<void> => {
    return new Promise((resolve) => {
      const reqStart = performance.now();
      
      const options: http.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 80,
        path: parsedUrl.pathname + parsedUrl.search,
        method,
        headers: {
          ...headers,
          'Content-Length': body ? Buffer.byteLength(body) : 0,
        },
      };
      
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          const reqEnd = performance.now();
          latencies.push(reqEnd - reqStart);
          requests++;
          resolve();
        });
      });
      
      req.on('error', () => {
        errors++;
        resolve();
      });
      
      req.on('timeout', () => {
        timeouts++;
        req.destroy();
        resolve();
      });
      
      req.setTimeout(5000);
      
      if (body) req.write(body);
      req.end();
    });
  };
  
  const worker = async () => {
    while (Date.now() < endTime) {
      await makeRequest();
    }
  };
  
  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  
  elMonitor.disable();
  
  latencies.sort((a, b) => a - b);
  const totalTime = (Date.now() - startTime) / 1000;
  
  return {
    requests,
    throughput: requests / totalTime,
    latencies,
    latencyP50: percentile(latencies, 50),
    latencyP95: percentile(latencies, 95),
    latencyP99: percentile(latencies, 99),
    latencyAvg: latencies.reduce((a, b) => a + b, 0) / latencies.length || 0,
    latencyMax: latencies[latencies.length - 1] || 0,
    errors,
    timeouts,
    eventLoopDelayAvg: elMonitor.mean / 1e6,
    eventLoopDelayMax: elMonitor.max / 1e6,
  };
}
