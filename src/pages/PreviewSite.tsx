import { Link } from 'react-router'
import { README_URL } from '../lib/site'
import { Brand } from '../ui/Brand'
import { buttonClass } from '../ui/buttonStyles'

// Only used by the public preview site (src/lib/site.ts).

function ReadmeLink({ className = '' }: { className?: string }) {
  return (
    <a
      href={README_URL}
      target="_blank"
      rel="noreferrer"
      className={`font-semibold text-biro underline underline-offset-4 ${className}`}
    >
      How to run the full app (README)
    </a>
  )
}

/** A bar at the top of every page of the public site. */
export function SiteNotice() {
  return (
    <aside
      aria-label="About this site"
      className="border-b-[1.5px] border-solid border-ink bg-mark px-4 py-2.5 text-center text-[.92rem]"
    >
      <b>This is a preview of SplitIt&apos;s interface.</b> The full app (sign-in, groups and all
      money logic) runs on the Firebase emulators on your own machine. <ReadmeLink />
    </aside>
  )
}

/** Shown instead of sign-in, the app and invite links on the public site. */
export function PreviewOnlyPage() {
  return (
    <main id="main" className="mx-auto max-w-[640px] px-[22px] py-14 max-[860px]:py-[26px]">
      <Brand to="/" />
      <div className="mt-8 rounded-pen border-pen bg-sheet p-8 shadow-offset max-[860px]:p-5">
        <h1 className="text-[clamp(1.8rem,5vw,2.4rem)] font-normal">
          Sign-in isn&apos;t available on this site
        </h1>
        <p className="mt-3">
          Every change in SplitIt (adding an expense, recording a payment, joining a group) goes
          through Cloud Functions, which check the amounts and keep the balances. Running Cloud
          Functions and Storage needs Firebase&apos;s paid Blaze plan, and this project stays on the
          free Spark plan.
        </p>
        <p className="mt-3">
          So this site shows the interface only. The complete app, with demo people and groups in
          naira and yen, runs on the Firebase emulators in about 10 minutes, and the walkthrough
          shows how to try to read another group&apos;s data.
        </p>
        <p className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
          <ReadmeLink />
          <Link to="/" className={buttonClass()}>
            Back to the start
          </Link>
        </p>
      </div>
    </main>
  )
}
