import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { router } from './app/router'
import { AuthProvider } from './auth/AuthProvider'
import './fonts.ts'
import './index.css'
import { queryClient } from './lib/queryClient'
import { OfflineNotice } from './ui/OfflineNotice'
import { ToastProvider } from './ui/ToastProvider'

// Console helpers for trying the security rules by hand (DEMO.md). Dropped from production builds.
if (import.meta.env.DEV) void import('./dev/probe')

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element in index.html')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <OfflineNotice />
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
