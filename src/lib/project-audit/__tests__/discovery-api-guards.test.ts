import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isDiscoveryRequestAllowed,
  parseDiscoveryProjectSelection,
} from '@/lib/project-audit/discovery/api-guards';

describe('discovery API guards', () => {
  it('defaults missing project selection to all and rejects unknown projects', () => {
    assert.deepEqual(parseDiscoveryProjectSelection(null), {
      success: true,
      projectSelection: 'all',
    });
    assert.deepEqual(parseDiscoveryProjectSelection('YM_PT'), {
      success: true,
      projectSelection: 'YM_PT',
    });

    const result = parseDiscoveryProjectSelection('bad-project');
    assert.equal(result.success, false);
  });

  it('allows local requests and blocks non-local requests unless explicitly enabled', () => {
    assert.equal(isDiscoveryRequestAllowed({
      requestUrl: 'http://localhost:10929/api/project-audit/discovery',
      hostHeader: 'localhost:10929',
    }), true);

    assert.equal(isDiscoveryRequestAllowed({
      requestUrl: 'http://10.0.0.5:10929/api/project-audit/discovery',
      hostHeader: '10.0.0.5:10929',
    }), false);

    assert.equal(isDiscoveryRequestAllowed({
      requestUrl: 'http://10.0.0.5:10929/api/project-audit/discovery',
      hostHeader: '10.0.0.5:10929',
      enabledEnv: 'true',
    }), true);
  });
});
