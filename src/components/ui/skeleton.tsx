import { cn } from "@/lib/utils";

/** Shared loading placeholder. Replaces the per-page copies of this markup. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      aria-hidden="true"
      {...props}
    />
  );
}

/** A vertical stack of list-row skeletons, optionally with a leading avatar. */
function ListSkeleton({ rows = 4, avatar = true }: { rows?: number; avatar?: boolean }) {
  return (
    <ul className="space-y-2" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 rounded-lg border border-border p-3">
          {avatar && <Skeleton className="size-10 shrink-0 rounded-full" />}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export { Skeleton, ListSkeleton };
