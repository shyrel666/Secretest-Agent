import { Nav } from './nav';

export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background" suppressHydrationWarning>
      <Nav />
      <main className="pt-16">
        {children}
      </main>
    </div>
  );
}
