import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AuthLayout } from '@/components/layouts/AuthLayout';
import { AdminLayout } from '@/components/layouts/AdminLayout';
import { RespondentLayout } from '@/components/layouts/RespondentLayout';
import { ProtectedRoute } from './ProtectedRoute';
import { RequireRoles } from './RequireRoles';
import { access } from '@/config/access';
import { ProfilePage } from '@/pages/admin/ProfilePage';
import { MapsPage } from '@/pages/admin/MapsPage';
import { StoragePage } from '@/pages/admin/StoragePage';
import { RespondentsPage } from '@/pages/admin/RespondentsPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { DashboardPage } from '@/pages/admin/DashboardPage';
import { SurveyListPage } from '@/pages/admin/surveys/SurveyListPage';
import { SurveyCreatePage } from '@/pages/admin/surveys/SurveyCreatePage';
import { SurveyEditPage } from '@/pages/admin/surveys/SurveyEditPage';
import { SurveyPreviewPage } from '@/pages/admin/surveys/SurveyPreviewPage';
import { SurveySummaryPage } from '@/pages/admin/surveys/SurveySummaryPage';
import { ResponseListPage } from '@/pages/admin/responses/ResponseListPage';
import { ResponseDetailPage } from '@/pages/admin/responses/ResponseDetailPage';
import { UserManagementPage } from '@/pages/admin/UserManagementPage';
import { AuditLogPage } from '@/pages/admin/AuditLogPage';
import { ClientLogsPage } from '@/pages/admin/ClientLogsPage';
import { DataCleanupPage } from '@/pages/admin/DataCleanupPage';
import { AnnouncementPage } from '@/pages/admin/AnnouncementPage';
import { SurveyListPage as RespondentSurveyListPage } from '@/pages/respondent/SurveyListPage';
import { SurveyFillPage } from '@/pages/respondent/SurveyFillPage';
import { RewardPage } from '@/pages/respondent/RewardPage';
import { ProfileCompletionPage } from '@/pages/respondent/ProfileCompletionPage';
import { HelpPage } from '@/pages/respondent/HelpPage';
import { NotificationsPage } from '@/pages/respondent/NotificationsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';


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
      { path: 'surveys', element: <RequireRoles roles={access.surveys}><SurveyListPage /></RequireRoles> },
      { path: 'surveys/create', element: <RequireRoles roles={access.surveys}><SurveyCreatePage /></RequireRoles> },
      { path: 'surveys/:id/edit', element: <RequireRoles roles={access.surveys}><SurveyEditPage /></RequireRoles> },
      { path: 'surveys/:id/preview', element: <RequireRoles roles={access.surveys}><SurveyPreviewPage /></RequireRoles> },
      { path: 'surveys/:id/summary', element: <RequireRoles roles={access.responses}><SurveySummaryPage /></RequireRoles> },
      { path: 'responses', element: <RequireRoles roles={access.responses}><ResponseListPage /></RequireRoles> },
      { path: 'responses/:id', element: <RequireRoles roles={access.responses}><ResponseDetailPage /></RequireRoles> },
      { path: 'maps', element: <RequireRoles roles={access.maps}><MapsPage /></RequireRoles> },
      { path: 'respondents', element: <RequireRoles roles={access.respondents}><RespondentsPage /></RequireRoles> },
      { path: 'users', element: <RequireRoles roles={access.users}><UserManagementPage /></RequireRoles> },
      { path: 'audit', element: <RequireRoles roles={access.audit}><AuditLogPage /></RequireRoles> },
      { path: 'client-logs', element: <RequireRoles roles={access.audit}><ClientLogsPage /></RequireRoles> },
      { path: 'cleanup', element: <RequireRoles roles={access.cleanup}><DataCleanupPage /></RequireRoles> },
      { path: 'storage', element: <RequireRoles roles={access.storage}><StoragePage /></RequireRoles> },
      { path: 'announcements', element: <RequireRoles roles={access.announcements}><AnnouncementPage /></RequireRoles> },
      { path: 'profile', element: <ProfilePage /> },
    ],
  },

  // Catch-all — rute tak dikenal (mis. notifikasi dgn link tak cocok) → 404 ramah
  // alih-alih layar error bawaan React Router.
  { path: '*', element: <NotFoundPage /> },
]);
