// The public site on Vercel is built with `pnpm build:site` (Vite mode "site"). The project is on
// Firebase's free Spark plan, which can't run Cloud Functions or Storage, and every change in
// SplitIt goes through a function. So the public site shows the interface and explains how to run
// the full app on the emulators, instead of a sign-in that cannot work. (Decision log 33.)

/** True only in the public build. Vite replaces MODE at build time, so the other branch is dropped. */
export const PREVIEW_SITE = import.meta.env.MODE === 'site'

/** Where the README lives (the repository page). vite.config.ts refuses a site build without it. */
export const README_URL = import.meta.env.VITE_README_URL ?? ''
