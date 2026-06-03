'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { 
  Shield, 
  Code2, 
  BookOpen, 
  GraduationCap,
  Trophy,
  Dumbbell,
  Menu,
  X,
  Settings
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { TokenUsageIndicator } from './token-usage-indicator';
import { BrandLogo } from './brand-logo';
import { useLearningProgressStore } from '@/lib/store/learning-progress';

const navItems = [
  { href: '/', label: '首页', icon: Shield },
  { href: '/audit', label: '代码审计', icon: Code2 },
  { href: '/knowledge', label: '知识库', icon: BookOpen },
  { href: '/learning', label: '学习中心', icon: GraduationCap },
  { href: '/assessment', label: '能力测评', icon: Trophy },
  { href: '/practice', label: '题库练习', icon: Dumbbell },
  { href: '/settings', label: '设置', icon: Settings },
];

export function Nav() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const learningTopics = useLearningProgressStore((state) => state.topics);

  const learningHref = useMemo(() => {
    const latestTopic = Object.values(learningTopics)
      .filter((topic) => Boolean(topic.lastVisitedAt))
      .sort((left, right) => new Date(right.lastVisitedAt).getTime() - new Date(left.lastVisitedAt).getTime())[0];

    return latestTopic ? `/learning/${latestTopic.topicId}` : '/learning';
  }, [learningTopics]);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="relative px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" prefetch={true} className="flex items-center gap-3 group">
            <BrandLogo
              size={38}
              className="transition-transform group-hover:scale-105"
            />
            <span className="text-lg font-semibold tracking-tight">
              Secretest Agent
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex flex-1 items-center justify-center pr-56 lg:pr-64">
            <div className="flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const href = item.href === '/learning' ? learningHref : item.href;
                const isActive = item.href === '/learning'
                  ? pathname === '/learning' || pathname.startsWith('/learning/')
                  : pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={href}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle compact />
            <TokenUsageIndicator />
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </Button>
          </div>
        </div>

        <div className="absolute inset-y-0 right-4 hidden items-center gap-2 sm:right-6 lg:right-8 md:flex">
          <ThemeToggle />
          <TokenUsageIndicator />
        </div>

        {/* Mobile Nav */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-border/40">
            <div className="mb-3 flex items-center justify-between px-4">
              <span className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                界面主题
              </span>
              <ThemeToggle compact />
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const href = item.href === '/learning' ? learningHref : item.href;
              const isActive = item.href === '/learning'
                ? pathname === '/learning' || pathname.startsWith('/learning/')
                : pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
}
