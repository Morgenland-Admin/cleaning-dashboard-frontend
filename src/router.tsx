import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';

import { AppLayout } from '@/components/layout';
import { RequireAuth } from '@/components/require-auth';
import { RouteError } from '@/components/route-error';
import { AcceptInvitePage } from '@/pages/accept-invite';
import { LoginPage } from '@/pages/login';
import { NotFoundPage } from '@/pages/not-found';
import { ResetPasswordPage } from '@/pages/reset-password';

// Authenticated pages are lazy; the single <Suspense> boundary lives in AppLayout.
const BrandDetailPage = lazy(() =>
  import('@/pages/brand-detail').then((m) => ({ default: m.BrandDetailPage })),
);
const BlogPage = lazy(() => import('@/pages/blog').then((m) => ({ default: m.BlogPage })));
const BlogDetailPage = lazy(() =>
  import('@/pages/blog-detail').then((m) => ({ default: m.BlogDetailPage })),
);
const BlogEditorPage = lazy(() =>
  import('@/pages/blog-editor').then((m) => ({ default: m.BlogEditorPage })),
);
const BrandNewPage = lazy(() =>
  import('@/pages/brand-new').then((m) => ({ default: m.BrandNewPage })),
);
const CallbacksPage = lazy(() =>
  import('@/pages/callbacks').then((m) => ({ default: m.CallbacksPage })),
);
const ChatPage = lazy(() => import('@/pages/chat').then((m) => ({ default: m.ChatPage })));
const CompaniesPage = lazy(() =>
  import('@/pages/companies').then((m) => ({ default: m.CompaniesPage })),
);
const ContactsPage = lazy(() =>
  import('@/pages/contacts').then((m) => ({ default: m.ContactsPage })),
);
const ContactDetailPage = lazy(() =>
  import('@/pages/contact-detail').then((m) => ({ default: m.ContactDetailPage })),
);
const CustomerAddressFormPage = lazy(() =>
  import('@/pages/customer-address-form').then((m) => ({ default: m.CustomerAddressFormPage })),
);
const CustomerDetailPage = lazy(() =>
  import('@/pages/customer-detail').then((m) => ({ default: m.CustomerDetailPage })),
);
const CustomerFormPage = lazy(() =>
  import('@/pages/customer-form').then((m) => ({ default: m.CustomerFormPage })),
);
const CustomersPage = lazy(() =>
  import('@/pages/customers').then((m) => ({ default: m.CustomersPage })),
);
const DashboardPage = lazy(() =>
  import('@/pages/dashboard').then((m) => ({ default: m.DashboardPage })),
);
const EmailsPage = lazy(() => import('@/pages/emails').then((m) => ({ default: m.EmailsPage })));
const EmailDetailPage = lazy(() =>
  import('@/pages/email-detail').then((m) => ({ default: m.EmailDetailPage })),
);
const ExportsPage = lazy(() => import('@/pages/exports').then((m) => ({ default: m.ExportsPage })));
const InquiriesPage = lazy(() =>
  import('@/pages/inquiries').then((m) => ({ default: m.InquiriesPage })),
);
const InquiryDetailPage = lazy(() =>
  import('@/pages/inquiry-detail').then((m) => ({ default: m.InquiryDetailPage })),
);
const InvoicesPage = lazy(() =>
  import('@/pages/invoices').then((m) => ({ default: m.InvoicesPage })),
);
const InvoiceDetailPage = lazy(() =>
  import('@/pages/invoice-detail').then((m) => ({ default: m.InvoiceDetailPage })),
);
const InvoiceFormPage = lazy(() =>
  import('@/pages/invoice-form').then((m) => ({ default: m.InvoiceFormPage })),
);
const NewsletterPage = lazy(() =>
  import('@/pages/newsletter').then((m) => ({ default: m.NewsletterPage })),
);
const OrdersPage = lazy(() => import('@/pages/orders').then((m) => ({ default: m.OrdersPage })));
const OrderNewPage = lazy(() =>
  import('@/pages/order-new').then((m) => ({ default: m.OrderNewPage })),
);
const OrderReceiptPage = lazy(() =>
  import('@/pages/order-receipt').then((m) => ({ default: m.OrderReceiptPage })),
);
const OrderDetailPage = lazy(() =>
  import('@/pages/order-detail').then((m) => ({ default: m.OrderDetailPage })),
);
const PartnersPage = lazy(() =>
  import('@/pages/partners').then((m) => ({ default: m.PartnersPage })),
);
const PartnerNewPage = lazy(() =>
  import('@/pages/partner-new').then((m) => ({ default: m.PartnerNewPage })),
);
const PartnerDetailPage = lazy(() =>
  import('@/pages/partner-detail').then((m) => ({ default: m.PartnerDetailPage })),
);
const PricingPage = lazy(() => import('@/pages/pricing').then((m) => ({ default: m.PricingPage })));
const PriceAdjustmentsPage = lazy(() =>
  import('@/pages/price-adjustments').then((m) => ({ default: m.PriceAdjustmentsPage })),
);
const CityStatusPage = lazy(() =>
  import('@/pages/city-status').then((m) => ({ default: m.CityStatusPage })),
);
const ProfilePage = lazy(() => import('@/pages/profile').then((m) => ({ default: m.ProfilePage })));
const ReviewsPage = lazy(() => import('@/pages/reviews').then((m) => ({ default: m.ReviewsPage })));
const SettingsPage = lazy(() =>
  import('@/pages/settings').then((m) => ({ default: m.SettingsPage })),
);
const SubscriptionFormPage = lazy(() =>
  import('@/pages/subscription-form').then((m) => ({ default: m.SubscriptionFormPage })),
);
const SubscriptionDetailPage = lazy(() =>
  import('@/pages/subscription-detail').then((m) => ({ default: m.SubscriptionDetailPage })),
);
const SubscriptionsPage = lazy(() =>
  import('@/pages/subscriptions').then((m) => ({ default: m.SubscriptionsPage })),
);
const TasksPage = lazy(() => import('@/pages/tasks').then((m) => ({ default: m.TasksPage })));
const TaskDetailPage = lazy(() =>
  import('@/pages/task-detail').then((m) => ({ default: m.TaskDetailPage })),
);

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteError /> },
  { path: '/reset-password', element: <ResetPasswordPage />, errorElement: <RouteError /> },
  { path: '/accept-invite', element: <AcceptInvitePage />, errorElement: <RouteError /> },
  {
    path: '/',
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppLayout />,
        errorElement: <RouteError />,
        children: [
          {
            // Pathless boundary: a crashing page renders its error inside the shell's <Outlet>, keeping sidebar/header usable.
            errorElement: <RouteError />,
            children: [
              { index: true, element: <DashboardPage /> },
              { path: 'customers', element: <CustomersPage /> },
              { path: 'customers/new', element: <CustomerFormPage /> },
              { path: 'customers/:id', element: <CustomerDetailPage /> },
              { path: 'customers/:id/edit', element: <CustomerFormPage /> },
              { path: 'customers/:id/addresses/new', element: <CustomerAddressFormPage /> },
              {
                path: 'customers/:id/addresses/:addressId/edit',
                element: <CustomerAddressFormPage />,
              },
              { path: 'auftraege', element: <OrdersPage /> },
              { path: 'auftraege/neu', element: <OrderNewPage /> },
              { path: 'auftraege/:id', element: <OrderDetailPage /> },
              { path: 'auftraege/:id/eingangsbestaetigung', element: <OrderReceiptPage /> },
              { path: 'rechnungen', element: <InvoicesPage /> },
              { path: 'rechnungen/neu', element: <InvoiceFormPage /> },
              { path: 'rechnungen/:id', element: <InvoiceDetailPage /> },
              { path: 'rechnungen/:id/bearbeiten', element: <InvoiceFormPage /> },
              { path: 'abos', element: <SubscriptionsPage /> },
              { path: 'abos/neu', element: <SubscriptionFormPage /> },
              { path: 'abos/:id', element: <SubscriptionDetailPage /> },
              { path: 'abos/:id/bearbeiten', element: <SubscriptionFormPage /> },
              { path: 'bewertungen', element: <ReviewsPage /> },
              { path: 'blog', element: <BlogPage /> },
              { path: 'blog/new', element: <BlogEditorPage /> },
              { path: 'blog/:id', element: <BlogDetailPage /> },
              { path: 'blog/:id/edit', element: <BlogEditorPage /> },
              { path: 'inquiries', element: <InquiriesPage /> },
              { path: 'inquiries/:slug/:id', element: <InquiryDetailPage /> },
              { path: 'callbacks', element: <CallbacksPage /> },
              { path: 'contacts', element: <ContactsPage /> },
              { path: 'contacts/:slug/:id', element: <ContactDetailPage /> },
              { path: 'newsletter', element: <NewsletterPage /> },
              { path: 'emails', element: <EmailsPage /> },
              { path: 'emails/:id', element: <EmailDetailPage /> },
              { path: 'tasks', element: <TasksPage /> },
              { path: 'tasks/:id', element: <TaskDetailPage /> },
              { path: 'exports', element: <ExportsPage /> },
              { path: 'pricing', element: <PricingPage /> },
              { path: 'preis-anpassungen', element: <PriceAdjustmentsPage /> },
              { path: 'staedte', element: <CityStatusPage /> },
              { path: 'chat', element: <ChatPage /> },
              { path: 'partner', element: <PartnersPage /> },
              { path: 'partner/neu', element: <PartnerNewPage /> },
              { path: 'partner/:id', element: <PartnerDetailPage /> },
              { path: 'companies', element: <CompaniesPage /> },
              { path: 'companies/new', element: <BrandNewPage /> },
              { path: 'companies/:slug', element: <BrandDetailPage /> },
              { path: 'profile', element: <ProfilePage /> },
              { path: 'settings', element: <SettingsPage /> },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage />, errorElement: <RouteError /> },
]);
