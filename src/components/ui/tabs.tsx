import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const Tabs = TabsPrimitive.Root;

const tabsListVariants = cva('items-center text-muted-foreground', {
  variants: {
    variant: {
      segmented: 'gap-0.5 rounded-lg bg-muted p-0.5 ring-1 ring-inset ring-border/70',
      line: 'gap-4 border-b border-border',
    },
    overflow: {
      wrap: 'inline-flex max-w-full flex-wrap',
      scroll: 'scroll-fade-x scrollbar-none flex w-full justify-start overflow-x-auto',
      fill: 'flex w-full',
    },
  },
  defaultVariants: {
    variant: 'segmented',
    overflow: 'wrap',
  },
});

const triggerVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap text-2sm font-medium ring-offset-background transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        segmented:
          'h-9 rounded-md px-3 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:h-7 sm:px-2.5',
        line: '-mb-px h-10 border-b-2 border-transparent px-0.5 data-[state=active]:border-primary data-[state=active]:text-foreground',
      },
    },
    defaultVariants: { variant: 'segmented' },
  },
);

type TabsVariant = NonNullable<VariantProps<typeof tabsListVariants>['variant']>;
const TabsVariantContext = React.createContext<TabsVariant>('segmented');

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>
>(({ className, overflow, variant, ...props }, ref) => (
  <TabsVariantContext.Provider value={variant ?? 'segmented'}>
    <TabsPrimitive.List
      ref={ref}
      className={cn(tabsListVariants({ variant, overflow }), className)}
      {...props}
    />
  </TabsVariantContext.Provider>
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const variant = React.useContext(TabsVariantContext);
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(triggerVariants({ variant }), className)}
      {...props}
    />
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-3 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
