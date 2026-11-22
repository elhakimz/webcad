import { describe, it, expect } from 'vitest';
import { metrics, sessionsCreated, sessionsActive, opsExecuted, opLatencyMs } from './metrics.js';

describe('metrics', () => {
  it('counter increments and exports in Prometheus text format', () => {
    sessionsCreated.inc({ status: 'ok' });
    sessionsCreated.inc({ status: 'ok' });
    sessionsCreated.inc({ status: 'error' });

    const output = metrics.export();
    expect(output).toContain('# HELP webcad_sessions_total Total number of sessions created');
    expect(output).toContain('# TYPE webcad_sessions_total counter');
    expect(output).toContain('webcad_sessions_total{status="ok"} 2');
    expect(output).toContain('webcad_sessions_total{status="error"} 1');
  });

  it('gauge sets and exports value', () => {
    sessionsActive.set({}, 5);
    const output = metrics.export();
    expect(output).toContain('# HELP webcad_sessions_active Number of currently active sessions');
    expect(output).toContain('# TYPE webcad_sessions_active gauge');
    expect(output).toContain('webcad_sessions_active 5');
  });

  it('counter with no labels exports without braces', () => {
    sessionsActive.set({}, 0); // ensure gauge is reset
    // counter with empty labels
    const noLabelCounter = metrics.counter('test_nolabel_total', 'no label counter');
    noLabelCounter.inc({});
    const output = metrics.export();
    expect(output).toContain('test_nolabel_total 1');
  });

  it('histogram observes and exports count, sum, buckets', () => {
    opLatencyMs.observe({ op: 'createBox' }, 12);
    opLatencyMs.observe({ op: 'createBox' }, 45);
    const output = metrics.export();
    expect(output).toContain('# TYPE webcad_op_latency_ms histogram');
    expect(output).toContain('webcad_op_latency_ms_count{op="createBox"} 2');
    expect(output).toContain('webcad_op_latency_ms_sum{op="createBox"} 57');
    expect(output).toContain('webcad_op_latency_ms_bucket{le="50",op="createBox"} 2');
    expect(output).toContain('webcad_op_latency_ms_bucket{le="+Inf",op="createBox"} 2');
  });

  it('opsExecuted counter with op and status labels', () => {
    opsExecuted.inc({ op: 'createBox', status: 'success' });
    opsExecuted.inc({ op: 'createBox', status: 'success' });
    opsExecuted.inc({ op: 'createBox', status: 'failure' });
    const output = metrics.export();
    expect(output).toContain('webcad_ops_executed_total{op="createBox",status="success"} 2');
    expect(output).toContain('webcad_ops_executed_total{op="createBox",status="failure"} 1');
  });
});
