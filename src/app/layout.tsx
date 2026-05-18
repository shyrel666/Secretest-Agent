import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Script from 'next/script';
import { Inspector } from 'react-dev-inspector';
import './globals.css';
import { MainLayout } from '@/components/layout/main-layout';
import { AppBootstrap } from '@/components/providers/app-bootstrap';
import { Toaster } from '@/components/ui/sonner';
import {
  ANONYMOUS_USER_COOKIE,
  COOKIE_MAX_AGE_SECONDS,
  getOrCreateAnonymousUserId,
} from '@/lib/user-context';

export const metadata: Metadata = {
  title: {
    default: 'Secretest Agent',
    template: '%s | Secretest Agent',
  },
  description:
    'Secretest Agent 是一个基于国标知识库与多 Agent 协作的代码漏洞审计、学习与测评平台，帮助开发者和安全测试人员完成能力训练与标准化验证。',
  keywords: [
    '代码审计',
    '漏洞检测',
    '安全测试',
    'GB/T 34944',
    'GB/T 34943',
    'GB/T 34946',
    'Java安全',
    'C/C++安全',
    'C#安全',
    '代码安全',
  ],
  authors: [{ name: 'Security Audit Team' }],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.NODE_ENV !== 'production';
  const cookieStore = await cookies();
  const resolvedUser = getOrCreateAnonymousUserId(cookieStore.get(ANONYMOUS_USER_COOKIE)?.value);
  const shouldSeedUserCookie = resolvedUser.isNew;
  const seededCookieValue = `${ANONYMOUS_USER_COOKIE}=${resolvedUser.userId}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax${isDev ? '' : '; secure'}`;
  const seedUserCookieScript = [
    `const cookieName = ${JSON.stringify(ANONYMOUS_USER_COOKIE)};`,
    `const cookieValue = ${JSON.stringify(resolvedUser.userId)};`,
    'const hasCookie = document.cookie.split(/;\\s*/).some((item) => item.startsWith(`${cookieName}=`));',
    'if (!hasCookie) {',
    `  document.cookie = ${JSON.stringify(seededCookieValue)};`,
    '}',
  ].join('');

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased font-mono">
        {shouldSeedUserCookie && (
          <Script id="seed-anonymous-user-cookie" strategy="beforeInteractive">
            {seedUserCookieScript}
          </Script>
        )}
        {isDev && <Inspector />}
        <AppBootstrap initialUserId={resolvedUser.userId}>
          <MainLayout>{children}</MainLayout>
          <Toaster />
        </AppBootstrap>
      </body>
    </html>
  );
}
