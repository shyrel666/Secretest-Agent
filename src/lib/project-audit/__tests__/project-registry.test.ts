import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import path from 'path';
import {
  getSourceCodeProject,
  listSourceCodeProjects,
  resolveProjectAbsoluteRoot,
  resolveProjectFilePath,
} from '@/lib/project-audit/project-registry';
import { isProjectId, PROJECT_IDS } from '@/lib/project-audit/types';

describe('project-registry', () => {
  it('lists two registered source code projects', () => {
    const projects = listSourceCodeProjects();
    assert.equal(projects.length, 2);
    assert.ok(projects.every((project) => isProjectId(project.id)));
  });

  it('returns unique project ids matching PROJECT_IDS', () => {
    const projects = listSourceCodeProjects();
    const ids = projects.map((project) => project.id);
    assert.deepEqual(ids, [...PROJECT_IDS]);
  });

  it('returns project profile for known id and null for unknown id', () => {
    const ympt = getSourceCodeProject('YM_PT');
    assert.ok(ympt);
    assert.equal(ympt.root, 'source_code/YM_PT');
    assert.equal(ympt.language, 'Java');

    assert.equal(getSourceCodeProject('unknown'), null);
    assert.equal(getSourceCodeProject(123 as unknown as string), null);
  });

  it('resolves project absolute root against process.cwd()', () => {
    const root = resolveProjectAbsoluteRoot('YM_PT');
    assert.ok(root);
    assert.equal(root, path.resolve(process.cwd(), 'source_code/YM_PT'));
    assert.equal(resolveProjectAbsoluteRoot('nope'), null);
  });

  it('resolves a project file path under its project root', () => {
    const filePath = resolveProjectFilePath(
      'itstec-24',
      'src/org/itstec/log/controller/LogController.java',
    );
    assert.ok(filePath);
    assert.ok(filePath!.endsWith(path.join('source_code', 'itstec-24', 'src', 'org', 'itstec', 'log', 'controller', 'LogController.java')));
  });

  it('returns null for file path under unknown project', () => {
    assert.equal(resolveProjectFilePath('unknown', 'whatever'), null);
  });
});
