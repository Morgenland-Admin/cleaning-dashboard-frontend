import { History } from 'lucide-react';

import { KeyValue, KeyValueList } from '@/components/key-value';
import { SectionCard } from '@/components/section';
import { useLocale, useT, type DictKey } from '@/i18n';
import { humanizeSlug } from '@/lib/use-order-kind-label';
import { formatDateTime } from '@/lib/utils';

import type { OrderRow } from '@/lib/api';

type Translate = ReturnType<typeof useT>;

const OLD_STATUS: Record<string, DictKey> = {
  PENDING: 'orders.legacy.oldStatus.pending',
  PAYMENT_PENDING: 'orders.legacy.oldStatus.paymentPending',
  ACCEPTED: 'orders.legacy.oldStatus.accepted',
  COMPLETED: 'orders.legacy.oldStatus.completed',
};

const DETAIL_LABEL: Record<string, DictKey> = {
  area: 'orders.legacy.detail.area',
  length: 'orders.legacy.detail.length',
  breadth: 'orders.legacy.detail.breadth',
  type: 'orders.legacy.detail.type',
  type_of: 'orders.legacy.detail.type',
};

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null;

/** Flat label/value pairs from the old order form; nested objects one level deep, deeper ones skipped. */
function detailPairs(t: Translate, details: unknown): Array<[string, string]> {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return [];
  const label = (key: string) => (DETAIL_LABEL[key] ? t(DETAIL_LABEL[key]) : humanizeSlug(key));
  const out: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
    const v = str(value);
    if (v) {
      out.push([label(key), v]);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [inner, innerValue] of Object.entries(value as Record<string, unknown>)) {
        const iv = str(innerValue);
        if (iv) out.push([label(inner), iv]);
      }
    }
  }
  return out;
}

function qnaPairs(qna: unknown): Array<[string, string]> {
  if (!Array.isArray(qna)) return [];
  return qna.flatMap((entry): Array<[string, string]> => {
    if (!entry || typeof entry !== 'object') return [];
    const q = str((entry as Record<string, unknown>).question);
    const a = str((entry as Record<string, unknown>).answer);
    return q && a ? [[q, a]] : [];
  });
}

/** What the old CLEANILO system knew about an imported order (`metadata.legacy` and friends). */
export function OrderLegacyCard({ order }: { order: OrderRow }) {
  const t = useT();
  const { bcp47 } = useLocale();
  const meta = order.metadata ?? {};
  const legacy = meta.legacy as Record<string, unknown> | undefined;
  if (!legacy || typeof legacy !== 'object') return null;

  const oldStatus = str(legacy.status);
  const dates = Array.isArray(meta.datesOfService)
    ? meta.datesOfService.flatMap((d) => {
        const s = str(d);
        return s && !Number.isNaN(Date.parse(s)) ? [s] : [];
      })
    : [];
  const pairs = [...detailPairs(t, meta.details), ...qnaPairs(meta.qna)];

  return (
    <SectionCard
      title={t('orders.legacy.title')}
      description={t('orders.legacy.description')}
      icon={<History />}
    >
      <KeyValueList layout="grid">
        <KeyValue label={t('orders.legacy.service')} value={str(meta.serviceName)} />
        <KeyValue
          label={t('orders.legacy.status')}
          value={oldStatus ? (OLD_STATUS[oldStatus] ? t(OLD_STATUS[oldStatus]) : oldStatus) : null}
        />
        <KeyValue label={t('orders.legacy.region')} value={str(meta.region)} />
        <KeyValue label={t('orders.legacy.address')} value={str(meta.fullAddress)} />
        <KeyValue
          label={t('orders.legacy.serviceDates')}
          value={
            dates.length > 0 ? (
              <span className="tabular-nums">
                {dates.map((d) => formatDateTime(d, bcp47)).join(' · ')}
              </span>
            ) : null
          }
        />
        {pairs.map(([label, value], i) => (
          <KeyValue key={`${i}:${label}`} label={label} value={value} />
        ))}
      </KeyValueList>
    </SectionCard>
  );
}
