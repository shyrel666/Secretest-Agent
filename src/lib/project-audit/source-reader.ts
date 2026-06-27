/**
 * 安全读取 source_code/<projectId> 下的源码片段。
 *
 * 关键安全保证：
 * 1. 路径解析后必须落在已注册项目根之内，禁止 ../ 越界访问。
 * 2. 行号范围越界时抛出结构化错误，不静默返回。
 * 3. 不修改任何源文件；只读 + UTF-8 解码。
 */

import fs from 'fs';
import path from 'path';
import {
  resolveProjectAbsoluteRoot,
  resolveProjectFilePath,
} from './project-registry';
import type { ProjectSourceRef } from './types';

export interface SourceReadResult {
  projectId: ProjectSourceRef['projectId'];
  absolutePath: string;
  relativePath: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  code: string;
  numberedCode: string;
}

export class SourceReadError extends Error {
  constructor(
    public readonly code:
      | 'PROJECT_NOT_FOUND'
      | 'PATH_ESCAPE'
      | 'FILE_NOT_FOUND'
      | 'INVALID_LINE_RANGE'
      | 'READ_ERROR',
    message: string,
  ) {
    super(message);
    this.name = 'SourceReadError';
  }
}

/** 校验并规范化行号；保证 startLine >= 1、endLine >= startLine。 */
function normalizeLineRange(
  startLine: number,
  endLine: number,
): { startLine: number; endLine: number } {
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine)) {
    throw new SourceReadError(
      'INVALID_LINE_RANGE',
      `行号必须为整数，收到 startLine=${startLine} endLine=${endLine}`,
    );
  }
  if (startLine < 1) {
    throw new SourceReadError('INVALID_LINE_RANGE', `startLine 必须 >= 1，收到 ${startLine}`);
  }
  if (endLine < startLine) {
    throw new SourceReadError(
      'INVALID_LINE_RANGE',
      `endLine 必须 >= startLine，收到 startLine=${startLine} endLine=${endLine}`,
    );
  }
  return { startLine, endLine };
}

/** 校验 ref 解析出的绝对路径是否仍处于项目根内。 */
function assertWithinProjectRoot(
  absolutePath: string,
  projectRoot: string,
): void {
  const relative = path.relative(projectRoot, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new SourceReadError(
      'PATH_ESCAPE',
      `路径 ${absolutePath} 越界（项目根 ${projectRoot}）`,
    );
  }
}

function formatNumberedCode(lines: string[], startLine: number, width: number): string {
  return lines
    .map((line, index) => {
      const lineNumber = startLine + index;
      const padded = lineNumber.toString().padStart(width, ' ');
      return `${padded} | ${line}`;
    })
    .join('\n');
}

export function readProjectSourceSnippet(ref: ProjectSourceRef): SourceReadResult {
  const projectRoot = resolveProjectAbsoluteRoot(ref.projectId);
  if (!projectRoot) {
    throw new SourceReadError(
      'PROJECT_NOT_FOUND',
      `未注册的 sourceProject: ${ref.projectId}`,
    );
  }

  const { startLine, endLine } = normalizeLineRange(ref.startLine, ref.endLine);

  const absolutePath = resolveProjectFilePath(ref.projectId, ref.path);
  if (!absolutePath) {
    throw new SourceReadError(
      'PROJECT_NOT_FOUND',
      `无法解析项目文件路径: projectId=${ref.projectId} path=${ref.path}`,
    );
  }
  assertWithinProjectRoot(absolutePath, projectRoot);

  if (!fs.existsSync(absolutePath)) {
    throw new SourceReadError(
      'FILE_NOT_FOUND',
      `源码文件不存在: ${ref.path} (${absolutePath})`,
    );
  }

  let raw: string;
  try {
    raw = fs.readFileSync(absolutePath, 'utf-8');
  } catch (error) {
    throw new SourceReadError(
      'READ_ERROR',
      `读取源码失败: ${(error as Error).message}`,
    );
  }

  const allLines = raw.split(/\r?\n/);
  const totalLines = allLines.length;
  if (startLine > totalLines) {
    throw new SourceReadError(
      'INVALID_LINE_RANGE',
      `startLine=${startLine} 超过文件总行数 ${totalLines}: ${ref.path}`,
    );
  }
  if (endLine > totalLines) {
    throw new SourceReadError(
      'INVALID_LINE_RANGE',
      `endLine=${endLine} 超过文件总行数 ${totalLines}: ${ref.path}`,
    );
  }

  const lines = allLines.slice(startLine - 1, endLine);
  const code = lines.join('\n');
  const width = Math.max(3, endLine.toString().length);
  const numberedCode = formatNumberedCode(lines, startLine, width);

  return {
    projectId: ref.projectId,
    absolutePath,
    relativePath: ref.path,
    startLine,
    endLine,
    totalLines,
    code,
    numberedCode,
  };
}
