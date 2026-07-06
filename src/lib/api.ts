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

/** Best-effort human-readable message from any thrown value. */
export function errMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

// --- CSV import (shared by newsletter + customers) -------------------------

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

// --- Contact ---------------------------------------------------------------

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
  /** Brand-specific extras submitted by the storefront (jsonb). Empty object if unused. */
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

// --- Users / Profile / Settings -------------------------------------------

export type UserAudience = 'admin' | 'partner' | 'customer';
export type UserAccessLevel = 'super_admin' | 'admin' | 'manager' | 'viewer' | 'none';

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
  /** ISO date — `YYYY-MM-DD`. */
  dateOfBirth?: string | null;
  gender?: UserGender | null;
}

// --- Addresses ------------------------------------------------------------

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

// --- Partners (admin) -----------------------------------------------------

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
  commissionRate: string | null;
  status: PartnerStatus;
  approvedAt: string | null;
  approvedByUserId: string | null;
  suspendedAt: string | null;
  internalNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerUpdate {
  status?: PartnerStatus;
  internalNotes?: string | null;
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
  update(companySlug: CompanySlug, id: number, patch: PartnerUpdate) {
    return request<{ partner: Partner }>(`/admin/partners/${id}`, {
      method: 'PATCH',
      companySlug,
      body: patch,
    });
  },
};

// --- Service inquiries (admin + public) ----------------------------------

export type InquiryStatus = 'new' | 'in_review' | 'quoted' | 'won' | 'lost';

/** Who owns the callback for an inquiry; set by backend geo-routing. */
export type CallbackOwner = 'human' | 'ai';

export interface ServiceInquiry {
  id: number;
  customerId: number | null;
  name: string;
  /** Null for voice-AI phone leads with no email on file. */
  email: string | null;
  phone: string | null;
  service: string | null;
  propertyDetails: string | null;
  /** ISO `YYYY-MM-DD` or null. */
  preferredDate: string | null;
  budget: string | null;
  message: string;
  locale: string;
  source: string | null;
  status: InquiryStatus;
  priority: string;
  /** Service PLZ (where the cleaning happens) — drives callback routing. */
  plz: string | null;
  /** Free-text "Grund des Anrufs" captured by the inbound voice-AI. */
  callReason: string | null;
  /** 'human' (Hamburg area) | 'ai' (warm-callback queue) | null (legacy). */
  callbackOwner: CallbackOwner | null;
  /** User the human callback is assigned to. */
  assignedTo: string | null;
  consentPrivacy: boolean;
  consentMarketing: boolean;
  handledByUserId: string | null;
  handledAt: string | null;
  quotedAt: string | null;
  quotedAmount: string | null;
  closedAt: string | null;
  internalNotes: string | null;
  /** Brand-specific form fields submitted by the storefront. */
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

/** Delivery status of a logged email. */
export type InquiryEmailStatus = 'sent' | 'skipped' | 'failed';

/** A single email sent to a lead from the dashboard (currently offers/quotes). */
export interface InquiryEmail {
  id: number;
  inquiryId: number;
  kind: string;
  toAddress: string;
  subject: string;
  /** Rendered HTML body — preview exactly what the customer received. */
  html: string;
  quotedAmount: string | null;
  status: InquiryEmailStatus;
  emailMessageId: string | null;
  sentByUserId: string | null;
  sentByName: string | null;
  createdAt: string;
}

/** Payload for sending an offer/quote email to a lead. */
export interface InquiryQuoteInput {
  body: string;
  quotedAmount?: string | null;
}

/** A human (Hamburg-area) callback as returned by the dashboard queue. */
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
    opts: { limit?: number; cursor?: string | null } = {},
    signal?: AbortSignal,
  ) {
    const params = new URLSearchParams();
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    if (opts.cursor) params.set('cursor', opts.cursor);
    const qs = params.toString();
    return request<{ inquiries: ServiceInquiry[]; nextCursor: string | null }>(
      `/admin/inquiries${qs ? `?${qs}` : ''}`,
      { companySlug, signal },
    );
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
  /** Send an offer/quote email to the lead. Flips status to 'quoted' server-side. */
  sendQuote(companySlug: CompanySlug, id: number, input: InquiryQuoteInput) {
    return request<{ ok: true; inquiry: ServiceInquiry }>(`/admin/inquiries/${id}/quote`, {
      method: 'POST',
      companySlug,
      body: input,
    });
  },
  /** Email history (sent offers) for a lead, newest first. */
  emails(companySlug: CompanySlug, id: number, signal?: AbortSignal) {
    return request<{ emails: InquiryEmail[] }>(`/admin/inquiries/${id}/emails`, {
      companySlug,
      signal,
    });
  },
  /** Human (Hamburg-area) callbacks for the dashboard. AI-owned leads stay in the AI queue. */
  humanCallbackQueue(
    companySlug: CompanySlug,
    opts: { limit?: number; assignedTo?: string; includeClosed?: boolean } = {},
    signal?: AbortSignal,
  ) {
    const params = new URLSearchParams();
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    if (opts.assignedTo) params.set('assignedTo', opts.assignedTo);
    if (opts.includeClosed) params.set('includeClosed', 'true');
    const qs = params.toString();
    return request<{ inquiries: HumanCallbackEntry[] }>(
      `/admin/inquiries/human-callback-queue${qs ? `?${qs}` : ''}`,
      { companySlug, signal },
    );
  },
};

