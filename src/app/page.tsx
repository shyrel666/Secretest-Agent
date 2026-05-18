import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandLogo } from '@/components/layout/brand-logo';
import { 
  Code2, 
  Trophy,
  ArrowRight,
  Bug,
  FileCode,
  Target,
  Sparkles,
  GraduationCap,
  Brain,
  Database,
  CheckCircle
} from 'lucide-react';
import { STANDARD_INFO, type StandardType } from '@/lib/standards';
import { getDocumentSections } from '@/lib/knowledge';

export const dynamic = 'force-dynamic';

const features = [
  {
    icon: Code2,
    title: '智能代码审计',
    description: 'AI驱动的代码安全分析，基于国标规范自动识别漏洞，提供详细修复建议',
    href: '/audit',
    color: 'text-teal-400',
    bgColor: 'bg-teal-400/10',
  },
  {
    icon: Database,
    title: '知识库管理',
    description: '上传国标PDF文档，构建专属知识库，AI基于知识库内容进行审计和出题',
    href: '/knowledge',
    color: 'text-amber-400',
    bgColor: 'bg-amber-400/10',
  },
  {
    icon: GraduationCap,
    title: '学习中心',
    description: '面向零基础用户的闯关式学习模块，先学概念、再做练习、最后进入能力测评',
    href: '/learning',
    color: 'text-sky-400',
    bgColor: 'bg-sky-400/10',
  },
  {
    icon: Trophy,
    title: '智能测评',
    description: '多Agent协作：出题、审核、讲解，形成完整的闭环学习系统',
    href: '/assessment',
    color: 'text-rose-400',
    bgColor: 'bg-rose-400/10',
  },
];

const agentFeatures = [
  {
    icon: Brain,
    title: '出题Agent',
    description: '基于知识库内容，智能生成专业测评题目',
  },
  {
    icon: CheckCircle,
    title: '审核Agent',
    description: '验证题目质量和准确性，确保符合标准',
  },
  {
    icon: GraduationCap,
    title: '讲解Agent',
    description: '针对错题提供详细讲解和学习建议',
  },
];

const STANDARD_ORDER: StandardType[] = ['java', 'cpp', 'csharp'];

function getStandardCoverage(type: StandardType): string {
  try {
    const sections = getDocumentSections(type);
    const vulnSections = sections.filter((s) => /^6\.2\.\d+$/.test(s.clauseNumber));
    if (vulnSections.length > 0) {
      const vulnCount = vulnSections.reduce((sum, s) => sum + s.childClauses.length, 0);
      return `${vulnSections.length}大类${vulnCount}种漏洞`;
    }
  } catch {
    // 如果知识库未就绪，静默返回默认展示文本
  }
  return STANDARD_INFO[type].vulnerabilities;
}

const stats = [
  { label: '漏洞类型', value: '159+', icon: Bug },
  { label: 'Agent协作', value: '3', icon: Brain },
  { label: '学习闭环', value: '完整', icon: Target },
  { label: '国标支持', value: '3', icon: FileCode },
];

