/**
 * 源码项目注册表。
 *
 * 将 source_code/<projectId> 映射为 SourceCodeProjectProfile，
 * 新增能力验证项目时只在这里登记并补 finding seeds 即可。
 */

import path from 'path';
import {
  isProjectId,
  PROJECT_IDS,
  type ProjectId,
  type SourceCodeProjectProfile,
} from './types';

const PROJECT_PROFILES: Readonly<Record<ProjectId, SourceCodeProjectProfile>> = {
  'YM_PT': {
    id: 'YM_PT',
    name: 'YM_PT 体检系统',
    root: 'source_code/YM_PT',
    language: 'Java',
    description:
      '医疗/体检报告类 Spring Boot 项目，包含 admin/doctor/report/user/filter/common-security 等模块以及 MyBatis XML mapper。适合训练 Controller→Service→Mapper 数据流追踪、Cookie/Session 授权、命令执行与路径遍历、密码学 API 审计、配置敏感信息审计。',
  },
  'itstec-24': {
    id: 'itstec-24',
    name: 'itstec-24 支付系统',
    root: 'source_code/itstec-24',
    language: 'Java',
    description:
      '支付/用户/日志类 Spring Boot 项目，包含 pay/user/log/common-crytodec/common-sign/base-util 等模块。适合训练登录重定向、日志归档与命令注入、路径遍历、Excel 批量导入/更新的 SQL 拼接、上传文件名校验、签名/加密过滤器、硬编码密钥、ECB 模式、MD5 签名与会话永不过期。',
  },
};

export function listSourceCodeProjects(): SourceCodeProjectProfile[] {
  return PROJECT_IDS.map((id) => PROJECT_PROFILES[id]);
}

export function getSourceCodeProject(projectId: ProjectId | string): SourceCodeProjectProfile | null {
  if (!isProjectId(projectId)) {
    return null;
  }
  return PROJECT_PROFILES[projectId];
}

/** 解析为相对于 process.cwd() 的绝对路径，便于 source-reader 安全读取。 */
export function resolveProjectAbsoluteRoot(projectId: ProjectId | string): string | null {
  const profile = getSourceCodeProject(projectId);
  if (!profile) {
    return null;
  }
  return path.resolve(process.cwd(), profile.root);
}

/** 把项目内相对路径解析为绝对路径；用于 source-reader 调用前做规范化。 */
export function resolveProjectFilePath(
  projectId: ProjectId | string,
  relativePath: string,
): string | null {
  const absoluteRoot = resolveProjectAbsoluteRoot(projectId);
  if (!absoluteRoot) {
    return null;
  }
  const normalized = relativePath.replace(/\\/g, '/');
  return path.resolve(absoluteRoot, normalized);
}
