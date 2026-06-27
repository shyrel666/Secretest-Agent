/**
 * 源码项目 Finding Seeds 目录。
 *
 * 每条 seed 都绑定到 source_code/<projectId> 下的真实文件、真实行号、真实方法，
 * 并对应一个 GB/T 34944-2017 条款、主漏洞类型和出题任务类型。
 *
 * 新增能力验证项目时：
 * 1. 在 project-registry.ts 注册项目 profile；
 * 2. 在本文件追加 ProjectAuditFindingSeed[]，并保证 id 唯一。
 *
 * 注意：
 * - sourceRefs.path 必须是相对项目根的路径，source-reader 会基于 project root 解析。
 * - 行号基于当前仓库中 source_code 下的源码；若未来源码发生行号漂移，需更新对应 seed。
 */

import { isProjectId, type ProjectAuditFindingSeed, type ProjectId } from './types';

const YMPT_SEEDS: ProjectAuditFindingSeed[] = [
  {
    id: 'ympt-sql-order-injection',
    projectId: 'YM_PT',
    title: 'ReportController#queryCustOrder 透传 order 触发 MyBatis ${} 注入',
    language: 'Java',
    difficulty: 'medium',
    standardReference: 'GB/T 34944-2017 6.2.3.4',
    vulnerabilityType: 'SQL 注入',
    sourceRefs: [
      {
        projectId: 'YM_PT',
        path: 'src/org/itstec/report/controller/ReportController.java',
        startLine: 180,
        endLine: 204,
        role: 'controller',
        symbol: 'ReportController.queryCustOrder',
      },
      {
        projectId: 'YM_PT',
        path: 'src/org/itstec/report/service/impl/ReportServiceImpl.java',
        startLine: 112,
        endLine: 120,
        role: 'service',
        symbol: 'ReportServiceImpl.queryCustOrder',
      },
      {
        projectId: 'YM_PT',
        path: 'src/resources/mapper/ReportMapper.xml',
        startLine: 47,
        endLine: 53,
        role: 'mapper',
        symbol: 'ReportMapper.queryCustOrder',
      },
    ],
    evidenceFlow: [
      {
        label: '入口参数',
        ref: {
          projectId: 'YM_PT',
          path: 'src/org/itstec/report/controller/ReportController.java',
          startLine: 180,
          endLine: 195,
          role: 'entry',
          symbol: 'ReportController.queryCustOrder',
        },
        summary: 'HTTP POST /report/queryCustOrder 接收 doctorID、dateTime、subject、condition、sData、order 参数，order 直接透传到 service，未做任何白名单校验。',
      },
      {
        label: '业务处理',
        ref: {
          projectId: 'YM_PT',
          path: 'src/org/itstec/report/service/impl/ReportServiceImpl.java',
          startLine: 112,
          endLine: 120,
          role: 'service',
          symbol: 'ReportServiceImpl.queryCustOrder',
        },
        summary: 'ReportServiceImpl.queryCustOrder 仅对 subject/condition/sData 做白名单或区间校验，order 字符串原样下传到 mapper。',
      },
      {
        label: '数据访问',
        ref: {
          projectId: 'YM_PT',
          path: 'src/resources/mapper/ReportMapper.xml',
          startLine: 47,
          endLine: 53,
          role: 'sink',
          symbol: 'ReportMapper.queryCustOrder',
        },
        summary: 'MyBatis XML 使用 ${order} 拼接 order by 子句，构成典型 SQL 注入。',
      },
    ],
    taskTypes: ['trace', 'identify', 'fix'],
    variantGuidance: '变体可保留 order→${} 结构，把 subject 列表改为其它枚举字段；不要把漏洞点换成 #{} 预编译。',
    distractorGuidance: [
      'subject/condition 已做白名单校验，不是主要风险',
      'doctorID 来自 session，篡改不会立刻影响授权',
      'MyBatis ${} 是字符串替换，与 #{} 预编译有本质区别',
    ],
    remediationGuidance: [
      'order 必须收敛为白名单字段后再做字符串拼接',
      '优先使用 ${}→{} 预编译，或在 SQL 中显式拼接受控的排序字段',
      '补充按字段名排序的策略类，避免直接接受任意 order by 子串',
    ],
  },
  {
    id: 'ympt-sql-subject-false-positive',
    projectId: 'YM_PT',
    title: 'querySubjScore 经白名单后使用 ${subject} ${condition} 是误报',
    language: 'Java',
    difficulty: 'hard',
    standardReference: 'GB/T 34944-2017 6.2.3.4',
    vulnerabilityType: 'SQL 注入误报排除',
    sourceRefs: [
      {
        projectId: 'YM_PT',
        path: 'src/org/itstec/report/controller/ReportController.java',
        startLine: 155,
        endLine: 178,
        role: 'controller',
        symbol: 'ReportController.querySubjScore',
      },
      {
        projectId: 'YM_PT',
        path: 'src/org/itstec/report/service/impl/ReportServiceImpl.java',
        startLine: 102,
        endLine: 110,
        role: 'service',
        symbol: 'ReportServiceImpl.querySubjScore',
      },
      {
        projectId: 'YM_PT',
        path: 'src/resources/mapper/ReportMapper.xml',
        startLine: 40,
        endLine: 45,
        role: 'mapper',
        symbol: 'ReportMapper.querySubjData',
      },
    ],
    evidenceFlow: [
      {
        label: '入口参数',
        ref: {
          projectId: 'YM_PT',
          path: 'src/org/itstec/report/controller/ReportController.java',
          startLine: 155,
          endLine: 178,
          role: 'entry',
          symbol: 'ReportController.querySubjScore',
        },
        summary: '接收 subject/condition 参数并直接传给 service。',
      },
      {
        label: '业务处理',
        ref: {
          projectId: 'YM_PT',
          path: 'src/org/itstec/report/service/impl/ReportServiceImpl.java',
          startLine: 102,
          endLine: 110,
          role: 'service',
          symbol: 'ReportServiceImpl.querySubjScore',
        },
        summary: '通过 checkSubject 限定为 bloodPressure/bloodSugar/bloodLipids，checkCond 限定为 >/=/<，checkData 限定数值区间。',
      },
      {
        label: '数据访问',
        ref: {
          projectId: 'YM_PT',
          path: 'src/resources/mapper/ReportMapper.xml',
          startLine: 40,
          endLine: 45,
          role: 'sink',
          symbol: 'ReportMapper.querySubjData',
        },
        summary: '虽然 SQL 用 ${subject} ${condition} 拼接，但参数已经收敛到白名单，不构成 SQL 注入。',
      },
    ],
    taskTypes: ['falsePositive', 'trace'],
    variantGuidance: '变体可改 sData 数值上下限判断逻辑或 subject 集合，但不能引入新的真正漏洞。',
    distractorGuidance: [
      '白名单校验是有效的安全控制',
      'sData 数值校验阻挡了 #{} 之外的输入',
      'sData 已通过 #{} 预编译参数化',
    ],
    remediationGuidance: [
      '无需修复，但需在解释中点明白名单 + #{} 双重控制',
      '如果未来要支持更多 subject 字段，需要同步扩展白名单和 mapper',
    ],
  },
  {
    id: 'ympt-command-arch',
    projectId: 'YM_PT',
    title: 'ReportController#arch 把 para 拼接到 cmd[2] 后执行 Runtime.exec',
    language: 'Java',
    difficulty: 'medium',
    standardReference: 'GB/T 34944-2017 6.2.3.3',
    vulnerabilityType: '命令注入',
    sourceRefs: [
      {
        projectId: 'YM_PT',
        path: 'src/org/itstec/report/controller/ReportController.java',
        startLine: 88,
        endLine: 108,
        role: 'controller',
        symbol: 'ReportController.arch',
      },
      {
        projectId: 'YM_PT',
        path: 'src/org/itstec/report/service/impl/ReportServiceImpl.java',
        startLine: 59,
        endLine: 75,
        role: 'service',
        symbol: 'ReportServiceImpl.arch',
      },
    ],
    evidenceFlow: [
      {
        label: '入口参数',
        ref: {
          projectId: 'YM_PT',
          path: 'src/org/itstec/report/controller/ReportController.java',
          startLine: 88,
          endLine: 108,
          role: 'entry',
          symbol: 'ReportController.arch',
        },
        summary: 'POST /report/arch 接收 doctorID、para 参数，para 用于归档子命令拼接。',
      },
      {
        label: '系统调用',
        ref: {
          projectId: 'YM_PT',
          path: 'src/org/itstec/report/service/impl/ReportServiceImpl.java',
          startLine: 59,
          endLine: 75,
          role: 'sink',
          symbol: 'ReportServiceImpl.arch',
        },
        summary: 'cmd[2] = "D:/itstec/arch.bat " + para，然后 Runtime.getRuntime().exec(cmd) 执行，攻击者可以通过 para 注入 & | 等 shell 元字符。',
      },
    ],
    taskTypes: ['trace', 'fix', 'identify'],
    variantGuidance: '变体可改 para 的命名或日志调用点，但必须保留 Runtime.exec 字符串数组与未过滤的外部输入。',
    distractorGuidance: [
      'checkDoctorLogin 校验了登录态，但不是命令注入的修复',
      'cmd[0]/cmd[1] 是常量，不影响注入',
      'Process.getInputStream() 处理的是执行结果，不能阻止注入',
    ],
    remediationGuidance: [
      '将 para 收敛为受控参数集合，禁止拼接到 shell 字符串',
      '改用 ProcessBuilder + 参数数组，把 para 作为独立参数传入',
      '对 doctorID、para 做白名单校验后调用外部归档程序',
    ],
  },
  {
    id: 'ympt-reflection-custom',
    projectId: 'YM_PT',
    title: 'ReportController#custom 用 Class.forName 反射实例化用户指定类',
    language: 'Java',
    difficulty: 'medium',
    standardReference: 'GB/T 34944-2017 6.2.3.5',
    vulnerabilityType: '代码注入',
    sourceRefs: [
      {
        projectId: 'YM_PT',
        path: 'src/org/itstec/report/controller/ReportController.java',
        startLine: 206,
        endLine: 223,
        role: 'controller',
        symbol: 'ReportController.custom',
      },
      {
        projectId: 'YM_PT',
        path: 'src/org/itstec/report/service/impl/ReportServiceImpl.java',
        startLine: 122,
        endLine: 126,
        role: 'service',
        symbol: 'ReportServiceImpl.handle',
      },
    ],
    evidenceFlow: [
      {
        label: '入口参数',
        ref: {
          projectId: 'YM_PT',
          path: 'src/org/itstec/report/controller/ReportController.java',
          startLine: 206,
          endLine: 223,
          role: 'entry',
          symbol: 'ReportController.custom',
        },
        summary: 'POST /report/custom 接收 cName，Class.forName(cName) 后反射实例化并调用 handle(request)。',
      },
      {
        label: '业务处理',
        ref: {
          projectId: 'YM_PT',
          path: 'src/org/itstec/report/service/impl/ReportServiceImpl.java',
          startLine: 122,
          endLine: 126,
          role: 'service',
          symbol: 'ReportServiceImpl.handle',
        },
        summary: 'ReportServiceImpl.handle 是空实现，预留给自定义业务；反射把 cName 指定的任意类当 ReportService 加载并实例化，构成代码注入。',
      },
    ],
    taskTypes: ['identify', 'fix'],
    variantGuidance: '变体可换 cName 字段名或调用的方法名，但必须保留 Class.forName + newInstance 调用。',
    distractorGuidance: [
      '空 catch 只影响异常处理，不能阻止反射加载',
      'cName 是 String，与 SQL 注入无关',
      'Class.forName 不需要 import 即可触发加载',
    ],
    remediationGuidance: [
      '将 cName 收敛为白名单枚举或通过服务注册中心查表',
      '使用 Java Module / SecurityManager 限制可加载类',
      '取消反射 + newInstance 的远程入口调用',
    ],
  },
  {
    id: 'ympt-cookie-admin-auth',
    projectId: 'YM_PT',
    title: 'AdminController#addDoctor 依赖客户端可篡改的 adminID Cookie',
    language: 'Java',
    difficulty: 'medium',
    standardReference: 'GB/T 34944-2017 6.2.6.15',
    vulnerabilityType: '依赖未经验证和完整性检查的 cookie',
    sourceRefs: [
      {
        projectId: 'YM_PT',
        path: 'src/org/itstec/admin/controller/AdminController.java',
        startLine: 30,
        endLine: 50,
        role: 'entry',
        symbol: 'AdminController.login',
      },
      {
        projectId: 'YM_PT',
        path: 'src/org/itstec/admin/controller/AdminController.java',
        startLine: 51,
        endLine: 90,
        role: 'controller',
        symbol: 'AdminController.addDoctor',
      },
      {
        projectId: 'YM_PT',
        path: 'src/org/itstec/admin/service/impl/AdminServiceImlp.java',
        startLine: 60,
        endLine: 90,
        role: 'service',
        symbol: 'AdminServiceImlp.addDoctor',
      },
    ],
    evidenceFlow: [
      {
        label: '入口参数',
        ref: {
          projectId: 'YM_PT',
          path: 'src/org/itstec/admin/controller/AdminController.java',
          startLine: 30,
          endLine: 50,
          role: 'entry',
          symbol: 'AdminController.login',
        },
        summary: '登录成功后将 adminID 写入 Cookie，但未设置 HttpOnly/Secure。',
      },
      {
        label: '业务处理',
        ref: {
          projectId: 'YM_PT',
          path: 'src/org/itstec/admin/controller/AdminController.java',
          startLine: 51,
          endLine: 90,
          role: 'controller',
          symbol: 'AdminController.addDoctor',
        },
        summary: '从 Cookie 读取 adminID 并与请求体 account 比对，二者相等就允许添加医生；Cookie 可被任意篡改。',
      },
    ],
    taskTypes: ['trace', 'identify', 'fix'],
    variantGuidance: '变体可改 Cookie 名称或读取方式，但必须保留未签名 Cookie 信任 + 添加医生的敏感操作。',
    distractorGuidance: [
      'checkLogin 用的是 session adminID，强度高于 Cookie，但本接口并未调用',
      'account.equals(adminID) 不构成反序列化漏洞',
      'MyBatis 参数绑定与本漏洞无关',
    ],
    remediationGuidance: [
      '添加医生时改为基于 session 校验角色，不再读 Cookie adminID',
      '为 Cookie 增加 HttpOnly / Secure / SameSite=Strict 保护',
      '如必须用 Cookie 携带身份信息，使用签名/加密方案验证完整性',
    ],
  },
  {
    id: 'ympt-missing-login-query-user-list',
    projectId: 'YM_PT',
    title: 'DoctorController#queryUserList 未调用 checkLogin',
    language: 'Java',
    difficulty: 'easy',
    standardReference: 'GB/T 34944-2017 6.2.6.12',
    vulnerabilityType: '关键参数篡改',
    sourceRefs: [
      {
        projectId: 'YM_PT',
        path: 'src/org/itstec/doctor/controller/DoctorController.java',
        startLine: 117,
        endLine: 128,
        role: 'controller',
        symbol: 'DoctorController.queryUserList',
      },
    ],
    evidenceFlow: [
      {
        label: '入口参数',
        ref: {
          projectId: 'YM_PT',
          path: 'src/org/itstec/doctor/controller/DoctorController.java',
          startLine: 117,
          endLine: 128,
          role: 'entry',
          symbol: 'DoctorController.queryUserList',
        },
        summary: 'POST /doctor/queryUserList 接收 account，未调用 checkLogin。',
      },
      {
        label: '业务处理',
        ref: {
          projectId: 'YM_PT',
          path: 'src/org/itstec/doctor/controller/DoctorController.java',
          startLine: 117,
          endLine: 128,
          role: 'service',
          symbol: 'DoctorController.queryUserList',
        },
        summary: '直接用请求中的 account 查询用户列表，攻击者可遍历 account 查询所有用户。',
      },
    ],
    taskTypes: ['identify', 'fix'],
    variantGuidance: '变体可换接口路径或返回字段，但必须保留 account 由请求体传入且未校验登录态。',
    distractorGuidance: [
      'service.queryUserList 的 SQL 是参数化查询，没有 SQL 注入',
      'account 由 session 中读取仍是修复方案，但不是当前代码',
      'Spring MVC 入参绑定不是漏洞',
    ],
    remediationGuidance: [
      '在 queryUserList 入口调用 checkLogin(request, account)',
      '或者直接从 session 读取 doctorID 过滤结果集',
    ],
  },
  {
    id: 'ympt-relative-path-show-arch-file',
    projectId: 'YM_PT',
    title: 'DoctorController#showArchFile 拼接 dCode 列出归档目录',
    language: 'Java',
    difficulty: 'medium',
    standardReference: 'GB/T 34944-2017 6.2.3.1',
    vulnerabilityType: '相对路径遍历',
    sourceRefs: [
      {
        projectId: 'YM_PT',
        path: 'src/org/itstec/doctor/controller/DoctorController.java',
        startLine: 148,
        endLine: 164,
        role: 'controller',
        symbol: 'DoctorController.showArchFile',
      },
      {
        projectId: 'YM_PT',
        path: 'src/org/itstec/doctor/service/impl/DoctorServiceImpl.java',
        startLine: 110,
        endLine: 130,
        role: 'service',
        symbol: 'DoctorServiceImpl.showArchFile',
      },
    ],
    evidenceFlow: [
      {
        label: '入口参数',
        ref: {
          projectId: 'YM_PT',
          path: 'src/org/itstec/doctor/controller/DoctorController.java',
          startLine: 148,
          endLine: 164,
          role: 'entry',
          symbol: 'DoctorController.showArchFile',
        },
        summary: 'POST /doctor/showArchFile 接收 dCode，做了 checkLogin 但未对 dCode 做规范化。',
      },
      {
        label: '系统调用',
        ref: {
          projectId: 'YM_PT',
          path: 'src/org/itstec/doctor/controller/DoctorController.java',
          startLine: 148,
          endLine: 164,
          role: 'sink',
          symbol: 'DoctorServiceImpl.showArchFile',
        },
        summary: 'service 层把 dCode 拼接到 D:/itstec/doctor/ 后列目录；攻击者通过 ../ 跳到任意目录。',
      },
    ],
    taskTypes: ['trace', 'fix', 'identify'],
    variantGuidance: '变体可换医生代码字段或目录前缀，但必须保留直接拼接与列目录调用。',
    distractorGuidance: [
      'checkLogin 已经校验登录态，但本漏洞与登录态无关',
      'MyBatis 不会因为 dCode 注入而出现 SQL 注入',
      'Spring MVC 路径变量不是本接口的入口',
    ],
    remediationGuidance: [
      '对 dCode 做强校验（白名单/正则）后再拼接',
      '使用 Paths.get(base).resolve(dCode).normalize() 后判断是否仍在 base 目录内',
      '对归档目录使用 FileSystems 默认拒绝 ../ 越界',
    ],
  },
  {
    id: 'ympt-des-hardcoded-key',
    projectId: 'YM_PT',
    title: 'DESUtil 硬编码 DES 密钥',
    language: 'Java',
    difficulty: 'easy',
    standardReference: 'GB/T 34944-2017 6.2.6.3',
    vulnerabilityType: '口令硬编码 / 危险加密算法',
    sourceRefs: [
      {
        projectId: 'YM_PT',
        path: 'src/org/itstec/common/security/DESUtil.java',
        startLine: 10,
        endLine: 38,
        role: 'utility',
        symbol: 'DESUtil.encrypt / DESUtil.decrypt',
      },
    ],
    evidenceFlow: [
      {
        label: '系统调用',
        ref: {
          projectId: 'YM_PT',
          path: 'src/org/itstec/common/security/DESUtil.java',
          startLine: 10,
          endLine: 38,
          role: 'sink',
          symbol: 'DESUtil.encrypt',
        },
        summary: '静态常量 key = "5gQ2QXcB7FQ=" 直接用于 DES 加密/解密，密钥硬编码且算法为不安全 DES。',
      },
    ],
    taskTypes: ['identify'],
    variantGuidance: '变体可换算法名或 Base64 字符串，但必须保留硬编码密钥 + Java 标准库 Cipher 静态初始化。',
    distractorGuidance: [
      'toBase64/fromBase64 不影响密钥保护强度',
      'Cipher.getInstance("DES") 是算法选择问题，不影响密钥泄漏',
      'logger.error 仅记录异常，不能阻止密钥泄漏',
    ],
    remediationGuidance: [
      '密钥应通过密钥管理服务或环境变量注入',
      '升级到 AES/GCM 等强算法，避免 DES/3DES',
      '若要保留对称加密，至少使用 128 位以上随机密钥并按需轮换',
    ],
  },
  {
    id: 'ympt-aes-fixed-gcm-iv',
    projectId: 'YM_PT',
    title: 'AESUtil#encrypt 使用固定 IV 执行 AES/GCM',
    language: 'Java',
    difficulty: 'easy',
    standardReference: 'GB/T 34944-2017 6.2.6.9',
    vulnerabilityType: '密码分组链接模式未使用随机初始化矢量',
    sourceRefs: [
      {
        projectId: 'YM_PT',
        path: 'src/org/itstec/common/security/AESUtil.java',
        startLine: 42,
        endLine: 60,
        role: 'utility',
        symbol: 'AESUtil.encrypt',
      },
    ],
    evidenceFlow: [
      {
        label: '系统调用',
        ref: {
          projectId: 'YM_PT',
          path: 'src/org/itstec/common/security/AESUtil.java',
          startLine: 42,
          endLine: 60,
          role: 'sink',
          symbol: 'AESUtil.encrypt',
        },
        summary: 'iv = {7, 9, 8, 1, 2, 3, 5, 66, 88, 10, 11, 12} 硬编码，每次加密都使用同一 IV，破坏 GCM 语义安全。',
      },
    ],
    taskTypes: ['identify', 'fix'],
    variantGuidance: '变体可换 IV 数组字面量但必须保持硬编码模式。',
    distractorGuidance: [
      'AESUtil 静态初始化读取的是 key 不是 IV',
      'Base64 仅是编码方式，不影响 IV 重复使用问题',
      'AES/GCM/NoPadding 算法本身安全，问题在 IV 不可变',
    ],
    remediationGuidance: [
      '使用 SecureRandom 为每次加密生成新 IV',
      '把 IV 与密文一起传输，解密端先取 IV 再解密密文',
      '加一个 minIvLength 断言防止历史数据误用',
    ],
  },
  {
    id: 'ympt-secutil-weak-random',
    projectId: 'YM_PT',
    title: 'SecUtil#encrypt 使用 java.util.Random 生成加密 IV',
    language: 'Java',
    difficulty: 'easy',
    standardReference: 'GB/T 34944-2017 6.2.6.10',
    vulnerabilityType: '不充分的随机数',
    sourceRefs: [
      {
        projectId: 'YM_PT',
        path: 'src/org/itstec/common/security/SecUtil.java',
        startLine: 29,
        endLine: 48,
        role: 'utility',
        symbol: 'SecUtil.encrypt',
      },
    ],
    evidenceFlow: [
      {
        label: '系统调用',
        ref: {
          projectId: 'YM_PT',
          path: 'src/org/itstec/common/security/SecUtil.java',
          startLine: 29,
          endLine: 48,
          role: 'sink',
          symbol: 'SecUtil.encrypt',
        },
        summary: 'Random random = new Random(); random.nextBytes(iv) 用于生成 AES/GCM IV，Random 可预测。',
      },
    ],
    taskTypes: ['identify'],
    variantGuidance: '变体可换字段名或加密算法，但必须保留 new Random() 作为 IV 来源。',
    distractorGuidance: [
      'SecretKeySpec 不影响随机数问题',
      'Base64.getEncoder 仅做编码，不解决 IV 可预测',
      'GCM 模式算法本身没问题，问题在 IV 派生方式',
    ],
    remediationGuidance: [
      '使用 SecureRandom 生成 IV',
      '把 Random 替换为 ThreadLocalRandom/SecureRandom，避免共享可预测状态',
    ],
  },
  {
    id: 'ympt-sensitive-log-phone',
    projectId: 'YM_PT',
    title: 'UserServiceImpl#show 解密手机号后 info 日志输出',
    language: 'Java',
    difficulty: 'easy',
    standardReference: 'GB/T 34944-2017 6.2.3.8',
    vulnerabilityType: '信息通过服务器日志文件泄露',
    sourceRefs: [
      {
        projectId: 'YM_PT',
        path: 'src/org/itstec/user/controller/UserController.java',
        startLine: 122,
        endLine: 130,
        role: 'controller',
        symbol: 'UserController.showUser',
      },
      {
        projectId: 'YM_PT',
        path: 'src/org/itstec/user/service/impl/UserServiceImpl.java',
        startLine: 71,
        endLine: 83,
        role: 'service',
        symbol: 'UserServiceImpl.show',
      },
    ],
    evidenceFlow: [
      {
        label: '业务处理',
        ref: {
          projectId: 'YM_PT',
          path: 'src/org/itstec/user/service/impl/UserServiceImpl.java',
          startLine: 71,
          endLine: 83,
          role: 'service',
          symbol: 'UserServiceImpl.show',
        },
        summary: 'DESUtil.decrypt(user.getUserPhone()) 得到明文手机号后直接 logger.info("phone:{}", phone) 打印，构成日志泄露。',
      },
    ],
    taskTypes: ['identify'],
    variantGuidance: '变体可换日志框架或字段名，但必须保留解密后日志输出。',
    distractorGuidance: [
      'replaceAll 脱敏只发生在返回对象上，不影响日志',
      'DESUtil.decrypt 是已修复的硬编码密钥，本题考点是日志泄露',
      'Spring Service 注解与日志无关',
    ],
    remediationGuidance: [
      '在日志前再次脱敏，仅打印 hash / 末四位',
      '将 info 级别改为 debug 或完全删除',
      '日志落地前接入结构化合规审计',
    ],
  },
  {
    id: 'ympt-cookie-sensitive-user-info',
    projectId: 'YM_PT',
    title: 'UserController#showUser 把手机号/地址写入 Cookie',
    language: 'Java',
    difficulty: 'medium',
    standardReference: 'GB/T 34944-2017 6.2.6.5',
    vulnerabilityType: 'Cookie 中的敏感信息明文存储',
    sourceRefs: [
      {
        projectId: 'YM_PT',
        path: 'src/org/itstec/user/controller/UserController.java',
        startLine: 123,
        endLine: 150,
        role: 'controller',
        symbol: 'UserController.showUser',
      },
      {
        projectId: 'YM_PT',
        path: 'src/org/itstec/user/service/impl/UserServiceImpl.java',
        startLine: 71,
        endLine: 84,
        role: 'service',
        symbol: 'UserServiceImpl.show',
      },
    ],
    evidenceFlow: [
      {
        label: '入口参数',
        ref: {
          projectId: 'YM_PT',
          path: 'src/org/itstec/user/controller/UserController.java',
          startLine: 123,
          endLine: 150,
          role: 'entry',
          symbol: 'UserController.showUser',
        },
        summary: '查询用户后把 userPhone/userAddress 明文写入 Cookie。',
      },
      {
        label: '业务处理',
        ref: {
          projectId: 'YM_PT',
          path: 'src/org/itstec/user/controller/UserController.java',
          startLine: 123,
          endLine: 150,
          role: 'controller',
          symbol: 'UserController.showUser',
        },
        summary: '虽然设了 HttpOnly/Secure，但 Cookie 仍是明文存储手机号/地址；本地浏览器/代理/抓包可读。',
      },
    ],
    taskTypes: ['identify', 'fix'],
    variantGuidance: '变体可换 Cookie 名称或字段，但必须保留明文敏感数据落 Cookie。',
    distractorGuidance: [
      'HttpOnly 不能阻止服务端读 Cookie',
      'Secure 仅在 HTTPS 下生效',
      'cAddress.setMaxAge(60) 也不影响明文存储事实',
    ],
    remediationGuidance: [
      '不在 Cookie 中保存明文敏感信息，改为只保留 userId',
      '如必须使用 Cookie 携带敏感数据，先加密或签名',
      '日志/审计/UI 只在需要时返回明文，传输层最小化',
    ],
  },
  {
    id: 'ympt-config-db-password',
    projectId: 'YM_PT',
    title: 'application.yml 明文存储数据库口令',
    language: 'Java',
    difficulty: 'easy',
    standardReference: 'GB/T 34944-2017 6.2.6.3',
    vulnerabilityType: '口令硬编码',
    sourceRefs: [
      {
        projectId: 'YM_PT',
        path: 'src/application.yml',
        startLine: 1,
        endLine: 15,
        role: 'config',
        symbol: 'spring.datasource.password',
      },
    ],
    evidenceFlow: [
      {
        label: '系统配置',
        ref: {
          projectId: 'YM_PT',
          path: 'src/application.yml',
          startLine: 1,
          endLine: 15,
          role: 'config',
          symbol: 'spring.datasource.password',
        },
        summary: 'username: root / password: nn44n4yh 直接写在 application.yml，提交进仓库即可造成口令泄漏。',
      },
    ],
    taskTypes: ['identify'],
    variantGuidance: '变体可换用户名/密码字面量，但必须保留 spring.datasource.password 硬编码形式。',
    distractorGuidance: [
      'driver-class-name 与漏洞无关',
      'context-path: /demo 不是漏洞点',
      'Hikari 连接池配置与凭据保护无关',
    ],
    remediationGuidance: [
      '密码应通过环境变量/Secret Manager 注入',
      '从仓库历史中清理已泄漏的明文',
      '为配置中心增加密钥轮换与最小权限',
    ],
  },
  {
    id: 'ympt-upload-extension-only',
    projectId: 'YM_PT',
    title: 'UserController#updatePic 仅校验后缀，依赖原文件名写入磁盘',
    language: 'Java',
    difficulty: 'medium',
    standardReference: 'GB/T 34944-2017 6.2.4.1',
    vulnerabilityType: '未限制危险类型文件的上传',
    sourceRefs: [
      {
        projectId: 'YM_PT',
        path: 'src/org/itstec/user/controller/UserController.java',
        startLine: 98,
        endLine: 121,
        role: 'controller',
        symbol: 'UserController.updatePic',
      },
      {
        projectId: 'YM_PT',
        path: 'src/org/itstec/user/service/impl/UserServiceImpl.java',
        startLine: 109,
        endLine: 144,
        role: 'service',
        symbol: 'UserServiceImpl.updatePic',
      },
    ],
    evidenceFlow: [
      {
        label: '入口参数',
        ref: {
          projectId: 'YM_PT',
          path: 'src/org/itstec/user/controller/UserController.java',
          startLine: 98,
          endLine: 121,
          role: 'entry',
          symbol: 'UserController.updatePic',
        },
        summary: '接收 pic 与 userId，未检查 contentType/MIME。',
      },
      {
        label: '业务处理',
        ref: {
          projectId: 'YM_PT',
          path: 'src/org/itstec/user/service/impl/UserServiceImpl.java',
          startLine: 109,
          endLine: 144,
          role: 'service',
          symbol: 'UserServiceImpl.updatePic',
        },
        summary: '仅比对 suffix 是否在 {jpg,png,jpeg,gif,bmp,ico} 集合；攻击者用 shell.php.jpg 仍可通过后缀白名单，并使用 userId + suffix 拼接写入磁盘，可能与上传解析逻辑组合成 Webshell。',
      },
    ],
    taskTypes: ['identify', 'fix'],
    variantGuidance: '变体可换白名单数组内容，但必须保留 suffix 校验 + 原文件名拼接 + Files.write 流程。',
    distractorGuidance: [
      'checkUserId 仅校验 userId 格式，与文件类型无关',
      'delFilesWithSameName 不会引入新漏洞',
      'Bytes 写入大小不是本漏洞的关注点',
    ],
    remediationGuidance: [
      '改用服务端生成文件名，不再信任原始文件名/后缀',
      '校验文件魔数/MIME 而不仅看后缀',
      '将上传目录设为非可执行，禁止 Web 容器解析',
    ],
  },
];