export default function Home() {
  const standards = STANDARD_ORDER.map((type) => ({
    name: STANDARD_INFO[type].name,
    fullName: STANDARD_INFO[type].fullName,
    icon: FileCode,
    coverage: getStandardCoverage(type),
  }));
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-primary/10 rounded-full blur-3xl opacity-20" />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm text-primary font-medium">多Agent协作 · 智能代码审计</span>
            </div>

            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight">
              <span className="text-foreground">代码漏洞</span>
              <br />
              <span className="text-primary">审计Agent助手</span>
            </h1>

            <p className="max-w-2xl mx-auto text-lg md:text-xl text-muted-foreground leading-relaxed">
              上传国标文档构建知识库，先学漏洞原理，再做能力测评
              <br className="hidden md:block" />
              形成完整的漏洞审计学习闭环
            </p>

            <div className="text-sm tracking-wide text-muted-foreground/80">
              Powered by <span className="font-semibold text-primary">Secretest Agent</span>
            </div>

            <div className="flex flex-col sm:flex-row sm:flex-wrap items-center justify-center gap-4 pt-4">
              <Link href="/knowledge">
                <Button size="lg" className="gap-2 px-8">
                  上传标准文档
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 border-y border-border/40 bg-muted/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 mb-3">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <div className="text-3xl font-bold text-foreground">{stat.value}</div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">核心功能</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              基于多Agent协作的智能代码漏洞审计系统
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card key={feature.title} className="h-full border-border/60 bg-card/70">
                  <CardHeader>
                    <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl ${feature.bgColor} mb-4`}>
                      <Icon className={`w-6 h-6 ${feature.color}`} />
                    </div>
                    <CardTitle className="text-xl">
                      {feature.title}
                    </CardTitle>
                    <CardDescription className="text-base">
                      {feature.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Agent Architecture Section */}
      <section className="py-20 lg:py-28 bg-muted/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">多Agent协作系统</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              出题、审核、讲解三个Agent协同工作，确保内容质量和学习效果
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {agentFeatures.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <Card key={index} className="bg-card/50 backdrop-blur-sm">
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center text-center">
                      <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                        <Icon className="w-7 h-7 text-primary" />
                      </div>
                      <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                      <p className="text-sm text-muted-foreground">{feature.description}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Flow Diagram */}
          <div className="mt-12 text-center">
            <div className="inline-flex items-center gap-4 px-6 py-4 rounded-xl bg-card border border-border/50">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-amber-400" />
                <span className="text-sm">知识库</span>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-primary" />
                <span className="text-sm">出题</span>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="text-sm">审核</span>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              <div className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-rose-400" />
                <span className="text-sm">讲解</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Standards Section */}
      <section className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">支持的国家标准</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              上传以下标准文档，AI将基于规范内容进行审计和出题
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3 max-w-5xl mx-auto">
            {standards.map((standard) => {
              const Icon = standard.icon;
              return (
                <Card key={standard.name} className="bg-card/50 backdrop-blur-sm">
                  <CardHeader className="flex flex-row items-start gap-4">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 shrink-0">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{standard.name}</CardTitle>
                      <CardDescription className="text-sm mt-1">
                        {standard.fullName}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-sm">
                      <Bug className="w-4 h-4 text-amber-400" />
                      <span className="text-muted-foreground">
                        覆盖 <span className="text-foreground font-semibold">{standard.coverage}</span>
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 lg:py-28 bg-muted/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/20 p-8 md:p-16 text-center">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent" />
            <div className="relative">
              <Brain className="w-16 h-16 text-primary mx-auto mb-6" />
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                准备好开始学习代码漏洞审计了吗？
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
                上传国标文档，让AI帮你构建专属的代码漏洞审计学习系统
              </p>
              <div className="flex items-center justify-center">
                <Link href="/knowledge">
                  <Button size="lg" className="gap-2">
                    <Database className="w-4 h-4" />
                    上传标准文档
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 bg-background/60">
        <div className="w-full">
          <div className="border-b border-border/50 bg-card/20">
            <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 md:py-8 lg:px-8 xl:flex-row xl:items-start xl:justify-between xl:gap-14">
              <div className="max-w-3xl flex-1 space-y-5">
                <div className="flex items-center gap-3">
                  <BrandLogo size={44} />
                  <div>
                    <div className="text-lg font-semibold text-foreground">Secretest Agent</div>
                    <div className="text-sm text-muted-foreground">代码漏洞审计学习平台</div>
                  </div>
                </div>

                <p className="max-w-2xl text-sm leading-7 text-muted-foreground text-pretty">
                  基于国家标准知识库与多 Agent 协作，帮助开发者、学习者和团队完成代码漏洞学习、能力测评与审计训练。
                </p>
              </div>

              <div className="grid w-full gap-3 sm:grid-cols-2 xl:max-w-xl xl:flex-none">
                <div className="rounded-2xl border border-border/50 bg-background/50 p-4">
                  <div className="text-sm font-medium text-foreground">国标知识库驱动</div>
                  <div className="mt-1 text-xs leading-6 text-muted-foreground">围绕上传标准文档构建审计与学习依据</div>
                </div>
                <div className="rounded-2xl border border-border/50 bg-background/50 p-4">
                  <div className="text-sm font-medium text-foreground">多 Agent 协作</div>
                  <div className="mt-1 text-xs leading-6 text-muted-foreground">出题、审核、讲解协同工作，稳定输出内容</div>
                </div>
                <div className="rounded-2xl border border-border/50 bg-background/50 p-4">
                  <div className="text-sm font-medium text-foreground">学习与测评闭环</div>
                  <div className="mt-1 text-xs leading-6 text-muted-foreground">从知识理解到能力验证，形成完整训练路径</div>
                </div>
                <div className="rounded-2xl border border-border/50 bg-background/50 p-4">
                  <div className="text-sm font-medium text-foreground">支持多语言标准</div>
                  <div className="mt-1 text-xs leading-6 text-muted-foreground">覆盖 Java、C/C++ 与 C# 代码漏洞审计场景</div>
                </div>
              </div>
            </div>

            <div className="mx-auto mt-8 flex max-w-7xl flex-col gap-3 border-t border-border/40 px-4 pt-6 text-xs text-muted-foreground sm:px-6 lg:px-8 md:flex-row md:items-center md:justify-between">
              <div className="leading-6">支持 GB/T 34944-2017 · GB/T 34943-2017 · GB/T 34946-2017</div>
              <div>Secretest Agent © 2026</div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
