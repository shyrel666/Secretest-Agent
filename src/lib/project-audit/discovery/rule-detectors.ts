import { buildSourceRefForLine, indexProjectSourceFiles } from './source-indexer';
import {
  buildDiscoveredSeedFingerprint,
  buildDiscoveredSeedId,
} from './seed-identity';
import type {
  DetectorMatch,
  DiscoveredProjectAuditFindingSeed,
  IndexedProjectSourceFile,
  RuleDetectorDefinition,
} from './types';
import type { ProjectAuditTaskType, ProjectId } from '../types';

const DEFAULT_TASK_TYPES: ProjectAuditTaskType[] = ['identify', 'trace', 'fix'];

function matchLines(
  file: IndexedProjectSourceFile,
  predicate: (line: string, index: number, file: IndexedProjectSourceFile) => boolean,
): DetectorMatch[] {
  const matches: DetectorMatch[] = [];
  file.lines.forEach((line, index) => {
    if (predicate(line, index, file)) {
      matches.push({ lineNumber: index + 1, lineText: line.trim() });
    }
  });
  return matches;
}

function hasNearby(file: IndexedProjectSourceFile, lineIndex: number, pattern: RegExp): boolean {
  const start = Math.max(0, lineIndex - 8);
  const end = Math.min(file.lines.length, lineIndex + 9);
  return file.lines.slice(start, end).some((line) => pattern.test(line));
}

function compactLine(lineText: string): string {
  return lineText.replace(/\s+/g, ' ').slice(0, 140);
}

