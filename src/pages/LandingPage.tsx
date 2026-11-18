import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/context'
import { Avatar } from '../ui/Avatar'
import { Brand } from '../ui/Brand'
import { buttonClass } from '../ui/buttonStyles'
import { Icon } from '../ui/Icon'
import { ThemeButton } from '../ui/ThemeButton'

// Copy from the prototype's landing page. The ledger "sheet" is a static illustration.
const SAMPLE = [
  ['Airbnb, 2 nights', 'Ada', '₦180,000'],
  ['Fuel and tolls', 'You', '₦24,000'],
  ['Suya and drinks', 'Femi', '₦18,600'],
] as const

const FAQ = [
  [
    'Can I split unevenly?',
    'Yes. Choose custom amounts and set what each person owes. The amounts must add up to the total.',
  ],
  [
    'Who can see my group?',
    "Only its members. The database itself refuses to show a group's data to anyone else.",
  ],
  [
    'How does settle-up work?',
    'A function on the server adds up what everyone paid and owes, then finds the fewest payments that clear it.',
  ],
  [
    'Which currencies can I use?',
    'Each group picks one when you create it: Naira, Dollar, Pound, Euro, Cedi, Shilling, Rand and more. Amounts are stored in the smallest unit, like kobo or cents, so nothing is lost to rounding.',
  ],
] as const

const wrap = 'mx-auto max-w-[1040px] px-[22px] max-[860px]:px-[18px]'
const secHead =
  'flex items-baseline justify-between gap-3 border-b-[1.5px] border-solid border-ink pb-2'

