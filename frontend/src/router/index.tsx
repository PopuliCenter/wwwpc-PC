import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AuthLayout } from '@/components/layouts/AuthLayout';
import { AdminLayout } from '@/components/layouts/AdminLayout';
import { RespondentLayout } from '@/components/layouts/RespondentLayout';
import { ProtectedRoute } from './ProtectedRoute';
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { DashboardPage } from '@/pages/admin/DashboardPage';
import { SurveyListPage } from '@/pages/admin/surveys/SurveyListPage';
import { SurveyCreatePage } from '@/pages/admin/surveys/SurveyCreatePage';
import { SurveyEditPage } from '@/pages/admin/surveys/SurveyEditPage';
import { SurveyPreviewPage } from '@/pages/admin/surveys/SurveyPreviewPage';
import { ResponseListPage } from '@/pages/admin/responses/ResponseListPage';
import { ResponseDetailPage } from '@/pages/admin/responses/ResponseDetailPage';
import { UserManagementPage } from '@/pages/admin/UserManagementPage';
import { AuditLogPage } from '@/pages/admin/AuditLogPage';
import { DataCleanupPage } from '@/pages/admin/DataCleanupPage';
import { SurveyListPage as RespondentSurveyListPage } from '@/pages/respondent/SurveyListPage';
import { SurveyFillPage } from '@/pages/respondent/SurveyFillPage';
import { RewardPage } from '@/pages/respondent/RewardPage';


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
      { path: 'reset-password', element: <ResetPasswordPage /> },
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
      { path: 'surveys', element: <RespondentSurveyListPage /> },
      { path: 'surveys/:id/fill', element: <SurveyFillPage /> },
      { path: 'rewards', element: <RewardPage /> },
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
      { path: 'surveys', element: <SurveyListPage /> },
      { path: 'surveys/create', element: <SurveyCreatePage /> },
      { path: 'surveys/:id/edit', element: <SurveyEditPage /> },
      { path: 'surveys/:id/preview', element: <SurveyPreviewPage /> },
      { path: 'responses', element: <ResponseListPage /> },
      { path: 'responses/:id', element: <ResponseDetailPage /> },
      { path: 'users', element: <UserManagementPage /> },
      { path: 'audit', element: <AuditLogPage /> },
      { path: 'cleanup', element: <DataCleanupPage /> },
    ],
  },
]);