const ITSTEC24_SEEDS: ProjectAuditFindingSeed[] = [
  {
    id: 'itstec24-open-redirect-login',
    projectId: 'itstec-24',
    title: 'UserController#loginAutoRedi 信任客户端 url 拼接 redirect',
    language: 'Java',
    difficulty: 'easy',
    standardReference: 'GB/T 34944-2017 6.2.8.4',
    vulnerabilityType: '开放重定向',
    sourceRefs: [
      {
        projectId: 'itstec-24',
        path: 'src/org/itstec/user/controller/UserController.java',
        startLine: 45,
        endLine: 49,
        role: 'controller',
        symbol: 'UserController.loginAutoRedi',
      },
      {
        projectId: 'itstec-24',
        path: 'src/org/itstec/user/service/impl/UserServiceImpl.java',
        startLine: 105,
        endLine: 128,
        role: 'service',
        symbol: 'UserServiceImpl.loginAutoRedi',
      },
    ],
    evidenceFlow: [
      {
        label: '入口参数',
        ref: {
          projectId: 'itstec-24',
          path: 'src/org/itstec/user/controller/UserController.java',
          startLine: 45,
          endLine: 49,
          role: 'entry',
          symbol: 'UserController.loginAutoRedi',
        },
        summary: 'GET/POST /user/loginAutoRedi 接收 url 参数。',
      },
      {
        label: '业务处理',
        ref: {
          projectId: 'itstec-24',
          path: 'src/org/itstec/user/service/impl/UserServiceImpl.java',
          startLine: 105,
          endLine: 128,
          role: 'service',
          symbol: 'UserServiceImpl.loginAutoRedi',
        },
        summary: '登录成功后 newUrl = url；外层 controller 返回 "redirect:" + newUrl，无白名单。',
      },
    ],
    taskTypes: ['trace', 'identify', 'fix'],
    variantGuidance: '变体可换 url 字段名或 controller 路径，但必须保留登录后用 url 直接拼接 redirect。',
    distractorGuidance: [
      'SM2Util.encrypt 加密不能阻止开放重定向',
      'session.setAttribute 与本漏洞无关',
      'R.data 是普通返回，不影响 redirect 行为',
    ],
    remediationGuidance: [
      '将 url 收敛到站内白名单或基于 allowlist 域名判断',
      '使用 Spring 的 RelativePathHelper / URIBuilder 限制协议与 host',
      '改用 post-login 跳转中间页 + 用户二次确认',
    ],
  },
  {
    id: 'itstec24-log-arch-command',
    projectId: 'itstec-24',
    title: 'LogServiceImpl#logArch 把 para 拼接到 cmd[2] 执行 Runtime.exec',
    language: 'Java',
    difficulty: 'medium',
    standardReference: 'GB/T 34944-2017 6.2.3.3',
    vulnerabilityType: '命令注入',
    sourceRefs: [
      {
        projectId: 'itstec-24',
        path: 'src/org/itstec/log/controller/LogController.java',
        startLine: 37,
        endLine: 41,
        role: 'controller',
        symbol: 'LogController.logArch',
      },
      {
        projectId: 'itstec-24',
        path: 'src/org/itstec/log/service/impl/LogServiceImpl.java',
        startLine: 100,
        endLine: 116,
        role: 'service',
        symbol: 'LogServiceImpl.logArch',
      },
    ],
    evidenceFlow: [
      {
        label: '入口参数',
        ref: {
          projectId: 'itstec-24',
          path: 'src/org/itstec/log/controller/LogController.java',
          startLine: 37,
          endLine: 41,
          role: 'entry',
          symbol: 'LogController.logArch',
        },
        summary: 'POST /log/logArch 接收 para，无登录态校验。',
      },
      {
        label: '系统调用',
        ref: {
          projectId: 'itstec-24',
          path: 'src/org/itstec/log/service/impl/LogServiceImpl.java',
          startLine: 100,
          endLine: 116,
          role: 'sink',
          symbol: 'LogServiceImpl.logArch',
        },
        summary: 'cmd[2] = "D:/itstec/logArch.bat " + para 后 Runtime.getRuntime().exec(cmd)，构成命令注入。',
      },
    ],
    taskTypes: ['trace', 'fix', 'identify'],
    variantGuidance: '变体可换 para 字段名或 bat 路径，但必须保留 cmd 数组 + 未过滤的外部输入。',
    distractorGuidance: [
      'execute 线程只是消费输出，不阻止注入',
      'logger.error 只是记录错误，不影响注入',
      'cmd[0]/cmd[1] 是常量，不影响漏洞',
    ],
    remediationGuidance: [
      '将 para 改为受控参数集合（动作枚举）',
      '改用 ProcessBuilder 参数数组，把 para 作为独立参数',
      '对命令执行做白名单或改用 Java API 替代 shell 脚本',
    ],
  },
  {
    id: 'itstec24-log-path-listing',
    projectId: 'itstec-24',
    title: 'LogServiceImpl#show 把 logPath 拼成 HTML 列出目录',
    language: 'Java',
    difficulty: 'easy',
    standardReference: 'GB/T 34944-2017 6.2.3.1',
    vulnerabilityType: '路径遍历',
    sourceRefs: [
      {
        projectId: 'itstec-24',
        path: 'src/org/itstec/log/controller/LogController.java',
        startLine: 22,
        endLine: 25,
        role: 'controller',
        symbol: 'LogController.show',
      },
      {
        projectId: 'itstec-24',
        path: 'src/org/itstec/log/service/impl/LogServiceImpl.java',
        startLine: 32,
        endLine: 61,
        role: 'service',
        symbol: 'LogServiceImpl.show',
      },
    ],
    evidenceFlow: [
      {
        label: '入口参数',
        ref: {
          projectId: 'itstec-24',
          path: 'src/org/itstec/log/controller/LogController.java',
          startLine: 22,
          endLine: 25,
          role: 'entry',
          symbol: 'LogController.show',
        },
        summary: 'POST /log/show 接收 logPath。',
      },
      {
        label: '系统调用',
        ref: {
          projectId: 'itstec-24',
          path: 'src/org/itstec/log/service/impl/LogServiceImpl.java',
          startLine: 32,
          endLine: 61,
          role: 'sink',
          symbol: 'LogServiceImpl.show',
        },
        summary: 'FileUtil.isFolder(logPath) 与 showFolder(logPath) 把任意目录名作为遍历目标，构成路径遍历/任意目录浏览。',
      },
    ],
    taskTypes: ['trace', 'identify', 'fix'],
    variantGuidance: '变体可换方法名或返回字段，但必须保留 logPath 透传到 FileUtil。',
    distractorGuidance: [
      'HTML 拼接只影响展示层，不影响路径遍历',
      'R.code("200",...) 不构成异常',
      'logger 与漏洞无关',
    ],
    remediationGuidance: [
      '对 logPath 做强校验或收敛到固定日志根目录',
      '使用 canonicalPath 解析后判断是否仍在白名单目录',
      '将 HTML 拼接改为 JSON 列表',
    ],
  },
  {
    id: 'itstec24-log-grab-path-zip',
    projectId: 'itstec-24',
    title: 'LogServiceImpl#logGrab 用 logPath 构造 zip 路径并压缩',
    language: 'Java',
    difficulty: 'medium',
    standardReference: 'GB/T 34944-2017 6.2.3.1',
    vulnerabilityType: '路径遍历',
    sourceRefs: [
      {
        projectId: 'itstec-24',
        path: 'src/org/itstec/log/controller/LogController.java',
        startLine: 27,
        endLine: 30,
        role: 'controller',
        symbol: 'LogController.logGrab',
      },
      {
        projectId: 'itstec-24',
        path: 'src/org/itstec/log/service/impl/LogServiceImpl.java',
        startLine: 63,
        endLine: 80,
        role: 'service',
        symbol: 'LogServiceImpl.logGrab',
      },
    ],
    evidenceFlow: [
      {
        label: '入口参数',
        ref: {
          projectId: 'itstec-24',
          path: 'src/org/itstec/log/controller/LogController.java',
          startLine: 27,
          endLine: 30,
          role: 'entry',
          symbol: 'LogController.logGrab',
        },
        summary: 'POST /log/logGrab 接收 logPath。',
      },
      {
        label: '系统调用',
        ref: {
          projectId: 'itstec-24',
          path: 'src/org/itstec/log/service/impl/LogServiceImpl.java',
          startLine: 63,
        endLine: 80,
          role: 'sink',
          symbol: 'LogServiceImpl.logGrab',
        },
        summary: 'ZipUtils(logPath+"/"+fileName+".zip").compress(logPath) 把任意目录压缩成 zip；攻击者可压缩敏感目录。',
      },
    ],
    taskTypes: ['trace', 'fix', 'identify'],
    variantGuidance: '变体可换压缩方法或目录名，但必须保留 logPath 作为压缩源。',
    distractorGuidance: [
      'fileUtil.copyFile 仅复制，不影响遍历',
      'DateUtil.getDateTimeStr 与漏洞无关',
      'ResourceUtils.getURL("classpath:") 是固定根，与 logPath 路径遍历无关',
    ],
    remediationGuidance: [
      '对 logPath 做白名单收敛',
      '改用 canonicalPath + Path.startsWith 检测是否在允许目录',
      '禁止压缩含敏感目录（如 /etc、用户上传目录）',
    ],
  },
  {
    id: 'itstec24-excel-update-sql-concat',
    projectId: 'itstec-24',
    title: 'UserServiceImpl#updateBatchInfo 把 Excel 单元格值拼成 SQL',
    language: 'Java',
    difficulty: 'medium',
    standardReference: 'GB/T 34944-2017 6.2.3.4',
    vulnerabilityType: 'SQL 注入',
    sourceRefs: [
      {
        projectId: 'itstec-24',
        path: 'src/org/itstec/user/controller/UserController.java',
        startLine: 71,
        endLine: 101,
        role: 'controller',
        symbol: 'UserController.updateBatchInfo',
      },
      {
        projectId: 'itstec-24',
        path: 'src/org/itstec/user/service/impl/UserServiceImpl.java',
        startLine: 231,
        endLine: 288,
        role: 'service',
        symbol: 'UserServiceImpl.updateBatchInfo',
      },
    ],
    evidenceFlow: [
      {
        label: '入口参数',
        ref: {
          projectId: 'itstec-24',
          path: 'src/org/itstec/user/controller/UserController.java',
          startLine: 71,
        endLine: 101,
          role: 'entry',
          symbol: 'UserController.updateBatchInfo',
        },
        summary: 'POST /user/updateBatchInfo 接收 Excel 文件并落盘。',
      },
      {
        label: '业务处理',
        ref: {
          projectId: 'itstec-24',
          path: 'src/org/itstec/user/service/impl/UserServiceImpl.java',
          startLine: 231,
        endLine: 288,
          role: 'service',
          symbol: 'UserServiceImpl.updateBatchInfo',
        },
        summary: 'set = set + " " + colum[j] + "=\'" + tmp + "\'," 直接字符串拼接 Excel 单元格值，where = "where id=" + id 同样裸拼，最后 dbbean.executeUpdate(update + set + where) 执行。',
      },
    ],
    taskTypes: ['trace', 'fix', 'identify'],
    variantGuidance: '变体可换列名集合或值，但必须保留字符串拼接 + executeUpdate 流程。',
    distractorGuidance: [
      'Poi4Util 仅做 Excel 解析，与 SQL 拼接无关',
      'StreamingReader 控制的是读取性能，不影响 SQL 拼接',
      'try/catch 不会阻止注入',
    ],
    remediationGuidance: [
      '改用参数化 SQL（PreparedStatement）',
      '或先做单元格值校验（白名单/正则）',
      '同时对 update/where 的列名做白名单收敛',
    ],
  },
  {
    id: 'itstec24-excel-import-sql-concat',
    projectId: 'itstec-24',
    title: 'UserServiceImpl#importBatchInfo 同样把 Excel 单元格值拼成 SQL',
    language: 'Java',
    difficulty: 'medium',
    standardReference: 'GB/T 34944-2017 6.2.3.4',
    vulnerabilityType: 'SQL 注入',
    sourceRefs: [
      {
        projectId: 'itstec-24',
        path: 'src/org/itstec/user/controller/UserController.java',
        startLine: 103,
        endLine: 133,
        role: 'controller',
        symbol: 'UserController.importBatchInfo',
      },
      {
        projectId: 'itstec-24',
        path: 'src/org/itstec/user/service/impl/UserServiceImpl.java',
        startLine: 290,
        endLine: 319,
        role: 'service',
        symbol: 'UserServiceImpl.importBatchInfo',
      },
    ],
    evidenceFlow: [
      {
        label: '入口参数',
        ref: {
          projectId: 'itstec-24',
          path: 'src/org/itstec/user/controller/UserController.java',
          startLine: 103,
        endLine: 133,
          role: 'entry',
          symbol: 'UserController.importBatchInfo',
        },
        summary: 'POST /user/importBatchInfo 接收 Excel 与 memorySize。',
      },
      {
        label: '业务处理',
        ref: {
          projectId: 'itstec-24',
          path: 'src/org/itstec/user/service/impl/UserServiceImpl.java',
          startLine: 290,
        endLine: 319,
          role: 'service',
          symbol: 'UserServiceImpl.importBatchInfo',
        },
        summary: 'values = values + "\'" + datas.get(i).get(colum[j]) + "\'," 裸拼后 dbbean.executeUpdate(insert + values) 执行。',
      },
    ],
    taskTypes: ['trace', 'fix', 'identify'],
    variantGuidance: '变体可换列名集合或循环结构，但必须保留 values 字符串拼接 + executeUpdate。',
    distractorGuidance: [
      'memorySize 仅控制读取缓冲区，与 SQL 拼接无关',
      'readBigExcel 只是 IO 封装，不影响注入',
      'dbbean.close 仅做资源释放',
    ],
    remediationGuidance: [
      '改用 PreparedStatement.setObject 等参数化方法',
      '对每个单元格值做白名单或字符串转义',
      '从源头校验 Excel 内容，最大化降低污染面',
    ],
  },
  {
    id: 'itstec24-upload-original-filename',
    projectId: 'itstec-24',
    title: 'UserServiceImpl#uploadImg 用 getOriginalFilename() 拼路径写入',
    language: 'Java',
    difficulty: 'easy',
    standardReference: 'GB/T 34944-2017 6.2.8.5',
    vulnerabilityType: '依赖外部提供的文件名或扩展名',
    sourceRefs: [
      {
        projectId: 'itstec-24',
        path: 'src/org/itstec/user/controller/UserController.java',
        startLine: 66,
        endLine: 69,
        role: 'controller',
        symbol: 'UserController.uploadImg',
      },
      {
        projectId: 'itstec-24',
        path: 'src/org/itstec/user/service/impl/UserServiceImpl.java',
        startLine: 162,
        endLine: 218,
        role: 'service',
        symbol: 'UserServiceImpl.uploadImg',
      },
    ],
    evidenceFlow: [
      {
        label: '入口参数',
        ref: {
          projectId: 'itstec-24',
          path: 'src/org/itstec/user/controller/UserController.java',
          startLine: 66,
        endLine: 69,
          role: 'entry',
          symbol: 'UserController.uploadImg',
        },
        summary: 'POST /user/uploadImg 接收 MultipartFile。',
      },
      {
        label: '业务处理',
        ref: {
          projectId: 'itstec-24',
          path: 'src/org/itstec/user/service/impl/UserServiceImpl.java',
          startLine: 162,
        endLine: 218,
          role: 'service',
          symbol: 'UserServiceImpl.uploadImg',
        },
        summary: 'fileName = multifile.getOriginalFilename() 后 filePath = UPLOADED_FOLDER + fileName，Files.write(path, bytes) 直接以原始文件名落盘，可造成 ../../etc/passwd 等越权写入或上传 Webshell。',
      },
    ],
    taskTypes: ['identify', 'fix'],
    variantGuidance: '变体可换白名单或 mime 黑名单内容，但必须保留原始文件名拼接 + Files.write 流程。',
    distractorGuidance: [
      'mimeType 黑名单只覆盖 HTML/JS 类型，攻击者用 image/jpeg + jsp 即可绕过',
      'suffix 白名单仅控制后缀，不影响 ../ 越界',
      'UPLOADED_FOLDER 是固定前缀，不解决原始文件名问题',
    ],
    remediationGuidance: [
      '改用服务端生成文件名（UUID + 受限后缀）',
      'Path.resolve(...).normalize() 后判断是否在白名单根目录',
      '将上传目录配置为不可执行',
    ],
  },
  {
    id: 'itstec24-filter-hardcoded-key',
    projectId: 'itstec-24',
    title: 'OrderFilter 硬编码 password = "CTGYUwnw" 用于签名/AES',
    language: 'Java',
    difficulty: 'easy',
    standardReference: 'GB/T 34944-2017 6.2.6.3',
    vulnerabilityType: '口令硬编码',
    sourceRefs: [
      {
        projectId: 'itstec-24',
        path: 'src/org/itstec/pay/filter/OrderFilter.java',
        startLine: 90,
        endLine: 170,
        role: 'filter',
        symbol: 'OrderFilter.doFilter',
      },
    ],
    evidenceFlow: [
      {
        label: '系统调用',
        ref: {
          projectId: 'itstec-24',
          path: 'src/org/itstec/pay/filter/OrderFilter.java',
          startLine: 90,
        endLine: 170,
          role: 'sink',
          symbol: 'OrderFilter.doFilter',
        },
        summary: 'String password = "CTGYUwnw" 同时用于请求验签（SignUtils.signB）、响应签名（SignUtils.signA）和 AES 加解密（AesUtil.encrypt/decrypt），密钥硬编码。',
      },
    ],
    taskTypes: ['identify'],
    variantGuidance: '变体可换密钥字符串字面量，但必须保留硬编码常量 + 同一密钥复用三处。',
    distractorGuidance: [
      'AesUtil.encrypt 单看是加解密，密钥才是核心问题',
      'SignUtils.md5 是算法，不是密钥',
      'JsonUtil.toJson 与本漏洞无关',
    ],
    remediationGuidance: [
      '密钥应通过密钥管理服务 / 环境变量注入',
      '不同用途（签名 vs 加密）应使用不同密钥',
      '补充密钥轮换策略',
    ],
  },
  {
    id: 'itstec24-aes-ecb-mode',
    projectId: 'itstec-24',
    title: 'AesUtil 使用 AES/ECB/PKCS5Padding',
    language: 'Java',
    difficulty: 'easy',
    standardReference: 'GB/T 34944-2017 6.2.6.7',
    vulnerabilityType: '使用已破解或危险的加密算法',
    sourceRefs: [
      {
        projectId: 'itstec-24',
        path: 'src/org/itstec/common/crytodec/AesUtil.java',
        startLine: 24,
        endLine: 62,
        role: 'utility',
        symbol: 'AesUtil.decrypt / AesUtil.encrypt',
      },
    ],
    evidenceFlow: [
      {
        label: '系统调用',
        ref: {
          projectId: 'itstec-24',
          path: 'src/org/itstec/common/crytodec/AesUtil.java',
          startLine: 24,
        endLine: 62,
          role: 'sink',
          symbol: 'AesUtil.encrypt / AesUtil.decrypt',
        },
        summary: 'Cipher.getInstance("AES/ECB/PKCS5Padding") 使用 ECB 模式，不提供语义安全。',
      },
    ],
    taskTypes: ['identify', 'fix'],
    variantGuidance: '变体可换算法名，但必须保留 ECB 模式。',
    distractorGuidance: [
      'Base64 仅是编码',
      'SecretKeySpec 仅封装密钥',
      'StringUtils.isEmpty 与算法无关',
    ],
    remediationGuidance: [
      '改用 AES/GCM 或 AES/CBC + HMAC',
      'GCM 模式下 IV 必须随机',
      'CBC 模式同样要保证随机 IV + 完整性校验',
    ],
  },
  {
    id: 'itstec24-md5-signature',
    projectId: 'itstec-24',
    title: 'SignUtils 使用 MD5 计算签名并记录签名前串',
    language: 'Java',
    difficulty: 'easy',
    standardReference: 'GB/T 34944-2017 6.2.6.8',
    vulnerabilityType: '可逆/弱散列算法与日志泄露',
    sourceRefs: [
      {
        projectId: 'itstec-24',
        path: 'src/org/itstec/common/sign/SignUtils.java',
        startLine: 17,
        endLine: 82,
        role: 'utility',
        symbol: 'SignUtils.signA / SignUtils.signB / SignUtils.md5',
      },
    ],
    evidenceFlow: [
      {
        label: '系统调用',
        ref: {
          projectId: 'itstec-24',
          path: 'src/org/itstec/common/sign/SignUtils.java',
          startLine: 17,
        endLine: 82,
          role: 'sink',
          symbol: 'SignUtils.signA / SignUtils.signB',
        },
        summary: 'MessageDigest.getInstance("MD5") 用于签名；logger.info("按照顺序计算签名前串:{}", unsignString) 又把签名前串打到日志，结合 OrderFilter 的 password 可推断密钥。',
      },
    ],
    taskTypes: ['identify', 'falsePositive'],
    variantGuidance: '变体可换排序方式或日志级别，但必须保留 MD5 + 记录前串。',
    distractorGuidance: [
      'Collections.sort 仅影响字段顺序',
      'String.valueOf(data.get(name)) 不是漏洞',
      'toUpperCase 只是格式处理',
    ],
    remediationGuidance: [
      '升级到 HMAC-SHA256 等带密钥的散列方案',
      '签名前串不应进入日志',
      '如继续用 MD5，至少加盐并使用 HMAC 构造',
    ],
  },
  {
    id: 'itstec24-session-never-expire',
    projectId: 'itstec-24',
    title: 'UserServiceImpl#login 设置 setMaxInactiveInterval(-1)',
    language: 'Java',
    difficulty: 'easy',
    standardReference: 'GB/T 34944-2017 6.2.7.2',
    vulnerabilityType: '会话永不过期',
    sourceRefs: [
      {
        projectId: 'itstec-24',
        path: 'src/org/itstec/user/controller/UserController.java',
        startLine: 40,
        endLine: 43,
        role: 'controller',
        symbol: 'UserController.login',
      },
      {
        projectId: 'itstec-24',
        path: 'src/org/itstec/user/service/impl/UserServiceImpl.java',
        startLine: 80,
        endLine: 103,
        role: 'service',
        symbol: 'UserServiceImpl.login',
      },
    ],
    evidenceFlow: [
      {
        label: '业务处理',
        ref: {
          projectId: 'itstec-24',
          path: 'src/org/itstec/user/service/impl/UserServiceImpl.java',
          startLine: 80,
        endLine: 103,
          role: 'service',
          symbol: 'UserServiceImpl.login',
        },
        summary: 'session.setMaxInactiveInterval(-1) 把会话最大空闲时间设为永不过期。',
      },
    ],
    taskTypes: ['identify'],
    variantGuidance: '变体可换 session 字段名或调用位置，但必须保留 -1 设置。',
    distractorGuidance: [
      'SM2Util.encrypt 与本漏洞无关',
      'userMapper.selectOne 不是会话问题',
      'R.code 是返回封装',
    ],
    remediationGuidance: [
      '设置合理的会话过期时间（如 30 分钟）',
      '结合滑动过期或绝对过期',
      '高敏操作要求重新登录',
    ],
  },
  {
    id: 'itstec24-payment-sign-bypass',
    projectId: 'itstec-24',
    title: 'PayController#getByIdCardNo 关闭请求解密与签名',
    language: 'Java',
    difficulty: 'hard',
    standardReference: 'GB/T 34944-2017 6.2.6.12',
    vulnerabilityType: '关键参数篡改 / 违反信任边界',
    sourceRefs: [
      {
        projectId: 'itstec-24',
        path: 'src/org/itstec/pay/controller/PayController.java',
        startLine: 67,
        endLine: 76,
        role: 'controller',
        symbol: 'PayController.getByIdCardNo',
      },
    ],
    evidenceFlow: [
      {
        label: '入口参数',
        ref: {
          projectId: 'itstec-24',
          path: 'src/org/itstec/pay/controller/PayController.java',
          startLine: 67,
        endLine: 76,
          role: 'controller',
          symbol: 'PayController.getByIdCardNo',
        },
        summary: '@CryptoDecryptionSignSecurity(requestDecryption=false, requestSign=false, partialCrySign={"idCardNo"}) 让 OrderFilter 跳过请求解密和签名校验。',
      },
      {
        label: '业务处理',
        ref: {
          projectId: 'itstec-24',
          path: 'src/org/itstec/pay/controller/PayController.java',
          startLine: 67,
        endLine: 76,
          role: 'controller',
          symbol: 'PayController.getByIdCardNo',
        },
        summary: '身份证号作为关键参数被信任，攻击者可以任意查询他人订单。',
      },
    ],
    taskTypes: ['identify', 'trace'],
    variantGuidance: '变体可换参数名（如银行卡号）或 partialCrySign 字段，但必须保留 requestSign=false 的关键参数放行。',
    distractorGuidance: [
      'R.data 是结果封装',
      'orderService.getByIdCardNo 只是查询接口，问题在注解关闭签名',
      'AesUtil.encrypt 仅是过滤器加解密函数',
    ],
    remediationGuidance: [
      '对关键参数（身份证/手机号/卡号）必须保留签名与解密',
      '改用基于 session 的鉴权或 OAuth 范围控制',
      '为 partialCrySign 字段做单独的完整性校验',
    ],
  },
  {
    id: 'itstec24-config-db-password',
    projectId: 'itstec-24',
    title: 'application.yml 明文存储数据库口令 + allowMultiQueries',
    language: 'Java',
    difficulty: 'easy',
    standardReference: 'GB/T 34944-2017 6.2.6.3',
    vulnerabilityType: '口令硬编码',
    sourceRefs: [
      {
        projectId: 'itstec-24',
        path: 'src/application.yml',
        startLine: 1,
        endLine: 18,
        role: 'config',
        symbol: 'spring.datasource.password',
      },
    ],
    evidenceFlow: [
      {
        label: '系统配置',
        ref: {
          projectId: 'itstec-24',
          path: 'src/application.yml',
          startLine: 1,
        endLine: 18,
          role: 'config',
          symbol: 'spring.datasource.password',
        },
        summary: 'username: itstec / password: DNFPLJUj 明文写入；url 包含 allowMultiQueries=true，叠加 SQL 注入时危害更大。',
      },
    ],
    taskTypes: ['identify'],
    variantGuidance: '变体可换用户名/密码字面量，但必须保留 allowMultiQueries 与明文密码。',
    distractorGuidance: [
      'driver-class-name 与漏洞无关',
      'useSSL=false 不是本题关注点',
      'Hikari 连接池配置与凭据保护无关',
    ],
    remediationGuidance: [
      '密码应通过环境变量/Secret Manager 注入',
      '关闭 allowMultiQueries，降低 SQL 注入危害',
      '为数据库账号按库配置最小权限',
    ],
  },
  {
    id: 'itstec24-insecure-random-discount',
    projectId: 'itstec-24',
    title: 'OrderServiceImpl#pay 用 new Random().nextInt() 生成优惠金额',
    language: 'Java',
    difficulty: 'medium',
    standardReference: 'GB/T 34944-2017 6.2.6.10',
    vulnerabilityType: '不充分的随机数',
    sourceRefs: [
      {
        projectId: 'itstec-24',
        path: 'src/org/itstec/pay/controller/PayController.java',
        startLine: 41,
        endLine: 45,
        role: 'controller',
        symbol: 'PayController.pay',
      },
      {
        projectId: 'itstec-24',
        path: 'src/org/itstec/pay/service/impl/OrderServiceImpl.java',
        startLine: 50,
        endLine: 71,
        role: 'service',
        symbol: 'OrderServiceImpl.pay',
      },
    ],
    evidenceFlow: [
      {
        label: '业务处理',
        ref: {
          projectId: 'itstec-24',
          path: 'src/org/itstec/pay/service/impl/OrderServiceImpl.java',
          startLine: 50,
        endLine: 71,
          role: 'service',
          symbol: 'OrderServiceImpl.pay',
        },
        summary: 'r.getData().setDiscountAmount(new Random().nextInt() + "") 把优惠金额交给可预测的随机数，攻击者可推测后续优惠。',
      },
    ],
    taskTypes: ['identify'],
    variantGuidance: '变体可换 Random 字段名，但必须保留可预测随机数 + 优惠金额落库。',
    distractorGuidance: [
      'BigDecimal 数值运算不解决随机源问题',
      'orderAmount 三元不影响随机问题',
      'orderMapper.updateById 只是持久化',
    ],
    remediationGuidance: [
      '优惠金额由后台运营规则计算，不要由客户端可预测随机数生成',
      '如需随机数，使用 SecureRandom',
      '将优惠逻辑下沉到审计可追溯的策略中心',
    ],
  },
];

