import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';
import { readListNav } from '@/lib/list-nav';

import type { ReactNode } from 'react';

/** The row above a record's heading: back link on the left, prev/next on the right. */
export function RecordNav({ children, pager }: { children: ReactNode; pager?: ReactNode }) {
  return (
    <div className="mb-3 flex min-h-8 items-center justify-between gap-3">
      {children}
      {pager}
    </div>
  );
}

/** Prev/next through the list the user came from; renders nothing when the record was opened directly. */
export function RecordPager({
  currentId,
  hrefFor,
}: {
  currentId: number;
  hrefFor: (id: number) => string;
}) {
  const t = useT();
  const location = useLocation();
  const navigate = useNavigate();
  const { ids } = readListNav(location.state);
  const position = ids ? ids.indexOf(currentId) : -1;
  if (!ids || position < 0 || ids.length < 2) return null;

  const prevId = ids[position - 1];
  const nextId = ids[position + 1];
  const go = (id: number) => navigate(hrefFor(id), { replace: true, state: location.state });

  return (
    <div
      role="group"
      aria-label={t('common.position', { n: position + 1, total: ids.length })}
      className="flex items-center gap-0.5"
    >
      <Button
        variant="ghost"
        size="icon"
        className="sm:size-8"
        aria-label={t('common.previous')}
        disabled={prevId === undefined}
        onClick={() => prevId !== undefined && go(prevId)}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      <span
        aria-hidden="true"
        className="min-w-12 text-center text-xs tabular-nums text-muted-foreground"
      >
        {position + 1} / {ids.length}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="sm:size-8"
        aria-label={t('common.next')}
        disabled={nextId === undefined}
        onClick={() => nextId !== undefined && go(nextId)}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  );
}
