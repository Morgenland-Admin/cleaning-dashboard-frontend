import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

interface SheetContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  side?: 'left' | 'right';
  /**
   * `nav` — the drawer that replaces the sidebar on small screens. Narrow, and
   * carries the sidebar's own colour so it reads as chrome.
   *
   * `content` — a record or form panel sliding in over the page. Takes the app
   * background, and goes full-width on phones so the content is not squeezed
   * into a 20rem column.
   */
  variant?: 'nav' | 'content';
  /** Render the dismiss X button. Default true. */
  showClose?: boolean;
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ side = 'left', variant = 'nav', className, children, showClose = true, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // pb clears the iOS home indicator. A caller passing `p-0` owns its
        // own padding and overrides this (tailwind-merge drops the pb-*).
        'data-[state=open]:duration-260 fixed z-50 flex h-svh flex-col gap-4 border p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl transition ease-in-out data-[state=closed]:duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out',
        variant === 'nav'
          ? 'w-[min(86vw,20rem)] bg-sidebar text-sidebar-foreground'
          : 'w-full bg-card text-foreground sm:max-w-xl',
        side === 'left'
          ? 'left-0 top-0 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left'
          : 'right-0 top-0 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
        className,
      )}
      {...props}
    >
      {children}
      {showClose ? (
        <DialogPrimitive.Close
          aria-label="Close"
          className={cn(
            // 40px hit area — the icon stays 16px.
            'absolute right-2 top-2 grid size-10 place-items-center rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring sm:size-8',
            variant === 'nav'
              ? 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      ) : null}
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = 'SheetContent';

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('sr-only', className)} {...props} />
));
SheetTitle.displayName = DialogPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('sr-only', className)} {...props} />
));
SheetDescription.displayName = DialogPrimitive.Description.displayName;

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetTitle, SheetDescription };
