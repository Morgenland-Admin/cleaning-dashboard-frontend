import type { ProjectId } from '@/contexts/project-context';

export interface StatCard {
  key: string;
  label: string;
  value: string;
  hint: string;
  tone: 'neutral' | 'rust' | 'positive' | 'warn';
  /** Sparkline values, normalized direction doesn't matter — the chart auto-scales. */
  spark: number[];
}

export interface PipelineStage {
  key: string;
  label: string;
  count: number;
  /** Bar fill 0–1 — used for the warm underline accent. */
  intensity: number;
}

export interface WorkflowRow {
  id: string;
  name: string;
  trigger: string;
  runs24h: number;
  avgSeconds: number;
  status: 'ok' | 'warn' | 'fail';
  statusLabel: string;
  statusDetail?: string;
}

export interface RunEvent {
  id: string;
  ref: string;
  title: string;
  detail: string;
  age: string;
  level: 'info' | 'warn' | 'fail' | 'ok';
}

export interface DashboardData {
  greetingSubtitle: string;
  stats: StatCard[];
  pipeline: PipelineStage[];
  workflows: WorkflowRow[];
  liveStream: RunEvent[];
}

function spark(seed: number, points = 18): number[] {
  const out: number[] = [];
  let v = seed;
  for (let i = 0; i < points; i++) {
    v += (Math.sin(seed + i * 0.7) + Math.cos(seed * 0.3 + i)) * (seed / 18);
    out.push(Math.max(0, v));
  }
  return out;
}

const cleanilo: DashboardData = {
  greetingSubtitle:
    '47 aktive Aufträge, 23 neue Leads heute Nacht. Vier Eskalationen warten auf dich.',
  stats: [
    {
      key: 'orders',
      label: 'Aktive Aufträge',
      value: '47',
      hint: '+12% · in Reinigung & Reparatur',
      tone: 'positive',
      spark: spark(60),
    },
    {
      key: 'revenue',
      label: 'Umsatz heute',
      value: '12 480 €',
      hint: '+€1.482 · ggü. Vortag',
      tone: 'warn',
      spark: spark(82),
    },
    {
      key: 'leads',
      label: 'Neue Leads',
      value: '23',
      hint: '5 hot · Webformular · 24 h',
      tone: 'neutral',
      spark: spark(45),
    },
    {
      key: 'escalations',
      label: 'Eskalationen',
      value: '4',
      hint: '1 critical · warten auf Reaktion',
      tone: 'rust',
      spark: spark(28),
    },
    {
      key: 'partners',
      label: 'Partner-Werkstätten',
      value: '847',
      hint: '+3 · aktiv im Netzwerk',
      tone: 'positive',
      spark: spark(150),
    },
  ],
  pipeline: [
    { key: 'leads', label: 'Leads', count: 184, intensity: 0.92 },
    { key: 'qualified', label: 'Qualifiziert', count: 92, intensity: 0.74 },
    { key: 'offer', label: 'Angebot', count: 67, intensity: 0.58 },
    { key: 'pickup', label: 'Abholung', count: 41, intensity: 0.42 },
    { key: 'work', label: 'In Arbeit', count: 47, intensity: 0.48 },
    { key: 'qc', label: 'Qualitätsprüfung', count: 12, intensity: 0.2 },
    { key: 'delivery', label: 'Auslieferung', count: 18, intensity: 0.26 },
    { key: 'invoiced', label: 'Fakturiert', count: 26, intensity: 0.34 },
  ],
  workflows: [
    {
      id: 'WF-014',
      name: 'Web-Lead → CRM → SMS-Bestätigung',
      trigger: 'Webhook · /lead',
      runs24h: 47,
      avgSeconds: 2.3,
      status: 'ok',
      statusLabel: 'Läuft',
    },
    {
      id: 'WF-021',
      name: 'Auftrag → Lexware → Rechnung',
      trigger: 'Cron · 06:00 / 18:00',
      runs24h: 12,
      avgSeconds: 8.1,
      status: 'ok',
      statusLabel: 'Läuft',
    },
    {
      id: 'WF-033',
      name: 'Reparatur-Foto → Vision → Schaden-Score',
      trigger: 'S3-Upload',
      runs24h: 23,
      avgSeconds: 11.4,
      status: 'warn',
      statusLabel: 'Warnung',
      statusDetail: '3 Timeouts bei Vision-API',
    },
    {
      id: 'WF-047',
      name: 'Abholung → Tour-Plan → Fahrer-SMS',
      trigger: 'Cron · 17:30',
      runs24h: 4,
      avgSeconds: 44,
      status: 'ok',
      statusLabel: 'Läuft',
    },
    {
      id: 'WF-061',
      name: 'IG cross-post',
      trigger: 'Cron · 09:00',
      runs24h: 3,
      avgSeconds: 6.2,
      status: 'fail',
      statusLabel: 'Fehler',
      statusDetail: 'Pinterest API · 401 Unauthorized',
    },
    {
      id: 'WF-072',
      name: 'Stripe-Payout → Buchhaltung',
      trigger: 'Webhook · /stripe',
      runs24h: 9,
      avgSeconds: 3.7,
      status: 'ok',
      statusLabel: 'Läuft',
    },
  ],
  liveStream: [
    {
      id: 'ev-1',
      ref: 'WF-061',
      title: 'IG cross-post',
      detail: 'Pinterest API: 401 Unauthorized — Token expired (refresh required)',
      age: '4 Min',
      level: 'fail',
    },
    {
      id: 'ev-2',
      ref: 'WF-033',
      title: 'Vision-Score',
      detail: 'Vision-API > 9 s · fallback auf Tier-2-Modell, Score: 0.84',
      age: '7 Min',
      level: 'warn',
    },
    {
      id: 'ev-3',
      ref: 'WF-014',
      title: 'Web-Lead',
      detail: 'Lead L-2031 (Müller, Hannover) → HubSpot · SMS verschickt',
      age: '11 Min',
      level: 'ok',
    },
    {
      id: 'ev-4',
      ref: 'WF-097',
      title: 'Backup',
      detail: 'S3 throughput < 50 MB/s · 6 m 28 s (Schwelle 6 m)',
      age: '28 Min',
      level: 'warn',
    },
    {
      id: 'ev-5',
      ref: 'WF-014',
      title: 'Web-Lead',
      detail: 'Lead L-2030 (Schmidt, München) → HubSpot · SMS verschickt',
      age: '34 Min',
      level: 'ok',
    },
    {
      id: 'ev-6',
      ref: 'WF-072',
      title: 'Stripe-Payout',
      detail: 'Auszahlung 8 412 € → DKB · Buchung gestellt',
      age: '41 Min',
      level: 'ok',
    },
  ],
};

