import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AuthLayout } from '@/components/layouts/AuthLayout';
import { AdminLayout } from '@/components/layouts/AdminLayout';
import { RespondentLayout } from '@/components/layouts/RespondentLayout';
import { SurveyorLayout } from '@/components/layouts/SurveyorLayout';
import { ProtectedRoute } from './ProtectedRoute';
import { RequireRoles } from './RequireRoles';
import { access } from '@/config/access';
import { ProfilePage } from '@/pages/admin/ProfilePage';
import { MapsPage } from '@/pages/admin/MapsPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { DashboardPage } from '@/pages/admin/DashboardPage';
import { SurveyListPage } from '@/pages/admin/surveys/SurveyListPage';
import { SurveyCreatePage } from '@/pages/admin/surveys/SurveyCreatePage';
import { SurveyEditPage } from '@/pages/admin/surveys/SurveyEditPage';
import { SurveyPreviewPage } from '@/pages/admin/surveys/SurveyPreviewPage';
import { SurveySurveyorsPage } from '@/pages/admin/surveys/SurveySurveyorsPage';
import { ResponseListPage } from '@/pages/admin/responses/ResponseListPage';
import { ResponseDetailPage } from '@/pages/admin/responses/ResponseDetailPage';
import { UserManagementPage } from '@/pages/admin/UserManagementPage';
import { AuditLogPage } from '@/pages/admin/AuditLogPage';
import { DataCleanupPage } from '@/pages/admin/DataCleanupPage';
import { SurveyListPage as RespondentSurveyListPage } from '@/pages/respondent/SurveyListPage';
import { SurveyFillPage } from '@/pages/respondent/SurveyFillPage';
import { RewardPage } from '@/pages/respondent/RewardPage';
import { MySurveysPage } from '@/pages/surveyor/MySurveysPage';
import { SurveyorCollectPage } from '@/pages/surveyor/SurveyorCollectPage';


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
      { path: 'profile', element: <ProfilePage /> },
    ],
  },

  // Protected surveyor (TPD) routes
  {
    path: '/surveyor',
    element: (
      <ProtectedRoute requiredRole="surveyor">
        <SurveyorLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/surveyor/surveys" replace /> },
      { path: 'surveys', element: <MySurveysPage /> },
      { path: 'surveys/:id/collect', element: <SurveyorCollectPage /> },
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
      { path: 'surveys/:id/surveyors', element: <RequireRoles roles={access.surveys}><SurveySurveyorsPage /></RequireRoles> },
      { path: 'responses', element: <RequireRoles roles={access.responses}><ResponseListPage /></RequireRoles> },
      { path: 'responses/:id', element: <RequireRoles roles={access.responses}><ResponseDetailPage /></RequireRoles> },
      { path: 'maps', element: <RequireRoles roles={access.maps}><MapsPage /></RequireRoles> },
      { path: 'users', element: <RequireRoles roles={access.users}><UserManagementPage /></RequireRoles> },
      { path: 'audit', element: <RequireRoles roles={access.audit}><AuditLogPage /></RequireRoles> },
      { path: 'cleanup', element: <RequireRoles roles={access.cleanup}><DataCleanupPage /></RequireRoles> },
      { path: 'profile', element: <ProfilePage /> },
    ],
  },
]);
