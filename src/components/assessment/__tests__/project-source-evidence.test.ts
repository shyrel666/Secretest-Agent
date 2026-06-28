import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProjectSourceEvidence } from '@/components/assessment/project-source-evidence';
import type { ProjectEvidenceStep, ProjectSourceRef } from '@/lib/project-audit/types';

const sourceRef: ProjectSourceRef = {
  projectId: 'YM_PT',
  path: 'src/org/itstec/user/controller/UserController.java',
  startLine: 98,
  endLine: 121,
  role: 'controller',
  symbol: 'UserController.updatePic',
};

const evidenceFlow: ProjectEvidenceStep[] = [
  {
    label: '入口参数',
    ref: sourceRef,
    summary: '接收 pic 与 userId，未检查 contentType/MIME。',
  },
  {
    label: '业务处理',
    ref: {
      ...sourceRef,
      path: 'src/org/itstec/user/service/impl/UserServiceImpl.java',
      startLine: 109,
      endLine: 144,
      role: 'service',
      symbol: 'UserServiceImpl.updatePic',
    },
    summary: '攻击者使用 shell.php.jpg 可绕过限制并上传可执行脚本。',
  },
];

describe('ProjectSourceEvidence', () => {
  it('hides evidence flow summaries before the answer is revealed', () => {
    const html = renderToStaticMarkup(React.createElement(ProjectSourceEvidence, {
      projectId: 'YM_PT',
      auditTaskType: 'identify',
      findingSeedId: 'ympt-upload-extension-only',
      sourceRefs: [sourceRef],
      evidenceFlow,
    }));

    assert.match(html, /UserController\.updatePic/);
    assert.doesNotMatch(html, /未检查 contentType\/MIME/);
    assert.doesNotMatch(html, /shell\.php\.jpg/);
  });

  it('shows evidence flow summaries after the answer is revealed', () => {
    const html = renderToStaticMarkup(React.createElement(ProjectSourceEvidence, {
      projectId: 'YM_PT',
      auditTaskType: 'identify',
      findingSeedId: 'ympt-upload-extension-only',
      sourceRefs: [sourceRef],
      evidenceFlow,
      revealEvidenceFlow: true,
    }));

    assert.match(html, /未检查 contentType\/MIME/);
    assert.match(html, /shell\.php\.jpg/);
  });
});