const ALL_SEEDS: ProjectAuditFindingSeed[] = [...YMPT_SEEDS, ...ITSTEC24_SEEDS];

export const PROJECT_AUDIT_FINDING_SEEDS: readonly ProjectAuditFindingSeed[] = ALL_SEEDS;

const SEEDS_BY_PROJECT: Readonly<Record<ProjectId, ProjectAuditFindingSeed[]>> = {
  'YM_PT': YMPT_SEEDS,
  'itstec-24': ITSTEC24_SEEDS,
};

const SEED_BY_ID = new Map<string, ProjectAuditFindingSeed>(
  ALL_SEEDS.map((seed) => [seed.id, seed]),
);

export function getProjectFindingSeeds(projectId?: ProjectId): ProjectAuditFindingSeed[] {
  if (!projectId) {
    return [...ALL_SEEDS];
  }
  if (!isProjectId(projectId)) {
    return [];
  }
  return [...(SEEDS_BY_PROJECT[projectId] || [])];
}

export function getProjectFindingSeed(seedId: string): ProjectAuditFindingSeed | null {
  return SEED_BY_ID.get(seedId) || null;
}

export function getProjectSeedsByClause(
  projectId: ProjectId,
  standardReference: string,
): ProjectAuditFindingSeed[] {
  const normalized = standardReference.trim();
  return getProjectFindingSeeds(projectId).filter(
    (seed) => seed.standardReference === normalized,
  );
}

export function getProjectSeedsByVulnerability(
  projectId: ProjectId,
  vulnerabilityType: string,
): ProjectAuditFindingSeed[] {
  const normalized = vulnerabilityType.trim().toLowerCase();
  return getProjectFindingSeeds(projectId).filter(
    (seed) => seed.vulnerabilityType.toLowerCase() === normalized,
  );
}

export function listProjectAuditFindingSeedIds(): string[] {
  return ALL_SEEDS.map((seed) => seed.id);
}