// --- Uploads (admin) ------------------------------------------------------

export const uploadsAdminApi = {
  /**
   * Exchange an S3 object key for a short-lived presigned GET URL the browser
   * can use to render the image. Keys are scoped to the company — passing
   * another tenant's key will be rejected by the backend with 403.
   */
  signDownload(companySlug: CompanySlug, key: string, signal?: AbortSignal) {
    const qs = new URLSearchParams({ key }).toString();
    return request<{ downloadUrl: string; expiresIn: number }>(
      `/admin/uploads/sign-download?${qs}`,
      { companySlug, signal },
    );
  },
  /**
   * Two-step upload helper: ask the backend for a presigned PUT URL, then
   * stream the file straight to S3 from the browser. Returns the attachment
   * record (key + metadata) ready to embed in a chat message or any other
   * row that references uploads.
   */
  async uploadDirect(companySlug: CompanySlug, file: File) {
    const sign = await request<{ uploadUrl: string; key: string }>('/admin/uploads/sign-upload', {
      method: 'POST',
      body: {
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
      },
      companySlug,
    });
    const put = await fetch(sign.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    if (!put.ok) throw new Error(`Upload failed (${put.status})`);
    return {
      key: sign.key,
      name: file.name,
      size: file.size,
      contentType: file.type || undefined,
    };
  },
};

// --- Orders (admin) ---------------------------------------------------------

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
  | 'refunded';

export type OrderTransitionStatus = Exclude<OrderStatus, 'pending' | 'payment_pending' | 'paid'>;

export interface OrderRow {
  id: number;
  customerId: number | null;
  orderNumber: string;
  publicToken: string;
  kind: 'teppichreinigung' | 'teppichreparatur' | 'polsterreinigung' | 'teppichbodenreinigung';
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
  /** 'stripe' (Checkout) or 'paypal' (native Orders v2 — settles in the PayPal account). */
  paymentProvider: 'stripe' | 'paypal';
  paypalOrderId: string | null;
  paypalCaptureId: string | null;
  /** 'upfront' — paid at checkout. 'after_service' — paid after the job. */
  paymentMode: 'upfront' | 'after_service';
  /** How an after-service order was settled: 'cash' | 'ec_card' | 'credit_card'. */
  paymentMethod: 'cash' | 'ec_card' | 'credit_card' | null;
  paidAt: string | null;
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
    /** Up to 3 proposed on-site slots, "YYYY-MM-DDTHH:mm" (customer- or operator-set). */
    preferredSlots?: string[];
    /** The slot the admin confirmed. */
    confirmedSlot?: string;
    /** Operator messages sent to the customer from the panel (newest last). */
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

export interface OrderItem {
  id: number;
  code: string;
  label: string;
  quantityLabel: string;
  quantity: string;
  unitPriceCents: number;
  subtotalCents: number;
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

/**
 * Cross-brand list — same as OrderRow but with companySlug/companyName so the
 * UI can render a brand badge and dispatch detail-view loads back to the
 * right tenant.
 */
export interface OrderListAllResponse {
  orders: Array<OrderRow & { companySlug: CompanySlug; companyName: string }>;
  nextCursor: null;
}

export interface OrderDetailResponse {
  order: OrderRow;
  items: OrderItem[];
  statusLog: OrderStatusLogEntry[];
  allowedNextStatuses: OrderStatus[];
}

export type OrderKind = OrderRow['kind'];

/** A manually-created order (admin). Total is recomputed server-side from items. */
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
  list(
    companySlug: CompanySlug,
    opts: { limit?: number; cursor?: string; status?: OrderStatus } = {},
    signal?: AbortSignal,
  ) {
    const qs = new URLSearchParams();
    if (opts.limit) qs.set('limit', String(opts.limit));
    if (opts.cursor) qs.set('cursor', opts.cursor);
    if (opts.status) qs.set('status', opts.status);
    return request<OrderListResponse>(`/admin/orders?${qs.toString()}`, {
      companySlug,
      signal,
    });
  },
  /**
   * Cross-brand list for the admin "All companies" view. Doesn't pass
   * X-Company-Slug; backend aggregates across all active tenant schemas.
   * Cursor pagination isn't implemented across tenants yet — limit caps the
   * page at 200, which is enough for current volume.
   */
  listAllCompanies(opts: { limit?: number; status?: OrderStatus } = {}, signal?: AbortSignal) {
    const qs = new URLSearchParams();
    if (opts.limit) qs.set('limit', String(opts.limit));
    if (opts.status) qs.set('status', opts.status);
    const search = qs.toString();
    return request<OrderListAllResponse>(`/admin/orders/all${search ? `?${search}` : ''}`, {
      signal,
    });
  },
  get(companySlug: CompanySlug, id: number, signal?: AbortSignal) {
    return request<OrderDetailResponse>(`/admin/orders/${id}`, { companySlug, signal });
  },
  /** Create an order manually (offline / after-service). */
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
  confirmAppointment(companySlug: CompanySlug, id: number, slot: string) {
    return request<{ order: OrderRow }>(`/admin/orders/${id}/confirm-appointment`, {
      method: 'POST',
      body: { slot },
      companySlug,
    });
  },
  /** Operator proposes up to 3 pickup/appointment times ("YYYY-MM-DDTHH:mm") from the panel. */
  proposeSlots(companySlug: CompanySlug, id: number, slots: string[]) {
    return request<{ order: OrderRow }>(`/admin/orders/${id}/propose-slots`, {
      method: 'POST',
      body: { slots },
      companySlug,
    });
  },
  /** Send a free-form message to the customer about an order (under the order's brand). */
  sendMessage(companySlug: CompanySlug, id: number, body: string) {
    return request<{ order: OrderRow }>(`/admin/orders/${id}/message`, {
      method: 'POST',
      body: { body },
      companySlug,
    });
  },
  /**
   * Recovery action: re-fetch the Stripe Checkout Session and reconcile the
   * order. Used to recover an order stuck in `payment_pending` when the
   * webhook was missed. `action` describes what the backend did:
   *   - "marked_paid"      → was unpaid in DB, Stripe says paid → flipped + emails sent
   *   - "marked_cancelled" → Stripe session expired → flipped to cancelled
   *   - "still_pending"    → Stripe also says still in flight (SEPA, abandoned, etc.)
   *   - "noop"             → already paid/cancelled/refunded; nothing to do
   */
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
  /**
   * Record an in-person payment for a "pay after service" order
   * (Barzahlung / EC-Kartenzahlung). Marks the order paid immediately.
   */
  recordPayment(companySlug: CompanySlug, id: number, method: 'cash' | 'ec_card') {
    return request<{ order: OrderRow }>(`/admin/orders/${id}/record-payment`, {
      method: 'POST',
      body: { method },
      companySlug,
    });
  },
  /**
   * Create a Stripe credit-card payment link for an after-service order and
   * email it to the customer. Returns the link so it can also be shared manually.
   */
  createPaymentLink(companySlug: CompanySlug, id: number) {
    return request<{ checkoutUrl: string | null }>(`/admin/orders/${id}/payment-link`, {
      method: 'POST',
      companySlug,
    });
  },
};

// --- Newsletter (admin) ---------------------------------------------------

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

// --- Chat (admin side) -----------------------------------------------------

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
}

export interface ChatConversation {
  /** Null until the first message creates the chat_conversations row. */
  id: number | null;
  partnerUserId: string;
  partnerCompanyName: string | null;
  partnerContactEmail: string | null;
  partnerName: string | null;
  partnerEmail: string | null;
  partnerStatus: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  /** Backend returns 0 when there's no conversation row. */
  unreadForAdmin: number;
  /** Conversation creation time (null = no conversation yet). */
  createdAt: string | null;
}

export const chatAdminApi = {
  conversations(companySlug: CompanySlug, signal?: AbortSignal) {
    return request<{ conversations: ChatConversation[] }>('/admin/chat/conversations', {
      signal,
      companySlug,
    });
  },
  messages(companySlug: CompanySlug, partnerUserId: string, signal?: AbortSignal) {
    return request<{ conversation: { id: number }; messages: ChatMessage[] }>(
      `/admin/chat/conversations/${encodeURIComponent(partnerUserId)}/messages`,
      { signal, companySlug },
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

export const newsletterAdminApi = {
  list(
    companySlug: CompanySlug,
    opts: { limit?: number; cursor?: string | null } = {},
    signal?: AbortSignal,
  ) {
    const params = new URLSearchParams();
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    if (opts.cursor) params.set('cursor', opts.cursor);
    const qs = params.toString();
    return request<{
      subscribers: NewsletterSubscriber[];
      nextCursor: string | null;
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
  /** ALL_68 — bulk CSV import. dryRun:true returns the summary without writing. */
  import(
    companySlug: CompanySlug,
    body: { csv: string; dryRun?: boolean; tag?: string; source?: string },
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

// --- Customers (admin) -----------------------------------------------------

export type LoyaltyTier = 'neukunde' | 'stammkunde' | 'premium';

export interface Customer {
  id: number;
  email: string;
  name: string | null;
  phone: string | null;
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
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  marketingOptIn: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerCreateInput {
  email: string;
  name?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  loyaltyTier?: LoyaltyTier;
  tags?: string[];
  internalNotes?: string;
  marketingOptIn?: boolean;
}

export interface CustomerUpdateInput {
  email?: string;
  name?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  loyaltyTier?: LoyaltyTier;
  tags?: string[];
  internalNotes?: string | null;
  marketingOptIn?: boolean;
}

export type NewsletterProfileStatus = 'confirmed' | 'pending' | 'unsubscribed' | 'none';

export interface CustomerOverviewStats {
  orders: number;
  paidOrders: number;
  lifetimeSpentCents: number;
  inquiries: number;
  openInquiries: number;
  contacts: number;
  newsletterStatus: NewsletterProfileStatus;
}

export interface CustomerOverview {
  customer: Customer;
  orders: OrderRow[];
  inquiries: ServiceInquiry[];
  contacts: ContactMessage[];
  newsletter: NewsletterSubscriber | null;
  stats: CustomerOverviewStats;
}

export type CustomerRejectReason = CsvImportRejectReason;
export type CustomerImportSummary = CsvImportSummary;

export interface CustomerListParams {
  limit?: number;
  cursor?: string | null;
  tier?: LoyaltyTier;
  email?: string;
}

export const customersAdminApi = {
  list(companySlug: CompanySlug, params: CustomerListParams = {}, signal?: AbortSignal) {
    const qs = new URLSearchParams();
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.cursor) qs.set('cursor', params.cursor);
    if (params.tier) qs.set('tier', params.tier);
    if (params.email) qs.set('email', params.email);
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
  recomputeTier(companySlug: CompanySlug, id: number) {
    return request<{ customer: Customer }>(`/admin/customers/${id}/recompute-tier`, {
      method: 'POST',
      companySlug,
      body: {},
    });
  },
  /** Bulk CSV import. dryRun:true returns the summary without writing. */
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

// --- Companies (admin: create + list) -------------------------------------

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
  logoUrl: string | null;
  primaryColor: string | null;
  senderEmail: string | null;
  senderName: string | null;
  storefrontOrigin: string | null;
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
  primaryColor?: string | null;
  logoUrl?: string | null;
  senderEmail?: string | null;
  senderName?: string | null;
  storefrontOrigin?: string | null;
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

// --- Dashboard summary -----------------------------------------------------

export interface DashboardBrandStats {
  slug: string;
  name: string;
  newsletter: { confirmed: number; pending: number; unsubscribed: number };
  contact: { total: number; new: number; last7Days: number };
  inquiry: { total: number; openCount: number; last7Days: number };
}

export type DashboardActivityKind = 'contact' | 'inquiry' | 'newsletter';
export interface DashboardActivityItem {
  id: string;
  kind: DashboardActivityKind;
  companySlug: string;
  companyName: string;
  rowId: number;
  title: string;
  subtitle: string | null;
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

// --- Notifications (bell) --------------------------------------------------

export type NotificationKind = 'contact' | 'inquiry';
export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  companySlug: string;
  companyName: string;
  rowId: number;
  title: string;
  message: string;
  createdAt: string;
}

export interface NotificationsUnreadResponse {
  count: number;
  byBrand: Array<{ slug: string; name: string; count: number }>;
}

export const notificationsAdminApi = {
  unreadCount(signal?: AbortSignal) {
    return request<NotificationsUnreadResponse>('/admin/notifications/unread-count', { signal });
  },
  list(limit = 20, signal?: AbortSignal) {
    return request<{ items: NotificationItem[] }>(`/admin/notifications?limit=${limit}`, {
      signal,
    });
  },
};

// --- Invites (admin: create; storefront: lookup + accept) -----------------

export interface InviteCreateInput {
  email: string;
  companySlug: string;
  role?: 'owner' | 'admin' | 'manager' | 'viewer' | 'partner';
  audience?: 'admin' | 'partner';
  accessLevel?: 'super_admin' | 'admin' | 'manager' | 'viewer' | 'none';
  /** Pre-fill the partner profile on accept (only honoured when audience=partner). */
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

// --- AI text assistant (Claude) -------------------------------------------
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
  current?: string; // refine instead of restart
  instruction?: string; // free-text steering, takes priority
  fresh?: boolean; // ignore `current`, write from scratch
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
    opts: { limit?: number; cursor?: string | null } = {},
    signal?: AbortSignal,
  ) {
    const params = new URLSearchParams();
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    if (opts.cursor) params.set('cursor', opts.cursor);
    const qs = params.toString();
    return request<{ messages: ContactMessage[]; nextCursor: string | null }>(
      `/admin/contact${qs ? `?${qs}` : ''}`,
      { companySlug, signal },
    );
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

// --- Catalog / Pricing -----------------------------------------------------
// The brand's price book — services + tiers + addons. Read-only here; edits
// live in `cleaning-dashboard-backend/src/lib/price-books/<slug>.ts`.

export type CatalogServiceKind =
  | 'teppichreinigung'
  | 'teppichreparatur'
  | 'polsterreinigung'
  | 'teppichbodenreinigung';

export type CatalogUnit = 'qm' | 'lfdm' | 'stueck' | 'bracket';

export interface CatalogTier {
  code: string;
  label: string;
  /**
   * Für Bracket-Services (unit: 'bracket') sind die Preise tier × bracket;
   * `unitPriceCents` ist dann `0` und sollte ignoriert werden. Stattdessen
   * `brackets[].pricesCents[tierCode]` auf dem Service lesen.
   */
  unitPriceCents: number;
  /** Optionale Card-Subtitle (z. B. "Mit Fleckenbehandlung & Imprägnierung"). */
  description?: string;
}

export interface CatalogBracket {
  code: string;
  label: string;
  /** Preis je Tier-Code in Cents — `null` ⇒ "auf Anfrage". */
  pricesCents: Record<string, number | null>;
}

export interface CatalogService {
  kind: CatalogServiceKind;
  label: string;
  unit: CatalogUnit;
  tiers: CatalogTier[];
  /** Nur gesetzt für `unit: 'bracket'`. */
  brackets?: CatalogBracket[];
  /** Service-specific config — minOrderCents, anfahrtCents, thresholds, … */
  options: Record<string, unknown>;
}

export interface CatalogResponse {
  brand: { slug: string; name: string };
  currency: string;
  services: CatalogService[];
  addons: CatalogTier[];
}

export const catalogApi = {
  /** Fetch the brand's price book. Cheap, deterministic — no rate-limit concerns. */
  forBrand(companySlug: CompanySlug, signal?: AbortSignal) {
    return request<CatalogResponse>('/storefront/catalog/', {
      companySlug,
      signal,
    });
  },
};

// --- Web Push subscriptions -----------------------------------------------

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

// --- Tasks (ALL_103) -------------------------------------------------------

export type TaskKind =
  | 'contact_review'
  | 'inquiry_review'
  | 'order_dispute'
  | 'bad_review_followup'
  | 'partner_application'
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
  /** ISO date string, or null to clear. */
  dueAt?: string | null;
  /** User id, or null to unassign. */
  assigneeUserId?: string | null;
}

export const tasksAdminApi = {
  list(
    opts: {
      status?: TaskStatus | 'all';
      brand?: CompanySlug;
      mine?: boolean;
      limit?: number;
      cursor?: string | null;
    } = {},
    signal?: AbortSignal,
  ) {
    const p = new URLSearchParams();
    if (opts.status) p.set('status', opts.status);
    if (opts.brand) p.set('brand', opts.brand);
    if (opts.mine) p.set('mine', 'true');
    if (opts.limit != null) p.set('limit', String(opts.limit));
    if (opts.cursor) p.set('cursor', opts.cursor);
    const qs = p.toString();
    return request<TaskListResponse>(`/admin/tasks${qs ? `?${qs}` : ''}`, { signal });
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

// --- Exports (ALL_74) ------------------------------------------------------

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

// --- Order cancellation (ALL_06) -------------------------------------------

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

// --- Invoices (admin) -------------------------------------------------------

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void';
export type InvoiceTaxRate = 0 | 7 | 19;

export interface InvoiceLineItem {
  label: string;
  quantity: number;
  unitPriceCents: number;
}

export interface InvoiceRow {
  id: number;
  number: string | null;
  orderId: number | null;
  partnerId: number | null;
  customerType: 'b2c' | 'b2b';
  recipientName: string;
  recipientEmail: string | null;
  recipientAddressLine1: string | null;
  recipientAddressLine2: string | null;
  recipientPostalCode: string | null;
  recipientCity: string | null;
  recipientCountry: string | null;
  /** "YYYY-MM-DD" Leistungsdatum (§14 UStG) — required before issuing. */
  serviceDate: string | null;
  serviceDateEnd: string | null;
  status: InvoiceStatus;
  currency: string;
  subtotalCents: number;
  taxRatePercent: number;
  taxCents: number;
  totalCents: number;
  lineItems: InvoiceLineItem[];
  paymentTermsDays: number;
  dueAt: string | null;
  sentAt: string | null;
  paidAt: string | null;
  dunningLevel: number;
  lastDunningAt: string | null;
  odooInvoiceId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceCreateInput {
  orderId?: number;
  partnerId?: number;
  customerType?: 'b2c' | 'b2b';
  recipientName: string;
  recipientEmail?: string;
  recipientAddressLine1?: string | null;
  recipientAddressLine2?: string | null;
  recipientPostalCode?: string | null;
  recipientCity?: string | null;
  recipientCountry?: string;
  serviceDate?: string | null;
  serviceDateEnd?: string | null;
  lineItems: InvoiceLineItem[];
  taxRatePercent?: InvoiceTaxRate;
  paymentTermsDays?: number;
  notes?: string;
}

/** Drafts accept content edits; issued invoices only status/odooInvoiceId. */
export interface InvoiceUpdateInput {
  recipientName?: string;
  recipientEmail?: string | null;
  recipientAddressLine1?: string | null;
  recipientAddressLine2?: string | null;
  recipientPostalCode?: string | null;
  recipientCity?: string | null;
  recipientCountry?: string;
  serviceDate?: string | null;
  serviceDateEnd?: string | null;
  lineItems?: InvoiceLineItem[];
  taxRatePercent?: InvoiceTaxRate;
  paymentTermsDays?: number;
  notes?: string | null;
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
  customerType?: 'b2c' | 'b2b';
  overdue?: boolean;
}

export const invoicesAdminApi = {
  list(companySlug: CompanySlug, params: InvoiceListParams = {}, signal?: AbortSignal) {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.cursor) qs.set('cursor', params.cursor);
    if (params.status) qs.set('status', params.status);
    if (params.customerType) qs.set('customerType', params.customerType);
    if (params.overdue !== undefined) qs.set('overdue', String(params.overdue));
    const suffix = qs.size > 0 ? `?${qs.toString()}` : '';
    return request<{ invoices: InvoiceRow[]; nextCursor: string | null }>(
      `/admin/invoices${suffix}`,
      { companySlug, signal },
    );
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
};

// --- Subscriptions (admin) ---------------------------------------------------

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

// --- Reviews (admin) ----------------------------------------------------------

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

// --- SEO / Blog pages (admin) ----------------------------------------------

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
  status: SeoPageStatus;
  gscPosition: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SeoPageListParams {
  type?: SeoPageType;
  status?: SeoPageStatus;
  limit?: number;
  cursor?: string;
}

export interface SeoPagePatch {
  status?: SeoPageStatus;
  title?: string;
  metaTitle?: string;
  metaDescription?: string;
  h1?: string;
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
  update(companySlug: CompanySlug, id: number, patch: SeoPagePatch) {
    return request<{ page: SeoPageRow }>(`/admin/seo-pages/${id}`, {
      method: 'PATCH',
      companySlug,
      body: patch,
    });
  },
  setFeaturedImage(companySlug: CompanySlug, id: number, imageUrl: string) {
    return request<{ page: SeoPageRow }>(`/admin/seo-pages/${id}/featured-image`, {
      method: 'PATCH',
      companySlug,
      body: { imageUrl },
    });
  },
  remove(companySlug: CompanySlug, id: number) {
    return request<void>(`/admin/seo-pages/${id}`, { method: 'DELETE', companySlug });
  },
  /** Sign + stream a public image to S3, then store its URL as the featured image. */
  async uploadFeaturedImage(companySlug: CompanySlug, id: number, file: File) {
    const sign = await request<{ uploadUrl: string; key: string; publicUrl: string }>(
      '/admin/uploads/sign-public-image',
      {
        method: 'POST',
        companySlug,
        body: {
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          size: file.size,
        },
      },
    );
    const put = await fetch(sign.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    if (!put.ok) throw new Error(`Upload failed (${put.status})`);
    return seoPagesAdminApi.setFeaturedImage(companySlug, id, sign.publicUrl);
  },
};
