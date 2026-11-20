import { Outlet, createBrowserRouter, type RouteObject } from 'react-router'
import { PREVIEW_SITE } from '../lib/site'
import { AuthPage } from '../pages/AuthPage'
import { LandingPage } from '../pages/LandingPage'
import { NotFoundPage, RouteLoading } from '../pages/NotFoundPage'
import { PreviewOnlyPage } from '../pages/PreviewSite'
import { RequireAuth } from './RequireAuth'

// The landing and sign-in pages ship in the first download. Every signed-in screen is loaded the
// first time it is visited (route `lazy`), which keeps the first page small.

const guarded = (
  <RequireAuth>
    <Outlet />
  </RequireAuth>
)

const appRoutes: RouteObject[] = [
  { path: '/auth', element: <AuthPage /> },
  {
    path: '/join/:token',
    element: guarded,
    HydrateFallback: RouteLoading,
    children: [
      {
        index: true,
        lazy: async () => ({ Component: (await import('../pages/JoinPage')).JoinPage }),
      },
    ],
  },
  {
    path: '/app',
    element: guarded,
    HydrateFallback: RouteLoading,
    children: [
      {
        lazy: async () => ({ Component: (await import('../shell/AppShell')).AppShell }),
        children: [
          {
            index: true,
            lazy: async () => ({
              Component: (await import('../pages/DashboardPage')).DashboardPage,
            }),
          },
          {
            path: 'groups',
            lazy: async () => ({ Component: (await import('../pages/GroupsPage')).GroupsPage }),
          },
          {
            path: 'groups/:id',
            lazy: async () => ({ Component: (await import('../pages/appPages')).GroupPage }),
          },
          {
            path: 'groups/:id/settle',
            lazy: async () => ({ Component: (await import('../pages/appPages')).SettlePage }),
          },
          {
            path: 'activity',
            lazy: async () => ({
              Component: (await import('../activity/ActivityPage')).ActivityPage,
            }),
          },
          {
            path: 'settings',
            lazy: async () => ({
              Component: (await import('../settings/SettingsPage')).SettingsPage,
            }),
          },
          { path: '*', element: <NotFoundPage inShell /> },
        ],
      },
    ],
  },
]

// The public preview site (src/lib/site.ts) explains instead of offering a sign-in that can't work.
const previewRoutes: RouteObject[] = ['/auth', '/join/*', '/app/*'].map((path) => ({
  path,
  element: <PreviewOnlyPage />,
}))

export const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  ...(PREVIEW_SITE ? previewRoutes : appRoutes),
  { path: '*', element: <NotFoundPage /> },
])
