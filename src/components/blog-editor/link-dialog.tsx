import { Link2, Unlink } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/i18n';

import { isAllowedHref, normalizeHref } from './editor-utils';

import type { Editor } from '@tiptap/react';

export function LinkDialog({
  editor,
  open,
  onOpenChange,
}: {
  editor: Editor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  // Seeded on mount; the caller remounts per open via `key`.
  const existing = editor.getAttributes('link') as { href?: string; target?: string | null };
  const { from, to, empty } = editor.state.selection;
  const selectedText = empty ? '' : editor.state.doc.textBetween(from, to, ' ');
  const isEditing = !!existing.href;

  const [href, setHref] = useState(existing.href ?? '');
  const [text, setText] = useState(selectedText);
  const [newTab, setNewTab] = useState(existing.target === '_blank');
  const [error, setError] = useState<string | null>(null);

  function apply() {
    const url = normalizeHref(href);
    if (!url || !isAllowedHref(url)) {
      setError(t('blogEditor.linkInvalid'));
      return;
    }
    const attrs = { href: url, target: newTab ? '_blank' : null };
    const chain = editor.chain().focus();
    if (empty && !isEditing) {
      // Nothing selected: insert the label (or the URL itself) as a new link.
      const label = text.trim() || url;
      chain.insertContent({ type: 'text', text: label, marks: [{ type: 'link', attrs }] }).run();
    } else {
      chain.extendMarkRange('link').setLink(attrs).run();
    }
    onOpenChange(false);
  }

  function remove() {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t('blogEditor.linkEditTitle') : t('blogEditor.linkInsertTitle')}
          </DialogTitle>
          <DialogDescription>{t('blogEditor.linkHint')}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="link-href">{t('blogEditor.linkUrl')}</Label>
            <Input
              id="link-href"
              value={href}
              onChange={(e) => {
                setHref(e.target.value);
                setError(null);
              }}
              placeholder="/leistungen/teppichreinigung/ · https://…"
              autoComplete="off"
              aria-invalid={!!error}
              aria-describedby={error ? 'link-href-error' : undefined}
            />
            {error ? (
              <p id="link-href-error" role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          {empty && !isEditing ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="link-text">{t('blogEditor.linkText')}</Label>
              <Input
                id="link-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t('blogEditor.linkTextPlaceholder')}
              />
            </div>
          ) : null}
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={newTab} onChange={(e) => setNewTab(e.target.checked)} />
            {t('blogEditor.linkNewTab')}
          </label>
          <DialogFooter className="gap-2 sm:justify-between">
            {isEditing ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={remove}
              >
                <Unlink aria-hidden="true" />
                {t('blogEditor.linkRemove')}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={!href.trim()}>
                <Link2 aria-hidden="true" />
                {isEditing ? t('common.save') : t('blogEditor.linkInsert')}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
