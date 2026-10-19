import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, ExternalLink, Save, Send } from 'lucide-react';
import { useMemo, useState } from 'react';

import { SectionCard } from '@/components/section';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-picker';
import { toast } from '@/hooks/use-toast';
import { useLocale, useT } from '@/i18n';
import { ApiError, ordersAdminApi, type CalendlyPickupMeta, type OrderRow } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatSlot, invalidateOrder, orderDetailKey } from '@/pages/orders-shared';

import type { CompanySlug } from '@/contexts/project-context';

const QUIET_LINK =
  'inline-flex items-center gap-1 rounded-sm underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Confirming also books the slot into the shared CLEANILO Calendly calendar; that leg is
 * reported separately because it can fail without invalidating the order.
 * `editable` false (viewer, closed order): shows what is booked, offers nothing.
 */
export function OrderAppointmentsCard({
  companySlug,
  order,
  editable,
}: {
  companySlug: CompanySlug;
  order: OrderRow;
  editable: boolean;
}) {
  const t = useT();
  const { bcp47 } = useLocale();
  const queryClient = useQueryClient();
  const confirmedSlot = order.metadata?.confirmedSlot ?? null;
  const calendly = order.metadata?.calendly ?? null;
  const slots = useMemo(() => order.metadata?.preferredSlots ?? [], [order.metadata]);

  const [drafts, setDrafts] = useState<string[]>(() => {
    const base = slots.slice(0, 3);
    return [base[0] ?? '', base[1] ?? '', base[2] ?? ''];
  });
  const [proposing, setProposing] = useState(slots.length === 0);
  const [confirmingSlot, setConfirmingSlot] = useState<string | null>(null);

  const confirmAppointment = useMutation({
    mutationFn: (slot: string) => ordersAdminApi.confirmAppointment(companySlug, order.id, slot),
    onSuccess: async (res) => {
      await invalidateOrder(queryClient, companySlug, order.id);
      // The order is confirmed either way; the calendar leg can still fail, and
      // the operator has to know before the crew relies on the calendar.
      if (res.calendly.error) {
        toast({
          title: t('orders.appointment.calendarFailedTitle'),
          description: res.calendly.error,
        });
      } else if (res.calendly.booked) {
        toast.success(t('orders.appointment.calendarOk'));
      } else {
        toast.success(t('orders.appointment.calendarSkipped'));
      }
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('orders.appointment.confirmFailed')),
  });

  const proposeSlots = useMutation({
    mutationFn: (next: string[]) => ordersAdminApi.proposeSlots(companySlug, order.id, next),
    onSuccess: async () => {
      await invalidateOrder(queryClient, companySlug, order.id);
      toast.success(t('orders.appointment.proposalsSaved'));
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('orders.appointment.proposalsFailed')),
  });

  const sendBookingLink = useMutation({
    mutationFn: () => ordersAdminApi.sendPickupBookingLink(companySlug, order.id),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: orderDetailKey(companySlug, order.id) });
      toast.success(
        res.emailed ? t('orders.appointment.linkSent') : t('orders.appointment.linkCreatedNoMail'),
      );
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('orders.appointment.linkFailed')),
  });

  // Nothing booked and nothing to do: a closed or read-only order has no appointment section.
  if (!editable && !confirmedSlot && slots.length === 0 && !calendly) return null;

  const cleaned = drafts.map((s) => s.trim()).filter(Boolean);
  const changed = JSON.stringify(cleaned) !== JSON.stringify(slots);
  const canSave = cleaned.length > 0 && changed;

  return (
    <SectionCard title={t('orders.section.appointments')} bodyClassName="space-y-3">
      {confirmedSlot ? (
        <Alert tone="success" title={t('orders.appointment.confirmedTitle')}>
          <span className="font-medium tabular-nums">{formatSlot(t, confirmedSlot, bcp47)}</span>
        </Alert>
      ) : editable ? (
        <p className="text-xs text-muted-foreground">
          {slots.length > 0 ? t('orders.appointment.pickOne') : t('orders.appointment.noSlotsYet')}
        </p>
      ) : null}

      <CalendlyStatus calendly={calendly} confirmedSlot={confirmedSlot} />

      {slots.length > 0 && (
        <ul className="space-y-1.5">
          {slots.map((slot) => {
            const isConfirmed = confirmedSlot === slot;
            return (
              <li
                key={slot}
                className={cn(
                  'flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-2sm',
                  isConfirmed ? 'border-success/25 bg-success-soft' : 'border-border',
                )}
              >
                <span className="flex items-center gap-2 tabular-nums">
                  <CalendarClock
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  {formatSlot(t, slot, bcp47)}
                </span>
                {isConfirmed ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-success">
                    <Check className="size-3.5" aria-hidden="true" />
                    {t('orders.appointment.confirmed')}
                  </span>
                ) : editable ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={confirmAppointment.isPending}
                    loading={confirmAppointment.isPending && confirmingSlot === slot}
                    onClick={() => {
                      setConfirmingSlot(slot);
                      confirmAppointment.mutate(slot);
                    }}
                  >
                    {t('orders.appointment.confirm')}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {editable && !confirmedSlot ? (
        proposing ? (
          <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              {t('orders.appointment.proposals')}
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {drafts.map((value, i) => (
                <DateTimePicker
                  key={i}
                  // The three slots share one heading, so each needs its own name:
                  // a screen reader otherwise reaches three identical blank fields.
                  aria-label={t('orders.appointment.slot', { n: i + 1, total: drafts.length })}
                  value={value}
                  onValueChange={(next) => setDrafts((d) => d.map((v, j) => (j === i ? next : v)))}
                />
              ))}
            </div>
            <div className="flex items-center justify-end gap-2">
              {slots.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setProposing(false)}>
                  {t('common.cancel')}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={!canSave}
                loading={proposeSlots.isPending}
                onClick={() => proposeSlots.mutate(cleaned)}
              >
                <Save aria-hidden="true" />
                {t('orders.appointment.saveProposals')}
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Button size="sm" variant="outline" onClick={() => setProposing(true)}>
              <CalendarClock aria-hidden="true" />
              {t('orders.appointment.propose')}
            </Button>
          </div>
        )
      ) : null}

      {editable && !confirmedSlot ? (
        <div className="space-y-1 border-t border-border pt-3">
          <Button
            size="sm"
            variant="outline"
            loading={sendBookingLink.isPending}
            onClick={() => sendBookingLink.mutate()}
          >
            <Send aria-hidden="true" />
            {t('orders.appointment.letCustomerBook')}
          </Button>
          <p className="text-xs text-muted-foreground">{t('orders.appointment.bookingLinkHint')}</p>
        </div>
      ) : null}
    </SectionCard>
  );
}

/** The crew works off the CLEANILO Calendly calendar, so a lagging or failed booking must show. */
function CalendlyStatus({
  calendly,
  confirmedSlot,
}: {
  calendly: CalendlyPickupMeta | null;
  confirmedSlot: string | null;
}) {
  const t = useT();
  const { bcp47 } = useLocale();
  if (!calendly) {
    if (!confirmedSlot) return null;
    return (
      <p className="text-xs text-muted-foreground">
        {t('orders.appointment.calendarNotConfigured')}
      </p>
    );
  }

  if (calendly.status === 'booked') {
    // A stale booking for a slot that was later changed elsewhere — flag it.
    const mismatch = !!confirmedSlot && !!calendly.slot && calendly.slot !== confirmedSlot;
    return (
      <p className="text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Check className="size-3 text-success" aria-hidden="true" />
          {t('orders.appointment.inCalendar')}
          {calendly.source === 'webhook' ? t('orders.appointment.bookedByCustomer') : ''}
        </span>
        {mismatch && (
          <span className="ml-1 text-destructive">
            {t('orders.appointment.bookedMismatch', {
              slot: formatSlot(t, calendly.slot!, bcp47),
            })}
          </span>
        )}
        {calendly.rescheduleUrl && (
          <a
            href={calendly.rescheduleUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(QUIET_LINK, 'ml-2')}
          >
            {t('orders.appointment.reschedule')}
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        )}
      </p>
    );
  }

  if (calendly.status === 'link_sent') {
    return (
      <p className="text-xs text-muted-foreground">
        {t('orders.appointment.linkSentWaiting')}
        {calendly.bookingUrl && (
          <a
            href={calendly.bookingUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(QUIET_LINK, 'ml-2')}
          >
            {t('orders.appointment.openLink')}
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        )}
      </p>
    );
  }

  if (calendly.status === 'cancelled') {
    return (
      <p className="text-xs text-muted-foreground">
        {t('orders.appointment.calendarEntryCancelled')}
        {calendly.source === 'webhook' ? t('orders.appointment.byCustomer') : ''}.
      </p>
    );
  }

  return (
    <Alert tone="destructive" title={t('orders.appointment.calendarMissingTitle')}>
      {t('orders.appointment.calendarMissingBody')}
    </Alert>
  );
}
