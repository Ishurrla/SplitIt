import { Link } from 'react-router'
import { buttonClass } from '../ui/buttonStyles'

/** Inside /app the shell already has the <main>; elsewhere this page brings its own. */
export function NotFoundPage({ inShell = false }: { inShell?: boolean }) {
  const body = (
    <>
      <h1 className="text-[clamp(2rem,5vw,3rem)] font-normal">There&apos;s no page here.</h1>
      <p className="mt-2 text-muted">Check the address, or go back to the start.</p>
      <Link to={inShell ? '/app' : '/'} className={`${buttonClass('primary')} mt-5`}>
        {inShell ? 'Go to the dashboard' : 'Go to SplitIt'}
      </Link>
    </>
  )
  if (inShell) return <div className="py-8">{body}</div>
  return (
    <main id="main" className="mx-auto max-w-[1040px] px-[22px] py-14">
      {body}
    </main>
  )
}

/** Shown while a page's code is downloading (each signed-in screen loads on first visit). */
export function RouteLoading() {
  return (
    <main className="grid min-h-screen place-items-center p-6" aria-busy="true">
      <h1 className="text-3xl">Loading…</h1>
    </main>
  )
}
