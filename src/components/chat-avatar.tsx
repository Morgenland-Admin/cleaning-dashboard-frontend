import { initialsOf } from '@/lib/chat';
import { cn } from '@/lib/utils';

const SIZE = {
  sm: 'size-7 text-2xs',
  md: 'size-10 text-xs',
  lg: 'size-16 text-base',
} as const;

/** Initials circle; decorative, the name is always written next to it. */
export function ChatAvatar({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full bg-primary-soft font-semibold text-primary',
        SIZE[size],
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
