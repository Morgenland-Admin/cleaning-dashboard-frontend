import { useEditorState } from '@tiptap/react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Code,
  FileCode2,
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
  MoreHorizontal,
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

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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

/** Everyday formatting up front; rarer marks, alignment and the HTML source sit in "More". */
export function EditorToolbar({
  editor,
  disabled,
  htmlMode,
  onLink,
  onImage,
  onToggleHtml,
}: {
  editor: Editor;
  disabled: boolean;
  htmlMode: boolean;
  onLink: () => void;
  onImage: () => void;
  onToggleHtml: () => void;
}) {
  const t = useT();
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const level = ([1, 2, 3, 4, 5, 6] as const).find((l) => e.isActive('heading', { level: l }));
      return {
        block: (level
          ? `h${level}`
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
      };
    },
  });

  const chain = () => editor.chain().focus();
  const off = disabled || htmlMode;
  const alignLeft = !s.alignCenter && !s.alignRight && !s.alignJustify;

  return (
    <div
      role="toolbar"
      aria-label={t('blogEditor.toolbar')}
      aria-orientation="horizontal"
      className="flex min-w-0 items-center gap-0.5"
    >
      <ToolButton
        icon={Undo2}
        label={t('blogEditor.undo')}
        shortcut={`${MOD}+Z`}
        disabled={off || !s.canUndo}
        onClick={() => chain().undo().run()}
      />
      <ToolButton
        icon={Redo2}
        label={t('blogEditor.redo')}
        shortcut={IS_MAC ? '⌘+⇧+Z' : 'Ctrl+Y'}
        disabled={off || !s.canRedo}
        onClick={() => chain().redo().run()}
      />
      <Divider />

      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={off}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`${t('blogEditor.blockType')}: ${t(BLOCK_LABEL[s.block])}`}
            className="min-w-[6.5rem] shrink-0 justify-between gap-1.5 px-2 sm:px-2"
          >
            {t(BLOCK_LABEL[s.block])}
            <ChevronDown className="size-3.5 opacity-60" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
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
            className="text-base font-semibold"
          />
          <BlockItem
            icon={Heading3}
            label={t('blogEditor.blockH3')}
            hint="###"
            active={s.block === 'h3'}
            onSelect={() => chain().setHeading({ level: 3 }).run()}
            className="text-sm font-semibold"
          />
          <BlockItem
            icon={Heading4}
            label={t('blogEditor.blockH4')}
            hint="####"
            active={s.block === 'h4'}
            onSelect={() => chain().setHeading({ level: 4 }).run()}
            className="font-medium"
          />
          {s.block === 'h1' ? (
            <BlockItem icon={Heading1} label={t('blogEditor.blockH1')} active onSelect={() => {}} />
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <Divider />

      <ToolButton
        icon={Bold}
        label={t('blogEditor.bold')}
        shortcut={`${MOD}+B`}
        active={s.bold}
        disabled={off}
        onClick={() => chain().toggleBold().run()}
      />
      <ToolButton
        icon={Italic}
        label={t('blogEditor.italic')}
        shortcut={`${MOD}+I`}
        active={s.italic}
        disabled={off}
        onClick={() => chain().toggleItalic().run()}
      />
      <ToolButton
        icon={Link2}
        label={t('blogEditor.link')}
        shortcut={`${MOD}+K`}
        active={s.link}
        disabled={off}
        onClick={onLink}
      />
      <Divider />
      <ToolButton
        icon={List}
        label={t('blogEditor.bulletList')}
        shortcut={`${MOD}+⇧+8`}
        active={s.bullet}
        disabled={off}
        onClick={() => chain().toggleBulletList().run()}
      />
      <ToolButton
        icon={ListOrdered}
        label={t('blogEditor.orderedList')}
        shortcut={`${MOD}+⇧+7`}
        active={s.ordered}
        disabled={off}
        onClick={() => chain().toggleOrderedList().run()}
      />
      <ToolButton
        icon={Quote}
        label={t('blogEditor.quote')}
        shortcut={`${MOD}+⇧+B`}
        active={s.quote}
        disabled={off}
        onClick={() => chain().toggleBlockquote().run()}
      />
      <Divider />
      <ToolButton icon={ImagePlus} label={t('blogEditor.image')} disabled={off} onClick={onImage} />
      <ToolButton
        icon={Table2}
        label={t('blogEditor.table')}
        active={s.table}
        disabled={off || s.table}
        onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      />

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild disabled={disabled}>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('blogEditor.more')}
                className={cn(
                  TOOL_BTN,
                  (s.underline || s.strike || s.sub || s.sup || s.code || htmlMode) &&
                    TOOL_BTN_ACTIVE,
                )}
              >
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{t('blogEditor.more')}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-60">
          {!htmlMode ? (
            <>
              <BlockItem
                icon={Underline}
                label={t('blogEditor.underline')}
                hint={`${MOD}+U`}
                active={s.underline}
                onSelect={() => chain().toggleUnderline().run()}
              />
              <BlockItem
                icon={Strikethrough}
                label={t('blogEditor.strike')}
                active={s.strike}
                onSelect={() => chain().toggleStrike().run()}
              />
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
                icon={Minus}
                label={t('blogEditor.divider')}
                hint="---"
                onSelect={() => chain().setHorizontalRule().run()}
              />
              <BlockItem
                icon={SquareCode}
                label={t('blogEditor.blockCode')}
                hint="```"
                active={s.block === 'codeBlock'}
                onSelect={() => chain().toggleCodeBlock().run()}
              />
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                {t('blogEditor.alignment')}
              </DropdownMenuLabel>
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
              <DropdownMenuSeparator />
              <BlockItem
                icon={RemoveFormatting}
                label={t('blogEditor.clearFormatting')}
                onSelect={() => chain().unsetAllMarks().clearNodes().run()}
              />
              <DropdownMenuSeparator />
            </>
          ) : null}
          <BlockItem
            icon={FileCode2}
            label={htmlMode ? t('blogEditor.backToVisual') : t('blogEditor.editHtml')}
            active={htmlMode}
            onSelect={onToggleHtml}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

const TOOL_BTN = 'shrink-0 text-muted-foreground hover:text-foreground';
const TOOL_BTN_ACTIVE = 'bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary';

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
        <Button
          ref={ref}
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-keyshortcuts={shortcut?.replace('⌘', 'Meta').replace('⇧', 'Shift')}
          aria-pressed={active === undefined ? undefined : active}
          disabled={disabled}
          // Keep the editor's selection: a toolbar click must not steal focus first.
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
          className={cn(TOOL_BTN, active && TOOL_BTN_ACTIVE)}
        >
          <Icon aria-hidden="true" />
        </Button>
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
    <DropdownMenuItem
      onSelect={onSelect}
      className={cn('gap-2', active && 'bg-primary-soft text-primary')}
    >
      <Icon className="size-4 shrink-0 opacity-70" aria-hidden="true" />
      <span className={cn('flex-1', className)}>{label}</span>
      {hint ? <span className="text-2xs text-muted-foreground">{hint}</span> : null}
    </DropdownMenuItem>
  );
}

function Divider() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border" />;
}