export function LandingPage() {
  const auth = useAuth()
  const signedIn = auth.status === 'signedIn'

  return (
    <div>
      <header
        className={`${wrap} flex h-17 items-center justify-between gap-4 border-b border-rule`}
      >
        <Brand />
        <nav aria-label="Sections" className="flex gap-6.5 max-[860px]:hidden">
          <a href="#features" className="font-semibold hover:underline">
            Features
          </a>
          <a href="#how" className="font-semibold hover:underline">
            How it works
          </a>
          <a href="#faq" className="font-semibold hover:underline">
            FAQ
          </a>
        </nav>
        <div className="flex items-center gap-2.5">
          <ThemeButton labelClassName="max-[540px]:hidden" />
          {signedIn ? (
            <Link to="/app" className={buttonClass('primary')}>
              Open SplitIt
            </Link>
          ) : (
            <>
              <Link to="/auth" className={`${buttonClass()} max-[860px]:hidden`}>
                Log in
              </Link>
              <Link to="/auth?mode=signup" className={buttonClass('primary')}>
                Get started
              </Link>
            </>
          )}
        </div>
      </header>

      <section
        className={`${wrap} grid grid-cols-[1.05fr_1fr] items-center gap-14 pt-16 pb-14 max-[860px]:grid-cols-1 max-[860px]:gap-8.5 max-[860px]:py-8.5`}
      >
        <div>
          <h1 className="text-[clamp(2.6rem,6.5vw,4.6rem)] leading-none font-normal">
            Split expenses. <span className="highlighter">Keep the peace.</span>
          </h1>
          <p className="mt-5 mb-7 max-w-[40ch] text-[1.12rem] text-muted">
            Track shared costs, settle up easily, and never awkwardly ask for money again.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Link
              to={signedIn ? '/app' : '/auth?mode=signup'}
              className={buttonClass('primary', { big: true })}
            >
              {signedIn ? 'Open SplitIt' : 'Get started free'}
            </Link>
            <a href="#how" className={buttonClass('default', { big: true })}>
              See how it works
            </a>
          </div>
        </div>

        <div
          aria-hidden="true"
          className="rotate-[1.2deg] rounded-pen border-pen bg-sheet px-6.5 pt-6 pb-6.5 shadow-offset-lg max-[860px]:rotate-0"
        >
          <div className="flex items-center justify-between font-display text-[1.4rem]">
            <span>Lekki weekend</span>
            <span className="inline-flex [&>*+*]:-ml-2">
              {['dami', 'ada', 'femi', 'zainab'].map((seed) => (
                <Avatar key={seed} seed={seed} name={seed} />
              ))}
            </span>
          </div>
          <table className="mt-3.5 w-full border-collapse text-[.95rem]">
            <tbody>
              {SAMPLE.map(([what, who, amount]) => (
                <tr key={what} className="border-b border-rule">
                  <td className="px-1 py-2">{what}</td>
                  <td className="px-1 py-2 text-muted">{who}</td>
                  <td className="px-1 py-2 text-right font-mono">{amount}</td>
                </tr>
              ))}
              <tr className="border-t-[1.5px] border-solid border-ink font-semibold">
                <td className="px-1 py-2">₦55,650 each</td>
                <td />
                <td className="px-1 py-2 text-right font-mono">₦222,600</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-4.5 flex flex-wrap items-center gap-3 font-display text-[1.5rem]">
            You owe Ada <span className="fig-total text-[.8em] text-red">₦35,650</span>
            <span className="inline-grid size-7.5 place-items-center text-biro [&_path]:animate-draw [&_path]:[stroke-dasharray:40] [&_path]:[stroke-dashoffset:40] [&_path]:[animation-delay:1.8s]">
              <Icon name="tick" className="size-full" />
            </span>
          </p>
        </div>
      </section>

      <section id="features" className={`${wrap} py-13 max-[860px]:py-9`}>
        <div className={secHead}>
          <h2 className="text-2xl">Built for trips, flats and dinners</h2>
        </div>
        <div className="mt-5.5 grid grid-cols-3 gap-8.5 max-[860px]:grid-cols-1 max-[860px]:gap-5.5">
          <Feature title="Create groups">
            A trip, house rent, a standing Friday dinner. Invite people with a link or an email.
          </Feature>
          <Feature title="Track expenses live">
            Add what you spent and everyone in the group sees it right away, without refreshing.
          </Feature>
          <Feature title="Settle up with ease">
            SplitIt works out the fewest payments that clear everyone&apos;s balance. Tick them off
            as you go.
          </Feature>
        </div>
      </section>

      <section id="how" className={`${wrap} py-13 max-[860px]:py-9`}>
        <div className={secHead}>
          <h2 className="text-2xl">How it works</h2>
        </div>
        <ol className="mt-5.5 [counter-reset:s]">
          <Step title="Make a group">Name it and invite the people you share costs with.</Step>
          <Step title="Write down what you spend">
            Say who paid and who it was for. Split equally or set custom amounts.
          </Step>
          <Step title="Pay each other back">
            See who owes whom, pay, and record it. Balances update for everyone.
          </Step>
        </ol>
      </section>

      <section id="faq" className={`${wrap} py-13 max-[860px]:py-9`}>
        <div className={secHead}>
          <h2 className="text-2xl">Questions</h2>
        </div>
        {FAQ.map(([q, a]) => (
          <details key={q} className="group border-b border-rule py-4">
            <summary className="flex cursor-pointer list-none justify-between gap-3 font-display text-[1.25rem] after:font-mono after:content-['+'] group-open:after:content-['–'] [&::-webkit-details-marker]:hidden">
              {q}
            </summary>
            <p className="mt-2 max-w-[62ch] text-muted">{a}</p>
          </details>
        ))}
      </section>

      <footer
        className={`${wrap} flex flex-wrap justify-between gap-3 border-t-[1.5px] border-solid border-ink py-7 text-[.9rem] text-muted`}
      >
        <span>SplitIt, a shared expense splitter.</span>
        <Link to={signedIn ? '/app' : '/auth?mode=signup'} className={buttonClass('link')}>
          {signedIn ? 'Open SplitIt' : 'Get started free'}
        </Link>
      </footer>
    </div>
  )
}

function Feature({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-[1.4rem]">{title}</h3>
      <p className="text-muted">{children}</p>
    </div>
  )
}

function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[56px_1fr] gap-1.5 border-b border-rule py-4.5 [counter-increment:s] before:font-display before:text-[2.4rem] before:leading-none before:text-biro before:content-[counter(s)]">
      <h3 className="text-[1.3rem]">{title}</h3>
      <p className="col-start-2 text-muted">{children}</p>
    </li>
  )
}
