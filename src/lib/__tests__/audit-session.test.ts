import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  getAuditElapsedMs,
  initialAuditSessionState,
  nextAuditStages,
  useAuditSessionStore,
} from '@/lib/store/audit-session';

describe('audit session store', () => {
  afterEach(() => {
    useAuditSessionStore.getState().reset();
  });

  it('keeps an in-flight audit session outside the route component lifecycle', () => {
    const store = useAuditSessionStore.getState();

    store.setInput('String sql = "select * from users where id=" + id;');
    store.setActiveFileName('SQL注入 (Java)');
    store.startAudit(1_000);
    store.recordStage('detect', '分析代码语言');
    store.appendReportContent('发现拼接 SQL。');

    const remountedRouteSnapshot = useAuditSessionStore.getState();
    assert.equal(remountedRouteSnapshot.isLoading, true);
    assert.equal(remountedRouteSnapshot.input, 'String sql = "select * from users where id=" + id;');
    assert.equal(remountedRouteSnapshot.activeFileName, 'SQL注入 (Java)');
    assert.equal(remountedRouteSnapshot.reportContent, '发现拼接 SQL。');
    assert.equal(remountedRouteSnapshot.stages.length, 1);
    assert.equal(remountedRouteSnapshot.stages[0].id, 'detect');
    assert.equal(remountedRouteSnapshot.stages[0].label, '分析代码语言');
    assert.equal(remountedRouteSnapshot.stages[0].status, 'active');
    assert.equal(typeof remountedRouteSnapshot.stages[0].loggedAt, 'number');
  });

  it('freezes elapsed time when an audit has finished', () => {
    assert.equal(getAuditElapsedMs(1_000, null, 4_250), 3_250);
    assert.equal(getAuditElapsedMs(1_000, 3_000, 9_000), 2_000);
  });

  it('resets audit session back to a fresh editor', () => {
    const store = useAuditSessionStore.getState();
    store.setInput('unsafe code');
    store.setActiveFileName('demo.c');
    store.startAudit(1_000);
    store.appendReportContent('report');

    store.reset();

    const state = useAuditSessionStore.getState();
    assert.equal(state.input, initialAuditSessionState.input);
    assert.equal(state.isLoading, initialAuditSessionState.isLoading);
    assert.equal(state.copiedId, initialAuditSessionState.copiedId);
    assert.deepEqual(state.stages, initialAuditSessionState.stages);
    assert.equal(state.reportContent, initialAuditSessionState.reportContent);
    assert.equal(state.auditStartedAt, initialAuditSessionState.auditStartedAt);
    assert.equal(state.auditFinishedAt, initialAuditSessionState.auditFinishedAt);
    assert.equal(state.activeFileName, initialAuditSessionState.activeFileName);
  });
});

describe('nextAuditStages', () => {
  it('marks the previous active stage done when a new stage arrives', () => {
    assert.deepEqual(
      nextAuditStages(
        [{ id: 'detect', label: '分析代码语言', status: 'active' }],
        'search',
        '检索国标知识库',
      ),
      [
        { id: 'detect', label: '分析代码语言', status: 'done' },
        { id: 'search', label: '检索国标知识库', status: 'active' },
      ],
    );
  });

  it('records terminal stages as done', () => {
    assert.deepEqual(nextAuditStages([], 'done', '审计完成'), [
      { id: 'done', label: '审计完成', status: 'done' },
    ]);
  });

  it('keeps the first logged time when a stage later becomes done', () => {
    assert.deepEqual(
      nextAuditStages(
        [{ id: 'detect', label: '分析代码语言', status: 'active', loggedAt: 1_000 }],
        'search',
        '检索国标知识库',
        2_000,
      ),
      [
        { id: 'detect', label: '分析代码语言', status: 'done', loggedAt: 1_000 },
        { id: 'search', label: '检索国标知识库', status: 'active', loggedAt: 2_000 },
      ],
    );
  });
});
