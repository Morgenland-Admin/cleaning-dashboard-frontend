import { Ban, BellRing, CheckCircle2, Pencil, Printer, Send, type LucideIcon } from 'lucide-react';

import { isNonContactableEmail } from '@/lib/utils';

import type { DictKey, useT } from '@/i18n';
import type { InvoiceRow, InvoiceStatus } from '@/lib/api';

type Translate = ReturnType<typeof useT>;
type Tone = 'info' | 'warning' | 'success' | 'danger' | 'neutral';

const STATUS_TONE: Record<InvoiceStatus, Tone> = {
  draft: 'neutral',
  sent: 'info',
  paid: 'success',
  overdue: 'danger',
  void: 'neutral',
};

const STATUS_LABEL: Record<InvoiceStatus, DictKey> = {
  draft: 'invoices.status.draft',
  sent: 'invoices.status.sent',
  paid: 'invoices.status.paid',
  overdue: 'invoices.status.overdue',
  void: 'invoices.status.void',
};

/** Status values come from the DB; an unknown one renders raw and neutral. */
export function invoiceStatusTone(status: string): Tone {
  return STATUS_TONE[status as InvoiceStatus] ?? 'neutral';
}

export function invoiceStatusLabel(t: Translate, status: string | null | undefined): string {
  if (!status) return '—';
  const key = STATUS_LABEL[status as InvoiceStatus];
  return key ? t(key) : status;
}

export function invoiceNumber(inv: Pick<InvoiceRow, 'id' | 'number'>): string {
  return inv.number ?? `#${inv.id}`;
}

/** Never blank: name, else company, else a neutral label. */
export function invoiceRecipient(
  t: Translate,
  inv: Pick<InvoiceRow, 'recipientName' | 'recipientCompany'>,
): string {
  return inv.recipientName?.trim() || inv.recipientCompany?.trim() || t('invoices.noRecipient');
}

/** `open` (draft/sent/overdue) is the default; paid and void are history. */
export type InvoiceFilter = 'open' | InvoiceStatus | 'all';

export const INVOICE_FILTERS: InvoiceFilter[] = [
  'open',
  'draft',
  'sent',
  'overdue',
  'paid',
  'void',
  'all',
];

const OPEN_STATUSES: ReadonlySet<string> = new Set(['draft', 'sent', 'overdue']);

export function parseInvoiceFilter(raw: string | null): InvoiceFilter {
  return INVOICE_FILTERS.includes(raw as InvoiceFilter) ? (raw as InvoiceFilter) : 'open';
}

export function invoiceFilterQuery(filter: InvoiceFilter): {
  status?: InvoiceStatus;
  view?: 'open';
} {
  if (filter === 'all') return {};
  if (filter === 'open') return { view: 'open' };
  return { status: filter };
}

export function invoiceFilterCount(
  filter: InvoiceFilter,
  counts: Partial<Record<string, number>> | undefined,
): number | undefined {
  if (!counts) return undefined;
  const entries = Object.entries(counts) as Array<[string, number | undefined]>;
  const sum = (keep: (status: string) => boolean) =>
    entries.reduce((n, [status, c]) => (keep(status) ? n + (c ?? 0) : n), 0);
  if (filter === 'all') return sum(() => true);
  if (filter === 'open') return sum((s) => OPEN_STATUSES.has(s));
  return counts[filter] ?? 0;
}

export type InvoiceAction =
  | 'edit'
  | 'send'
  | 'issuePrint'
  | 'resend'
  | 'markPaid'
  | 'dunning'
  | 'void';

/** What may happen next; paid / void are GoBD-immutable. */
export function invoiceActionsFor(status: string): InvoiceAction[] {
  switch (status) {
    case 'draft':
      return ['edit', 'send', 'issuePrint', 'void'];
    case 'sent':
    case 'overdue':
      return ['resend', 'markPaid', 'dunning', 'void'];
    default:
      return [];
  }
}

export const INVOICE_ACTION_META: Record<InvoiceAction, { labelKey: DictKey; icon: LucideIcon }> = {
  edit: { labelKey: 'invoices.edit', icon: Pencil },
  send: { labelKey: 'invoices.send', icon: Send },
  issuePrint: { labelKey: 'invoices.issuePrint', icon: Printer },
  resend: { labelKey: 'invoices.resend', icon: Send },
  markPaid: { labelKey: 'invoices.markPaid', icon: CheckCircle2 },
  dunning: { labelKey: 'invoices.dunning', icon: BellRing },
  void: { labelKey: 'invoices.voidAction', icon: Ban },
};

export type InvoiceConfirmAction = Exclude<InvoiceAction, 'edit'>;

/** Every action but edit mails the customer or freezes the invoice (GoBD), so each one is confirmed. */
export function invoiceConfirmCopy(
  t: Translate,
  action: InvoiceConfirmAction,
  invoice: Pick<InvoiceRow, 'recipientEmail'>,
): { title: string; description: string; confirmLabel: string; isDangerous: boolean } {
  const email =
    invoice.recipientEmail && !isNonContactableEmail(invoice.recipientEmail)
      ? invoice.recipientEmail
      : null;
  const mailLine = email ? t('invoices.confirmMailsTo', { email }) : t('invoices.confirmNoEmail');
  const label = t(INVOICE_ACTION_META[action].labelKey);
  const copy = (description: string, isDangerous = false) => ({
    title: label,
    description,
    confirmLabel: label,
    isDangerous,
  });
  switch (action) {
    case 'send':
      return copy(`${t('invoices.confirmSend')} ${mailLine}`);
    case 'resend':
      return copy(email ? t('invoices.confirmResend', { email }) : t('invoices.confirmNoEmail'));
    case 'issuePrint':
      return copy(t('invoices.confirmIssue'));
    case 'markPaid':
      return copy(t('invoices.confirmMarkPaid'));
    case 'dunning':
      return copy(`${t('invoices.confirmDunning')} ${mailLine}`);
    case 'void':
      return copy(t('invoices.confirmVoid'), true);
  }
}
