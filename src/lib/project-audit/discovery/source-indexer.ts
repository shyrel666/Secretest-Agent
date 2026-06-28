import fs from 'fs';
import path from 'path';
import { resolveProjectAbsoluteRoot } from '../project-registry';
import type {
  ProjectId,
  ProjectSourceRef,
  SourceRefRole,
} from '../types';
import type { IndexedProjectSourceFile } from './types';

const DEFAULT_MAX_FILE_BYTES = 512 * 1024;
const DEFAULT_EXTENSIONS = new Set(['.java', '.xml', '.properties', '.yml', '.yaml']);
const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.idea',
  '.next',
  'dist',
  'node_modules',
  'out',
  'target',
  'build',
]);

export interface IndexProjectSourceOptions {
  extensions?: string[];
  maxFileBytes?: number;
}

function toProjectPath(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).replace(/\\/g, '/');
}

function isWithinRoot(projectRoot: string, absolutePath: string): boolean {
  const relative = path.relative(projectRoot, absolutePath);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

function getLineAt(lines: string[], lineNumber: number): string {
  return lines[Math.max(0, Math.min(lines.length - 1, lineNumber - 1))] || '';
}

function inferSourceRefRole(filePath: string, lineText = ''): SourceRefRole {
  const lowered = `${filePath}\n${lineText}`.toLowerCase();
  if (lowered.includes('controller')) return 'controller';
  if (lowered.includes('service')) return 'service';
  if (lowered.includes('mapper') || lowered.endsWith('.xml')) return 'mapper';
  if (lowered.includes('filter')) return 'filter';
  if (lowered.includes('util') || lowered.includes('common')) return 'utility';
  if (/\.(yml|yaml|properties)$/.test(lowered)) return 'config';
  if (lowered.includes('exec(') || lowered.includes('processbuilder')) return 'sink';
  return 'evidence';
}

function inferJavaSymbol(file: IndexedProjectSourceFile, lineNumber: number): string | undefined {
  if (file.extension !== '.java') {
    return undefined;
  }

  const classMatch = file.content.match(/\bclass\s+([A-Za-z_][A-Za-z0-9_]*)/);
  const className = classMatch?.[1] || path.basename(file.path, '.java');
  let methodName: string | undefined;

  for (let index = Math.min(file.lines.length - 1, lineNumber - 1); index >= 0; index--) {
    const line = file.lines[index].trim();
    const methodMatch = line.match(
      /(?:public|protected|private|static|final|synchronized|\s)*[\w<>\[\], ?]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^;]*\)\s*(?:throws\s+[\w.,\s]+)?\{?$/,
    );
    if (methodMatch) {
      methodName = methodMatch[1];
      break;
    }
  }

  return methodName ? `${className}.${methodName}` : className;
}

function readIndexedFile(
  projectId: ProjectId,
  projectRoot: string,
  absolutePath: string,
  maxFileBytes: number = DEFAULT_MAX_FILE_BYTES,
): IndexedProjectSourceFile | null {
  if (!isWithinRoot(projectRoot, absolutePath)) {
    return null;
  }

  const stat = fs.statSync(absolutePath);
  if (!stat.isFile() || stat.size > maxFileBytes) {
    return null;
  }

  const extension = path.extname(absolutePath).toLowerCase();
  const content = fs.readFileSync(absolutePath, 'utf-8').replace(/^\uFEFF/, '');
  return {
    projectId,
    path: toProjectPath(projectRoot, absolutePath),
    absolutePath,
    extension,
    content,
    lines: content.split(/\r?\n/),
  };
}

export function indexProjectSourceFiles(
  projectId: ProjectId,
  options: IndexProjectSourceOptions = {},
): IndexedProjectSourceFile[] {
  const projectRoot = resolveProjectAbsoluteRoot(projectId);
  if (!projectRoot || !fs.existsSync(projectRoot)) {
    return [];
  }
  const root = projectRoot;

  const extensions = options.extensions
    ? new Set(options.extensions.map((extension) => extension.toLowerCase()))
    : DEFAULT_EXTENSIONS;
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const files: IndexedProjectSourceFile[] = [];

  function visit(directory: string): void {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          visit(path.join(directory, entry.name));
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const absolutePath = path.join(directory, entry.name);
      const extension = path.extname(entry.name).toLowerCase();
      if (!extensions.has(extension)) {
        continue;
      }
      if (fs.statSync(absolutePath).size > maxFileBytes) {
        continue;
      }

      const indexed = readIndexedFile(projectId, root, absolutePath, maxFileBytes);
      if (indexed) {
        files.push(indexed);
      }
    }
  }

  visit(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function buildSourceRefForLine(
  file: IndexedProjectSourceFile,
  lineNumber: number,
  role?: SourceRefRole,
): ProjectSourceRef {
  const normalizedLine = Math.max(1, Math.min(file.lines.length, lineNumber));
  const startLine = Math.max(1, normalizedLine - 6);
  const endLine = Math.min(file.lines.length, normalizedLine + 6);
  const lineText = getLineAt(file.lines, normalizedLine);

  return {
    projectId: file.projectId,
    path: file.path,
    startLine,
    endLine,
    role: role || inferSourceRefRole(file.path, lineText),
    symbol: inferJavaSymbol(file, normalizedLine),
  };
}
