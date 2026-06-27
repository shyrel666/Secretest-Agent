import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  readProjectSourceSnippet,
  SourceReadError,
} from '@/lib/project-audit/source-reader';
import { getProjectFindingSeed } from '@/lib/project-audit/source-code-findings';

describe('source-reader', () => {
  it('reads ReportController queryCustOrder snippet from YM_PT', () => {
    const seed = getProjectFindingSeed('ympt-sql-order-injection');
    assert.ok(seed);
    const ref = seed!.sourceRefs[0];
    const result = readProjectSourceSnippet(ref);
    assert.equal(result.projectId, 'YM_PT');
    assert.equal(result.startLine, ref.startLine);
    assert.ok(result.code.includes('queryCustOrder'));
    assert.ok(result.numberedCode.includes(`${ref.startLine} |`));
  });

  it('reads LogServiceImpl logArch snippet from itstec-24', () => {
    const seed = getProjectFindingSeed('itstec24-log-arch-command');
    assert.ok(seed);
    const serviceRef = seed!.sourceRefs.find((ref) => ref.symbol === 'LogServiceImpl.logArch');
    assert.ok(serviceRef);
    const result = readProjectSourceSnippet(serviceRef!);
    assert.equal(result.projectId, 'itstec-24');
    assert.ok(result.code.includes('logArch'));
    assert.ok(result.code.includes('Runtime.getRuntime().exec'));
  });

  it('rejects paths that escape the registered project root', () => {
    const escapeRef = {
      projectId: 'YM_PT' as const,
      path: '../../package.json',
      startLine: 1,
      endLine: 5,
      role: 'evidence' as const,
    };
    assert.throws(() => readProjectSourceSnippet(escapeRef), (err) => {
      return err instanceof SourceReadError && err.code === 'PATH_ESCAPE';
    });
  });

  it('rejects paths to files outside the project root via relative traversal', () => {
    const escapeRef = {
      projectId: 'YM_PT' as const,
      path: '../itstec-24/src/application.yml',
      startLine: 1,
      endLine: 5,
      role: 'evidence' as const,
    };
    assert.throws(() => readProjectSourceSnippet(escapeRef), (err) => {
      return err instanceof SourceReadError && err.code === 'PATH_ESCAPE';
    });
  });

  it('rejects unknown project id', () => {
    const badRef = {
      projectId: 'not-a-project' as unknown as 'YM_PT',
      path: 'src/main/java/Foo.java',
      startLine: 1,
      endLine: 5,
      role: 'evidence' as const,
    };
    assert.throws(() => readProjectSourceSnippet(badRef), (err) => {
      return err instanceof SourceReadError && err.code === 'PROJECT_NOT_FOUND';
    });
  });

  it('rejects invalid line ranges', () => {
    const baseRef = {
      projectId: 'YM_PT' as const,
      path: 'src/org/itstec/report/controller/ReportController.java',
      startLine: 1,
      endLine: 5,
      role: 'evidence' as const,
    };
    assert.throws(
      () => readProjectSourceSnippet({ ...baseRef, startLine: 0 }),
      (err) => err instanceof SourceReadError && err.code === 'INVALID_LINE_RANGE',
    );
    assert.throws(
      () => readProjectSourceSnippet({ ...baseRef, startLine: 5, endLine: 3 }),
      (err) => err instanceof SourceReadError && err.code === 'INVALID_LINE_RANGE',
    );
  });

  it('rejects line ranges that exceed file size with structured error', () => {
    const seed = getProjectFindingSeed('ympt-sql-order-injection');
    assert.ok(seed);
    const ref = seed!.sourceRefs[0];
    assert.throws(
      () => readProjectSourceSnippet({ ...ref, startLine: 9999, endLine: 10000 }),
      (err) => err instanceof SourceReadError && err.code === 'INVALID_LINE_RANGE',
    );
  });

  it('rejects an endLine that exceeds file size instead of silently clamping', () => {
    const seed = getProjectFindingSeed('ympt-sql-order-injection');
    assert.ok(seed);
    const ref = seed!.sourceRefs[0];
    assert.throws(
      () => readProjectSourceSnippet({ ...ref, startLine: 1, endLine: 999999 }),
      (err) => err instanceof SourceReadError && err.code === 'INVALID_LINE_RANGE',
    );
  });

  it('returns FILE_NOT_FOUND for non-existent files', () => {
    const badRef = {
      projectId: 'YM_PT' as const,
      path: 'src/org/itstec/report/controller/NotExist.java',
      startLine: 1,
      endLine: 5,
      role: 'evidence' as const,
    };
    assert.throws(
      () => readProjectSourceSnippet(badRef),
      (err) => err instanceof SourceReadError && err.code === 'FILE_NOT_FOUND',
    );
  });
});
