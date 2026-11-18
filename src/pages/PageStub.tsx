import type { ReactNode } from 'react'

/**
 * A screen whose real content arrives in a later phase. It says so instead of showing
 * made-up data, and is replaced (not extended) when that phase lands.
 */
export function PageStub({
  eyebrow,
  title,
  phase,
  children,
}: {
  eyebrow?: string
  title: string
  phase: number
  children?: ReactNode
}) {
  return (
    <div>
      {eyebrow ? <p className="text-[.9rem] text-muted">{eyebrow}</p> : null}
      <h1 className="text-[clamp(2rem,5vw,3rem)] leading-[1.1] font-normal">{title}</h1>
      {children}
      <div className="mt-6 rounded-pen border-[1.5px] border-dashed border-muted px-[22px] py-[34px] text-center">
        <p className="text-muted">This screen is built in Phase {phase}.</p>
      </div>
    </div>
  )
}
