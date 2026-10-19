import type { CompanySlug } from '@/contexts/project-context';

const RAW_API_URL = import.meta.env.VITE_API_URL;
if (import.meta.env.PROD && !RAW_API_URL) {
  throw new Error(
    'VITE_API_URL is required in production builds. Pass it as a Docker --build-arg.',
  );
}
const API_BASE = (RAW_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The backend's machine-readable `code` (e.g. STALE, NOT_READY), if any. */
export function apiErrorCode(err: unknown): string | null {
  if (!(err instanceof ApiError) || !err.body || typeof err.body !== 'object') return null;
  const code = (err.body as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

export function errMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

export type CsvImportRejectReason =
  | 'invalid_email'
  | 'duplicate'
  | 'own_domain'
  | 'system_address'
  | 'disposable_domain';

export interface CsvImportSummary {
  parsedRows: number;
  imported: number;
  skipped: number;
  byReason: Record<CsvImportRejectReason, number>;
  sampleRejects: Array<{
    email: string;
    firstName?: string;
    lastName?: string;
    line: number;
    reject?: CsvImportRejectReason;
  }>;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  companySlug?: CompanySlug;
  signal?: AbortSignal;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.companySlug) headers['X-Company-Slug'] = opts.companySlug;

  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: 'include',
    signal: opts.signal,
  });

  const text = await res.text();
  const parsed = text ? safeJson(text) : null;

  if (!res.ok) {
    const msg =
      (parsed && typeof parsed === 'object' && 'error' in parsed
        ? String((parsed as { error?: unknown }).error)
        : null) ??
      res.statusText ??
      `Request failed (${res.status})`;
    throw new ApiError(res.status, msg, parsed);
  }

  return parsed as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export type SearchKind = 'order' | 'customer' | 'inquiry' | 'contact' | 'invoice' | 'partner';

/** `href` is a dashboard path, already brand-scoped. */
export interface SearchHit {
  kind: SearchKind;
  companySlug: CompanySlug;
  companyName: string;
  id: number;
  /** '' when the row has no usable name. */
  title: string;
  subtitle: string | null;
  meta: string | null;
  href: string;
  /** Raw status slug (untranslated). */
  status?: string | null;
  orderKind?: string | null;
  /** Written by a data import (old-system history). */
  imported?: boolean;
}

export const searchApi = {
  /** No `X-Company-Slug`: the backend scopes by the caller's memberships. */
  query(q: string, signal?: AbortSignal) {
    const qs = new URLSearchParams({ q }).toString();
    return request<{ hits: SearchHit[]; query: string }>(`/admin/search?${qs}`, { signal });
  },
};

export type EmailKind =
  | 'password_reset'
  | 'invite'
  | 'task_assigned'
  | 'task_comment'
  | 'staff_notification'
  | 'contact_ack'
  | 'contact_reply'
  | 'inquiry_ack'
  | 'quote'
  | 'order_confirmation'
  | 'order_status'
  | 'order_message'
  | 'payment_request'
  | 'appointment_confirmed'
  | 'pickup_scheduling'
  | 'receipt'
  | 'invoice'
  | 'dunning'
  | 'newsletter_confirm'
  | 'customer_message'
  | 'partner_offer'
  | 'partner_assigned'
  | 'partner_document'
  | 'partner_application_ack'
  | 'partner_activated';

/** Our send call's result (Resend accepted it). */
export type EmailSendStatus = 'sending' | 'sent' | 'failed' | 'skipped' | 'blocked';
/** Resend's later report via the delivery webhook. */
export type EmailDeliveryStatus =
  | 'sent'
  | 'delivered'
  | 'delivery_delayed'
  | 'bounced'
  | 'complained'
  | 'failed'
  | 'suppressed';
export type EmailRefType =
  | 'order'
  | 'invoice'
  | 'inquiry'
  | 'contact'
  | 'task'
  | 'partner'
  | 'customer';
export type EmailStatusFilter = 'delivered' | 'opened' | 'problem' | 'not_sent';

export interface EmailLogRow {
  id: number;
  /** Null = platform mail with no brand (password reset). */
  companySlug: CompanySlug | null;
  companyName: string | null;
  kind: EmailKind;
  toAddress: string;
  subject: string;
  status: EmailSendStatus;
  deliveryStatus: EmailDeliveryStatus | null;
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  /** False when the body was not stored (it carried a reset/invite/opt-in link). */
  hasBody: boolean;
  attachmentCount: number;
  refType: EmailRefType | null;
  refId: number | null;
  createdAt: string;
}

export interface EmailLogEvent {
  type: string;
  at: string;
  detail?: string;
}

export interface EmailLogDetail extends EmailLogRow {
  fromAddress: string;
  replyTo: string | null;
  html: string | null;
  attachments: Array<{ filename: string; size: number }>;
  error: string | null;
  resendId: string | null;
  events: EmailLogEvent[];
  sentByName: string | null;
}

export interface EmailTracking {
  brands: Array<{ slug: CompanySlug; name: string; connected: boolean }>;
  /** super_admins only. */
  system: { connected: boolean } | null;
}

export const emailsAdminApi = {
  /** No `X-Company-Slug`: scope is the caller's brands; `brand` narrows ("system" = platform mail). */
  list(
    params: {
      brand?: CompanySlug | 'system';
      kind?: EmailKind;
      status?: EmailStatusFilter;
      q?: string;
      refType?: EmailRefType;
      refId?: number;
      limit?: number;
      cursor?: string;
    },
    signal?: AbortSignal,
  ) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') qs.set(key, String(value));
    }
    return request<{ emails: EmailLogRow[]; nextCursor: string | null }>(
      `/admin/emails?${qs.toString()}`,
      { signal },
    );
  },
  get(id: number, signal?: AbortSignal) {
    return request<{ email: EmailLogDetail }>(`/admin/emails/${id}`, { signal });
  },
  tracking(signal?: AbortSignal) {
    return request<EmailTracking>('/admin/emails/tracking', { signal });
  },
};

export type ContactStatus = 'new' | 'read' | 'replied' | 'archived';

