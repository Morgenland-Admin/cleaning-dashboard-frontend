import {
  Archive,
  AtSign,
  Briefcase,
  Building2,
  CheckSquare,
  ClipboardList,
  Database,
  Layers,
  LayoutGrid,
  Mail,
  MapPin,
  MessageSquare,
  Newspaper,
  Percent,
  PhoneCall,
  Receipt,
  RefreshCcw,
  Send,
  Star,
  ShieldCheck,
  Tag,
  UserRound,
  Users,
} from 'lucide-react';

import type { DictKey } from '@/i18n';

/** Sidebar structure; the command palette offers the same pages. */
export type NavItem = {
  to: string;
  labelKey: DictKey;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
  live?: 'chat';
  /** Shows the brand view's untouched items of this kind. */
  inbox?: 'inquiry' | 'contact';
  adminOnly?: boolean;
  /** Hidden from viewers: the page has nothing for read-only users. */
  writeOnly?: boolean;
};

export type NavGroup = { labelKey?: DictKey; items: NavItem[] };

export const NAV: NavGroup[] = [
  { items: [{ to: '/', labelKey: 'nav.overview', icon: LayoutGrid, end: true }] },
  {
    labelKey: 'nav.groupOperations',
    items: [
      { to: '/auftraege', labelKey: 'nav.auftraege', icon: Briefcase },
      { to: '/inquiries', labelKey: 'nav.inquiries', icon: ClipboardList, inbox: 'inquiry' },
      { to: '/callbacks', labelKey: 'nav.callbacks', icon: PhoneCall },
      { to: '/contacts', labelKey: 'nav.contacts', icon: Mail, inbox: 'contact' },
      { to: '/tasks', labelKey: 'nav.tasks', icon: CheckSquare },
      { to: '/chat', labelKey: 'nav.chat', icon: MessageSquare, live: 'chat' },
    ],
  },
  {
    labelKey: 'nav.groupCustomers',
    items: [
      { to: '/customers', labelKey: 'nav.customers', icon: UserRound },
      { to: '/rechnungen', labelKey: 'nav.invoices', icon: Receipt },
      { to: '/abos', labelKey: 'nav.subscriptions', icon: RefreshCcw },
    ],
  },
  {
    labelKey: 'nav.groupMarketing',
    items: [
      { to: '/bewertungen', labelKey: 'nav.reviews', icon: Star },
      { to: '/blog', labelKey: 'nav.blog', icon: Newspaper },
      { to: '/newsletter', labelKey: 'nav.newsletter', icon: AtSign },
      { to: '/emails', labelKey: 'nav.emails', icon: Send },
    ],
  },
  {
    labelKey: 'nav.groupPlatform',
    items: [
      { to: '/partner', labelKey: 'nav.partner', icon: Users },
      { to: '/leistungskatalog', labelKey: 'nav.serviceCatalog', icon: Layers },
      { to: '/pricing', labelKey: 'nav.pricing', icon: Tag },
      { to: '/preis-anpassungen', labelKey: 'nav.priceAdjustments', icon: Percent },
      { to: '/staedte', labelKey: 'nav.cityStatus', icon: MapPin },
      { to: '/exports', labelKey: 'nav.exports', icon: Database, writeOnly: true },
      { to: '/altdaten', labelKey: 'nav.legacy', icon: Archive, adminOnly: true },
      { to: '/companies', labelKey: 'nav.companies', icon: Building2 },
      { to: '/users', labelKey: 'nav.users', icon: ShieldCheck, adminOnly: true },
    ],
  },
];
