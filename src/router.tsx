import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';

import { AppLayout } from '@/components/layout';
import { RequireAuth } from '@/components/require-auth';
import { RouteError } from '@/components/route-error';
// Entry pages stay eager — they're the first paint and tiny.
import { AcceptInvitePage } from '@/pages/accept-invite';
import { LoginPage } from '@/pages/login';
import { NotFoundPage } from '@/pages/not-found';
import { ResetPasswordPage } from '@/pages/reset-password';

// Authenticated pages are code-split: each loads on first navigation, so the
// recharts-heavy dashboard and the large orders/invoices bundles don't ship on
// the initial login paint. A single <Suspense> boundary lives in AppLayout.
const BrandDetailPage = lazy(() =>
  import('@/pages/brand-detail').then((m) => ({ default: m.BrandDetailPage })),
);
const BlogPage = lazy(() => import('@/pages/blog').then((m) => ({ default: m.BlogPage })));
const BlogDetailPage = lazy(() =>
  import('@/pages/blog-detail').then((m) => ({ default: m.BlogDetailPage })),
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
const CustomerDetailPage = lazy(() =>
  import('@/pages/customer-detail').then((m) => ({ default: m.CustomerDetailPage })),
);
const CustomersPage = lazy(() =>
  import('@/pages/customers').then((m) => ({ default: m.CustomersPage })),
);
const DashboardPage = lazy(() =>
  import('@/pages/dashboard').then((m) => ({ default: m.DashboardPage })),
);
const ExportsPage = lazy(() => import('@/pages/exports').then((m) => ({ default: m.ExportsPage })));
const InquiriesPage = lazy(() =>
  import('@/pages/inquiries').then((m) => ({ default: m.InquiriesPage })),
);
const InvoicesPage = lazy(() =>
  import('@/pages/invoices').then((m) => ({ default: m.InvoicesPage })),
);
const InvoiceDetailPage = lazy(() =>
  import('@/pages/invoice-detail').then((m) => ({ default: m.InvoiceDetailPage })),
);
const NewsletterPage = lazy(() =>
  import('@/pages/newsletter').then((m) => ({ default: m.NewsletterPage })),
);
const OrdersPage = lazy(() => import('@/pages/orders').then((m) => ({ default: m.OrdersPage })));
const PartnersPage = lazy(() =>
  import('@/pages/partners').then((m) => ({ default: m.PartnersPage })),
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
const SubscriptionsPage = lazy(() =>
  import('@/pages/subscriptions').then((m) => ({ default: m.SubscriptionsPage })),
);
const TasksPage = lazy(() => import('@/pages/tasks').then((m) => ({ default: m.TasksPage })));

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
          { index: true, element: <DashboardPage /> },
          { path: 'customers', element: <CustomersPage /> },
          { path: 'customers/:id', element: <CustomerDetailPage /> },
          { path: 'auftraege', element: <OrdersPage /> },
          { path: 'rechnungen', element: <InvoicesPage /> },
          { path: 'rechnungen/:id', element: <InvoiceDetailPage /> },
          { path: 'abos', element: <SubscriptionsPage /> },
          { path: 'bewertungen', element: <ReviewsPage /> },
          { path: 'blog', element: <BlogPage /> },
          { path: 'blog/:id', element: <BlogDetailPage /> },
          { path: 'inquiries', element: <InquiriesPage /> },
          { path: 'callbacks', element: <CallbacksPage /> },
          { path: 'contacts', element: <ContactsPage /> },
          { path: 'newsletter', element: <NewsletterPage /> },
          { path: 'tasks', element: <TasksPage /> },
          { path: 'exports', element: <ExportsPage /> },
          { path: 'pricing', element: <PricingPage /> },
          { path: 'preis-anpassungen', element: <PriceAdjustmentsPage /> },
          { path: 'staedte', element: <CityStatusPage /> },
          { path: 'chat', element: <ChatPage /> },
          { path: 'partner', element: <PartnersPage /> },
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
  { path: '*', element: <NotFoundPage />, errorElement: <RouteError /> },
]);