const hamburg: DashboardData = {
  greetingSubtitle: '22 aktive Aufträge, 9 neue Leads heute Nacht. Eine Eskalation wartet.',
  stats: [
    {
      key: 'orders',
      label: 'Aktive Aufträge',
      value: '22',
      hint: '+4% · in Reinigung',
      tone: 'positive',
      spark: spark(40),
    },
    {
      key: 'revenue',
      label: 'Umsatz heute',
      value: '4 820 €',
      hint: '+€612 · ggü. Vortag',
      tone: 'warn',
      spark: spark(55),
    },
    {
      key: 'leads',
      label: 'Neue Leads',
      value: '9',
      hint: '2 hot · Webformular',
      tone: 'neutral',
      spark: spark(25),
    },
    {
      key: 'escalations',
      label: 'Eskalationen',
      value: '1',
      hint: 'warten auf Reaktion',
      tone: 'rust',
      spark: spark(12),
    },
    {
      key: 'partners',
      label: 'Eigenes Team',
      value: '8',
      hint: 'Vor-Ort + Werkstatt',
      tone: 'positive',
      spark: spark(30),
    },
  ],
  pipeline: [
    { key: 'leads', label: 'Leads', count: 64, intensity: 0.7 },
    { key: 'qualified', label: 'Qualifiziert', count: 38, intensity: 0.56 },
    { key: 'offer', label: 'Angebot', count: 22, intensity: 0.4 },
    { key: 'pickup', label: 'Abholung', count: 14, intensity: 0.3 },
    { key: 'work', label: 'In Arbeit', count: 19, intensity: 0.34 },
    { key: 'qc', label: 'Qualitätsprüfung', count: 5, intensity: 0.16 },
    { key: 'delivery', label: 'Auslieferung', count: 9, intensity: 0.22 },
    { key: 'invoiced', label: 'Fakturiert', count: 13, intensity: 0.28 },
  ],
  workflows: cleanilo.workflows.slice(0, 5),
  liveStream: cleanilo.liveStream.slice(0, 5),
};

const teppich: DashboardData = {
  greetingSubtitle: '14 Aufträge unterwegs, 12 neue Leads heute Nacht. Zwei Eskalationen warten.',
  stats: [
    {
      key: 'orders',
      label: 'Aktive Aufträge',
      value: '14',
      hint: '+8% · Abholung & Pickup',
      tone: 'positive',
      spark: spark(28),
    },
    {
      key: 'revenue',
      label: 'Umsatz heute',
      value: '3 240 €',
      hint: '+€420 · ggü. Vortag',
      tone: 'warn',
      spark: spark(38),
    },
    {
      key: 'leads',
      label: 'Neue Leads',
      value: '12',
      hint: '3 hot · Anthrazit-Funnel',
      tone: 'neutral',
      spark: spark(22),
    },
    {
      key: 'escalations',
      label: 'Eskalationen',
      value: '2',
      hint: 'warten auf Reaktion',
      tone: 'rust',
      spark: spark(8),
    },
    {
      key: 'partners',
      label: 'Partner aktiv',
      value: '210',
      hint: '+1 · Bundesweit',
      tone: 'positive',
      spark: spark(70),
    },
  ],
  pipeline: [
    { key: 'leads', label: 'Leads', count: 96, intensity: 0.78 },
    { key: 'qualified', label: 'Qualifiziert', count: 48, intensity: 0.6 },
    { key: 'offer', label: 'Angebot', count: 31, intensity: 0.46 },
    { key: 'pickup', label: 'Abholung', count: 18, intensity: 0.32 },
    { key: 'work', label: 'In Arbeit', count: 24, intensity: 0.38 },
    { key: 'qc', label: 'Qualitätsprüfung', count: 6, intensity: 0.18 },
    { key: 'delivery', label: 'Auslieferung', count: 11, intensity: 0.24 },
    { key: 'invoiced', label: 'Fakturiert', count: 17, intensity: 0.3 },
  ],
  workflows: cleanilo.workflows.slice(1, 6),
  liveStream: cleanilo.liveStream.slice(1, 6),
};

export const DASHBOARD_DATA: Record<ProjectId, DashboardData> = {
  cleanilo,
  'hamburg-teppichreinigung': hamburg,
  'teppichreinigen-lassen': teppich,
};
