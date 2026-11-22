// Metrics collector for the gateway (WC-EC-38).
// In-memory counters, gauges, and histograms with Prometheus text-format exposition.

type MetricType = 'counter' | 'gauge' | 'histogram';

interface MetricDef {
  name: string;
  type: MetricType;
  help: string;
  labelNames: string[];
}

interface MetricValue {
  labels: Record<string, string>;
  value: number;
  // histogram buckets
  bucketCounts?: Record<string, number>;
  sum?: number;
  count?: number;
}

class Metric {
  readonly def: MetricDef;
  private values = new Map<string, MetricValue>();

  constructor(def: MetricDef) {
    this.def = def;
  }

  private labelKey(labels: Record<string, string>): string {
    return this.def.labelNames
      .map((n) => labels[n] ?? '')
      .join('|');
  }

  inc(labels: Record<string, string>, amount = 1): void {
    if (this.def.type !== 'counter') {
      throw new Error(`Metric ${this.def.name} is not a counter`);
    }
    const key = this.labelKey(labels);
    const existing = this.values.get(key);
    if (existing) {
      existing.value += amount;
    } else {
      this.values.set(key, { labels, value: amount });
    }
  }

  set(labels: Record<string, string>, value: number): void {
    if (this.def.type !== 'gauge') {
      throw new Error(`Metric ${this.def.name} is not a gauge`);
    }
    const key = this.labelKey(labels);
    this.values.set(key, { labels, value });
  }

  observe(labels: Record<string, string>, value: number): void {
    if (this.def.type !== 'histogram') {
      throw new Error(`Metric ${this.def.name} is not a histogram`);
    }
    const key = this.labelKey(labels);
    const existing = this.values.get(key);
    if (existing) {
      existing.value += value;
      existing.count = (existing.count ?? 0) + 1;
      existing.sum = (existing.sum ?? 0) + value;
      // Bucket counts
      const buckets = ['5', '10', '25', '50', '100', '250', '500', '1000', '2500', '5000'];
      for (const b of buckets) {
        const bk = `le="${b}"`;
        if (!existing.bucketCounts) existing.bucketCounts = {};
        if (value <= parseFloat(b)) {
          existing.bucketCounts![bk] = (existing.bucketCounts![bk] ?? 0) + 1;
        }
      }
      existing.bucketCounts!['le="+Inf"'] = (existing.bucketCounts!['le="+Inf"'] ?? 0) + 1;
    } else {
      const buckets = ['5', '10', '25', '50', '100', '250', '500', '1000', '2500', '5000'];
      const bucketCounts: Record<string, number> = {};
      for (const b of buckets) {
        const bk = `le="${b}"`;
        bucketCounts[bk] = value <= parseFloat(b) ? 1 : 0;
      }
      bucketCounts['le="+Inf"'] = 1;
      this.values.set(key, {
        labels,
        value,
        count: 1,
        sum: value,
        bucketCounts,
      });
    }
  }

  getValues(): MetricValue[] {
    return Array.from(this.values.values());
  }
}

class MetricsRegistry {
  private metrics = new Map<string, Metric>();

  counter(name: string, help: string, labelNames: string[] = []): Metric {
    const m = new Metric({ name, type: 'counter', help, labelNames });
    this.metrics.set(name, m);
    return m;
  }

  gauge(name: string, help: string, labelNames: string[] = []): Metric {
    const m = new Metric({ name, type: 'gauge', help, labelNames });
    this.metrics.set(name, m);
    return m;
  }

  histogram(name: string, help: string, labelNames: string[] = []): Metric {
    const m = new Metric({ name, type: 'histogram', help, labelNames });
    this.metrics.set(name, m);
    return m;
  }

  get(name: string): Metric | undefined {
    return this.metrics.get(name);
  }

  /** Export all metrics in Prometheus text format. */
  export(): string {
    const lines: string[] = [];
    for (const [name, metric] of this.metrics) {
      lines.push(`# HELP ${name} ${metric.def.help}`);
      lines.push(`# TYPE ${name} ${metric.def.type}`);
      for (const v of metric.getValues()) {
        const labelStr = metric.def.labelNames
          .map((ln) => {
            const val = v.labels[ln];
            return val !== undefined ? `${ln}="${escapeLabelValue(val)}"` : '';
          })
          .filter((s) => s.length > 0)
          .join(',');
        const labels = labelStr.length > 0 ? `{${labelStr}}` : '';

        if (metric.def.type === 'histogram') {
          const count = v.count ?? 0;
          const sum = v.sum ?? 0;
          lines.push(`${name}${labels} ${v.value}`);
          lines.push(`${name}_count${labels} ${count}`);
          lines.push(`${name}_sum${labels} ${sum}`);
          if (v.bucketCounts) {
            for (const [bk, bc] of Object.entries(v.bucketCounts)) {
              lines.push(`${name}_bucket{${bk},${labelStr.replace(/^\{|\}$/g, '')}} ${bc}`);
            }
          }
        } else {
          lines.push(`${name}${labels} ${v.value}`);
        }
      }
    }
    return lines.join('\n') + '\n';
  }
}

function escapeLabelValue(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export const metrics = new MetricsRegistry();

// ---- Pre-defined gateway metrics ----

// Sessions
export const sessionsCreated = metrics.counter(
  'webcad_sessions_total',
  'Total number of sessions created',
  ['status']
);
export const sessionsActive = metrics.gauge(
  'webcad_sessions_active',
  'Number of currently active sessions'
);

// Kernels
export const kernelsActive = metrics.gauge(
  'webcad_kernels_active',
  'Number of kernels currently running'
);
export const kernelsSpare = metrics.gauge(
  'webcad_kernels_spare',
  'Number of spare kernels in the pool'
);
export const kernelRespawns = metrics.counter(
  'webcad_kernel_respawns_total',
  'Total number of kernel respawns'
);
export const kernelCrashes = metrics.counter(
  'webcad_kernel_crashes_total',
  'Total number of kernel crashes'
);
export const kernelRssBytes = metrics.gauge(
  'webcad_kernel_rss_bytes',
  'Kernel process RSS memory in bytes',
  ['sessionId']
);

// Operations
export const opsExecuted = metrics.counter(
  'webcad_ops_executed_total',
  'Total number of operations executed',
  ['op', 'status']
);
export const opLatencyMs = metrics.histogram(
  'webcad_op_latency_ms',
  'Operation latency in milliseconds',
  ['op']
);

// Queue
export const queueDepth = metrics.gauge(
  'webcad_queue_depth',
  'Number of pending commands in the reorder buffer',
  ['sessionId']
);
