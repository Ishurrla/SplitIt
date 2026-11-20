import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

// The signed-in screens load on first visit (src/app/router.tsx). The libraries every page needs
// go into their own files, so a change to the app's code doesn't make browsers download them again.
// Photo uploads only (src/lib/uploads.ts loads it on demand), so the live site, which has no
// uploads, never downloads it. A group also takes the dependencies of what it matches, so this one
// has the lowest priority: the shared Firebase code is claimed by the firebase group first.
const storageSdk = /node_modules[\\/](@firebase[\\/]storage|firebase[\\/]storage)[\\/]/
const firebaseSdk = /node_modules[\\/].pnpm[\\/](@firebase|firebase|idb|tslib)/

const vendor = [
  // A Firestore dependency; on its own so neither file passes Vite's 500 kB warning.
  { name: 're2js', test: /node_modules[\\/]re2js[\\/]/, priority: 10 },
  { name: 'firestore', test: /node_modules[\\/].pnpm[\\/]@firebase\+firestore/, priority: 2 },
  {
    name: 'firebase',
    test: (id: string) => firebaseSdk.test(id) && !storageSdk.test(id),
    priority: 1,
  },
  { name: 'storage', test: storageSdk },
  { name: 'react', test: /node_modules[\\/].pnpm[\\/](react|react-dom|scheduler|react-router)@/ },
  { name: 'query', test: /node_modules[\\/].pnpm[\\/]@tanstack/ },
]

/**
 * pnpm dev only: serves /api/<name> from server/ on the same origin as the app, as Vercel does
 * with api/[name].ts. Both end in the same handleApi (server/http/handle.ts).
 *
 * The Admin SDK reads its settings from process.env. With VITE_USE_EMULATORS=true they point at
 * the local emulators (and Storage only when VITE_STORAGE_UPLOADS=true, matching the client).
 * Otherwise FIREBASE_SERVICE_ACCOUNT from .env.local is used, which is never sent to the browser
 * because it has no VITE_ prefix.
 */
function devApi(env: Record<string, string>): Plugin {
  return {
    name: 'splitit-dev-api',
    apply: 'serve',
    configureServer(server) {
      if (env.VITE_USE_EMULATORS === 'true') {
        process.env.GCLOUD_PROJECT = env.VITE_FIREBASE_PROJECT_ID
        process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
        process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
        if (env.VITE_STORAGE_UPLOADS === 'true') {
          process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199'
        }
      } else if (env.FIREBASE_SERVICE_ACCOUNT) {
        process.env.FIREBASE_SERVICE_ACCOUNT = env.FIREBASE_SERVICE_ACCOUNT
      }
      server.middlewares.use('/api', (req, res) => {
        // Loaded on each request, so edits to server/ apply without restarting pnpm dev.
        server
          .ssrLoadModule('/server/http/node.ts')
          .then((mod) =>
            (mod as typeof import('./server/http/node.ts')).serveApi(req, res, req.url ?? ''),
          )
          .catch((error: unknown) => {
            server.config.logger.error(`[api] ${String(error)}`)
            if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: { code: 'internal', message: 'Internal error' } }))
          })
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), devApi(loadEnv(mode, process.cwd(), ''))],
  build: {
    rolldownOptions: {
      output: { codeSplitting: { groups: vendor } },
    },
  },
}))
