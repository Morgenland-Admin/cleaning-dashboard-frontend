import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';

/** Controlled confirmation dialog (alertdialog) for destructive actions. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Abbrechen',
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent role="alertdialog" showClose={false}>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <DialogFooter className="mt-2">
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>
              {cancelLabel}
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant={isDangerous ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={isPending}
            autoFocus
          >
            {isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
