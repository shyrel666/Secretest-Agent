'use client';

import { useEffect, useState } from 'react';
import { Check, LaptopMinimal, Moon, SunMedium } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { THEME_OPTIONS, getThemeLabel, type ThemeMode } from '@/lib/theme';

interface ThemeToggleProps {
  variant?: 'nav' | 'settings';
  className?: string;
  compact?: boolean;
}

const themeIconMap = {
  light: SunMedium,
  dark: Moon,
  system: LaptopMinimal,
} as const;

function useThemeState() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setMounted(true);
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  const currentTheme = mounted ? (theme ?? 'system') as ThemeMode : 'system';
  const activeResolvedTheme = mounted ? (resolvedTheme ?? 'dark') as 'light' | 'dark' : null;
  const ActiveIcon = themeIconMap[currentTheme];

  return {
    mounted,
    currentTheme,
    activeResolvedTheme,
    ActiveIcon,
    setTheme,
  };
}

export function ThemeToggle({ variant = 'nav', className, compact = false }: ThemeToggleProps) {
  const { mounted, currentTheme, activeResolvedTheme, ActiveIcon, setTheme } = useThemeState();
  const buttonLabel = getThemeLabel(currentTheme);
  const nextTheme = activeResolvedTheme === 'dark' ? 'light' : 'dark';
  const nextThemeLabel = nextTheme === 'dark' ? '深色' : '浅色';

  if (variant === 'settings') {
    return (
      <div className={cn('space-y-4', className)}>
        <div className="grid gap-2 sm:grid-cols-3" suppressHydrationWarning>
          {THEME_OPTIONS.map((option) => {
            const Icon = themeIconMap[option.value];
            const isActive = mounted && currentTheme === option.value;

            return (
              <button
                type="button"
                key={option.value}
                onClick={() => setTheme(option.value)}
                className={cn(
                  'rounded-xl border px-4 py-3 text-left text-sm transition-colors',
                  'hover:border-primary/40 hover:bg-primary/6',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  isActive
                    ? 'border-primary/40 bg-primary/8 text-foreground'
                    : 'border-border/60 bg-card/70 text-muted-foreground',
                )}
                aria-pressed={isActive}
                aria-label={`切换到${option.label}`}
              >
                <div className="flex items-center gap-2 font-medium">
                  <Icon className="h-4 w-4" />
                  {option.label}
                  {isActive && <Check className="ml-auto h-4 w-4 text-primary" />}
                </div>
                <p className="mt-2 leading-6">{option.description}</p>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => setTheme(nextTheme)}
      className={cn(
        'group relative border-border/60 bg-background/85 text-foreground shadow-sm backdrop-blur-sm transition-all hover:border-primary/40 hover:bg-primary/6 hover:text-primary',
        compact ? 'h-10 w-10 rounded-full px-0' : 'h-10 rounded-full px-4',
        className,
      )}
      aria-label={!mounted ? '切换主题' : `切换到${nextThemeLabel}`}
      title={!mounted ? '切换主题' : `点击切换到${nextThemeLabel}`}
    >
      <span className="flex items-center gap-2">
        <ActiveIcon className="h-4 w-4 transition-transform group-hover:scale-110" />
        {!compact && (
          <span className="text-sm font-medium">
            {!mounted
              ? '界面主题'
              : activeResolvedTheme === 'dark'
                ? '深色模式'
                : '浅色模式'}
          </span>
        )}
      </span>
      <span className="sr-only">{buttonLabel}</span>
    </Button>
  );
}