const DETECTORS: RuleDetectorDefinition[] = [
  {
    id: 'command-injection',
    standardReference: 'GB/T 34944-2017 6.2.3.3',
    vulnerabilityType: '命令注入',
    difficulty: 'medium',
    confidence: 0.78,
    taskTypes: DEFAULT_TASK_TYPES,
    label: '命令执行',
    variantGuidance: '围绕 Runtime.exec 或 ProcessBuilder 的外部输入拼接生成变体，保持命令参数边界和输入校验缺失。',
    distractorGuidance: [
      '不要把普通文件读取误判为命令执行',
      '优先区分固定命令与用户可控参数拼接',
      '不要只因为出现 shell 字符串就判断漏洞成立',
    ],
    remediationGuidance: [
      '避免拼接系统命令，优先使用安全 API 完成业务动作',
      '必须执行命令时使用参数数组和严格白名单',
      '记录审计日志并限制执行账户权限',
    ],
    match: (file) => matchLines(
      file,
      (line) => /\bRuntime\.getRuntime\(\)\.exec\s*\(|\bnew\s+ProcessBuilder\s*\(/.test(line),
    ),
    summarizeEvidence: (match) => `检测到命令执行 API 调用：${compactLine(match.lineText)}。需要追踪命令字符串是否包含外部输入。`,
    buildSourceRef: (file, match) => buildSourceRefForLine(file, match.lineNumber, 'sink'),
  },
  {
    id: 'mybatis-dollar-sql',
    standardReference: 'GB/T 34944-2017 6.2.3.4',
    vulnerabilityType: 'SQL 注入',
    difficulty: 'medium',
    confidence: 0.76,
    taskTypes: DEFAULT_TASK_TYPES,
    label: 'MyBatis 字符串替换',
    variantGuidance: '围绕 MyBatis ${} 字符串替换与上游参数白名单缺失生成变体，避免把 #{} 参数化写成漏洞点。',
    distractorGuidance: [
      '同一 mapper 中的 #{} 参数不是主要风险',
      '已经白名单收敛的 ${} 需要作为误报排除讨论',
      '不要把 XML 标签本身当作注入入口',
    ],
    remediationGuidance: [
      '优先改用 #{} 参数化',
      '排序字段、列名等不能参数化的位置必须做枚举白名单',
      '补充 mapper 层回归测试覆盖恶意输入',
    ],
    match: (file) => file.extension === '.xml'
      ? matchLines(file, (line) => line.includes('${'))
      : [],
    summarizeEvidence: (match) => `Mapper XML 中出现 ${'${}'} 字符串替换：${compactLine(match.lineText)}。需要确认上游是否做了严格白名单。`,
    buildSourceRef: (file, match) => buildSourceRefForLine(file, match.lineNumber, 'mapper'),
  },
  {
    id: 'jdbc-sql-concat',
    standardReference: 'GB/T 34944-2017 6.2.3.4',
    vulnerabilityType: 'SQL 注入',
    difficulty: 'medium',
    confidence: 0.72,
    taskTypes: DEFAULT_TASK_TYPES,
    label: 'JDBC SQL 拼接',
    variantGuidance: '围绕 JDBC executeUpdate/executeQuery 接收拼接 SQL 的场景生成变体，保留用户输入进入 SQL 字符串的证据。',
    distractorGuidance: [
      'PreparedStatement 的占位符参数不是同类风险',
      '常量 SQL 不构成注入',
      '不要忽略循环批处理中的拼接 SQL',
    ],
    remediationGuidance: [
      '使用 PreparedStatement 占位符绑定变量',
      '对动态表名/列名做枚举白名单',
      '拆分 SQL 构造与参数绑定并增加单测',
    ],
    match: (file) => file.extension === '.java'
      ? matchLines(
        file,
        (line, index) => /\bexecute(Update|Query)\s*\(/.test(line)
          && (line.includes('+') || hasNearby(file, index, /sql\s*=.*\+/i)),
      )
      : [],
    summarizeEvidence: (match) => `检测到 JDBC 执行拼接 SQL 的候选语句：${compactLine(match.lineText)}。需要追踪 SQL 变量是否由外部输入组成。`,
    buildSourceRef: (file, match) => buildSourceRefForLine(file, match.lineNumber, 'sink'),
  },
  {
    id: 'upload-original-filename',
    standardReference: 'GB/T 34944-2017 6.2.8.5',
    vulnerabilityType: '不可信文件名/文件上传校验不足',
    difficulty: 'medium',
    confidence: 0.7,
    taskTypes: DEFAULT_TASK_TYPES,
    label: '文件上传',
    variantGuidance: '围绕 getOriginalFilename、后缀校验、Files.write 写入路径生成变体，保持文件名或内容校验缺失。',
    distractorGuidance: [
      '仅校验文件扩展名不能证明内容安全',
      '路径拼接风险与可执行文件上传风险需要分别说明',
      '不要把文件大小限制当作 MIME 或内容校验',
    ],
    remediationGuidance: [
      '使用服务端生成的随机文件名',
      '校验 MIME、文件魔数和业务允许类型',
      '将上传目录放在不可执行位置并做路径规范化',
    ],
    match: (file) => file.extension === '.java'
      ? matchLines(
        file,
        (line, index) => /getOriginalFilename\s*\(|Files\.write\s*\(/.test(line)
          && hasNearby(file, index, /MultipartFile|getOriginalFilename|suffix|extension|Files\.write/i),
      )
      : [],
    summarizeEvidence: (match) => `检测到上传文件名或写入逻辑：${compactLine(match.lineText)}。需要确认是否只依赖原始文件名/后缀。`,
    buildSourceRef: (file, match) => buildSourceRefForLine(file, match.lineNumber, 'sink'),
  },
  {
    id: 'open-redirect',
    standardReference: 'GB/T 34944-2017 6.2.8.4',
    vulnerabilityType: '开放重定向',
    difficulty: 'medium',
    confidence: 0.68,
    taskTypes: DEFAULT_TASK_TYPES,
    label: '重定向',
    variantGuidance: '围绕 redirect: 或 sendRedirect 使用外部可控 URL 的场景生成变体，保留跳转目标白名单缺失。',
    distractorGuidance: [
      '固定站内路径不是开放重定向',
      '登录成功后的跳转参数需要追踪来源',
      'URL 编码不等于域名白名单',
    ],
    remediationGuidance: [
      '跳转目标限定为站内路径或可信域名白名单',
      '拒绝协议相对 URL、反斜杠和多重编码绕过',
      '统一封装安全 redirect 工具函数',
    ],
    match: (file) => file.extension === '.java'
      ? matchLines(
        file,
        (line, index) => /(redirect\s*:|sendRedirect\s*\(|RedirectView)/i.test(line)
          && hasNearby(file, index, /url|redirect|returnUrl|newUrl|target/i),
      )
      : [],
    summarizeEvidence: (match) => `检测到重定向候选语句：${compactLine(match.lineText)}。需要确认跳转目标是否由请求参数控制。`,
    buildSourceRef: (file, match) => buildSourceRefForLine(file, match.lineNumber),
  },
  {
    id: 'hardcoded-secret',
    standardReference: 'GB/T 34944-2017 6.2.6.3',
    vulnerabilityType: '敏感信息硬编码',
    difficulty: 'easy',
    confidence: 0.66,
    taskTypes: DEFAULT_TASK_TYPES,
    label: '硬编码密钥/口令',
    variantGuidance: '围绕配置文件或常量中的口令、密钥、token 生成变体，注意不要把测试占位符当成真实凭据。',
    distractorGuidance: [
      '变量名包含 key 不一定是密钥',
      '空值或占位符不是同等风险',
      '配置读取代码本身不是硬编码',
    ],
    remediationGuidance: [
      '迁移到密钥管理服务或环境变量',
      '仓库中移除历史泄露凭据并轮换',
      '增加 secret scanning 和配置审计',
    ],
    match: (file) => matchLines(
      file,
      (line) => /(password|passwd|secret|token|access[-_]?key|private[-_]?key)\s*[:=]\s*['"]?[^'"\s#]{6,}/i.test(line)
        && !/(example|placeholder|your_|change-me)/i.test(line),
    ),
    summarizeEvidence: (match) => `检测到疑似硬编码敏感配置：${compactLine(match.lineText)}。需要判断是否为真实凭据或密钥材料。`,
    buildSourceRef: (file, match) => buildSourceRefForLine(file, match.lineNumber, file.extension === '.java' ? undefined : 'config'),
  },
  {
    id: 'aes-ecb-mode',
    standardReference: 'GB/T 34944-2017 6.2.6.7',
    vulnerabilityType: '不安全的密码算法模式',
    difficulty: 'easy',
    confidence: 0.82,
    taskTypes: DEFAULT_TASK_TYPES,
    label: 'AES ECB',
    variantGuidance: '围绕 Cipher.getInstance("AES/ECB/...") 生成变体，保持 ECB 模式和缺少随机 IV 的核心风险。',
    distractorGuidance: [
      'AES 算法本身不是问题，ECB 模式才是重点',
      'PKCS5Padding 不是主要漏洞点',
      '密钥长度不能抵消 ECB 模式风险',
    ],
    remediationGuidance: [
      '改用 AES-GCM 或其他认证加密模式',
      '每次加密使用唯一随机 IV/nonce',
      '绑定完整性校验和密钥轮换策略',
    ],
    match: (file) => matchLines(file, (line) => /AES\/ECB/i.test(line)),
    summarizeEvidence: (match) => `检测到 AES/ECB 加密模式：${compactLine(match.lineText)}。ECB 会泄露明文块模式。`,
    buildSourceRef: (file, match) => buildSourceRefForLine(file, match.lineNumber, 'sink'),
  },
  {
    id: 'md5-digest',
    standardReference: 'GB/T 34944-2017 6.2.6.8',
    vulnerabilityType: '弱散列算法',
    difficulty: 'easy',
    confidence: 0.72,
    taskTypes: DEFAULT_TASK_TYPES,
    label: 'MD5',
    variantGuidance: '围绕 MessageDigest.getInstance("MD5") 或签名流程中的 MD5 生成变体，保留抗碰撞不足问题。',
    distractorGuidance: [
      '编码转换不是哈希安全性控制',
      '摘要后再转十六进制不能提升强度',
      '业务签名需要关注抗碰撞和密钥绑定',
    ],
    remediationGuidance: [
      '签名场景使用 HMAC-SHA256 或更强算法',
      '密码存储使用专用 KDF',
      '明确区分校验和与安全签名用途',
    ],
    match: (file) => matchLines(file, (line) => /MessageDigest\.getInstance\s*\(\s*["']MD5["']|DigestUtils\.md5|MD5/i.test(line)),
    summarizeEvidence: (match) => `检测到 MD5 弱散列使用：${compactLine(match.lineText)}。需要确认是否用于签名、口令或安全校验。`,
    buildSourceRef: (file, match) => buildSourceRefForLine(file, match.lineNumber, 'sink'),
  },
  {
    id: 'weak-random',
    standardReference: 'GB/T 34944-2017 6.2.6.10',
    vulnerabilityType: '不充分的随机数',
    difficulty: 'easy',
    confidence: 0.7,
    taskTypes: DEFAULT_TASK_TYPES,
    label: '弱随机数',
    variantGuidance: '围绕 java.util.Random 用于安全敏感 token、折扣、验证码或密钥材料的场景生成变体。',
    distractorGuidance: [
      '普通展示随机不一定是安全漏洞',
      'SecureRandom 与 Random 不能混为一谈',
      '随机范围大小不能替代不可预测性',
    ],
    remediationGuidance: [
      '安全敏感随机值使用 SecureRandom',
      '避免把可预测随机用于令牌、优惠或授权判断',
      '为随机策略增加可测试的封装',
    ],
    match: (file) => file.extension === '.java'
      ? matchLines(file, (line) => /\bnew\s+Random\s*\(/.test(line))
      : [],
    summarizeEvidence: (match) => `检测到 java.util.Random：${compactLine(match.lineText)}。需要判断随机值是否影响安全敏感业务。`,
    buildSourceRef: (file, match) => buildSourceRefForLine(file, match.lineNumber),
  },
];

function buildCandidate(
  projectId: ProjectId,
  detector: RuleDetectorDefinition,
  file: IndexedProjectSourceFile,
  match: DetectorMatch,
): DiscoveredProjectAuditFindingSeed {
  const sourceRef = detector.buildSourceRef(file, match);
  const title = `${file.path}:${match.lineNumber} ${detector.label}候选点`;
  const evidenceSummary = detector.summarizeEvidence(match, file);
  const identityInput = {
    projectId,
    detectorId: detector.id,
    path: file.path,
    symbol: sourceRef.symbol,
    vulnerabilityType: detector.vulnerabilityType,
    standardReference: detector.standardReference,
    evidenceSummary,
  };
  return {
    id: buildDiscoveredSeedId(identityInput),
    projectId,
    title,
    language: 'Java',
    difficulty: detector.difficulty,
    standardReference: detector.standardReference,
    vulnerabilityType: detector.vulnerabilityType,
    sourceRefs: [sourceRef],
    evidenceFlow: [
      {
        label: detector.label,
        ref: sourceRef,
        summary: evidenceSummary,
      },
    ],
    taskTypes: detector.taskTypes,
    variantGuidance: detector.variantGuidance,
    distractorGuidance: detector.distractorGuidance,
    remediationGuidance: detector.remediationGuidance,
    discovery: {
      status: 'candidate',
      detectorId: detector.id,
      confidence: detector.confidence,
      generatedAt: new Date().toISOString(),
      reason: evidenceSummary,
      fingerprint: buildDiscoveredSeedFingerprint(identityInput),
    },
  };
}

export function discoverProjectFindingCandidates(
  projectId: ProjectId,
  options: { limit?: number } = {},
): DiscoveredProjectAuditFindingSeed[] {
  const candidates: DiscoveredProjectAuditFindingSeed[] = [];
  const seen = new Set<string>();

  for (const file of indexProjectSourceFiles(projectId)) {
    for (const detector of DETECTORS) {
      for (const match of detector.match(file)) {
        const candidate = buildCandidate(projectId, detector, file, match);
        if (seen.has(candidate.id)) {
          continue;
        }
        seen.add(candidate.id);
        candidates.push(candidate);
        if (options.limit && candidates.length >= options.limit) {
          return candidates;
        }
      }
    }
  }

  return candidates.sort((a, b) => {
    if (b.discovery.confidence !== a.discovery.confidence) {
      return b.discovery.confidence - a.discovery.confidence;
    }
    return a.id.localeCompare(b.id);
  });
}

export function listRuleDetectorIds(): string[] {
  return DETECTORS.map((detector) => detector.id);
}
