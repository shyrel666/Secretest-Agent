import Image from 'next/image';
import { cn } from '@/lib/utils';

interface BrandLogoProps {
  size?: number;
  className?: string;
  imageClassName?: string;
}

export function BrandLogo({
  size = 40,
  className,
  imageClassName,
}: BrandLogoProps) {
  return (
    <div
      className={cn('relative flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <div className="absolute inset-[18%] rounded-full bg-primary/12 blur-lg" />
      <Image
        src="/brand-logo.png"
        alt=""
        width={size}
        height={size}
        priority
        className={cn(
          'relative z-10 object-contain drop-shadow-[0_6px_18px_rgba(34,197,203,0.14)]',
          imageClassName,
        )}
      />
    </div>
  );
}