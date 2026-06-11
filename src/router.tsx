import { createBrowserRouter } from 'react-router-dom';

import { AppLayout } from '@/components/layout';
import { RequireAuth } from '@/components/require-auth';
import { RouteError } from '@/components/route-error';
import { AcceptInvitePage } from '@/pages/accept-invite';
import { BrandDetailPage } from '@/pages/brand-detail';
import { BrandNewPage } from '@/pages/brand-new';
import { ChatPage } from '@/pages/chat';
import { CompaniesPage } from '@/pages/companies';
import { ContactsPage } from '@/pages/contacts';
import { CustomerDetailPage } from '@/pages/customer-detail';
import { CustomersPage } from '@/pages/customers';
import { DashboardPage } from '@/pages/dashboard';
import { ExportsPage } from '@/pages/exports';
import { InquiriesPage } from '@/pages/inquiries';
import { InvoicesPage } from '@/pages/invoices';
import { LoginPage } from '@/pages/login';
import { NewsletterPage } from '@/pages/newsletter';
import { NotFoundPage } from '@/pages/not-found';
import { OrdersPage } from '@/pages/orders';
import { PartnersPage } from '@/pages/partners';
import { PricingPage } from '@/pages/pricing';
import { ProfilePage } from '@/pages/profile';
import { ResetPasswordPage } from '@/pages/reset-password';
import { ReviewsPage } from '@/pages/reviews';
import { SettingsPage } from '@/pages/settings';
import { SubscriptionsPage } from '@/pages/subscriptions';
import { TasksPage } from '@/pages/tasks';

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
          { path: 'abos', element: <SubscriptionsPage /> },
          { path: 'bewertungen', element: <ReviewsPage /> },
          { path: 'inquiries', element: <InquiriesPage /> },
          { path: 'contacts', element: <ContactsPage /> },
          { path: 'newsletter', element: <NewsletterPage /> },
          { path: 'tasks', element: <TasksPage /> },
          { path: 'exports', element: <ExportsPage /> },
          { path: 'pricing', element: <PricingPage /> },
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
