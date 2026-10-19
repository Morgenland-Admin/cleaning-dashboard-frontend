import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { useT } from '@/i18n';

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  isDangerous = false,
  isPending = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  isDangerous?: boolean;
  isPending?: boolean;
}) {
  const t = useT();
  return (
    // Not dismissable while the action runs: closing would hide a request still in flight.
    <Dialog
      open={open}
      onOpenChange={(next) => (isPending && !next ? undefined : onOpenChange(next))}
    >
      <DialogContent role="alertdialog" showClose={false}>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <DialogFooter className="mt-2">
          <DialogClose asChild>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              // Irreversible actions focus Cancel, so a reflexive Enter does not delete.
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus={isDangerous}
            >
              {cancelLabel ?? t('common.cancel')}
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant={isDangerous ? 'destructive' : 'default'}
            onClick={onConfirm}
            loading={isPending}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus={!isDangerous}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