export interface ContactMessage {
  id: number;
  customerId: number | null;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  locale: string;
  source: string | null;
  status: ContactStatus;
  priority: string;
  consentPrivacy: boolean;
  consentMarketing: boolean;
  handledByUserId: string | null;
  handledAt: string | null;
  repliedAt: string | null;
  internalNotes: string | null;
  metadata: Record<string, unknown>;
  attachments: Array<{ key: string; name: string; size: number; contentType?: string }>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactSubmitInput {
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  message: string;
  locale?: string;
  source?: string;
  consentPrivacy: true;
  consentMarketing?: boolean;
}

export type UserAudience = 'admin' | 'partner' | 'customer';
export type UserAccessLevel = 'super_admin' | 'admin' | 'manager' | 'seo' | 'viewer' | 'none';

export interface MeUser {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  phoneVerified: boolean;
  image: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  locale: string;
  timezone: string;
  audience: UserAudience;
  accessLevel: UserAccessLevel;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type UserGender = 'male' | 'female' | 'diverse' | 'prefer_not_to_say';

export interface ProfilePatch {
  name?: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  image?: string | null;
  locale?: string;
  timezone?: string;
  dateOfBirth?: string | null;
  gender?: UserGender | null;
}

export type AddressType = 'primary' | 'billing' | 'service' | 'shipping' | 'other';

export interface Address {
  id: number;
  userId: string;
  label: string | null;
  type: AddressType;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string;
  country: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AddressInput {
  label?: string | null;
  type?: AddressType;
  line1: string;
  line2?: string | null;
  city: string;
  region?: string | null;
  postalCode: string;
  country?: string;
  isDefault?: boolean;
}

export type AddressPatch = Partial<AddressInput>;

export type UserTheme = 'system' | 'light' | 'dark';

export interface UserSettings {
  userId: string;
  locale: string;
  theme: UserTheme;
  notificationsEmail: boolean;
  notificationsSms: boolean;
  marketingOptIn: boolean;
  updatedAt: string;
}

export interface SettingsPatch {
  locale?: string;
  theme?: UserTheme;
  notificationsEmail?: boolean;
  notificationsSms?: boolean;
  marketingOptIn?: boolean;
}

export interface MembershipRow {
  companySlug: CompanySlug;
  role: 'owner' | 'admin' | 'manager' | 'viewer' | 'partner';
  companyName: string | null;
  acceptedAt: string | null;
}

export const usersApi = {
  me(signal?: AbortSignal) {
    return request<{ user: MeUser }>('/admin/users/me', { signal });
  },
  updateMe(patch: ProfilePatch) {
    return request<{ user: MeUser }>('/admin/users/me', {
      method: 'PATCH',
      body: patch,
    });
  },
  memberships(signal?: AbortSignal) {
    return request<{ memberships: MembershipRow[] }>('/admin/users/me/memberships', { signal });
  },
  settings(signal?: AbortSignal) {
    return request<{ settings: UserSettings }>('/admin/users/me/settings', { signal });
  },
  updateSettings(patch: SettingsPatch) {
    return request<{ settings: UserSettings }>('/admin/users/me/settings', {
      method: 'PATCH',
      body: patch,
    });
  },
  addresses(signal?: AbortSignal) {
    return request<{ addresses: Address[] }>('/admin/users/me/addresses', {
      signal,
    });
  },
  createAddress(input: AddressInput) {
    return request<{ address: Address }>('/admin/users/me/addresses', {
      method: 'POST',
      body: input,
    });
  },
  updateAddress(id: number, patch: AddressPatch) {
    return request<{ address: Address }>(`/admin/users/me/addresses/${id}`, {
      method: 'PATCH',
      body: patch,
    });
  },
  deleteAddress(id: number) {
    return request<null>(`/admin/users/me/addresses/${id}`, {
      method: 'DELETE',
    });
  },
};

export type StaffAccessLevel = Exclude<UserAccessLevel, 'none'>;
export type StaffStatusFilter = 'active' | 'inactive' | 'all';

export interface StaffListRow {
  id: string;
  name: string;
  email: string;
  accessLevel: StaffAccessLevel;
  isActive: boolean;
  createdAt: string;
  lastSignInAt: string | null;
  lastActiveAt: string | null;
  companySlugs: CompanySlug[];
}

export interface StaffUser {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  accessLevel: StaffAccessLevel;
  isActive: boolean;
  internalNotes: string | null;
  createdAt: string;
  updatedAt: string;
  hasPassword?: boolean;
  invitedBy?: { id: string; name: string } | null;
}

export interface StaffSession {
  id: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface StaffDetail {
  user: StaffUser;
  memberships: Array<{
    companySlug: CompanySlug;
    companyName: string;
    role: MembershipRow['role'];
    acceptedAt: string | null;
  }>;
  sessions: StaffSession[];
  isSelf: boolean;
}

export interface StaffCreateInput {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  password: string;
  accessLevel: StaffAccessLevel;
  companySlugs: CompanySlug[];
  internalNotes?: string | null;
}

export type StaffUpdateInput = Partial<
  Omit<StaffCreateInput, 'email' | 'password'> & { isActive: boolean }
>;

/** Dashboard team accounts; super_admin/admin only (backend `/admin/staff`). */
export const staffApi = {
  list(
    params: { q?: string; status?: StaffStatusFilter; accessLevel?: StaffAccessLevel },
    signal?: AbortSignal,
  ) {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.status) qs.set('status', params.status);
    if (params.accessLevel) qs.set('accessLevel', params.accessLevel);
    return request<{ users: StaffListRow[]; counts: { active: number; inactive: number } }>(
      `/admin/staff?${qs.toString()}`,
      { signal },
    );
  },
  brands(signal?: AbortSignal) {
    return request<{ brands: Array<{ slug: CompanySlug; name: string }> }>('/admin/staff/brands', {
      signal,
    });
  },
  get(id: string, signal?: AbortSignal) {
    return request<StaffDetail>(`/admin/staff/${encodeURIComponent(id)}`, { signal });
  },
  create(input: StaffCreateInput) {
    return request<{ user: StaffUser }>('/admin/staff', { method: 'POST', body: input });
  },
  update(id: string, patch: StaffUpdateInput) {
    return request<{ user: StaffUser }>(`/admin/staff/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: patch,
    });
  },
  setPassword(id: string, password: string) {
    return request<{ ok: true }>(`/admin/staff/${encodeURIComponent(id)}/password`, {
      method: 'POST',
      body: { password },
    });
  },
  sendResetEmail(id: string) {
    return request<{ ok: true }>(`/admin/staff/${encodeURIComponent(id)}/reset-email`, {
      method: 'POST',
      body: {},
    });
  },
  signOutEverywhere(id: string) {
    return request<{ ok: true; revoked: number }>(
      `/admin/staff/${encodeURIComponent(id)}/sign-out`,
      { method: 'POST', body: {} },
    );
  },
};

export type PartnerStatus = 'pending' | 'active' | 'suspended' | 'rejected';

export interface Partner {
  id: number;
  userId: string;
  companyName: string | null;
  legalName: string | null;
  taxId: string | null;
  vatId: string | null;
  registrationNumber: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  websiteUrl: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  serviceAreas: string[];
  services: string[];
  iban: string | null;
  bic: string | null;
  /** Null = catalog default, else the platform 12 %. */
  commissionRate: string | null;
  lat: number | null;
  lng: number | null;
  serviceRadiusKm: number;
  stripeConnectStatus: string;
  payoutsEnabled: boolean;
  rating: string | null;
  ratingCount: number;
  contractVersion: string | null;
  contractAcceptedAt: string | null;
  status: PartnerStatus;
  approvedAt: string | null;
  approvedByUserId: string | null;
  suspendedAt: string | null;
  internalNotes: string | null;
  createdAt: string;
  updatedAt: string;
  /** List rows only: documents, profile and contract complete. */
  verified?: boolean;
}

export interface PartnerUpdate {
  status?: PartnerStatus;
  internalNotes?: string | null;
  companyName?: string;
  legalName?: string | null;
  taxId?: string | null;
  vatId?: string | null;
  registrationNumber?: string | null;
  contactEmail?: string;
  contactPhone?: string | null;
  websiteUrl?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  serviceRadiusKm?: number;
  services?: string[];
  iban?: string | null;
  bic?: string | null;
  commissionRate?: number | null;
}

export type PartnerDocumentKind =
  | 'gewerbeanmeldung'
  | 'haftpflicht'
  | 'handelsregister'
  | 'ausweis'
  | 'qualifikation'
  | 'sonstiges';
export type PartnerDocumentStatus = 'pending' | 'approved' | 'rejected';
export type PartnerDocumentState = 'missing' | 'pending' | 'approved' | 'rejected' | 'expired';

export interface PartnerDocument {
  id: number;
  partnerId: number;
  kind: PartnerDocumentKind;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  status: PartnerDocumentStatus;
  rejectionReason: string | null;
  /** "YYYY-MM-DD". */
  expiresAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface PartnerChecklist {
  profileComplete: boolean;
  servicesSet: boolean;
  locationSet: boolean;
  documents: Array<{ kind: PartnerDocumentKind; state: PartnerDocumentState }>;
  contract: { required: string | null; accepted: string | null; ok: boolean };
  payouts: { status: string; ok: boolean };
  verified: boolean;
  missing: string[];
}

export interface PartnerContractAcceptance {
  id: number;
  version: string;
  ipAddress: string | null;
  userAgent: string | null;
  acceptedAt: string;
}

export type PartnerOfferStatus = 'offered' | 'accepted' | 'declined' | 'expired' | 'withdrawn';

export interface PartnerDetailResponse {
  partner: Partner;
  checklist: PartnerChecklist;
  documents: PartnerDocument[];
  contractAcceptances: PartnerContractAcceptance[];
  offerStats: Partial<Record<PartnerOfferStatus, number>>;
  assignedOrders: number;
}

export interface DocumentReviewInput {
  status: 'approved' | 'rejected';
  rejectionReason?: string;
  expiresAt?: string | null;
}

export interface PartnerCreateInput {
  email: string;
  companyName: string;
  legalName?: string;
  contactPhone?: string;
  websiteUrl?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  services?: string[];
  serviceAreas?: string[];
  iban?: string;
  bic?: string;
  taxId?: string;
  vatId?: string;
  internalNotes?: string;
}

export const partnersAdminApi = {
  list(companySlug: CompanySlug, signal?: AbortSignal) {
    return request<{ partners: Partner[] }>('/admin/partners', {
      companySlug,
      signal,
    });
  },
  create(companySlug: CompanySlug, input: PartnerCreateInput) {
    return request<{ partner: Partner; userCreated: boolean }>('/admin/partners', {
      method: 'POST',
      companySlug,
      body: input,
    });
  },
  get(companySlug: CompanySlug, id: number, signal?: AbortSignal) {
    return request<PartnerDetailResponse>(`/admin/partners/${id}`, { companySlug, signal });
  },
  update(companySlug: CompanySlug, id: number, patch: PartnerUpdate) {
    return request<{ partner: Partner; checklist: PartnerChecklist }>(`/admin/partners/${id}`, {
      method: 'PATCH',
      companySlug,
      body: patch,
    });
  },
  documentDownload(companySlug: CompanySlug, id: number, docId: number) {
    return request<{ downloadUrl: string; expiresIn: number }>(
      `/admin/partners/${id}/documents/${docId}/download`,
      { companySlug },
    );
  },
  /** Mails the partner the outcome. */
  reviewDocument(companySlug: CompanySlug, id: number, docId: number, input: DocumentReviewInput) {
    return request<{ document: PartnerDocument }>(
      `/admin/partners/${id}/documents/${docId}/review`,
      { method: 'POST', companySlug, body: input },
    );
  },
};

export type PartnerApplicationStatus = 'new' | 'invited' | 'rejected';

export interface PartnerApplication {
  id: number;
  companyName: string;
  contactName: string;
  email: string;
  phone: string | null;
  websiteUrl: string | null;
  legalForm: string | null;
  postalCode: string;
  city: string | null;
  serviceRadiusKm: number;
  services: string[];
  employeeCount: string | null;
  message: string | null;
  status: PartnerApplicationStatus;
  rejectionReason: string | null;
  invitedAt: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
}

export const partnerApplicationsApi = {
  list(companySlug: CompanySlug, signal?: AbortSignal) {
    return request<{ applications: PartnerApplication[] }>('/admin/partner-applications', {
      companySlug,
      signal,
    });
  },
  get(companySlug: CompanySlug, id: number, signal?: AbortSignal) {
    return request<{ application: PartnerApplication }>(`/admin/partner-applications/${id}`, {
      companySlug,
      signal,
    });
  },
  /** Mails a branded portal invite; accepting it creates a pending partner. */
  invite(companySlug: CompanySlug, id: number) {
    return request<{ application: PartnerApplication; inviteExpiresAt: string }>(
      `/admin/partner-applications/${id}/invite`,
      { method: 'POST', companySlug, body: {} },
    );
  },
  reject(companySlug: CompanySlug, id: number, reason?: string) {
    return request<{ application: PartnerApplication }>(
      `/admin/partner-applications/${id}/reject`,
      { method: 'POST', companySlug, body: reason ? { reason } : {} },
    );
  },
};

export type ServicePricingMode = 'fixed' | 'inquiry';

export interface CatalogEntry {
  id: number;
  slug: string;
  name: string;
  category: string | null;
  pricingMode: ServicePricingMode;
  orderKind: string | null;
  description: string | null;
  commissionRate: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogEntryInput {
  name: string;
  category?: string | null;
  pricingMode?: ServicePricingMode;
  orderKind?: string | null;
  description?: string | null;
  commissionRate?: number | null;
  isActive?: boolean;
  sortOrder?: number;
}

export const serviceCatalogApi = {
  list(companySlug: CompanySlug, signal?: AbortSignal) {
    return request<{ services: CatalogEntry[] }>('/admin/service-catalog', { companySlug, signal });
  },
  create(companySlug: CompanySlug, input: CatalogEntryInput & { slug: string }) {
    return request<{ service: CatalogEntry }>('/admin/service-catalog', {
      method: 'POST',
      companySlug,
      body: input,
    });
  },
  /** The slug is immutable. */
  update(companySlug: CompanySlug, id: number, patch: Partial<CatalogEntryInput>) {
    return request<{ service: CatalogEntry }>(`/admin/service-catalog/${id}`, {
      method: 'PATCH',
      companySlug,
      body: patch,
    });
  },
};

export type DispatchTargetKind = 'orders' | 'inquiries';
export type MatchReason =
  | 'not_active'
  | 'not_verified'
  | 'no_location'
  | 'out_of_radius'
  | 'service_not_offered';

export interface PartnerMatch {
  partnerId: number;
  companyName: string | null;
  distanceKm: number | null;
  rating: number | null;
  openOffers: number;
  eligible: boolean;
  reasons: MatchReason[];
  /** Explains `not_active` (pending vs suspended); absent on older backends. */
  partnerStatus?: string;
}

export interface PartnerMatchResponse {
  target: { plz: string | null; serviceSlugs: string[] | null };
  matches: PartnerMatch[];
}

export interface PartnerOffer {
  id: number;
  partnerId: number;
  orderId: number | null;
  inquiryId: number | null;
  status: PartnerOfferStatus;
  note: string | null;
  expiresAt: string;
  distanceKm: number | null;
  respondedAt: string | null;
  declineReason: string | null;
  /** Inquiry offers: the partner's gross price proposal. */
  proposedPriceCents: number | null;
  partnerNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOfferInput {
  partnerId: number;
  expiresInHours: number;
  note?: string;
}

export const dispatchApi = {
  matches(companySlug: CompanySlug, kind: DispatchTargetKind, id: number, signal?: AbortSignal) {
    return request<PartnerMatchResponse>(`/admin/${kind}/${id}/partner-matches`, {
      companySlug,
      signal,
    });
  },
  offers(companySlug: CompanySlug, kind: DispatchTargetKind, id: number, signal?: AbortSignal) {
    return request<{ offers: Array<{ offer: PartnerOffer; partnerCompanyName: string | null }> }>(
      `/admin/${kind}/${id}/offers`,
      { companySlug, signal },
    );
  },
  /** Pushes and mails the partner. */
  createOffer(
    companySlug: CompanySlug,
    kind: DispatchTargetKind,
    id: number,
    input: CreateOfferInput,
  ) {
    return request<{ offer: PartnerOffer }>(`/admin/${kind}/${id}/offers`, {
      method: 'POST',
      companySlug,
      body: input,
    });
  },
  withdraw(companySlug: CompanySlug, offerId: number) {
    return request<{ offer: PartnerOffer }>(`/admin/partner-offers/${offerId}/withdraw`, {
      method: 'POST',
      companySlug,
      body: {},
    });
  },
};

export type InquiryStatus = 'new' | 'in_review' | 'quoted' | 'won' | 'lost';

/** 'human' = Hamburg area, 'ai' = warm-callback queue; set by backend geo-routing. */
export type CallbackOwner = 'human' | 'ai';

export interface ServiceInquiry {
  id: number;
  inquiryNumber: string;
  customerId: number | null;
  name: string;
  /** Null for voice-AI phone leads with no email on file. */
  email: string | null;
  phone: string | null;
  service: string | null;
  propertyDetails: string | null;
  preferredDate: string | null;
  budget: string | null;
  message: string;
  locale: string;
  source: string | null;
  status: InquiryStatus;
  priority: string;
  /** Service PLZ (where the cleaning happens); drives callback routing. */
  plz: string | null;
  callReason: string | null;
  /** Null = legacy. */
  callbackOwner: CallbackOwner | null;
  assignedTo: string | null;
  /** Set when a partner accepts a dispatch offer. */
  assignedPartnerId: number | null;
  consentPrivacy: boolean;
  consentMarketing: boolean;
  handledByUserId: string | null;
  handledAt: string | null;
  quotedAt: string | null;
  quotedAmount: string | null;
  closedAt: string | null;
  internalNotes: string | null;
  metadata: Record<string, unknown>;
  attachments: Array<{ key: string; name: string; size: number; contentType?: string }>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InquirySubmitInput {
  name: string;
  email: string;
  phone?: string;
  service?: string;
  propertyDetails?: string;
  preferredDate?: string;
  budget?: string;
  message: string;
  locale?: string;
  source?: string;
  metadata?: Record<string, unknown>;
  consentPrivacy: true;
  consentMarketing?: boolean;
}

export interface InquiryUpdate {
  status?: InquiryStatus;
  priority?: 'normal' | 'high';
  email?: string | null;
  phone?: string | null;
  internalNotes?: string | null;
  quotedAmount?: string | null;
}

export type InquiryEmailStatus = 'sent' | 'skipped' | 'failed';

export interface InquiryEmail {
  id: number;
  inquiryId: number;
  kind: string;
  toAddress: string;
  subject: string;
  html: string;
  quotedAmount: string | null;
  status: InquiryEmailStatus;
  emailMessageId: string | null;
  sentByUserId: string | null;
  sentByName: string | null;
  createdAt: string;
}

export interface InquiryQuoteInput {
  body: string;
  quotedAmount?: string | null;
}

export interface HumanCallbackEntry {
  id: number;
  name: string;
  phone: string | null;
  /** Null for voice-AI phone leads with no email on file. */
  email: string | null;
  callReason: string | null;
  plz: string | null;
  service: string | null;
  message: string;
  status: InquiryStatus;
  assignedTo: string | null;
  priority: string;
  createdAt: string;
  brand: CompanySlug;
  flag: string;
}

/** Server-side list filters shared by the inquiry and contact inboxes; `source: '_none'` = rows without a source. */
export interface InboxListFilters {
  status?: string;
  q?: string;
  source?: string;
}

/** Keys are raw DB values, so imported or future statuses/sources show up too. */
export interface InboxCounts {
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
}

function inboxParams(opts: InboxListFilters & { limit?: number; cursor?: string | null }) {
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.status) params.set('status', opts.status);
  if (opts.q) params.set('q', opts.q);
  if (opts.source) params.set('source', opts.source);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const inquiriesApi = {
  submit(companySlug: CompanySlug, input: InquirySubmitInput) {
    return request<{ ok: true; inquiry: ServiceInquiry }>('/storefront/inquiries', {
      method: 'POST',
      companySlug,
      body: input,
    });
  },
  list(
    companySlug: CompanySlug,
    opts: InboxListFilters & { limit?: number; cursor?: string | null } = {},
    signal?: AbortSignal,
  ) {
    return request<{ inquiries: ServiceInquiry[]; nextCursor: string | null }>(
      `/admin/inquiries${inboxParams(opts)}`,
      { companySlug, signal },
    );
  },
  counts(companySlug: CompanySlug, opts: InboxListFilters = {}, signal?: AbortSignal) {
    return request<InboxCounts>(`/admin/inquiries/counts${inboxParams(opts)}`, {
      companySlug,
      signal,
    });
  },
  get(companySlug: CompanySlug, id: number, signal?: AbortSignal) {
    return request<{ inquiry: ServiceInquiry | null }>(`/admin/inquiries/${id}`, {
      companySlug,
      signal,
    });
  },
  update(companySlug: CompanySlug, id: number, patch: InquiryUpdate) {
    return request<{ inquiry: ServiceInquiry }>(`/admin/inquiries/${id}`, {
      method: 'PATCH',
      companySlug,
      body: patch,
    });
  },
  /** Flips status to 'quoted' server-side. */
  sendQuote(companySlug: CompanySlug, id: number, input: InquiryQuoteInput) {
    return request<{ ok: true; inquiry: ServiceInquiry }>(`/admin/inquiries/${id}/quote`, {
      method: 'POST',
      companySlug,
      body: input,
    });
  },
  emails(companySlug: CompanySlug, id: number, signal?: AbortSignal) {
    return request<{ emails: InquiryEmail[] }>(`/admin/inquiries/${id}/emails`, {
      companySlug,
      signal,
    });
  },
  /** AI-owned leads stay in the AI queue. */
  humanCallbackQueue(
    companySlug: CompanySlug,
    opts: {
      limit?: number;
      cursor?: string | null;
      assignedTo?: string;
      includeClosed?: boolean;
    } = {},
    signal?: AbortSignal,
  ) {
    const params = new URLSearchParams();
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    if (opts.cursor) params.set('cursor', opts.cursor);
    if (opts.assignedTo) params.set('assignedTo', opts.assignedTo);
    if (opts.includeClosed) params.set('includeClosed', 'true');
    const qs = params.toString();
    // `total` is only computed for the first page (no cursor).
    return request<{
      inquiries: HumanCallbackEntry[];
      nextCursor: string | null;
      total: number | null;
    }>(`/admin/inquiries/human-callback-queue${qs ? `?${qs}` : ''}`, { companySlug, signal });
  },
};

// XHR rather than fetch: only XHR reports upload progress.
function putFile(url: string, file: File, onProgress?: (fraction: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error('Upload failed (network)'));
    xhr.send(file);
  });
}

export const uploadsAdminApi = {
  /** Short-lived presigned GET URL. Keys are company-scoped: another tenant's key gets 403. */
  signDownload(companySlug: CompanySlug, key: string, signal?: AbortSignal) {
    const qs = new URLSearchParams({ key }).toString();
    return request<{ downloadUrl: string; expiresIn: number }>(
      `/admin/uploads/sign-download?${qs}`,
      { companySlug, signal },
    );
  },
  /** Two-step: presigned PUT URL from the backend, then the browser streams the file straight to S3. */
  async uploadDirect(
    companySlug: CompanySlug,
    file: File,
    opts: { folder?: 'inquiries' | 'receipts'; onProgress?: (fraction: number) => void } = {},
  ) {
    const sign = await request<{ uploadUrl: string; key: string }>('/admin/uploads/sign-upload', {
      method: 'POST',
      body: {
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
        ...(opts.folder ? { folder: opts.folder } : {}),
      },
      companySlug,
    });
    await putFile(sign.uploadUrl, file, opts.onProgress);
    return {
      key: sign.key,
      name: file.name,
      size: file.size,
      contentType: file.type || undefined,
    };
  },
};

export type OrderStatus =
  | 'pending'
  | 'payment_pending'
  | 'paid'
  | 'accepted'
  | 'picked_up'
  | 'in_cleaning'
  | 'ready'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'partially_refunded'
  | 'refunded';

export type OrderTransitionStatus = Exclude<OrderStatus, 'pending' | 'payment_pending' | 'paid'>;

export interface OrderRow {
  id: number;
  customerId: number | null;
  orderNumber: string;
  publicToken: string;
  /** One of OrderKind for new orders; imported orders carry any service-catalog slug. */
  kind: string;
  status: OrderStatus;
  currency: string;
  subtotalCents: number;
  pickupFeeCents: number;
  minOrderTopUpCents: number;
  totalCents: number;
  pickupMode: 'pickup' | 'drop_off' | 'onsite';
  pickupZone: number | null;
  pickupPlz: string | null;
  pickupLabel: string | null;
  preferredDate: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  addressCity: string | null;
  addressPostalCode: string | null;
  addressCountry: string | null;
  customerNotes: string | null;
  internalNotes: string | null;
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  /** PayPal orders settle in the PayPal account, not Stripe. */
  paymentProvider: 'stripe' | 'paypal';
  paypalOrderId: string | null;
  paypalCaptureId: string | null;
  /** 'upfront' = paid at checkout, 'after_service' = paid after the job. */
  paymentMode: 'upfront' | 'after_service';
  paymentMethod: 'cash' | 'ec_card' | 'credit_card' | null;
  paidAt: string | null;
  assignedPartnerId: number | null;
  assignedAt: string | null;
  commissionCents: number | null;
  partnerPayoutCents: number | null;
  payoutStatus: 'none' | 'pending' | 'paid' | 'failed';
  stripeTransferId: string | null;
  payoutAt: string | null;
  acceptedAt: string | null;
  pickedUpAt: string | null;
  inCleaningAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  refundedAt: string | null;
  consentPrivacy: boolean;
  consentMarketing: boolean;
  locale: string;
  source: string | null;
  metadata: {
    /** Up to 3 proposed slots, "YYYY-MM-DDTHH:mm" (Berlin wall-clock). */
    preferredSlots?: string[];
    confirmedSlot?: string;
    calendly?: CalendlyPickupMeta;
    receipt?: {
      savedAt?: string;
      history?: Array<{ sentAt: string; sentByName: string | null; totalCents: number }>;
    };
    messages?: Array<{
      body: string;
      sentByName: string | null;
      sentByUserId?: string;
      sentAt: string;
      emailMessageId?: string | null;
    }>;
    [key: string]: unknown;
  } | null;
  createdAt: string;
  updatedAt: string;
}

// Pickups book into the one CLEANILO Calendly account for every brand (the only brand-sharing exception);
// `booked` means it is on the CLEANILO Google Calendar.
export interface CalendlyPickupMeta {
  status: 'booked' | 'link_sent' | 'cancelled' | 'failed';
  /** Berlin wall-clock "YYYY-MM-DDTHH:mm". */
  slot?: string | null;
  startTime?: string | null;
  eventUri?: string | null;
  inviteeUri?: string | null;
  cancelUrl?: string | null;
  rescheduleUrl?: string | null;
  bookingUrl?: string | null;
  source: 'dashboard' | 'webhook';
  error?: string | null;
  updatedAt: string;
}

export interface CalendlyConfirmResult {
  /** False when the server has no Calendly credentials: nothing was attempted. */
  configured: boolean;
  booked: boolean;
  slotUnavailable: boolean;
  error: string | null;
}

export interface OrderItem {
  id: number;
  code: string;
  label: string;
  quantityLabel: string;
  quantity: string;
  unitPriceCents: number;
  subtotalCents: number;
  metadata: {
    lengthCm?: number;
    widthCm?: number;
    tagNumber?: string;
    condition?: string;
    photos?: ReceiptPhoto[];
    /** Per-m² extra belonging to the position before it. */
    addon?: boolean;
    [key: string]: unknown;
  } | null;
}

export interface OrderStatusLogEntry {
  id: number;
  fromStatus: string | null;
  toStatus: string;
  changedByUserId: string | null;
  reason: string | null;
  createdAt: string;
}

export interface OrderListResponse {
  orders: OrderRow[];
  nextCursor: string | null;
}

export interface OrderListFilter {
  status?: OrderStatus;
  view?: 'open' | 'closed';
  q?: string;
}

/** Row count per status value, as stored (unknown values included). */
export interface StatusCounts {
  counts: Partial<Record<string, number>>;
}

function orderListQuery(opts: OrderListFilter & { limit?: number }): URLSearchParams {
  const qs = new URLSearchParams();
  if (opts.limit) qs.set('limit', String(opts.limit));
  if (opts.status) qs.set('status', opts.status);
  else if (opts.view) qs.set('view', opts.view);
  if (opts.q) qs.set('q', opts.q);
  return qs;
}

export interface OrderListAllResponse {
  orders: Array<OrderRow & { companySlug: CompanySlug; companyName: string }>;
  nextCursor: null;
}

export interface OrderInvoiceSummary {
  id: number;
  number: string | null;
  status: InvoiceStatus;
  totalCents: number;
  currency: string;
  issuedAt: string | null;
  dueAt: string | null;
}

export interface OrderDetailResponse {
  order: OrderRow;
  items: OrderItem[];
  statusLog: OrderStatusLogEntry[];
  allowedNextStatuses: OrderStatus[];
  invoice: OrderInvoiceSummary | null;
}

export interface ReceiptPhoto {
  key: string;
  name?: string;
  contentType?: string;
  size?: number;
}

/** With both dimensions set the backend prices by area (L × W) and ignores `quantity`; extras take the same area. */
export interface ReceiptDraftItem {
  code: string;
  label: string;
  quantity: number;
  quantityLabel?: string;
  unitPriceCents: number;
  lengthCm?: number;
  widthCm?: number;
  tagNumber?: string;
  condition?: string;
  photos: ReceiptPhoto[];
  addons: Array<{ code: string; label: string; unitPriceCents: number }>;
}

export interface ReceiptDraft {
  handover: 'pickup' | 'drop_off';
  /** Berlin wall-clock "YYYY-MM-DDTHH:mm". */
  receivedAt: string;
  pickupFeeCents: number;
  note?: string;
  items: ReceiptDraftItem[];
}

/** 'advance' moves the order to picked_up on send; 'resend' sends a corrected copy. */
export type ReceiptStatusAction = 'advance' | 'resend';

export interface ReceiptTotals {
  itemsCents: number;
  pickupFeeCents: number;
  minOrderTopUpCents: number;
  discountCents: number;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
}

export interface ReceiptContext {
  draft: ReceiptDraft;
  /** Null when a receipt does not apply (on-site job, unpaid, delivered …). */
  statusAction: ReceiptStatusAction | null;
  paidCents: number;
  minOrderCents: number;
  discountCents: number;
  voucherCode: string | null;
  /** Set when the order total can no longer change (invoice issued / partner paid). */
  moneyLockReason: string | null;
  invoice: { id: number; status: InvoiceStatus; number: string | null } | null;
  savedAt: string | null;
  history: Array<{
    sentAt: string;
    sentByName: string | null;
    totalCents: number;
    statusAction: ReceiptStatusAction;
  }>;
}

export interface ReceiptSaveResult {
  order: OrderRow;
  totals: ReceiptTotals;
  deltaCents: number;
  invoiceDraftStale: boolean;
}

export interface ReceiptPreview extends Omit<ReceiptSaveResult, 'order'> {
  to: string;
  subject: string;
  html: string;
  pdfBase64: string;
  filename: string;
  statusAction: ReceiptStatusAction;
  moneyLockReason: string | null;
}

export interface ReceiptSendResult extends ReceiptSaveResult {
  /** False when no mail key is configured: nothing was sent. */
  emailed: boolean;
  statusChanged: boolean;
}

export type OrderKind =
  | 'teppichreinigung'
  | 'teppichreparatur'
  | 'polsterreinigung'
  | 'teppichbodenreinigung';

/** Total is recomputed server-side from items. */
export interface OrderCreateInput {
  kind: OrderKind;
  customer: { name: string; email: string; phone?: string };
  items: Array<{
    code?: string;
    label: string;
    quantityLabel: string;
    quantity: number;
    unitPriceCents: number;
  }>;
  pickupMode?: 'pickup' | 'drop_off' | 'onsite';
  address?: { line1: string; line2?: string; city: string; postalCode: string; country?: string };
  preferredDate?: string;
  customerNotes?: string;
  internalNotes?: string;
}

export const ordersAdminApi = {
  /** `view`: open = in flight, closed = completed/cancelled/refunded; a `status` wins over it. */
  list(
    companySlug: CompanySlug,
    opts: OrderListFilter & { limit?: number; cursor?: string } = {},
    signal?: AbortSignal,
  ) {
    const qs = orderListQuery(opts);
    if (opts.cursor) qs.set('cursor', opts.cursor);
    return request<OrderListResponse>(`/admin/orders?${qs.toString()}`, {
      companySlug,
      signal,
    });
  },
  /** No `X-Company-Slug`: aggregates all active tenants. No cross-tenant cursor yet; `limit` caps at 200. */
  listAllCompanies(opts: OrderListFilter & { limit?: number } = {}, signal?: AbortSignal) {
    const search = orderListQuery(opts).toString();
    return request<OrderListAllResponse>(`/admin/orders/all${search ? `?${search}` : ''}`, {
      signal,
    });
  },
  /** Orders per status, narrowed by the list's search. */
  counts(companySlug: CompanySlug, opts: { q?: string } = {}, signal?: AbortSignal) {
    const qs = opts.q ? `?${new URLSearchParams({ q: opts.q })}` : '';
    return request<StatusCounts>(`/admin/orders/counts${qs}`, { companySlug, signal });
  },
  countsAllCompanies(opts: { q?: string } = {}, signal?: AbortSignal) {
    const qs = opts.q ? `?${new URLSearchParams({ q: opts.q })}` : '';
    return request<StatusCounts>(`/admin/orders/all/counts${qs}`, { signal });
  },
  get(companySlug: CompanySlug, id: number, signal?: AbortSignal) {
    return request<OrderDetailResponse>(`/admin/orders/${id}`, { companySlug, signal });
  },
  /** Creates a DRAFT only (never issues) so positions stay editable. Idempotent: an existing invoice returns created:false. */
  createInvoice(companySlug: CompanySlug, id: number) {
    return request<{ invoice: OrderInvoiceSummary; created: boolean }>(
      `/admin/orders/${id}/invoice`,
      { method: 'POST', companySlug, body: {} },
    );
  },
  getReceipt(companySlug: CompanySlug, id: number, signal?: AbortSignal) {
    return request<ReceiptContext>(`/admin/orders/${id}/receipt`, { companySlug, signal });
  },
  /** Writes nothing. */
  previewReceipt(companySlug: CompanySlug, id: number, draft: ReceiptDraft) {
    return request<ReceiptPreview>(`/admin/orders/${id}/receipt/preview`, {
      method: 'POST',
      body: { draft },
      companySlug,
    });
  },
  saveReceipt(companySlug: CompanySlug, id: number, draft: ReceiptDraft) {
    return request<ReceiptSaveResult>(`/admin/orders/${id}/receipt`, {
      method: 'POST',
      body: { draft },
      companySlug,
    });
  },
  /** Saves, emails the receipt with PDF, and moves the order to picked_up. */
  sendReceipt(companySlug: CompanySlug, id: number, draft: ReceiptDraft) {
    return request<ReceiptSendResult>(`/admin/orders/${id}/receipt/send`, {
      method: 'POST',
      body: { draft },
      companySlug,
    });
  },
  create(companySlug: CompanySlug, input: OrderCreateInput) {
    return request<{ order: OrderRow }>('/admin/orders', {
      method: 'POST',
      body: input,
      companySlug,
    });
  },
  transition(
    companySlug: CompanySlug,
    id: number,
    body: { toStatus: OrderTransitionStatus; reason?: string },
  ) {
    return request<{ order: OrderRow }>(`/admin/orders/${id}/transition`, {
      method: 'POST',
      body,
      companySlug,
    });
  },
  updateNotes(companySlug: CompanySlug, id: number, internalNotes: string | null) {
    return request<{ order: OrderRow }>(`/admin/orders/${id}/notes`, {
      method: 'PATCH',
      body: { internalNotes },
      companySlug,
    });
  },
  /** Also books the slot into the CLEANILO Calendly; `calendly.booked` says whether that worked, the order stands either way. */
  confirmAppointment(companySlug: CompanySlug, id: number, slot: string) {
    return request<{ order: OrderRow; calendly: CalendlyConfirmResult }>(
      `/admin/orders/${id}/confirm-appointment`,
      {
        method: 'POST',
        body: { slot },
        companySlug,
      },
    );
  },
  /** Fallback: single-use CLEANILO scheduling link, emailed to the customer by default. */
  sendPickupBookingLink(companySlug: CompanySlug, id: number, send = true) {
    return request<{ order: OrderRow; bookingUrl: string; emailed: boolean }>(
      `/admin/orders/${id}/pickup-booking-link`,
      {
        method: 'POST',
        body: { send },
        companySlug,
      },
    );
  },
  proposeSlots(companySlug: CompanySlug, id: number, slots: string[]) {
    return request<{ order: OrderRow }>(`/admin/orders/${id}/propose-slots`, {
      method: 'POST',
      body: { slots },
      companySlug,
    });
  },
  sendMessage(companySlug: CompanySlug, id: number, body: string) {
    return request<{ order: OrderRow }>(`/admin/orders/${id}/message`, {
      method: 'POST',
      body: { body },
      companySlug,
    });
  },
  /** Recovers an order stuck in `payment_pending` after a missed webhook by re-fetching the Stripe Checkout Session. */
  syncStripe(companySlug: CompanySlug, id: number) {
    return request<{
      order: OrderRow | null;
      stripe: { sessionStatus: string; paymentStatus: string };
      action: 'marked_paid' | 'marked_cancelled' | 'still_pending' | 'noop';
    }>(`/admin/orders/${id}/sync-stripe`, {
      method: 'POST',
      companySlug,
    });
  },
  /** In-person payment for a pay-after-service order; marks it paid immediately. */
  recordPayment(companySlug: CompanySlug, id: number, method: 'cash' | 'ec_card') {
    return request<{ order: OrderRow }>(`/admin/orders/${id}/record-payment`, {
      method: 'POST',
      body: { method },
      companySlug,
    });
  },
  /** Stripe card payment link for an after-service order, emailed to the customer and returned for manual sharing. */
  createPaymentLink(companySlug: CompanySlug, id: number) {
    return request<{ checkoutUrl: string | null }>(`/admin/orders/${id}/payment-link`, {
      method: 'POST',
      companySlug,
    });
  },
  /** Direct assignment (no offer); notifies the partner. */
  assign(companySlug: CompanySlug, id: number, partnerId: number) {
    return request<{
      order: OrderRow;
      commission: { ratePercent: number; commissionCents: number; partnerPayoutCents: number };
      payoutReady: boolean;
      warning: string | null;
    }>(`/admin/orders/${id}/assign`, { method: 'POST', companySlug, body: { partnerId } });
  },
  unassign(companySlug: CompanySlug, id: number) {
    return request<{ order: OrderRow }>(`/admin/orders/${id}/unassign`, {
      method: 'POST',
      companySlug,
      body: {},
    });
  },
  /** Stripe Connect transfer of the partner share. */
  payout(companySlug: CompanySlug, id: number) {
    return request<{ order: OrderRow; transferId: string; payoutCents: number }>(
      `/admin/orders/${id}/payout`,
      { method: 'POST', companySlug, body: {} },
    );
  },
};

export interface NewsletterSubscriber {
  id: number;
  customerId: number | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  locale: string;
  source: string | null;
  tags: string[];
  confirmed: boolean;
  confirmedAt: string | null;
  unsubscribedAt: string | null;
  lastEmailSentAt: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatAttachment {
  key: string;
  name: string;
  size: number;
  contentType?: string;
}

export interface ChatMessage {
  id: number;
  conversationId: number;
  senderUserId: string;
  senderRole: 'admin' | 'partner';
  body: string | null;
  attachments: ChatAttachment[];
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
  /** The colleague who wrote an admin message; null for the old system. */
  senderName?: string | null;
}

export interface ChatThreadPage {
  conversation: { id: number };
  messages: ChatMessage[];
  hasMore: boolean;
}

export interface ChatConversation {
  /** Null until the first message creates the conversation row. */
  id: number | null;
  partnerId: number;
  partnerUserId: string;
  partnerCompanyName: string | null;
  partnerContactEmail: string | null;
  partnerContactPhone?: string | null;
  partnerName: string | null;
  partnerEmail: string | null;
  /** The login account's phone; the profile's contact phone wins. */
  partnerPhone?: string | null;
  partnerStatus: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadForAdmin: number;
  createdAt: string | null;
}

export const chatAdminApi = {
  conversations(companySlug: CompanySlug, signal?: AbortSignal) {
    return request<{ conversations: ChatConversation[] }>('/admin/chat/conversations', {
      signal,
      companySlug,
    });
  },
  /** Newest page first; pass `before` (a message id) for older pages. */
  messages(
    companySlug: CompanySlug,
    partnerUserId: string,
    opts: { before?: number; signal?: AbortSignal } = {},
  ) {
    const qs = opts.before ? `?${new URLSearchParams({ before: String(opts.before) })}` : '';
    return request<ChatThreadPage>(
      `/admin/chat/conversations/${encodeURIComponent(partnerUserId)}/messages${qs}`,
      { signal: opts.signal, companySlug },
    );
  },
  send(
    companySlug: CompanySlug,
    partnerUserId: string,
    body: { body?: string; attachments?: ChatAttachment[] },
  ) {
    return request<{ message: ChatMessage }>(
      `/admin/chat/conversations/${encodeURIComponent(partnerUserId)}/messages`,
      { method: 'POST', body, companySlug },
    );
  },
  markRead(companySlug: CompanySlug, partnerUserId: string) {
    return request<null>(`/admin/chat/conversations/${encodeURIComponent(partnerUserId)}/read`, {
      method: 'POST',
      body: {},
      companySlug,
    });
  },
  setTyping(companySlug: CompanySlug, partnerUserId: string, isTyping: boolean) {
    return request<null>(`/admin/chat/conversations/${encodeURIComponent(partnerUserId)}/typing`, {
      method: 'POST',
      body: { isTyping },
      companySlug,
    });
  },
};

export type NewsletterStatus = 'confirmed' | 'pending' | 'unsubscribed';

export type NewsletterCounts = Record<NewsletterStatus | 'all', number>;

export const newsletterAdminApi = {
  /** `counts` (per status, for the current search) comes with the first page only. */
  list(
    companySlug: CompanySlug,
    opts: {
      limit?: number;
      cursor?: string | null;
      status?: NewsletterStatus;
      q?: string;
    } = {},
    signal?: AbortSignal,
  ) {
    const params = new URLSearchParams();
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    if (opts.cursor) params.set('cursor', opts.cursor);
    if (opts.status) params.set('status', opts.status);
    if (opts.q) params.set('q', opts.q);
    const qs = params.toString();
    return request<{
      subscribers: NewsletterSubscriber[];
      nextCursor: string | null;
      counts: NewsletterCounts | null;
    }>(`/admin/newsletter${qs ? `?${qs}` : ''}`, {
      companySlug,
      signal,
    });
  },
  delete(companySlug: CompanySlug, id: number) {
    return request<null>(`/admin/newsletter/${id}`, {
      method: 'DELETE',
      companySlug,
    });
  },
  /** `dryRun: true` returns the summary without writing. */
  import(
    companySlug: CompanySlug,
    body: { csv: string; dryRun?: boolean; tag?: string; source?: string; attestConsent?: boolean },
  ) {
    return request<{
      summary: NewsletterImportSummary;
      dryRun: boolean;
    }>('/admin/newsletter/import', {
      method: 'POST',
      companySlug,
      body,
    });
  },
};

export type NewsletterRejectReason = CsvImportRejectReason;
export type NewsletterImportSummary = CsvImportSummary;

export type LoyaltyTier = 'neukunde' | 'stammkunde' | 'premium';

export type CustomerType = 'private' | 'business';
export type CustomerSalutation = 'herr' | 'frau' | 'divers' | 'firma';
export type CustomerLanguage = 'de' | 'en';
export type CustomerChannel = 'email' | 'phone' | 'whatsapp' | 'post';
export type CustomerAddressKind = 'billing' | 'service' | 'shipping';

export interface Customer {
  id: number;
  email: string;
  name: string | null;
  phone: string | null;
  customerType: CustomerType;
  salutation: CustomerSalutation | null;
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  language: CustomerLanguage | null;
  preferredChannel: CustomerChannel | null;
  companyName: string | null;
  vatId: string | null;
  taxNumber: string | null;
  customerNumber: string | null;
  externalNumber: string | null;
  jobPosition: string | null;
  department: string | null;
  website: string | null;
  /** Mirror of the default address row, kept in sync by the API. */
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  totalOrders: number;
  totalSpentCents: number;
  loyaltyTier: LoyaltyTier;
  tags: string[];
  internalNotes: string | null;
  defaultPaymentTermsDays: number | null;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  marketingOptIn: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Empty strings clear a field server-side. */
export interface CustomerProfileInput {
  name?: string | null;
  phone?: string | null;
  customerType?: CustomerType;
  salutation?: CustomerSalutation | null;
  firstName?: string | null;
  lastName?: string | null;
  dateOfBirth?: string | null;
  language?: CustomerLanguage | null;
  preferredChannel?: CustomerChannel | null;
  companyName?: string | null;
  vatId?: string | null;
  taxNumber?: string | null;
  customerNumber?: string | null;
  externalNumber?: string | null;
  jobPosition?: string | null;
  department?: string | null;
  website?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  loyaltyTier?: LoyaltyTier;
  tags?: string[];
  internalNotes?: string | null;
  marketingOptIn?: boolean;
  defaultPaymentTermsDays?: number | null;
}

export interface CustomerCreateInput extends CustomerProfileInput {
  email: string;
}

export interface CustomerUpdateInput extends CustomerProfileInput {
  email?: string;
}

export interface CustomerAddress {
  id: number;
  customerId: number;
  kind: CustomerAddressKind;
  isDefault: boolean;
  label: string | null;
  name: string | null;
  company: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerAddressInput {
  kind?: CustomerAddressKind;
  isDefault?: boolean;
  label?: string | null;
  name?: string | null;
  company?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  notes?: string | null;
}

export type NewsletterProfileStatus = 'confirmed' | 'pending' | 'unsubscribed' | 'none';

export interface CustomerOverviewStats {
  orders: number;
  paidOrders: number;
  lifetimeSpentCents: number;
  invoices: number;
  issuedInvoices: number;
  invoicedCents: number;
  openInvoices: number;
  openInvoicedCents: number;
  overdueInvoices: number;
  inquiries: number;
  openInquiries: number;
  contacts: number;
  emails: number;
  newsletterStatus: NewsletterProfileStatus;
}

/** Linked orders/invoices/inquiries/contacts/emails page separately via `customersAdminApi.linked*`. */
export interface CustomerOverview {
  customer: Customer;
  addresses: CustomerAddress[];
  newsletter: NewsletterSubscriber | null;
  stats: CustomerOverviewStats;
}

export interface CustomerLinkedRows {
  orders: OrderRow;
  invoices: InvoiceRow;
  inquiries: ServiceInquiry;
  contacts: ContactMessage;
}

export type CustomerLinkedKind = keyof CustomerLinkedRows;

export interface CustomerEmailInput {
  subject: string;
  body: string;
}

export interface CustomerEmailPreview {
  to: string;
  from: string;
  replyTo: string | null;
  subject: string;
  html: string;
}

export type CustomerRejectReason = CsvImportRejectReason;
export type CustomerImportSummary = CsvImportSummary;

export interface CustomerListParams {
  limit?: number;
  cursor?: string | null;
  tier?: LoyaltyTier;
  email?: string;
  q?: string;
}

export const customersAdminApi = {
  list(companySlug: CompanySlug, params: CustomerListParams = {}, signal?: AbortSignal) {
    const qs = new URLSearchParams();
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.cursor) qs.set('cursor', params.cursor);
    if (params.tier) qs.set('tier', params.tier);
    if (params.email) qs.set('email', params.email);
    if (params.q) qs.set('q', params.q);
    const suffix = qs.toString();
    return request<{ customers: Customer[]; nextCursor: string | null }>(
      `/admin/customers${suffix ? `?${suffix}` : ''}`,
      { companySlug, signal },
    );
  },
  get(companySlug: CompanySlug, id: number, signal?: AbortSignal) {
    return request<{ customer: Customer }>(`/admin/customers/${id}`, { companySlug, signal });
  },
  overview(companySlug: CompanySlug, id: number, signal?: AbortSignal) {
    return request<CustomerOverview>(`/admin/customers/${id}/overview`, { companySlug, signal });
  },
  create(companySlug: CompanySlug, input: CustomerCreateInput) {
    return request<{ customer: Customer }>('/admin/customers', {
      method: 'POST',
      companySlug,
      body: input,
    });
  },
  update(companySlug: CompanySlug, id: number, patch: CustomerUpdateInput) {
    return request<{ customer: Customer }>(`/admin/customers/${id}`, {
      method: 'PATCH',
      companySlug,
      body: patch,
    });
  },
  delete(companySlug: CompanySlug, id: number) {
    return request<null>(`/admin/customers/${id}`, { method: 'DELETE', companySlug });
  },
  /** One page of the customer's linked records, newest first. */
  linked<K extends CustomerLinkedKind>(
    companySlug: CompanySlug,
    id: number,
    kind: K,
    params: { limit?: number; cursor?: string | null } = {},
    signal?: AbortSignal,
  ) {
    const qs = new URLSearchParams();
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.cursor) qs.set('cursor', params.cursor);
    return request<{ nextCursor: string | null } & Record<K, CustomerLinkedRows[K][]>>(
      `/admin/customers/${id}/${kind}?${qs.toString()}`,
      { companySlug, signal },
    );
  },
  /** Mail to the customer's address or about one of their records, newest first. */
  emails(
    companySlug: CompanySlug,
    id: number,
    params: { limit?: number; cursor?: string | null } = {},
    signal?: AbortSignal,
  ) {
    const qs = new URLSearchParams();
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.cursor) qs.set('cursor', params.cursor);
    return request<{ emails: EmailLogRow[]; nextCursor: string | null }>(
      `/admin/customers/${id}/emails?${qs.toString()}`,
      { companySlug, signal },
    );
  },
  /** Renders the branded mail without sending. */
  previewEmail(companySlug: CompanySlug, id: number, body: CustomerEmailInput) {
    return request<CustomerEmailPreview>(`/admin/customers/${id}/email/preview`, {
      method: 'POST',
      companySlug,
      body,
    });
  },
  /** `skipped`: logged but not handed to Resend (no API key configured). */
  sendEmail(companySlug: CompanySlug, id: number, body: CustomerEmailInput) {
    return request<{ ok: true; skipped: boolean }>(`/admin/customers/${id}/email`, {
      method: 'POST',
      companySlug,
      body,
    });
  },
  recomputeTier(companySlug: CompanySlug, id: number) {
    return request<{ customer: Customer }>(`/admin/customers/${id}/recompute-tier`, {
      method: 'POST',
      companySlug,
      body: {},
    });
  },
  listAddresses(companySlug: CompanySlug, id: number, signal?: AbortSignal) {
    return request<{ addresses: CustomerAddress[] }>(`/admin/customers/${id}/addresses`, {
      companySlug,
      signal,
    });
  },
  createAddress(companySlug: CompanySlug, id: number, body: CustomerAddressInput) {
    return request<{ address: CustomerAddress }>(`/admin/customers/${id}/addresses`, {
      method: 'POST',
      companySlug,
      body,
    });
  },
  updateAddress(
    companySlug: CompanySlug,
    id: number,
    addressId: number,
    body: CustomerAddressInput,
  ) {
    return request<{ address: CustomerAddress }>(`/admin/customers/${id}/addresses/${addressId}`, {
      method: 'PATCH',
      companySlug,
      body,
    });
  },
  setDefaultAddress(companySlug: CompanySlug, id: number, addressId: number) {
    return request<{ addresses: CustomerAddress[] }>(
      `/admin/customers/${id}/addresses/${addressId}/default`,
      { method: 'POST', companySlug, body: {} },
    );
  },
  deleteAddress(companySlug: CompanySlug, id: number, addressId: number) {
    return request<null>(`/admin/customers/${id}/addresses/${addressId}`, {
      method: 'DELETE',
      companySlug,
    });
  },
  /** `dryRun: true` returns the summary without writing. */
  import(
    companySlug: CompanySlug,
    body: { csv: string; dryRun?: boolean; marketingOptIn?: boolean },
  ) {
    return request<{ summary: CustomerImportSummary; dryRun: boolean }>('/admin/customers/import', {
      method: 'POST',
      companySlug,
      body,
    });
  },
};

export interface ContactReply {
  id: number;
  contactMessageId: number;
  body: string;
  sentByUserId: string | null;
  sentByName: string | null;
  emailMessageId: string | null;
  createdAt: string;
}

export interface CompanyRow {
  slug: string;
  name: string;
  schemaName: string;
  keyPrefix?: string;
  storefrontOrigin?: string | null;
  senderEmail?: string | null;
  senderName?: string | null;
  email?: string | null;
  websiteUrl?: string | null;
  primaryColor?: string | null;
  isActive?: boolean;
  createdAt?: string;
}

export interface CreateCompanyInput {
  slug: string;
  name: string;
  schemaName?: string;
  keyPrefix?: string;
  storefrontOrigin?: string;
  senderEmail?: string;
  senderName?: string;
  email?: string;
  websiteUrl?: string;
  primaryColor?: string;
  logoUrl?: string;
}

export interface CompanyListRow {
  slug: string;
  name: string;
  legalName: string | null;
  schemaName: string;
  email: string | null;
  phone: string | null;
  websiteUrl: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  vatId: string | null;
  registrationNumber: string | null;
  businessId: string | null;
  legalForm: string | null;
  managingDirectors: string | null;
  chamber: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  /** Seed-owned, read-only over the API; only the fields the dashboard shows are typed. */
  emailSignature: { signOff?: string | null; signatory?: string | null } | null;
  senderEmail: string | null;
  senderName: string | null;
  storefrontOrigin: string | null;
  /** Off = a paid order's automatic invoice stops at a draft instead of issuing and emailing. */
  autoIssueInvoices: boolean;
  isActive: boolean;
  role: string;
}

export interface CompanyUpdateInput {
  name?: string;
  legalName?: string | null;
  email?: string | null;
  phone?: string | null;
  websiteUrl?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
  vatId?: string | null;
  registrationNumber?: string | null;
  businessId?: string | null;
  legalForm?: string | null;
  managingDirectors?: string | null;
  chamber?: string | null;
  primaryColor?: string | null;
  logoUrl?: string | null;
  senderEmail?: string | null;
  senderName?: string | null;
  storefrontOrigin?: string | null;
  autoIssueInvoices?: boolean;
  isActive?: boolean;
}

export interface CompanyStats {
  newsletter: { confirmed: number; pending: number; unsubscribed: number };
  contact: { total: number; new: number; last7Days: number };
  inquiry: { total: number; openCount: number; last7Days: number };
}

export const companiesAdminApi = {
  list(signal?: AbortSignal) {
    return request<{ companies: CompanyListRow[] }>('/admin/companies', { signal });
  },
  create(input: CreateCompanyInput) {
    return request<{ company: CompanyRow }>('/admin/companies', {
      method: 'POST',
      body: input,
    });
  },
  update(slug: string, patch: CompanyUpdateInput) {
    return request<{ company: CompanyRow }>(`/admin/companies/${slug}`, {
      method: 'PATCH',
      body: patch,
    });
  },
  stats(slug: string, signal?: AbortSignal) {
    return request<{ stats: CompanyStats }>(`/admin/companies/${slug}/stats`, { signal });
  },
};

export interface DashboardBrandStats {
  slug: string;
  name: string;
  newsletter: { confirmed: number; pending: number; unsubscribed: number };
  contact: { total: number; new: number; last7Days: number };
  inquiry: {
    total: number;
    openCount: number;
    last7Days: number;
    new?: number;
    channels?: InquiryChannelCounts;
    humanCallbacks?: number;
  };
  orders?: { open: number; today: number; last7Days: number };
  invoices?: { overdue: number; draft: number };
  partnerApplications?: { new: number };
  chat?: { unread: number };
  tasks?: { open: number };
}

export type DashboardActivityKind = 'contact' | 'inquiry' | 'newsletter' | 'order';
export interface DashboardActivityItem {
  id: string;
  kind: DashboardActivityKind;
  companySlug: string;
  companyName: string;
  rowId: number;
  /** '' when the row has no usable name. */
  title: string;
  subtitle: string | null;
  orderKind?: string;
  createdAt: string;
}

export interface DashboardSummary {
  brands: DashboardBrandStats[];
  activity: DashboardActivityItem[];
}

export const dashboardAdminApi = {
  summary(signal?: AbortSignal) {
    return request<DashboardSummary>('/admin/dashboard/summary', { signal });
  },
};

export type NotificationKind = 'contact' | 'inquiry';
/** How an inquiry arrived: voice-AI phone lead, inbound e-mail or a web form. */
export type InquiryChannel = 'phone' | 'email' | 'web';
export type InquiryChannelCounts = Record<InquiryChannel, number>;

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  companySlug: string;
  companyName: string;
  rowId: number;
  /** '' when the sender left no usable name. */
  title: string;
  message: string;
  channel?: InquiryChannel | null;
  createdAt: string;
}

export interface NotificationBrandCounts {
  slug: string;
  name: string;
  count: number;
  inquiry?: number;
  contact?: number;
  channels?: InquiryChannelCounts;
  latestAt?: string | null;
}

/** Untouched (`new`) inquiries and contact messages; imported history never counts. */
export interface NotificationsUnreadResponse {
  count: number;
  latestAt?: string | null;
  byKind?: { inquiry: number; contact: number };
  inquiryChannels?: InquiryChannelCounts;
  byBrand: NotificationBrandCounts[];
}

export const notificationsAdminApi = {
  unreadCount(signal?: AbortSignal) {
    return request<NotificationsUnreadResponse>('/admin/notifications/unread-count', { signal });
  },
  list(limit = 20, signal?: AbortSignal, brand?: CompanySlug | null) {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (brand) qs.set('brand', brand);
    return request<{ items: NotificationItem[] }>(`/admin/notifications?${qs.toString()}`, {
      signal,
    });
  },
};

export interface InviteCreateInput {
  email: string;
  companySlug: string;
  role?: 'owner' | 'admin' | 'manager' | 'viewer' | 'partner';
  audience?: 'admin' | 'partner';
  accessLevel?: UserAccessLevel;
  /** Only honoured when audience=partner. */
  partner?: {
    companyName: string;
    contactPhone?: string;
    websiteUrl?: string;
    city?: string;
    postalCode?: string;
  };
}

export interface InviteDetails {
  email: string;
  companyName: string | null;
  companySlug: string;
  role: string;
  invitedByName: string;
  expiresAt: string;
}

export interface InviteAcceptInput {
  token: string;
  password: string;
  firstName: string;
  lastName?: string;
}

export const invitesAdminApi = {
  create(input: InviteCreateInput) {
    return request<{
      invite: { email: string; companySlug: string; role: string; expiresAt: string };
    }>('/admin/invites', { method: 'POST', body: input });
  },
};

export const invitesPublicApi = {
  lookup(token: string, signal?: AbortSignal) {
    const qs = new URLSearchParams({ token }).toString();
    return request<{ invite: InviteDetails }>(`/storefront/invites?${qs}`, { signal });
  },
  accept(input: InviteAcceptInput) {
    return request<{ ok: true; companySlug: string }>('/storefront/invites/accept', {
      method: 'POST',
      body: input,
    });
  },
};

// Backend loads the source record by refId; we send kind + id (+ draft/instruction).

export type AiAssistKind =
  | 'contact_reply'
  | 'review_response'
  | 'inquiry_note'
  | 'inquiry_quote'
  | 'order_message';

export interface AiAssistInput {
  kind: AiAssistKind;
  refId: number;
  current?: string;
  instruction?: string; // takes priority
  fresh?: boolean; // ignores `current`
}

export interface ExtractedOfferItem {
  label: string;
  quantity: number;
  /** Gross, in euros; null when the text names no price. */
  unitPriceGross: number | null;
}

export interface AiPrompt {
  kind: AiAssistKind;
  body: string;
  defaultBody: string;
  /** Appended on every call; not editable. */
  lockedRules: string;
  isCustom: boolean;
  updatedAt: string | null;
  /** Replaces {{brand}} at call time. */
  brand: string;
}

export const aiApi = {
  assist(companySlug: CompanySlug, input: AiAssistInput, signal?: AbortSignal) {
    return request<{ text: string }>('/admin/ai/assist', {
      method: 'POST',
      companySlug,
      body: input,
      signal,
    });
  },
  extractOfferItems(
    companySlug: CompanySlug,
    refId: number,
    current?: string,
    signal?: AbortSignal,
  ) {
    return request<{ items: ExtractedOfferItem[] }>('/admin/ai/extract-offer-items', {
      method: 'POST',
      companySlug,
      body: { refId, current },
      signal,
    });
  },
  prompts(companySlug: CompanySlug, signal?: AbortSignal) {
    return request<{ prompts: AiPrompt[] }>('/admin/ai/prompts', { companySlug, signal });
  },
  /** Saving the unchanged default clears the override. */
  savePrompt(companySlug: CompanySlug, kind: AiAssistKind, body: string) {
    return request<{ kind: AiAssistKind; isCustom: boolean; body: string }>(
      `/admin/ai/prompts/${kind}`,
      { method: 'PATCH', companySlug, body: { body } },
    );
  },
  resetPrompt(companySlug: CompanySlug, kind: AiAssistKind) {
    return request<{ kind: AiAssistKind; isCustom: boolean; body: string }>(
      `/admin/ai/prompts/${kind}`,
      { method: 'DELETE', companySlug },
    );
  },
};

export const contactApi = {
  submit(companySlug: CompanySlug, input: ContactSubmitInput) {
    return request<{ ok: true; message: ContactMessage }>('/storefront/contact', {
      method: 'POST',
      companySlug,
      body: input,
    });
  },

  list(
    companySlug: CompanySlug,
    opts: InboxListFilters & { limit?: number; cursor?: string | null } = {},
    signal?: AbortSignal,
  ) {
    return request<{ messages: ContactMessage[]; nextCursor: string | null }>(
      `/admin/contact${inboxParams(opts)}`,
      { companySlug, signal },
    );
  },

  counts(companySlug: CompanySlug, opts: InboxListFilters = {}, signal?: AbortSignal) {
    return request<InboxCounts>(`/admin/contact/counts${inboxParams(opts)}`, {
      companySlug,
      signal,
    });
  },

  get(companySlug: CompanySlug, id: number, signal?: AbortSignal) {
    return request<{ message: ContactMessage | null; replies: ContactReply[] }>(
      `/admin/contact/${id}`,
      { companySlug, signal },
    );
  },

  updateStatus(companySlug: CompanySlug, id: number, status: ContactStatus) {
    return request<{ message: ContactMessage }>(`/admin/contact/${id}`, {
      method: 'PATCH',
      companySlug,
      body: { status },
    });
  },

  reply(companySlug: CompanySlug, id: number, body: string) {
    return request<{
      ok: true;
      reply: ContactReply;
      message: ContactMessage;
    }>(`/admin/contact/${id}/reply`, {
      method: 'POST',
      companySlug,
      body: { body },
    });
  },
};

// Read-only here; edits live in backend `src/lib/price-books/<slug>.ts`.

export type CatalogServiceKind =
  | 'teppichreinigung'
  | 'teppichreparatur'
  | 'polsterreinigung'
  | 'teppichbodenreinigung';

export type CatalogUnit = 'qm' | 'lfdm' | 'stueck' | 'bracket';

export interface CatalogTier {
  code: string;
  label: string;
  /** Bracket services (unit: 'bracket'): `0` and to be ignored; read `brackets[].pricesCents[tierCode]` instead. */
  unitPriceCents: number;
  description?: string;
}

export interface CatalogBracket {
  code: string;
  label: string;
  /** Cents per tier code; null = "auf Anfrage". */
  pricesCents: Record<string, number | null>;
}

export interface CatalogService {
  kind: CatalogServiceKind;
  label: string;
  unit: CatalogUnit;
  tiers: CatalogTier[];
  brackets?: CatalogBracket[];
  options: Record<string, unknown>;
}

export interface CatalogResponse {
  brand: { slug: string; name: string };
  currency: string;
  services: CatalogService[];
  addons: CatalogTier[];
}

export const catalogApi = {
  forBrand(companySlug: CompanySlug, signal?: AbortSignal) {
    return request<CatalogResponse>('/storefront/catalog/', {
      companySlug,
      signal,
    });
  },
};

export interface PushStatus {
  configured: boolean;
  subscriptions: string[];
}

export interface PushSubscribeBody {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}

export const pushAdminApi = {
  vapidKey(signal?: AbortSignal) {
    return request<{ publicKey: string }>('/admin/push/vapid-key', { signal });
  },
  status(signal?: AbortSignal) {
    return request<PushStatus>('/admin/push/status', { signal });
  },
  subscribe(body: PushSubscribeBody) {
    return request<{ ok: true }>('/admin/push/subscribe', {
      method: 'POST',
      body,
    });
  },
  unsubscribe(endpoint: string) {
    return request<{ ok: true }>('/admin/push/subscribe', {
      method: 'DELETE',
      body: { endpoint },
    });
  },
  test() {
    return request<{ ok: true; sent: number; pruned: number }>('/admin/push/test', {
      method: 'POST',
    });
  },
};

export type TaskKind =
  | 'contact_review'
  | 'inquiry_review'
  | 'human_callback'
  | 'order_dispute'
  | 'order_cancellation'
  | 'bad_review_followup'
  | 'partner_application'
  | 'partner_report'
  | 'ad_hoc';

export type TaskStatus = 'open' | 'in_progress' | 'done' | 'dismissed';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Task {
  id: number;
  companySlug: string;
  kind: TaskKind;
  refKind: string | null;
  refId: number | null;
  title: string;
  body: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeUserId: string | null;
  dueAt: string | null;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TaskListResponse {
  items: Task[];
  nextCursor: string | null;
}

export interface TaskSummary {
  openByBrand: Array<{ slug: string; count: number }>;
  openTotal: number;
}

export interface TaskUserLite {
  id: string;
  name: string;
  email: string;
}

export interface TaskComment {
  id: number;
  body: string;
  createdAt: string;
  authorUserId: string;
  authorName: string | null;
  authorEmail: string | null;
}

export interface TaskMember {
  id: string;
  name: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
}

export interface TaskCreateInput {
  companySlug: CompanySlug;
  kind?: string;
  title: string;
  body?: string;
  priority?: TaskPriority;
  assigneeUserId?: string;
  dueAt?: string;
}

export interface TaskPatchInput {
  title?: string;
  body?: string | null;
  priority?: TaskPriority;
  /** Null clears. */
  dueAt?: string | null;
  /** Null unassigns. */
  assigneeUserId?: string | null;
}

export const tasksAdminApi = {
  /** `active` = open + in_progress. */
  list(
    opts: {
      status?: TaskStatus | 'active' | 'all';
      brand?: CompanySlug;
      mine?: boolean;
      q?: string;
      limit?: number;
      cursor?: string | null;
    } = {},
    signal?: AbortSignal,
  ) {
    const p = new URLSearchParams();
    if (opts.status) p.set('status', opts.status);
    if (opts.brand) p.set('brand', opts.brand);
    if (opts.mine) p.set('mine', 'true');
    if (opts.q) p.set('q', opts.q);
    if (opts.limit != null) p.set('limit', String(opts.limit));
    if (opts.cursor) p.set('cursor', opts.cursor);
    const qs = p.toString();
    return request<TaskListResponse>(`/admin/tasks${qs ? `?${qs}` : ''}`, { signal });
  },
  counts(opts: { brand?: CompanySlug; mine?: boolean; q?: string } = {}, signal?: AbortSignal) {
    const p = new URLSearchParams();
    if (opts.brand) p.set('brand', opts.brand);
    if (opts.mine) p.set('mine', 'true');
    if (opts.q) p.set('q', opts.q);
    const qs = p.toString();
    return request<{ byStatus: Record<string, number> }>(
      `/admin/tasks/counts${qs ? `?${qs}` : ''}`,
      { signal },
    );
  },
  summary(signal?: AbortSignal) {
    return request<TaskSummary>('/admin/tasks/summary', { signal });
  },
  detail(id: number, signal?: AbortSignal) {
    return request<{
      task: Task;
      assignee: TaskUserLite | null;
      resolvedBy: TaskUserLite | null;
    }>(`/admin/tasks/${id}`, { signal });
  },
  members(brand: CompanySlug, signal?: AbortSignal) {
    return request<{ members: TaskMember[] }>(
      `/admin/tasks/members?brand=${encodeURIComponent(brand)}`,
      { signal },
    );
  },
  create(body: TaskCreateInput) {
    return request<{ task: Task; created: boolean }>('/admin/tasks', {
      method: 'POST',
      body,
    });
  },
  patch(id: number, body: TaskPatchInput) {
    return request<{ task: Task }>(`/admin/tasks/${id}`, {
      method: 'PATCH',
      body,
    });
  },
  ack(id: number) {
    return request<{ task: Task }>(`/admin/tasks/${id}/ack`, { method: 'POST' });
  },
  done(id: number) {
    return request<{ task: Task }>(`/admin/tasks/${id}/done`, { method: 'POST' });
  },
  dismiss(id: number) {
    return request<{ task: Task }>(`/admin/tasks/${id}/dismiss`, { method: 'POST' });
  },
  comments(id: number, signal?: AbortSignal) {
    return request<{ comments: TaskComment[] }>(`/admin/tasks/${id}/comments`, { signal });
  },
  postComment(id: number, body: string) {
    return request<{ comment: TaskComment }>(`/admin/tasks/${id}/comments`, {
      method: 'POST',
      body: { body },
    });
  },
};

export type ExportKind = 'orders' | 'inquiries' | 'contacts' | 'newsletter' | 'customers';

export type ExportStatus = 'pending' | 'processing' | 'done' | 'failed' | 'cancelled';

export interface ExportJob {
  id: number;
  companySlug: string;
  requestedByUserId: string;
  kind: ExportKind;
  filter: Record<string, unknown>;
  format: 'csv';
  status: ExportStatus;
  rowCount: number | null;
  s3Key: string | null;
  sizeBytes: number | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface ExportListResponse {
  items: ExportJob[];
  nextCursor: string | null;
}

export const exportsAdminApi = {
  list(
    opts: { limit?: number; cursor?: string | null; status?: ExportStatus | 'all' } = {},
    signal?: AbortSignal,
  ) {
    const p = new URLSearchParams();
    if (opts.limit != null) p.set('limit', String(opts.limit));
    if (opts.cursor) p.set('cursor', opts.cursor);
    if (opts.status) p.set('status', opts.status);
    const qs = p.toString();
    return request<ExportListResponse>(`/admin/exports${qs ? `?${qs}` : ''}`, { signal });
  },
  /** The caller's own jobs per status. */
  counts(signal?: AbortSignal) {
    return request<StatusCounts>('/admin/exports/counts', { signal });
  },
  create(body: { companySlug: CompanySlug; kind: ExportKind; filter?: Record<string, unknown> }) {
    return request<{ job: ExportJob }>('/admin/exports', { method: 'POST', body });
  },
  get(id: number, signal?: AbortSignal) {
    return request<{ job: ExportJob }>(`/admin/exports/${id}`, { signal });
  },
  download(id: number) {
    return request<{ downloadUrl: string; expiresIn: number }>(`/admin/exports/${id}/download`);
  },
  cancel(id: number) {
    return request<{ job: ExportJob }>(`/admin/exports/${id}/cancel`, {
      method: 'POST',
    });
  },
};

export interface CancellationDecision {
  allowed: boolean;
  mode: 'full' | 'partial' | 'denied';
  reasonCode:
    | 'not_yet_paid'
    | 'well_in_advance'
    | 'within_24h'
    | 'no_appointment'
    | 'after_pickup'
    | 'terminal_state'
    | 'invalid_status';
  suggestedRefundCents: number;
  /** Hard ceiling: total minus already-refunded cents. */
  maxRefundCents: number;
  message: string;
}

export const ordersCancellationApi = {
  preview(companySlug: CompanySlug, orderId: number, signal?: AbortSignal) {
    return request<{ decision: CancellationDecision }>(`/admin/orders/${orderId}/cancel-preview`, {
      companySlug,
      signal,
    });
  },
  cancel(
    companySlug: CompanySlug,
    orderId: number,
    body: { reason?: string; refundCentsOverride?: number } = {},
  ) {
    return request<{
      order: unknown;
      decision: CancellationDecision;
      refundCents: number;
    }>(`/admin/orders/${orderId}/cancel`, {
      method: 'POST',
      companySlug,
      body,
    });
  },
};

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void';
export type InvoiceTaxRate = 0 | 7 | 19;
/** Drives the payment text + bank block. */
export type InvoicePaymentMethod = 'transfer' | 'card' | 'cash';

export interface InvoiceLineItem {
  label: string;
  note?: string | null;
  quantity: number;
  unitPriceCents: number;
  isPackage?: boolean;
}

export interface InvoiceRow {
  id: number;
  number: string | null;
  orderId: number | null;
  partnerId: number | null;
  customerId: number | null;
  customerType: 'b2c' | 'b2b';
  recipientName: string;
  recipientCompany: string | null;
  recipientVatId: string | null;
  recipientEmail: string | null;
  recipientAddressLine1: string | null;
  recipientAddressLine2: string | null;
  recipientPostalCode: string | null;
  recipientCity: string | null;
  recipientCountry: string | null;
  subject: string | null;
  /** Leistungsdatum (§14 UStG), "YYYY-MM-DD"; required before issuing. */
  serviceDate: string | null;
  serviceDateEnd: string | null;
  status: InvoiceStatus;
  currency: string;
  subtotalCents: number;
  taxRatePercent: number;
  taxCents: number;
  totalCents: number;
  lineItems: InvoiceLineItem[];
  /** Paketrechnung: positions are scope only, no per-line price stored or printed; `subtotalCents` holds the agreed package price. */
  packageMode: boolean;
  paymentTermsDays: number;
  paymentMethod: InvoicePaymentMethod;
  dueAt: string | null;
  sentAt: string | null;
  paidAt: string | null;
  dunningLevel: number;
  lastDunningAt: string | null;
  odooInvoiceId: string | null;
  notes: string | null;
  /** §35a EStG: the invoice covers a Handwerkerleistung (deductible labour). */
  craftsmanService: boolean;
  /** Gross (VAT-inclusive) labour share. */
  laborGrossCents: number | null;
  laborVatCents: number | null;
  /** The §35a sentence as printed; frozen server-side, read-only here. */
  craftsmanNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceCreateInput {
  orderId?: number;
  partnerId?: number;
  /** The customer record the invoice was started from (same brand); wins over the email match. */
  customerId?: number;
  customerType?: 'b2c' | 'b2b';
  recipientName: string;
  recipientCompany?: string | null;
  recipientVatId?: string | null;
  recipientEmail?: string;
  recipientAddressLine1?: string | null;
  recipientAddressLine2?: string | null;
  recipientPostalCode?: string | null;
  recipientCity?: string | null;
  recipientCountry?: string;
  subject?: string | null;
  serviceDate?: string | null;
  serviceDateEnd?: string | null;
  lineItems: InvoiceLineItem[];
  packageMode?: boolean;
  /** Agreed net package price in cents; becomes the invoice subtotal. */
  packageNetCents?: number;
  taxRatePercent?: InvoiceTaxRate;
  paymentTermsDays?: number;
  paymentMethod?: InvoicePaymentMethod;
  notes?: string;
  craftsmanService?: boolean;
  laborGrossCents?: number | null;
  laborVatCents?: number | null;
}

/** Drafts accept content edits; issued invoices only status/odooInvoiceId. */
export interface InvoiceUpdateInput {
  recipientName?: string;
  recipientCompany?: string | null;
  recipientVatId?: string | null;
  recipientEmail?: string | null;
  recipientAddressLine1?: string | null;
  recipientAddressLine2?: string | null;
  recipientPostalCode?: string | null;
  recipientCity?: string | null;
  recipientCountry?: string;
  subject?: string | null;
  serviceDate?: string | null;
  serviceDateEnd?: string | null;
  lineItems?: InvoiceLineItem[];
  packageMode?: boolean;
  packageNetCents?: number;
  taxRatePercent?: InvoiceTaxRate;
  paymentTermsDays?: number;
  paymentMethod?: InvoicePaymentMethod;
  notes?: string | null;
  craftsmanService?: boolean;
  laborGrossCents?: number | null;
  laborVatCents?: number | null;
  status?: InvoiceStatus;
  odooInvoiceId?: string | null;
}

export interface InvoiceStatusLogEntry {
  id: number;
  invoiceId: number;
  fromStatus: InvoiceStatus | null;
  toStatus: InvoiceStatus;
  changedByUserId: string | null;
  reason: string | null;
  createdAt: string;
}

export interface InvoiceListParams {
  limit?: number;
  cursor?: string;
  status?: InvoiceStatus;
  /** open = draft/sent/overdue, closed = paid/void; a `status` wins over it. */
  view?: 'open' | 'closed';
  q?: string;
  customerType?: 'b2c' | 'b2b';
  overdue?: boolean;
}

export const invoicesAdminApi = {
  list(companySlug: CompanySlug, params: InvoiceListParams = {}, signal?: AbortSignal) {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.cursor) qs.set('cursor', params.cursor);
    if (params.status) qs.set('status', params.status);
    else if (params.view) qs.set('view', params.view);
    if (params.q) qs.set('q', params.q);
    if (params.customerType) qs.set('customerType', params.customerType);
    if (params.overdue !== undefined) qs.set('overdue', String(params.overdue));
    const suffix = qs.size > 0 ? `?${qs.toString()}` : '';
    return request<{ invoices: InvoiceRow[]; nextCursor: string | null }>(
      `/admin/invoices${suffix}`,
      { companySlug, signal },
    );
  },
  /** Invoices per status, narrowed by the list's search and overdue filter. */
  counts(
    companySlug: CompanySlug,
    opts: { q?: string; overdue?: boolean } = {},
    signal?: AbortSignal,
  ) {
    const params = new URLSearchParams();
    if (opts.q) params.set('q', opts.q);
    if (opts.overdue) params.set('overdue', 'true');
    const qs = params.toString() ? `?${params}` : '';
    return request<StatusCounts>(`/admin/invoices/counts${qs}`, { companySlug, signal });
  },
  get(companySlug: CompanySlug, id: number, signal?: AbortSignal) {
    return request<{ invoice: InvoiceRow }>(`/admin/invoices/${id}`, { companySlug, signal });
  },
  create(companySlug: CompanySlug, input: InvoiceCreateInput) {
    return request<{ invoice: InvoiceRow }>('/admin/invoices', {
      method: 'POST',
      companySlug,
      body: input,
    });
  },
  update(companySlug: CompanySlug, id: number, patch: InvoiceUpdateInput) {
    return request<{ invoice: InvoiceRow }>(`/admin/invoices/${id}`, {
      method: 'PATCH',
      companySlug,
      body: patch,
    });
  },
  send(companySlug: CompanySlug, id: number) {
    return request<{ invoice: InvoiceRow; emailSent: boolean; emailSkipped: boolean }>(
      `/admin/invoices/${id}/send`,
      { method: 'POST', companySlug, body: {} },
    );
  },
  /** Issues a draft without emailing it (print flow). */
  issue(companySlug: CompanySlug, id: number) {
    return request<{ invoice: InvoiceRow }>(`/admin/invoices/${id}/issue`, {
      method: 'POST',
      companySlug,
      body: {},
    });
  },
  markPaid(companySlug: CompanySlug, id: number) {
    return request<{ invoice: InvoiceRow }>(`/admin/invoices/${id}/mark-paid`, {
      method: 'POST',
      companySlug,
      body: {},
    });
  },
  dunning(companySlug: CompanySlug, id: number) {
    return request<{ invoice: InvoiceRow }>(`/admin/invoices/${id}/dunning`, {
      method: 'POST',
      companySlug,
      body: {},
    });
  },
  log(companySlug: CompanySlug, id: number, signal?: AbortSignal) {
    return request<{ log: InvoiceStatusLogEntry[] }>(`/admin/invoices/${id}/log`, {
      companySlug,
      signal,
    });
  },
  async pdf(companySlug: CompanySlug, id: number, signal?: AbortSignal): Promise<Blob> {
    const res = await fetch(`${API_BASE}/admin/invoices/${id}/pdf`, {
      headers: { Accept: 'application/pdf', 'X-Company-Slug': companySlug },
      credentials: 'include',
      signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const parsed = text ? safeJson(text) : null;
      const msg =
        (parsed && typeof parsed === 'object' && 'error' in parsed
          ? String((parsed as { error?: unknown }).error)
          : null) ??
        res.statusText ??
        `Request failed (${res.status})`;
      throw new ApiError(res.status, msg, parsed);
    }
    return res.blob();
  },
};

export type SubscriptionStatus = 'active' | 'paused' | 'past_due' | 'cancelled';

export interface SubscriptionRow {
  id: number;
  customerEmail: string;
  customerName: string | null;
  planName: string;
  monthlyPriceCents: number;
  intervalMonths: number;
  stripeSubscriptionId: string | null;
  status: SubscriptionStatus;
  servicesIncluded: string[];
  nextServiceDate: string | null;
  pausedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionCreateInput {
  customerEmail: string;
  customerName?: string;
  planName: string;
  monthlyPriceCents?: number;
  intervalMonths?: number;
  stripeSubscriptionId?: string;
  servicesIncluded?: string[];
  nextServiceDate?: string;
}

export interface SubscriptionUpdateInput {
  planName?: string;
  monthlyPriceCents?: number;
  intervalMonths?: number;
  stripeSubscriptionId?: string | null;
  servicesIncluded?: string[];
  nextServiceDate?: string | null;
}

export type SubscriptionAction = 'pause' | 'resume' | 'cancel';

export interface SubscriptionListParams {
  limit?: number;
  cursor?: string;
  status?: SubscriptionStatus;
  email?: string;
}

export const subscriptionsAdminApi = {
  list(companySlug: CompanySlug, params: SubscriptionListParams = {}, signal?: AbortSignal) {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.cursor) qs.set('cursor', params.cursor);
    if (params.status) qs.set('status', params.status);
    if (params.email) qs.set('email', params.email);
    const suffix = qs.size > 0 ? `?${qs.toString()}` : '';
    return request<{ subscriptions: SubscriptionRow[]; nextCursor: string | null }>(
      `/admin/subscriptions${suffix}`,
      { companySlug, signal },
    );
  },
  get(companySlug: CompanySlug, id: number, signal?: AbortSignal) {
    return request<{ subscription: SubscriptionRow }>(`/admin/subscriptions/${id}`, {
      companySlug,
      signal,
    });
  },
  create(companySlug: CompanySlug, input: SubscriptionCreateInput) {
    return request<{ subscription: SubscriptionRow }>('/admin/subscriptions', {
      method: 'POST',
      companySlug,
      body: input,
    });
  },
  update(companySlug: CompanySlug, id: number, patch: SubscriptionUpdateInput) {
    return request<{ subscription: SubscriptionRow }>(`/admin/subscriptions/${id}`, {
      method: 'PATCH',
      companySlug,
      body: patch,
    });
  },
  /** Mirrored to Stripe server-side before the local update. */
  action(companySlug: CompanySlug, id: number, action: SubscriptionAction) {
    return request<{ subscription: SubscriptionRow }>(`/admin/subscriptions/${id}/${action}`, {
      method: 'POST',
      companySlug,
      body: {},
    });
  },
};

export type ReviewStatus = 'new' | 'published' | 'flagged' | 'hidden';

export interface ReviewRow {
  id: number;
  orderId: number | null;
  partnerId: number | null;
  customerEmail: string | null;
  customerName: string | null;
  rating: number;
  comment: string | null;
  photos: string[];
  status: ReviewStatus;
  partnerResponse: string | null;
  respondedAt: string | null;
  flagged: boolean;
  flagReason: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewListParams {
  limit?: number;
  cursor?: string;
  status?: ReviewStatus;
  flagged?: boolean;
}

export const reviewsAdminApi = {
  list(companySlug: CompanySlug, params: ReviewListParams = {}, signal?: AbortSignal) {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.cursor) qs.set('cursor', params.cursor);
    if (params.status) qs.set('status', params.status);
    if (params.flagged !== undefined) qs.set('flagged', String(params.flagged));
    const suffix = qs.size > 0 ? `?${qs.toString()}` : '';
    return request<{ reviews: ReviewRow[]; nextCursor: string | null }>(`/admin/reviews${suffix}`, {
      companySlug,
      signal,
    });
  },
  setStatus(companySlug: CompanySlug, id: number, status: ReviewStatus) {
    return request<{ review: ReviewRow }>(`/admin/reviews/${id}`, {
      method: 'PATCH',
      companySlug,
      body: { status },
    });
  },
  respond(companySlug: CompanySlug, id: number, response: string) {
    return request<{ review: ReviewRow }>(`/admin/reviews/${id}/respond`, {
      method: 'POST',
      companySlug,
      body: { response },
    });
  },
  flag(companySlug: CompanySlug, id: number, reason: string) {
    return request<{ review: ReviewRow }>(`/admin/reviews/${id}/flag`, {
      method: 'POST',
      companySlug,
      body: { reason },
    });
  },
  remove(companySlug: CompanySlug, id: number) {
    return request<void>(`/admin/reviews/${id}`, {
      method: 'DELETE',
      companySlug,
    });
  },
};

export type SeoPageType = 'service' | 'city' | 'blog';
export type SeoPageStatus = 'draft' | 'live' | 'protected';

export interface SeoPageRow {
  id: number;
  type: SeoPageType;
  path: string;
  category: string | null;
  city: string | null;
  region: string | null;
  title: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  h1: string | null;
  bodyHtml: string | null;
  schemaJsonld: Record<string, unknown> | unknown[] | null;
  faq: Array<{ question: string; answer: string }>;
  meta: SeoPageMeta;
  status: SeoPageStatus;
  gscPosition: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Editorial/SEO settings; empty values are dropped by the server. */
export interface SeoPageMeta {
  excerpt?: string;
  noindex?: boolean;
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  focusKeyphrase?: string;
  imageAlt?: string;
  imageCaption?: string;
}

export type BlogSort = 'updated' | 'created' | 'published' | 'title';

export interface BlogListParams {
  q?: string;
  status?: SeoPageStatus;
  attention?: boolean;
  sort?: BlogSort;
  offset?: number;
  limit?: number;
}

export interface BlogListItem {
  id: number;
  path: string;
  title: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  status: SeoPageStatus;
  gscPosition: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
  image: string | null;
  datePublished: string | null;
  hasTitle: boolean;
  hasBody: boolean;
  noindex: boolean;
}

export interface BlogListCounts {
  all: number;
  draft: number;
  live: number;
  protected: number;
  attention: number;
}

export interface SeoPageListParams {
  type?: SeoPageType;
  status?: SeoPageStatus;
  limit?: number;
  cursor?: string;
}

export type SeoPageJsonLd = Record<string, unknown> | unknown[];

export interface SeoPagePatch {
  status?: SeoPageStatus;
  path?: string;
  title?: string;
  metaTitle?: string;
  metaDescription?: string;
  h1?: string;
  bodyHtml?: string;
  schemaJsonld?: SeoPageJsonLd;
  faq?: Array<{ question: string; answer: string }>;
  meta?: SeoPageMeta;
  /** The updatedAt this client last saw; the server answers 409 STALE if the row moved on. */
  expectedUpdatedAt?: string;
}

export interface SeoPageCreate extends Omit<SeoPagePatch, 'expectedUpdatedAt'> {
  type: SeoPageType;
  path: string;
  source?: string;
}

/** Signs + streams to the public S3 prefix; returns the permanent public URL (blog images). */
export async function uploadPublicImage(
  companySlug: CompanySlug,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const contentType = file.type || 'application/octet-stream';
  const sign = await request<{ uploadUrl: string; key: string; publicUrl: string }>(
    '/admin/uploads/sign-public-image',
    {
      method: 'POST',
      companySlug,
      body: { filename: file.name, contentType, size: file.size },
    },
  );
  // XHR, not fetch: fetch has no upload progress events.
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', sign.uploadUrl);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error('Upload failed (network error)'));
    xhr.send(file);
  });
  return sign.publicUrl;
}

export const seoPagesAdminApi = {
  list(companySlug: CompanySlug, params: SeoPageListParams = {}, signal?: AbortSignal) {
    const qs = new URLSearchParams();
    if (params.type) qs.set('type', params.type);
    if (params.status) qs.set('status', params.status);
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.cursor) qs.set('cursor', params.cursor);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ pages: SeoPageRow[]; nextCursor: string | null }>(
      `/admin/seo-pages${suffix}`,
      { companySlug, signal },
    );
  },
  get(companySlug: CompanySlug, id: number, signal?: AbortSignal) {
    return request<{ page: SeoPageRow }>(`/admin/seo-pages/${id}`, { companySlug, signal });
  },
  create(companySlug: CompanySlug, input: SeoPageCreate) {
    return request<{ page: SeoPageRow }>('/admin/seo-pages', {
      method: 'POST',
      companySlug,
      body: input,
    });
  },
  update(companySlug: CompanySlug, id: number, patch: SeoPagePatch) {
    return request<{ page: SeoPageRow }>(`/admin/seo-pages/${id}`, {
      method: 'PATCH',
      companySlug,
      body: patch,
    });
  },
  remove(companySlug: CompanySlug, id: number) {
    return request<void>(`/admin/seo-pages/${id}`, { method: 'DELETE', companySlug });
  },
  listPosts(companySlug: CompanySlug, params: BlogListParams = {}, signal?: AbortSignal) {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.status) qs.set('status', params.status);
    if (params.attention) qs.set('attention', '1');
    if (params.sort) qs.set('sort', params.sort);
    if (params.offset) qs.set('offset', String(params.offset));
    if (params.limit) qs.set('limit', String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ posts: BlogListItem[]; total: number; counts: BlogListCounts }>(
      `/admin/seo-pages/posts${suffix}`,
      { companySlug, signal },
    );
  },
  checkPath(companySlug: CompanySlug, path: string, excludeId?: number, signal?: AbortSignal) {
    const qs = new URLSearchParams({ path });
    if (excludeId) qs.set('excludeId', String(excludeId));
    return request<{ valid: boolean; available: boolean; suggestion: string | null }>(
      `/admin/seo-pages/check-path?${qs.toString()}`,
      { companySlug, signal },
    );
  },
  duplicate(companySlug: CompanySlug, id: number) {
    return request<{ page: SeoPageRow }>(`/admin/seo-pages/${id}/duplicate`, {
      method: 'POST',
      companySlug,
    });
  },
};

export type PriceAdjustmentScope = 'global' | 'service' | 'zone';

export interface PriceAdjustment {
  id: number;
  scope: PriceAdjustmentScope;
  scopeKey: string | null;
  adjustmentPercent: string;
  reason: string | null;
  active: boolean;
  validFrom: string | null;
  validTo: string | null;
  createdByUserId: string | null;
  createdAt: string;
}

export interface PriceAdjustmentInput {
  scope: PriceAdjustmentScope;
  scopeKey?: string;
  adjustmentPercent: number;
  reason?: string;
  active?: boolean;
  validFrom?: string;
  validTo?: string;
}

export const priceAdjustmentsAdminApi = {
  list(
    companySlug: CompanySlug,
    opts: { active?: boolean; limit?: number; cursor?: string } = {},
    signal?: AbortSignal,
  ) {
    const qs = new URLSearchParams();
    if (opts.active !== undefined) qs.set('active', String(opts.active));
    if (opts.limit) qs.set('limit', String(opts.limit));
    if (opts.cursor) qs.set('cursor', opts.cursor);
    const suffix = qs.size > 0 ? `?${qs.toString()}` : '';
    return request<{ adjustments: PriceAdjustment[]; nextCursor: string | null; note: string }>(
      `/admin/price-adjustments${suffix}`,
      { companySlug, signal },
    );
  },
  create(companySlug: CompanySlug, input: PriceAdjustmentInput) {
    return request<{ adjustment: PriceAdjustment }>('/admin/price-adjustments', {
      method: 'POST',
      companySlug,
      body: input,
    });
  },
  setActive(companySlug: CompanySlug, id: number, active: boolean) {
    return request<{ adjustment: PriceAdjustment }>(`/admin/price-adjustments/${id}`, {
      method: 'PATCH',
      companySlug,
      body: { active },
    });
  },
};

export type CityStatusValue = 'locked' | 'soft_launch' | 'active' | 'scaling';

export interface CityStatus {
  id: number;
  city: string;
  plzPrefix: string;
  status: CityStatusValue;
  seoPageGenerated: boolean;
  googleAdsActive: boolean;
  notes: string | null;
  partnerCount: number;
  activePartnerCount: number;
  orderCount30d: number;
  ordersPerPartner: string | null;
  lastStatusChange: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CityStatusCreateInput {
  city: string;
  plzPrefix: string;
  status?: CityStatusValue;
  seoPageGenerated?: boolean;
  googleAdsActive?: boolean;
  notes?: string;
}

export interface CityStatusUpdateInput {
  city?: string;
  status?: CityStatusValue;
  seoPageGenerated?: boolean;
  googleAdsActive?: boolean;
  notes?: string | null;
}

export const cityStatusAdminApi = {
  list(companySlug: CompanySlug, status?: CityStatusValue, signal?: AbortSignal) {
    const qs = status ? `?status=${status}` : '';
    return request<{ cities: CityStatus[] }>(`/admin/city-status${qs}`, { companySlug, signal });
  },
  create(companySlug: CompanySlug, input: CityStatusCreateInput) {
    return request<{ city: CityStatus }>('/admin/city-status', {
      method: 'POST',
      companySlug,
      body: input,
    });
  },
  update(companySlug: CompanySlug, id: number, input: CityStatusUpdateInput) {
    return request<{ city: CityStatus }>(`/admin/city-status/${id}`, {
      method: 'PATCH',
      companySlug,
      body: input,
    });
  },
  recompute(companySlug: CompanySlug, id: number) {
    return request<{ city: CityStatus }>(`/admin/city-status/${id}/recompute`, {
      method: 'POST',
      companySlug,
    });
  },
  remove(companySlug: CompanySlug, id: number) {
    return request<void>(`/admin/city-status/${id}`, { method: 'DELETE', companySlug });
  },
};

export interface LegacyTableSummary {
  source: string;
  table: string;
  count: number;
  firstAt: string | null;
  lastAt: string | null;
}

export interface LegacyRecordRow {
  id: number;
  source: string;
  legacyTable: string;
  legacyId: string;
  legacyCreatedAt: string | null;
  importedAt: string;
  preview: string;
}

export interface LegacyRecord extends Omit<LegacyRecordRow, 'preview'> {
  data: Record<string, unknown>;
}

/** "Altdaten": raw rows from retired systems; admins only. */
export const legacyRecordsAdminApi = {
  summary(companySlug: CompanySlug, signal?: AbortSignal) {
    return request<{ tables: LegacyTableSummary[] }>('/admin/legacy-records/summary', {
      companySlug,
      signal,
    });
  },
  list(
    companySlug: CompanySlug,
    params: { source: string; table: string; q?: string; limit?: number; offset?: number },
    signal?: AbortSignal,
  ) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') qs.set(key, String(value));
    }
    return request<{ items: LegacyRecordRow[]; total: number }>(
      `/admin/legacy-records?${qs.toString()}`,
      { companySlug, signal },
    );
  },
  get(companySlug: CompanySlug, id: number, signal?: AbortSignal) {
    return request<{ record: LegacyRecord }>(`/admin/legacy-records/${id}`, {
      companySlug,
      signal,
    });
  },
  remove(companySlug: CompanySlug, id: number) {
    return request<{ ok: true }>(`/admin/legacy-records/${id}`, { method: 'DELETE', companySlug });
  },
  removeTable(companySlug: CompanySlug, source: string, table: string) {
    const qs = new URLSearchParams({ source, table }).toString();
    return request<{ deleted: number }>(`/admin/legacy-records?${qs}`, {
      method: 'DELETE',
      companySlug,
    });
  },
  /** Every table at once; a full scan server-side, so call it on submit, not per keystroke. */
  search(
    companySlug: CompanySlug,
    params: { q: string; limit?: number; offset?: number },
    signal?: AbortSignal,
  ) {
    const qs = new URLSearchParams({ q: params.q });
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));
    return request<{ items: LegacyRecordRow[]; hasMore: boolean }>(
      `/admin/legacy-records/search?${qs.toString()}`,
      { companySlug, signal },
    );
  },
};
