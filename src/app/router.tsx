import { createBrowserRouter } from 'react-router'
import { AuthPage } from '../pages/AuthPage'
import { LandingPage } from '../pages/LandingPage'
import { ActivityPage } from '../activity/ActivityPage'
import { GroupPage, NotFoundPage, SettingsPage, SettlePage } from '../pages/appPages'
import { DashboardPage } from '../pages/DashboardPage'
import { GroupsPage } from '../pages/GroupsPage'
import { JoinPage } from '../pages/JoinPage'
import { AppShell } from '../shell/AppShell'
import { RequireAuth } from './RequireAuth'

export const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/auth', element: <AuthPage /> },
  {
    path: '/join/:token',
    element: (
      <RequireAuth>
        <JoinPage />
      </RequireAuth>
    ),
  },
  {
    path: '/app',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'groups', element: <GroupsPage /> },
      { path: 'groups/:id', element: <GroupPage /> },
      { path: 'groups/:id/settle', element: <SettlePage /> },
      { path: 'activity', element: <ActivityPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
