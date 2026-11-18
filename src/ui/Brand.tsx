import { Link } from 'react-router'

/** The "SplitIt" wordmark. A link home when `to` is given. */
export function Brand({ to, className = '' }: { to?: string; className?: string }) {
  const mark = (
    <>
      Split<em className="font-normal text-biro italic">It</em>
    </>
  )
  const style = `font-display text-[1.6rem] font-semibold tracking-[-0.02em] text-ink ${className}`
  return to ? (
    <Link to={to} className={style} aria-label="SplitIt home">
      {mark}
    </Link>
  ) : (
    <span className={style}>{mark}</span>
  )
}
