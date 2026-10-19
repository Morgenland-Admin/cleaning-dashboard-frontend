import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Send, Star, Undo2, UserCheck, Wallet } from 'lucide-react';
import { Fragment, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormField } from '@/components/form-field';
import { KeyValue, KeyValueList } from '@/components/key-value';
import { SectionCard, SectionLabel } from '@/components/section';
import { StatusBadge } from '@/components/status-badge';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { useLocale, useT, type DictKey } from '@/i18n';
import { useCanWrite } from '@/lib/access';
import {
  dispatchApi,
  errMessage,
  ordersAdminApi,
  partnersAdminApi,
  serviceCatalogApi,
  type DispatchTargetKind,
  type MatchReason,
  type OrderRow,
  type PartnerMatch,
  type PartnerOffer,
  type PartnerOfferStatus,
} from '@/lib/api';
import {
  matchReasonLabel,
  offerStatusLabel,
  offerStatusTone,
  partnerHref,
  partnerStatusLabel,
} from '@/lib/partners';
import { useNow } from '@/lib/use-now';
import { cn, formatCurrency, formatDateTime } from '@/lib/utils';

import type { CompanySlug } from '@/contexts/project-context';

const PAYOUT_LABEL: Record<OrderRow['payoutStatus'], DictKey> = {
  none: 'dispatch.payoutState.none',
  pending: 'dispatch.payoutState.pending',
  paid: 'dispatch.payoutState.paid',
  failed: 'dispatch.payoutState.failed',
};

const PAYOUT_TONE: Record<OrderRow['payoutStatus'], 'warning' | 'success' | 'danger' | 'neutral'> =
  {
    none: 'neutral',
    pending: 'warning',
    paid: 'success',
    failed: 'danger',
  };

const EXPIRY_HOURS = [4, 12, 24, 48, 72, 168] as const;
const ELIGIBLE_STEP = 5;
const OTHERS_STEP = 10;

const REASON_COUNT_KEY: Partial<Record<string, DictKey>> = {
  pending: 'dispatch.reasonCount.pending',
  suspended: 'dispatch.reasonCount.suspended',
  not_active: 'dispatch.reasonCount.not_active',
  not_verified: 'dispatch.reasonCount.not_verified',
  no_location: 'dispatch.reasonCount.no_location',
  out_of_radius: 'dispatch.reasonCount.out_of_radius',
  service_not_offered: 'dispatch.reasonCount.service_not_offered',
};

/** `not_active` says which status (pending/suspended) when the backend sends it. */
function reasonId(m: PartnerMatch, r: MatchReason): string {
  return r === 'not_active' && (m.partnerStatus === 'pending' || m.partnerStatus === 'suspended')
    ? m.partnerStatus
    : r;
}

/** Near misses: offerable (active) first, then fewest gaps, then nearest. */
function byCloseness(a: PartnerMatch, b: PartnerMatch): number {
  const aActive = !a.reasons.includes('not_active');
  const bActive = !b.reasons.includes('not_active');
  if (aActive !== bActive) return aActive ? -1 : 1;
  if (a.reasons.length !== b.reasons.length) return a.reasons.length - b.reasons.length;
  return (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY);
}

const TEXT_LINK =
  'rounded-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** The sweep runs every 5 min, so an open offer past its deadline already counts as expired. */
function effectiveStatus(offer: PartnerOffer, now: number): PartnerOfferStatus {
  return offer.status === 'offered' && new Date(offer.expiresAt).getTime() <= now
    ? 'expired'
    : offer.status;
}

type Target = { kind: 'orders'; order: OrderRow } | { kind: 'inquiries'; inquiryId: number };

/**
 * Partner matching, offers and (orders) assignment + payout for one job.
 * Renders nothing for a brand without partners, offers or an assignment.
 */
