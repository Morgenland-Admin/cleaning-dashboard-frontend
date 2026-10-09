import { useEditorState } from '@tiptap/react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Code,
  Ellipsis,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  RemoveFormatting,
  SquareCode,
  Strikethrough,
  Subscript,
  Superscript,
  Table2,
  Underline,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { forwardRef, type ReactNode } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useT, type DictKey } from '@/i18n';
import { cn } from '@/lib/utils';

import type { Editor } from '@tiptap/react';

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = IS_MAC ? '⌘' : 'Ctrl';

type BlockKey = 'paragraph' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'codeBlock';

const BLOCK_LABEL: Record<BlockKey, DictKey> = {
  paragraph: 'blogEditor.blockParagraph',
  h1: 'blogEditor.blockH1',
  h2: 'blogEditor.blockH2',
  h3: 'blogEditor.blockH3',
  h4: 'blogEditor.blockH4',
  h5: 'blogEditor.blockH5',
  h6: 'blogEditor.blockH6',
  codeBlock: 'blogEditor.blockCode',
};

export function EditorToolbar({
  editor,
  disabled,
  onLink,
  onImage,
}: {
  editor: Editor;
  disabled: boolean;
  onLink: () => void;
  onImage: () => void;
}) {
  const t = useT();
  // Re-render only when one of these flags flips, not on every keystroke.
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: (e.isActive('heading', { level: 1 })
        ? 'h1'
        : e.isActive('heading', { level: 2 })
          ? 'h2'
          : e.isActive('heading', { level: 3 })
            ? 'h3'
            : e.isActive('heading', { level: 4 })
              ? 'h4'
              : e.isActive('heading', { level: 5 })
                ? 'h5'
                : e.isActive('heading', { level: 6 })
                  ? 'h6'
                  : e.isActive('codeBlock')
                    ? 'codeBlock'
                    : 'paragraph') as BlockKey,
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      sub: e.isActive('subscript'),
      sup: e.isActive('superscript'),
      link: e.isActive('link'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      table: e.isActive('table'),
      alignCenter: e.isActive({ textAlign: 'center' }),
      alignRight: e.isActive({ textAlign: 'right' }),
      alignJustify: e.isActive({ textAlign: 'justify' }),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();
  const alignLeft = !s.alignCenter && !s.alignRight && !s.alignJustify;
  const AlignIcon = s.alignCenter
    ? AlignCenter
    : s.alignRight
      ? AlignRight
      : s.alignJustify
        ? AlignJustify
        : AlignLeft;

  return (
    <div
      role="toolbar"
      aria-label={t('blogEditor.toolbar')}
      aria-orientation="horizontal"
      className="flex flex-wrap items-center gap-0.5 px-2 py-1.5"
    >
      <ToolButton
        icon={Undo2}
        label={t('blogEditor.undo')}
        shortcut={`${MOD}+Z`}
        disabled={disabled || !s.canUndo}
        onClick={() => chain().undo().run()}
      />
      <ToolButton
        icon={Redo2}
        label={t('blogEditor.redo')}
        shortcut={IS_MAC ? '⌘+⇧+Z' : 'Ctrl+Y'}
        disabled={disabled || !s.canRedo}
        onClick={() => chain().redo().run()}
      />
      <Divider />

      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={disabled}
          aria-label={t('blogEditor.blockType')}
          className={cn(
            'inline-flex h-9 min-w-[7.5rem] items-center justify-between gap-1.5 rounded-md px-2.5 text-2sm font-medium sm:h-8',
            'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
          )}
        >
          {t(BLOCK_LABEL[s.block])}
          <ChevronDown className="size-3.5 opacity-60" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <BlockItem
            icon={Pilcrow}
            label={t('blogEditor.blockParagraph')}
            active={s.block === 'paragraph'}
            onSelect={() => chain().setParagraph().run()}
          />
          <BlockItem
            icon={Heading2}
            label={t('blogEditor.blockH2')}
            hint="##"
            active={s.block === 'h2'}
            onSelect={() => chain().setHeading({ level: 2 }).run()}
            className="text-lg font-bold"
          />
          <BlockItem
            icon={Heading3}
            label={t('blogEditor.blockH3')}
            hint="###"
            active={s.block === 'h3'}
            onSelect={() => chain().setHeading({ level: 3 }).run()}
            className="text-base font-bold"
          />
          <BlockItem
            icon={Heading4}
            label={t('blogEditor.blockH4')}
            hint="####"
            active={s.block === 'h4'}
            onSelect={() => chain().setHeading({ level: 4 }).run()}
            className="font-semibold"
          />
          {s.block === 'h1' ? (
            <BlockItem icon={Heading1} label={t('blogEditor.blockH1')} active onSelect={() => {}} />
          ) : null}
          <DropdownMenuSeparator />
          <BlockItem
            icon={SquareCode}
            label={t('blogEditor.blockCode')}
            hint="```"
            active={s.block === 'codeBlock'}
            onSelect={() => chain().toggleCodeBlock().run()}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <Divider />

      <ToolButton
        icon={Bold}
        label={t('blogEditor.bold')}
        shortcut={`${MOD}+B`}
        active={s.bold}
        disabled={disabled}
        onClick={() => chain().toggleBold().run()}
      />
      <ToolButton
        icon={Italic}
        label={t('blogEditor.italic')}
        shortcut={`${MOD}+I`}
        active={s.italic}
        disabled={disabled}
        onClick={() => chain().toggleItalic().run()}
      />
      <ToolButton
        icon={Underline}
        label={t('blogEditor.underline')}
        shortcut={`${MOD}+U`}
        active={s.underline}
        disabled={disabled}
        onClick={() => chain().toggleUnderline().run()}
      />
      <ToolButton
        icon={Strikethrough}
        label={t('blogEditor.strike')}
        shortcut={`${MOD}+⇧+S`}
        active={s.strike}
        disabled={disabled}
        onClick={() => chain().toggleStrike().run()}
      />
      <Divider />

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger
              disabled={disabled}
              aria-label={t('blogEditor.alignment')}
              className={cn(TOOL_BTN, 'w-auto gap-0.5 px-1.5')}
            >
              <AlignIcon className="size-4" aria-hidden="true" />
              <ChevronDown className="size-3 opacity-60" aria-hidden="true" />
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{t('blogEditor.alignment')}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="w-48">
          <BlockItem
            icon={AlignLeft}
            label={t('blogEditor.alignLeft')}
            active={alignLeft}
            onSelect={() => chain().unsetTextAlign().run()}
          />
          <BlockItem
            icon={AlignCenter}
            label={t('blogEditor.alignCenter')}
            active={s.alignCenter}
            onSelect={() => chain().setTextAlign('center').run()}
          />
          <BlockItem
            icon={AlignRight}
            label={t('blogEditor.alignRight')}
            active={s.alignRight}
            onSelect={() => chain().setTextAlign('right').run()}
          />
          <BlockItem
            icon={AlignJustify}
            label={t('blogEditor.alignJustify')}
            active={s.alignJustify}
            onSelect={() => chain().setTextAlign('justify').run()}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <ToolButton
        icon={List}
        label={t('blogEditor.bulletList')}
        shortcut={`${MOD}+⇧+8`}
        active={s.bullet}
        disabled={disabled}
        onClick={() => chain().toggleBulletList().run()}
      />
      <ToolButton
        icon={ListOrdered}
        label={t('blogEditor.orderedList')}
        shortcut={`${MOD}+⇧+7`}
        active={s.ordered}
        disabled={disabled}
        onClick={() => chain().toggleOrderedList().run()}
      />
      <ToolButton
        icon={Quote}
        label={t('blogEditor.quote')}
        shortcut={`${MOD}+⇧+B`}
        active={s.quote}
        disabled={disabled}
        onClick={() => chain().toggleBlockquote().run()}
      />
      <ToolButton
        icon={Minus}
        label={t('blogEditor.divider')}
        disabled={disabled}
        onClick={() => chain().setHorizontalRule().run()}
      />
      <Divider />

      <ToolButton
        icon={Link2}
        label={t('blogEditor.link')}
        shortcut={`${MOD}+K`}
        active={s.link}
        disabled={disabled}
        onClick={onLink}
      />
      <ToolButton
        icon={ImagePlus}
        label={t('blogEditor.image')}
        disabled={disabled}
        onClick={onImage}
      />
      <ToolButton
        icon={Table2}
        label={t('blogEditor.table')}
        active={s.table}
        disabled={disabled || s.table}
        onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      />

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger
              disabled={disabled}
              aria-label={t('blogEditor.more')}
              className={cn(
                TOOL_BTN,
                (s.sub || s.sup || s.code) && 'bg-foreground/10 text-foreground',
              )}
            >
              <Ellipsis className="size-4" aria-hidden="true" />
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{t('blogEditor.more')}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-56">
          <BlockItem
            icon={Code}
            label={t('blogEditor.inlineCode')}
            hint={`${MOD}+E`}
            active={s.code}
            onSelect={() => chain().toggleCode().run()}
          />
          <BlockItem
            icon={Subscript}
            label={t('blogEditor.subscript')}
            active={s.sub}
            onSelect={() => chain().toggleSubscript().run()}
          />
          <BlockItem
            icon={Superscript}
            label={t('blogEditor.superscript')}
            active={s.sup}
            onSelect={() => chain().toggleSuperscript().run()}
          />
          <DropdownMenuSeparator />
          <BlockItem
            icon={RemoveFormatting}
            label={t('blogEditor.clearFormatting')}
            onSelect={() => chain().unsetAllMarks().clearNodes().run()}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

const TOOL_BTN =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-md text-foreground/75 transition-colors sm:size-8 ' +
  'hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
  'disabled:pointer-events-none disabled:opacity-35';

export const ToolButton = forwardRef<
  HTMLButtonElement,
  {
    icon: LucideIcon;
    label: string;
    shortcut?: string;
    active?: boolean;
    disabled?: boolean;
    onClick: () => void;
  }
>(function ToolButton({ icon: Icon, label, shortcut, active, disabled, onClick }, ref) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={ref}
          type="button"
          aria-label={label}
          aria-pressed={active === undefined ? undefined : active}
          disabled={disabled}
          // Keep the editor's selection: a toolbar click must not steal focus first.
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
          className={cn(TOOL_BTN, active && 'bg-foreground/10 text-foreground')}
        >
          <Icon className="size-4" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut ? <span className="ml-2 opacity-70">{shortcut}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
});

function BlockItem({
  icon: Icon,
  label,
  hint,
  active,
  onSelect,
  className,
}: {
  icon: LucideIcon;
  label: string;
  hint?: ReactNode;
  active?: boolean;
  onSelect: () => void;
  className?: string;
}) {
  return (
    <DropdownMenuItem onSelect={onSelect} className={cn('gap-2', active && 'bg-muted')}>
      <Icon className="size-4 shrink-0 opacity-70" aria-hidden="true" />
      <span className={cn('flex-1', className)}>{label}</span>
      {hint ? <span className="text-2xs text-muted-foreground">{hint}</span> : null}
    </DropdownMenuItem>
  );
}

function Divider() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border" />;
}
