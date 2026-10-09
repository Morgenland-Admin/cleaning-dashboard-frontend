import { useEditorState } from '@tiptap/react';
import {
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  Columns3,
  PanelTopDashed,
  Rows3,
  TableCellsMerge,
  TableCellsSplit,
  Trash2,
  type LucideIcon,
} from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

import type { Editor } from '@tiptap/react';

/** Contextual row shown under the main toolbar while the caret is in a table. */
export function TableToolbar({ editor, disabled }: { editor: Editor; disabled: boolean }) {
  const t = useT();
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      inTable: e.isActive('table'),
      canMerge: e.can().mergeCells(),
      canSplit: e.can().splitCell(),
    }),
  });
  if (!s.inTable) return null;

  const chain = () => editor.chain().focus();

  return (
    <div
      role="toolbar"
      aria-label={t('blogEditor.tableToolbar')}
      className="flex flex-wrap items-center gap-1 border-t border-border/70 bg-muted/40 px-2 py-1.5"
    >
      <span className="mr-1 px-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('blogEditor.table')}
      </span>
      <TableButton
        icon={BetweenHorizontalStart}
        label={t('blogEditor.rowAbove')}
        disabled={disabled}
        onClick={() => chain().addRowBefore().run()}
      />
      <TableButton
        icon={BetweenHorizontalEnd}
        label={t('blogEditor.rowBelow')}
        disabled={disabled}
        onClick={() => chain().addRowAfter().run()}
      />
      <TableButton
        icon={BetweenVerticalStart}
        label={t('blogEditor.colLeft')}
        disabled={disabled}
        onClick={() => chain().addColumnBefore().run()}
      />
      <TableButton
        icon={BetweenVerticalEnd}
        label={t('blogEditor.colRight')}
        disabled={disabled}
        onClick={() => chain().addColumnAfter().run()}
      />
      <TableButton
        icon={PanelTopDashed}
        label={t('blogEditor.headerRow')}
        disabled={disabled}
        onClick={() => chain().toggleHeaderRow().run()}
      />
      <TableButton
        icon={TableCellsMerge}
        label={t('blogEditor.mergeCells')}
        disabled={disabled || !s.canMerge}
        onClick={() => chain().mergeCells().run()}
      />
      <TableButton
        icon={TableCellsSplit}
        label={t('blogEditor.splitCell')}
        disabled={disabled || !s.canSplit}
        onClick={() => chain().splitCell().run()}
      />
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
      <TableButton
        icon={Rows3}
        label={t('blogEditor.deleteRow')}
        danger
        disabled={disabled}
        onClick={() => chain().deleteRow().run()}
      />
      <TableButton
        icon={Columns3}
        label={t('blogEditor.deleteCol')}
        danger
        disabled={disabled}
        onClick={() => chain().deleteColumn().run()}
      />
      <TableButton
        icon={Trash2}
        label={t('blogEditor.deleteTable')}
        danger
        disabled={disabled}
        onClick={() => chain().deleteTable().run()}
      />
    </div>
  );
}

function TableButton({
  icon: Icon,
  label,
  danger,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-2sm font-medium transition-colors sm:h-8',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35',
            danger
              ? 'text-destructive hover:bg-destructive/10'
              : 'text-foreground/80 hover:bg-card hover:text-foreground',
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
          <span className="hidden xl:inline">{label}</span>
          <span className="sr-only xl:hidden">{label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent className="xl:hidden">{label}</TooltipContent>
    </Tooltip>
  );
}
