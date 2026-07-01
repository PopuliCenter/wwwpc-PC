import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AuthLayout } from '@/components/layouts/AuthLayout';
import { AdminLayout } from '@/components/layouts/AdminLayout';
import { RespondentLayout } from '@/components/layouts/RespondentLayout';
import { ProtectedRoute } from './ProtectedRoute';
import { RequireRoles } from './RequireRoles';
import { access } from '@/config/access';
import { NotFoundPage } from '@/pages/NotFoundPage';

// Code-splitting: setiap halaman jadi chunk terpisah (dimuat saat rute dibuka),
// bukan satu bundle raksasa untuk semua peran (admin/responden/auth sekaligus).
// Layout (AdminLayout/RespondentLayout/AuthLayout) tetap statis — itu shell yang
// selalu dibutuhkan. Loading state ditangani oleh <Suspense> di tiap layout.
const LoginPage = lazy(() =>
  import('@/pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })),
);
const RegisterPage = lazy(() =>
  import('@/pages/auth/RegisterPage').then((m) => ({ default: m.RegisterPage })),
);
const ForgotPasswordPage = lazy(() =>
  import('@/pages/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
);

const ProfileCompletionPage = lazy(() =>
  import('@/pages/respondent/ProfileCompletionPage').then((m) => ({
    default: m.ProfileCompletionPage,
  })),
);
const RespondentSurveyListPage = lazy(() =>
  import('@/pages/respondent/SurveyListPage').then((m) => ({ default: m.SurveyListPage })),
);
const SurveyFillPage = lazy(() =>
  import('@/pages/respondent/SurveyFillPage').then((m) => ({ default: m.SurveyFillPage })),
);
const RewardPage = lazy(() =>
  import('@/pages/respondent/RewardPage').then((m) => ({ default: m.RewardPage })),
);
const HelpPage = lazy(() =>
  import('@/pages/respondent/HelpPage').then((m) => ({ default: m.HelpPage })),
);
const NotificationsPage = lazy(() =>
  import('@/pages/respondent/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
);
// ProfilePage dipakai bersama admin & responden (rute /profile dan /admin/profile).
const ProfilePage = lazy(() =>
  import('@/pages/admin/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);

const DashboardPage = lazy(() =>
  import('@/pages/admin/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const SurveyListPage = lazy(() =>
  import('@/pages/admin/surveys/SurveyListPage').then((m) => ({ default: m.SurveyListPage })),
);
const SurveyCreatePage = lazy(() =>
  import('@/pages/admin/surveys/SurveyCreatePage').then((m) => ({ default: m.SurveyCreatePage })),
);
const SurveyEditPage = lazy(() =>
  import('@/pages/admin/surveys/SurveyEditPage').then((m) => ({ default: m.SurveyEditPage })),
);
const SurveyPreviewPage = lazy(() =>
  import('@/pages/admin/surveys/SurveyPreviewPage').then((m) => ({ default: m.SurveyPreviewPage })),
);
const SurveySummaryPage = lazy(() =>
  import('@/pages/admin/surveys/SurveySummaryPage').then((m) => ({ default: m.SurveySummaryPage })),
);
const ResponseListPage = lazy(() =>
  import('@/pages/admin/responses/ResponseListPage').then((m) => ({ default: m.ResponseListPage })),
);
const ResponseDetailPage = lazy(() =>
  import('@/pages/admin/responses/ResponseDetailPage').then((m) => ({
    default: m.ResponseDetailPage,
  })),
);
const MapsPage = lazy(() =>
  import('@/pages/admin/MapsPage').then((m) => ({ default: m.MapsPage })),
);
const RespondentsPage = lazy(() =>
  import('@/pages/admin/RespondentsPage').then((m) => ({ default: m.RespondentsPage })),
);
const UserManagementPage = lazy(() =>
  import('@/pages/admin/UserManagementPage').then((m) => ({ default: m.UserManagementPage })),
);
const AuditLogPage = lazy(() =>
  import('@/pages/admin/AuditLogPage').then((m) => ({ default: m.AuditLogPage })),
);
const ClientLogsPage = lazy(() =>
  import('@/pages/admin/ClientLogsPage').then((m) => ({ default: m.ClientLogsPage })),
);
const DataCleanupPage = lazy(() =>
  import('@/pages/admin/DataCleanupPage').then((m) => ({ default: m.DataCleanupPage })),
);
const StoragePage = lazy(() =>
  import('@/pages/admin/StoragePage').then((m) => ({ default: m.StoragePage })),
);
const AnnouncementPage = lazy(() =>
  import('@/pages/admin/AnnouncementPage').then((m) => ({ default: m.AnnouncementPage })),
);

export const router = createBrowserRouter([
  // Public auth routes
  {
    path: '/',
    element: <AuthLayout />,
    children: [
      { index: true, element: <Navigate to="/login" replace /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
    ],
  },

  // Protected respondent routes
  {
    path: '/',
    element: (
      <ProtectedRoute requiredRole="respondent">
        <RespondentLayout />
      </ProtectedRoute>
    ),
    children: [
      { path: 'complete-profile', element: <ProfileCompletionPage /> },
      { path: 'surveys', element: <RespondentSurveyListPage /> },
      { path: 'surveys/:id/fill', element: <SurveyFillPage /> },
      { path: 'rewards', element: <RewardPage /> },
      { path: 'help', element: <HelpPage /> },
      { path: 'notifications', element: <NotificationsPage /> },
      { path: 'profile', element: <ProfilePage /> },
    ],
  },

  // Protected admin routes
  {
    path: '/admin',
    element: (
      <ProtectedRoute requiredRole="admin">
        <AdminLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/admin/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      {
        path: 'surveys',
        element: (
          <RequireRoles roles={access.surveys}>
            <SurveyListPage />
          </RequireRoles>
        ),
      },
      {
        path: 'surveys/create',
        element: (
          <RequireRoles roles={access.surveys}>
            <SurveyCreatePage />
          </RequireRoles>
        ),
      },
      {
        path: 'surveys/:id/edit',
        element: (
          <RequireRoles roles={access.surveys}>
            <SurveyEditPage />
          </RequireRoles>
        ),
      },
      {
        path: 'surveys/:id/preview',
        element: (
          <RequireRoles roles={access.surveys}>
            <SurveyPreviewPage />
          </RequireRoles>
        ),
      },
      {
        path: 'surveys/:id/summary',
        element: (
          <RequireRoles roles={access.responses}>
            <SurveySummaryPage />
          </RequireRoles>
        ),
      },
      {
        path: 'responses',
        element: (
          <RequireRoles roles={access.responses}>
            <ResponseListPage />
          </RequireRoles>
        ),
      },
      {
        path: 'responses/:id',
        element: (
          <RequireRoles roles={access.responses}>
            <ResponseDetailPage />
          </RequireRoles>
        ),
      },
      {
        path: 'maps',
        element: (
          <RequireRoles roles={access.maps}>
            <MapsPage />
          </RequireRoles>
        ),
      },
      {
        path: 'respondents',
        element: (
          <RequireRoles roles={access.respondents}>
            <RespondentsPage />
          </RequireRoles>
        ),
      },
      {
        path: 'users',
        element: (
          <RequireRoles roles={access.users}>
            <UserManagementPage />
          </RequireRoles>
        ),
      },
      {
        path: 'audit',
        element: (
          <RequireRoles roles={access.audit}>
            <AuditLogPage />
          </RequireRoles>
        ),
      },
      {
        path: 'client-logs',
        element: (
          <RequireRoles roles={access.audit}>
            <ClientLogsPage />
          </RequireRoles>
        ),
      },
      {
        path: 'cleanup',
        element: (
          <RequireRoles roles={access.cleanup}>
            <DataCleanupPage />
          </RequireRoles>
        ),
      },
      {
        path: 'storage',
        element: (
          <RequireRoles roles={access.storage}>
            <StoragePage />
          </RequireRoles>
        ),
      },
      {
        path: 'announcements',
        element: (
          <RequireRoles roles={access.announcements}>
            <AnnouncementPage />
          </RequireRoles>
        ),
      },
      { path: 'profile', element: <ProfilePage /> },
    ],
  },

  // Catch-all — rute tak dikenal (mis. notifikasi dgn link tak cocok) → 404 ramah
  // alih-alih layar error bawaan React Router.
  { path: '*', element: <NotFoundPage /> },
]);
