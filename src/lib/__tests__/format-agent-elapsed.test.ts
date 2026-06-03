import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatAgentElapsed } from '@/lib/format-agent-elapsed';

describe('formatAgentElapsed', () => {
  it('shows decimal seconds under one minute', () => {
    assert.equal(formatAgentElapsed(4720), '4.7s');
    assert.equal(formatAgentElapsed(0), '0.0s');
  });

  it('shows minutes and seconds under one hour', () => {
    assert.equal(formatAgentElapsed(78_000), '1m 18s');
    assert.equal(formatAgentElapsed(120_000), '2m');
  });

  it('shows hours for long durations', () => {
    assert.equal(formatAgentElapsed(3_600_000), '1h');
    assert.equal(formatAgentElapsed(5_400_000), '1h 30m');
  });
});
