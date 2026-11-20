import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// The signed-in screens load on first visit (src/app/router.tsx). The libraries every page needs
// go into their own files, so a change to the app's code doesn't make browsers download them again.
const vendor = [
  // A Firestore dependency; on its own so neither file passes Vite's 500 kB warning.
  { name: 're2js', test: /node_modules[\\/]re2js[\\/]/, priority: 10 },
  { name: 'firestore', test: /node_modules[\\/].pnpm[\\/]@firebase\+firestore/ },
  { name: 'firebase', test: /node_modules[\\/].pnpm[\\/](@firebase|firebase|idb|tslib)/ },
  { name: 'react', test: /node_modules[\\/].pnpm[\\/](react|react-dom|scheduler|react-router)@/ },
  { name: 'query', test: /node_modules[\\/].pnpm[\\/]@tanstack/ },
]

export default defineConfig(({ mode }) => {
  // The public preview site (pnpm build:site) links to the README on every page, so it must know
  // where the README is. Set VITE_README_URL in Vercel's environment variables (README, "Deploy").
  if (mode === 'site') {
    const readme = loadEnv(mode, process.cwd(), 'VITE_').VITE_README_URL
    if (!/^https:\/\/\S+$/.test(readme)) {
      throw new Error(
        'VITE_README_URL must be set to the https link of the README for a site build, for example https://github.com/you/SplitIt#readme',
      )
    }
  }
  return {
    plugins: [react(), tailwindcss()],
    build: {
      rolldownOptions: {
        output: { codeSplitting: { groups: vendor } },
      },
    },
  }
})
