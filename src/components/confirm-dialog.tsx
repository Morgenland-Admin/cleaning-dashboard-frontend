import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/i18n';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  isDangerous?: boolean;
  isPending?: boolean;
  /** Confirm stays disabled until the user types this exact text (bulk deletes). */
  requireText?: { value: string; label: string };
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  isPending = false,
  ...rest
}: ConfirmDialogProps) {
  return (
    // Not dismissable while the action runs: closing would hide a request still in flight.
    <Dialog
      open={open}
      onOpenChange={(next) => (isPending && !next ? undefined : onOpenChange(next))}
    >
      <DialogContent role="alertdialog" showClose={false}>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        {/* Content unmounts when closed, so typed text resets on every open. */}
        <ConfirmBody isPending={isPending} {...rest} />
      </DialogContent>
    </Dialog>
  );
}

function ConfirmBody({
  confirmLabel,
  cancelLabel,
  onConfirm,
  isDangerous = false,
  isPending,
  requireText,
}: Omit<ConfirmDialogProps, 'open' | 'onOpenChange' | 'title' | 'description'>) {
  const t = useT();
  const inputId = useId();
  const [typed, setTyped] = useState('');
  const blocked = requireText ? typed.trim() !== requireText.value : false;

  return (
    <>
      {requireText ? (
        <div className="space-y-1.5">
          <Label htmlFor={inputId}>{requireText.label}</Label>
          <Input
            id={inputId}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !blocked && !isPending) onConfirm();
            }}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={isPending}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
        </div>
      ) : null}
      <DialogFooter className="mt-2">
        <DialogClose asChild>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            // Irreversible actions focus Cancel, so a reflexive Enter does not delete.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus={isDangerous && !requireText}
          >
            {cancelLabel ?? t('common.cancel')}
          </Button>
        </DialogClose>
        <Button
          type="button"
          variant={isDangerous ? 'destructive' : 'default'}
          onClick={onConfirm}
          loading={isPending}
          disabled={blocked}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={!isDangerous}
        >
          {confirmLabel}
        </Button>
      </DialogFooter>
    </>
  );
}