export function PartnerDispatchCard({
  companySlug,
  target,
  assignedPartnerId,
  closed,
  onAssignmentChange,
}: {
  companySlug: CompanySlug;
  target: Target;
  assignedPartnerId: number | null;
  closed: boolean;
  onAssignmentChange: () => Promise<void> | void;
}) {
  const t = useT();
  const { bcp47 } = useLocale();
  const canWrite = useCanWrite();
  const queryClient = useQueryClient();
  const kind: DispatchTargetKind = target.kind;
  const targetId = target.kind === 'orders' ? target.order.id : target.inquiryId;
  const matchesKey = ['dispatch-matches', companySlug, kind, targetId] as const;
  const offersKey = ['dispatch-offers', companySlug, kind, targetId] as const;

  const matchesQuery = useQuery({
    queryKey: matchesKey,
    queryFn: ({ signal }) => dispatchApi.matches(companySlug, kind, targetId, signal),
  });
  const offersQuery = useQuery({
    queryKey: offersKey,
    queryFn: ({ signal }) => dispatchApi.offers(companySlug, kind, targetId, signal),
  });
  const catalogQuery = useQuery({
    queryKey: ['service-catalog', companySlug] as const,
    queryFn: ({ signal }) => serviceCatalogApi.list(companySlug, signal),
    staleTime: 5 * 60_000,
  });
  // Names + payout readiness for the assigned partner (same key as the partners list).
  const partnersQuery = useQuery({
    queryKey: ['partners', companySlug] as const,
    queryFn: ({ signal }) => partnersAdminApi.list(companySlug, signal),
    enabled: assignedPartnerId != null,
  });

  const [offerFor, setOfferFor] = useState<PartnerMatch | null>(null);
  const [assignFor, setAssignFor] = useState<PartnerMatch | null>(null);
  const [withdrawOffer, setWithdrawOffer] = useState<{ id: number; name: string } | null>(null);
  const [confirmUnassign, setConfirmUnassign] = useState(false);
  const [confirmPayout, setConfirmPayout] = useState(false);
  const [showOthers, setShowOthers] = useState(false);
  const [eligibleLimit, setEligibleLimit] = useState(ELIGIBLE_STEP);
  const [othersLimit, setOthersLimit] = useState(OTHERS_STEP);
  const now = useNow();

  async function refreshDispatch() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: matchesKey }),
      queryClient.invalidateQueries({ queryKey: offersKey }),
    ]);
  }

  const createOffer = useMutation({
    mutationFn: (vars: { match: PartnerMatch; expiresInHours: number; note: string }) =>
      dispatchApi.createOffer(companySlug, kind, targetId, {
        partnerId: vars.match.partnerId,
        expiresInHours: vars.expiresInHours,
        note: vars.note.trim() || undefined,
      }),
    onSuccess: async (_res, vars) => {
      setOfferFor(null);
      await refreshDispatch();
      toast.success(t('dispatch.offerSent', { partner: nameOf(vars.match) }));
    },
    onError: (err) => toast.error(errMessage(err), t('dispatch.offerFailed')),
  });

  const withdraw = useMutation({
    mutationFn: (offerId: number) => dispatchApi.withdraw(companySlug, offerId),
    onSuccess: async () => {
      setWithdrawOffer(null);
      await refreshDispatch();
      toast.success(t('dispatch.withdrawn'));
    },
    onError: (err) => toast.error(errMessage(err), t('dispatch.withdrawFailed')),
  });

  const assign = useMutation({
    mutationFn: (match: PartnerMatch) =>
      ordersAdminApi.assign(companySlug, targetId, match.partnerId),
    onSuccess: async (res, match) => {
      setAssignFor(null);
      await Promise.all([onAssignmentChange(), refreshDispatch()]);
      if (res.warning)
        toast({
          title: t('dispatch.assigned', { partner: nameOf(match) }),
          description: t('dispatch.payoutNotReady'),
        });
      else toast.success(t('dispatch.assigned', { partner: nameOf(match) }));
    },
    onError: (err) => toast.error(errMessage(err), t('dispatch.assignFailed')),
  });

  const unassign = useMutation({
    mutationFn: () => ordersAdminApi.unassign(companySlug, targetId),
    onSuccess: async () => {
      setConfirmUnassign(false);
      await Promise.all([onAssignmentChange(), refreshDispatch()]);
      toast.success(t('dispatch.unassigned'));
    },
    onError: (err) => toast.error(errMessage(err), t('dispatch.unassignFailed')),
  });

  const payout = useMutation({
    mutationFn: () => ordersAdminApi.payout(companySlug, targetId),
    onSuccess: async () => {
      setConfirmPayout(false);
      await onAssignmentChange();
      toast.success(t('dispatch.payoutDone'));
    },
    onError: async (err) => {
      setConfirmPayout(false);
      await onAssignmentChange();
      toast.error(errMessage(err), t('dispatch.payoutFailed'));
    },
  });

  function nameOf(p: { companyName: string | null; partnerId: number }): string {
    return p.companyName ?? t('dispatch.partnerFallback', { id: p.partnerId });
  }

  const matches = matchesQuery.data?.matches ?? [];
  const offers = offersQuery.data?.offers ?? [];
  const assigned = assignedPartnerId != null;
  if (matchesQuery.isLoading || offersQuery.isLoading) return null;
  if (
    !matchesQuery.isError &&
    !offersQuery.isError &&
    matches.length === 0 &&
    offers.length === 0 &&
    !assigned
  ) {
    return null;
  }

  const openOfferPartnerIds = new Set(
    offers.filter((o) => effectiveStatus(o.offer, now) === 'offered').map((o) => o.offer.partnerId),
  );
  const eligible = matches.filter((m) => m.eligible);
  const others = matches.filter((m) => !m.eligible).sort(byCloseness);
  const assignedPartner = assigned
    ? (partnersQuery.data?.partners.find((p) => p.id === assignedPartnerId) ?? null)
    : null;
  const assignedName =
    assignedPartner?.companyName ??
    offers.find((o) => o.offer.partnerId === assignedPartnerId)?.partnerCompanyName ??
    matches.find((m) => m.partnerId === assignedPartnerId)?.companyName ??
    t('dispatch.partnerFallback', { id: assignedPartnerId ?? 0 });
  const acceptedOffer = offers.find(
    (o) => o.offer.status === 'accepted' && o.offer.partnerId === assignedPartnerId,
  )?.offer;
  const showFinder = !assigned && !closed;
  const targetInfo = matchesQuery.data?.target;
  const serviceName = new Map(catalogQuery.data?.services.map((c) => [c.slug, c.name]) ?? []);

  const renderMatch = (m: PartnerMatch) => (
    <MatchRow
      key={m.partnerId}
      match={m}
      href={partnerHref(companySlug, m.partnerId)}
      name={nameOf(m)}
      hasOpenOffer={openOfferPartnerIds.has(m.partnerId)}
      canWrite={canWrite}
      canAssign={target.kind === 'orders'}
      onOffer={() => setOfferFor(m)}
      onAssign={() => setAssignFor(m)}
      bcp47={bcp47}
    />
  );

  return (
    <SectionCard
      title={t('dispatch.title')}
      description={
        targetInfo
          ? [
              targetInfo.plz
                ? t('dispatch.targetPlz', { plz: targetInfo.plz })
                : t('dispatch.targetNoPlz'),
              targetInfo.serviceSlugs
                ? t('dispatch.targetServices', {
                    services: targetInfo.serviceSlugs
                      .map((x) => serviceName.get(x) ?? x)
                      .join(', '),
                  })
                : t('dispatch.targetAnyService'),
            ].join(' · ')
          : undefined
      }
      bodyClassName="space-y-5"
    >
      {matchesQuery.isError || offersQuery.isError ? (
        <Alert tone="destructive">{t('dispatch.loadFailed')}</Alert>
      ) : null}

      {assignedPartnerId != null ? (
        <div className="space-y-3">
          <SectionLabel icon={<UserCheck aria-hidden="true" />}>
            {t('dispatch.assignedTitle')}
          </SectionLabel>
          <KeyValueList layout="grid">
            <KeyValue
              label={t('dispatch.partner')}
              value={
                <Link to={partnerHref(companySlug, assignedPartnerId)} className={TEXT_LINK}>
                  {assignedName}
                </Link>
              }
            />
            {target.kind === 'orders' && target.order.assignedAt ? (
              <KeyValue
                label={t('dispatch.assignedAt')}
                value={
                  <time className="tabular-nums" dateTime={target.order.assignedAt}>
                    {formatDateTime(target.order.assignedAt, bcp47)}
                  </time>
                }
              />
            ) : null}
            {target.kind === 'orders' ? (
              <OrderSplit order={target.order} bcp47={bcp47} />
            ) : acceptedOffer?.proposedPriceCents != null ? (
              <KeyValue
                label={t('dispatch.proposedPrice')}
                value={
                  <span className="tabular-nums">
                    {formatCurrency(acceptedOffer.proposedPriceCents / 100, 'EUR', bcp47)}
                  </span>
                }
              />
            ) : null}
          </KeyValueList>
          {target.kind === 'orders' ? (
            <OrderPayoutActions
              order={target.order}
              payoutReady={
                assignedPartner
                  ? assignedPartner.payoutsEnabled &&
                    assignedPartner.stripeConnectStatus === 'active'
                  : null
              }
              canWrite={canWrite}
              onPayout={() => setConfirmPayout(true)}
              onUnassign={() => setConfirmUnassign(true)}
              paying={payout.isPending}
              unassigning={unassign.isPending}
            />
          ) : null}
        </div>
      ) : null}

      {showFinder ? (
        <div className="space-y-2">
          <SectionLabel>{t('dispatch.findTitle')}</SectionLabel>
          {eligible.length > 0 ? (
            <MatchList
              matches={eligible}
              limit={eligibleLimit}
              onShowMore={() => setEligibleLimit((n) => n + ELIGIBLE_STEP)}
              renderRow={renderMatch}
            />
          ) : matches.length > 0 ? (
            <NoMatchSummary others={others} />
          ) : null}
          {others.length > 0 ? (
            <>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => setShowOthers((v) => !v)}
                aria-expanded={showOthers}
              >
                {showOthers
                  ? t('dispatch.hideIneligible')
                  : t('dispatch.showIneligible', { count: others.length })}
              </Button>
              {showOthers ? (
                <MatchList
                  matches={others}
                  limit={othersLimit}
                  onShowMore={() => setOthersLimit((n) => n + OTHERS_STEP)}
                  renderRow={renderMatch}
                />
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {closed && !assigned ? (
        <p className="text-2sm text-muted-foreground">{t('dispatch.closedHint')}</p>
      ) : null}

      {offers.length > 0 ? (
        <div className="space-y-2">
          <SectionLabel>{t('dispatch.offersTitle')}</SectionLabel>
          <ol className="space-y-3">
            {offers.map(({ offer, partnerCompanyName }) => {
              const status = effectiveStatus(offer, now);
              const name =
                partnerCompanyName ?? t('dispatch.partnerFallback', { id: offer.partnerId });
              return (
                <OfferEntry
                  key={offer.id}
                  offer={offer}
                  status={status}
                  name={name}
                  href={partnerHref(companySlug, offer.partnerId)}
                  canWithdraw={canWrite && offer.status === 'offered'}
                  onWithdraw={() => setWithdrawOffer({ id: offer.id, name })}
                  bcp47={bcp47}
                />
              );
            })}
          </ol>
        </div>
      ) : null}

      {offerFor ? (
        <OfferDialog
          partnerName={nameOf(offerFor)}
          isInquiry={kind === 'inquiries'}
          pending={createOffer.isPending}
          onClose={() => setOfferFor(null)}
          onSubmit={(expiresInHours, note) =>
            createOffer.mutate({ match: offerFor, expiresInHours, note })
          }
        />
      ) : null}

      <ConfirmDialog
        open={assignFor !== null}
        onOpenChange={(open) => !open && setAssignFor(null)}
        title={t('dispatch.assignTitle', { partner: assignFor ? nameOf(assignFor) : '' })}
        description={t('dispatch.assignBody')}
        confirmLabel={t('dispatch.assignDirect')}
        isPending={assign.isPending}
        onConfirm={() => assignFor && assign.mutate(assignFor)}
      />
      <ConfirmDialog
        open={withdrawOffer !== null}
        onOpenChange={(open) => !open && setWithdrawOffer(null)}
        title={t('dispatch.withdrawTitle')}
        description={t('dispatch.withdrawBody', { partner: withdrawOffer?.name ?? '' })}
        confirmLabel={t('dispatch.withdraw')}
        isDangerous
        isPending={withdraw.isPending}
        onConfirm={() => withdrawOffer && withdraw.mutate(withdrawOffer.id)}
      />
      <ConfirmDialog
        open={confirmUnassign}
        onOpenChange={setConfirmUnassign}
        title={t('dispatch.unassignTitle')}
        description={t('dispatch.unassignBody', { partner: assignedName })}
        confirmLabel={t('dispatch.unassignCta')}
        isDangerous
        isPending={unassign.isPending}
        onConfirm={() => unassign.mutate()}
      />
      {target.kind === 'orders' ? (
        <ConfirmDialog
          open={confirmPayout}
          onOpenChange={setConfirmPayout}
          title={t('dispatch.payoutTitle')}
          description={t('dispatch.payoutBody', {
            amount: formatCurrency((target.order.partnerPayoutCents ?? 0) / 100, 'EUR', bcp47),
            partner: assignedName,
          })}
          confirmLabel={t('dispatch.payoutCta')}
          isPending={payout.isPending}
          onConfirm={() => payout.mutate()}
        />
      ) : null}
    </SectionCard>
  );
}

function OrderSplit({ order, bcp47 }: { order: OrderRow; bcp47: string }) {
  const t = useT();
  const eur = (cents: number) => formatCurrency(cents / 100, 'EUR', bcp47);
  const rate =
    order.commissionCents != null && order.totalCents > 0
      ? Math.round((order.commissionCents / order.totalCents) * 10000) / 100
      : null;
  return (
    <>
      <KeyValue
        label={t('dispatch.orderTotal')}
        value={<span className="tabular-nums">{eur(order.totalCents)}</span>}
      />
      <KeyValue
        label={t('dispatch.commission')}
        empty="—"
        value={
          order.commissionCents != null ? (
            <span className="tabular-nums">
              {t('dispatch.commissionValue', {
                rate: rate == null ? '—' : rate.toLocaleString(bcp47),
                amount: eur(order.commissionCents),
              })}
            </span>
          ) : null
        }
      />
      <KeyValue
        label={t('dispatch.payoutAmount')}
        empty="—"
        value={
          order.partnerPayoutCents != null ? (
            <span className="font-medium tabular-nums">{eur(order.partnerPayoutCents)}</span>
          ) : null
        }
      />
      <KeyValue
        label={t('dispatch.payoutStatus')}
        value={
          <StatusBadge
            label={t(PAYOUT_LABEL[order.payoutStatus] ?? 'dispatch.payoutState.none')}
            tone={PAYOUT_TONE[order.payoutStatus] ?? 'neutral'}
          />
        }
      />
      {order.payoutAt ? (
        <KeyValue
          label={t('dispatch.payoutAt')}
          value={
            <time className="tabular-nums" dateTime={order.payoutAt}>
              {formatDateTime(order.payoutAt, bcp47)}
            </time>
          }
        />
      ) : null}
      {order.stripeTransferId ? (
        <KeyValue
          label={t('dispatch.transferId')}
          value={<span className="break-all font-mono text-xs">{order.stripeTransferId}</span>}
        />
      ) : null}
    </>
  );
}

function OrderPayoutActions({
  order,
  payoutReady,
  canWrite,
  onPayout,
  onUnassign,
  paying,
  unassigning,
}: {
  order: OrderRow;
  /** Null while the partner row is unknown. */
  payoutReady: boolean | null;
  canWrite: boolean;
  onPayout: () => void;
  onUnassign: () => void;
  paying: boolean;
  unassigning: boolean;
}) {
  const t = useT();
  const paid = order.payoutStatus === 'paid';
  const paypal = order.paymentProvider === 'paypal';
  return (
    <div className="space-y-2">
      {!paid && paypal ? (
        <Alert tone="info">{t('dispatch.payoutPaypal')}</Alert>
      ) : !paid && payoutReady === false ? (
        <Alert tone="warning">{t('dispatch.payoutNotReady')}</Alert>
      ) : null}
      {canWrite && !paid ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline-destructive"
            onClick={onUnassign}
            loading={unassigning}
            disabled={paying}
          >
            <Undo2 aria-hidden="true" />
            {t('dispatch.unassignCta')}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onPayout}
            loading={paying}
            disabled={
              unassigning || paypal || payoutReady === false || order.partnerPayoutCents == null
            }
          >
            <Wallet aria-hidden="true" />
            {t('dispatch.payoutCta')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function MatchList({
  matches,
  limit,
  onShowMore,
  renderRow,
}: {
  matches: PartnerMatch[];
  limit: number;
  onShowMore: () => void;
  renderRow: (m: PartnerMatch) => ReactNode;
}) {
  const t = useT();
  const rest = matches.length - limit;
  return (
    <div className="space-y-1">
      <ul className="divide-y divide-border rounded-md border border-border">
        {matches.slice(0, limit).map(renderRow)}
      </ul>
      {rest > 0 ? (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="text-muted-foreground"
          onClick={onShowMore}
        >
          {t('dispatch.showMore', { count: rest })}
        </Button>
      ) : null}
    </div>
  );
}

/** Why nobody fits, counted over all partners, plus where to fix it. */
function NoMatchSummary({ others }: { others: PartnerMatch[] }) {
  const t = useT();
  const counts = new Map<string, number>();
  for (const m of others) {
    for (const r of m.reasons) counts.set(reasonId(m, r), (counts.get(reasonId(m, r)) ?? 0) + 1);
  }
  const reasons = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => {
      const key = REASON_COUNT_KEY[id];
      return key ? t(key, { count }) : `${count} ${id}`;
    });
  return (
    <div className="space-y-1 rounded-md border border-dashed border-border-strong px-3 py-2.5">
      <p className="text-2sm font-medium text-foreground">{t('dispatch.noEligible')}</p>
      {reasons.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t('dispatch.whyNone', { total: others.length, reasons: reasons.join(' · ') })}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {t('dispatch.noEligibleHint')}{' '}
        <Link to="/partner" className={cn(TEXT_LINK, 'text-primary')}>
          {t('dispatch.managePartners')}
        </Link>
      </p>
    </div>
  );
}

function MatchRow({
  match,
  href,
  name,
  hasOpenOffer,
  canWrite,
  canAssign,
  onOffer,
  onAssign,
  bcp47,
}: {
  match: PartnerMatch;
  href: string;
  name: string;
  hasOpenOffer: boolean;
  canWrite: boolean;
  canAssign: boolean;
  onOffer: () => void;
  onAssign: () => void;
  bcp47: string;
}) {
  const t = useT();
  const active = !match.reasons.includes('not_active');
  const facts: ReactNode[] = [
    match.distanceKm != null
      ? t('dispatch.distance', {
          km: match.distanceKm.toLocaleString(bcp47, { maximumFractionDigits: 1 }),
        })
      : null,
    match.rating != null ? (
      <span className="inline-flex items-center gap-0.5">
        <Star className="size-3" aria-hidden="true" />
        <span className="sr-only">{t('dispatch.ratingLabel')}</span>
        {match.rating.toLocaleString(bcp47, { maximumFractionDigits: 1 })}
      </span>
    ) : null,
    match.openOffers > 0 ? t('dispatch.openOffers', { count: match.openOffers }) : null,
  ].filter(Boolean);
  const reasons = match.reasons.map((r) => {
    const id = reasonId(match, r);
    return id === r ? matchReasonLabel(t, r) : partnerStatusLabel(t, id);
  });
  return (
    <li className={cn('flex items-center gap-x-3 px-3 py-2', !match.eligible && 'bg-muted/40')}>
      <div className="min-w-0 flex-1">
        <Link to={href} className={cn(TEXT_LINK, 'block truncate text-2sm')}>
          {name}
        </Link>
        {facts.length > 0 || reasons.length > 0 ? (
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs tabular-nums text-muted-foreground">
            {facts.map((f, i) => (
              <Fragment key={i}>
                {i > 0 ? <span aria-hidden="true">·</span> : null}
                {f}
              </Fragment>
            ))}
            {reasons.length > 0 ? (
              <>
                {facts.length > 0 ? <span aria-hidden="true">·</span> : null}
                <span className="sr-only">{t('dispatch.reasonsLabel')}:</span>
                {reasons.join(' · ')}
              </>
            ) : null}
          </p>
        ) : null}
      </div>
      {canWrite && active ? (
        <div className="flex shrink-0 items-center gap-1">
          {hasOpenOffer ? (
            <Badge variant="info">{t('dispatch.offerOpen')}</Badge>
          ) : (
            <Button
              type="button"
              size="xs"
              variant={match.eligible ? 'default' : 'outline'}
              onClick={onOffer}
            >
              <Send aria-hidden="true" />
              {t('dispatch.offerCta')}
            </Button>
          )}
          {canAssign ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t('dispatch.moreFor', { name })}
                >
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onAssign}>
                  <UserCheck aria-hidden="true" />
                  {t('dispatch.assignDirect')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function OfferEntry({
  offer,
  status,
  name,
  href,
  canWithdraw,
  onWithdraw,
  bcp47,
}: {
  offer: PartnerOffer;
  status: PartnerOfferStatus;
  name: string;
  href: string;
  canWithdraw: boolean;
  onWithdraw: () => void;
  bcp47: string;
}) {
  const t = useT();
  const when = (iso: string) => formatDateTime(iso, bcp47);
  const meta = [
    t('dispatch.offeredAt', { date: when(offer.createdAt) }),
    status === 'offered' ? t('dispatch.expiresAt', { date: when(offer.expiresAt) }) : null,
    offer.respondedAt ? t('dispatch.respondedAt', { date: when(offer.respondedAt) }) : null,
    offer.distanceKm != null
      ? t('dispatch.distance', {
          km: offer.distanceKm.toLocaleString(bcp47, { maximumFractionDigits: 1 }),
        })
      : null,
  ].filter(Boolean);
  return (
    <li className="rounded-md border border-border px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Link to={href} className={cn(TEXT_LINK, 'min-w-0 text-2sm [overflow-wrap:anywhere]')}>
          {name}
        </Link>
        <StatusBadge label={offerStatusLabel(t, status)} tone={offerStatusTone(status)} />
        {canWithdraw ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="ml-auto text-muted-foreground"
            onClick={onWithdraw}
          >
            <Undo2 aria-hidden="true" />
            {t('dispatch.withdraw')}
          </Button>
        ) : null}
      </div>
      <p className="mt-1 text-xs tabular-nums text-muted-foreground">{meta.join(' · ')}</p>
      <dl className="mt-1.5 space-y-1 text-2sm empty:hidden">
        {offer.proposedPriceCents != null ? (
          <OfferFact label={t('dispatch.proposedPrice')}>
            <span className="font-medium tabular-nums">
              {formatCurrency(offer.proposedPriceCents / 100, 'EUR', bcp47)}
            </span>
          </OfferFact>
        ) : null}
        {offer.partnerNote ? (
          <OfferFact label={t('dispatch.partnerNote')}>{offer.partnerNote}</OfferFact>
        ) : null}
        {offer.declineReason ? (
          <OfferFact label={t('dispatch.declineReason')}>{offer.declineReason}</OfferFact>
        ) : null}
        {offer.note ? <OfferFact label={t('dispatch.adminNote')}>{offer.note}</OfferFact> : null}
      </dl>
    </li>
  );
}

function OfferFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-1.5">
      <dt className="text-muted-foreground">{label}:</dt>
      <dd className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function OfferDialog({
  partnerName,
  isInquiry,
  pending,
  onClose,
  onSubmit,
}: {
  partnerName: string;
  isInquiry: boolean;
  pending: boolean;
  onClose: () => void;
  onSubmit: (expiresInHours: number, note: string) => void;
}) {
  const t = useT();
  const [hours, setHours] = useState('24');
  const [note, setNote] = useState('');
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg" showClose={!pending}>
        <DialogHeader>
          <DialogTitle>
            {isInquiry ? t('dispatch.offerDialog.titleInquiry') : t('dispatch.offerDialog.title')}
          </DialogTitle>
          <DialogDescription>
            {t(
              isInquiry
                ? 'dispatch.offerDialog.descriptionInquiry'
                : 'dispatch.offerDialog.description',
              {
                partner: partnerName,
              },
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(Number(hours), note);
          }}
        >
          <FormField label={t('dispatch.offerDialog.expires')}>
            <Select
              value={hours}
              onValueChange={setHours}
              options={EXPIRY_HOURS.map((h) => ({
                value: String(h),
                label:
                  h % 24 === 0 && h >= 48
                    ? t('dispatch.offerDialog.days', { count: h / 24 })
                    : t('dispatch.offerDialog.hours', { count: h }),
              }))}
            />
          </FormField>
          <FormField
            label={t('dispatch.offerDialog.note')}
            hint={t('dispatch.offerDialog.noteHint')}
          >
            <Textarea
              rows={3}
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('dispatch.offerDialog.notePlaceholder')}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={pending}>
              <Send aria-hidden="true" />
              {t('dispatch.offerDialog.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
