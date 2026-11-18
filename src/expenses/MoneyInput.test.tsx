// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CurrencyCode, ParsedAmount } from '../lib/money'
import { MoneyInput } from './MoneyInput'

afterEach(cleanup)

/** A parent that keeps the text, like the real forms do, and records every parse result. */
function Harness({
  currency,
  onParsed,
  error,
}: {
  currency: CurrencyCode
  onParsed: (p: ParsedAmount) => void
  error?: string
}) {
  const [text, setText] = useState('')
  return (
    <MoneyInput
      label="Amount"
      currency={currency}
      value={text}
      error={error ?? null}
      onChange={(next, parsed) => {
        setText(next)
        onParsed(parsed)
      }}
    />
  )
}

function type(text: string) {
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: text } })
}

describe('<MoneyInput>', () => {
  it('shows the currency symbol next to a labelled box', () => {
    render(<Harness currency="NGN" onParsed={vi.fn()} />)
    expect(screen.getByText('₦')).toBeTruthy()
    expect(screen.getByLabelText('Amount').getAttribute('placeholder')).toBe('0.00')
  })

  it('turns "1,250.50" into 125050 kobo and keeps the text as typed', () => {
    const onParsed = vi.fn()
    render(<Harness currency="NGN" onParsed={onParsed} />)
    type('1,250.50')
    expect(onParsed).toHaveBeenLastCalledWith({ ok: true, minor: 125_050 })
    expect(screen.getByLabelText<HTMLInputElement>('Amount').value).toBe('1,250.50')
  })

  it('reports why text is not an amount', () => {
    const onParsed = vi.fn()
    render(<Harness currency="GBP" onParsed={onParsed} />)
    type('12.345')
    expect(onParsed).toHaveBeenLastCalledWith({ ok: false, message: 'Use at most 2 decimals.' })
  })

  it('uses whole yen: the number pad on phones, no decimals accepted', () => {
    const onParsed = vi.fn()
    render(<Harness currency="JPY" onParsed={onParsed} />)
    const input = screen.getByLabelText('Amount')
    expect(screen.getByText('¥')).toBeTruthy()
    expect(input.getAttribute('inputmode')).toBe('numeric')
    expect(input.getAttribute('placeholder')).toBe('0')
    type('1,500')
    expect(onParsed).toHaveBeenLastCalledWith({ ok: true, minor: 1_500 })
    type('1500.5')
    expect(onParsed.mock.lastCall?.[0]).toMatchObject({
      ok: false,
      message: expect.stringMatching(/no decimals/) as unknown,
    })
  })

  it('shows an error, marks the box invalid and links the message to it', () => {
    render(<Harness currency="NGN" onParsed={vi.fn()} error="Enter an amount above zero." />)
    const input = screen.getByLabelText('Amount')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const describedBy = input.getAttribute('aria-describedby') ?? ''
    expect(document.getElementById(describedBy)?.textContent).toBe('Enter an amount above zero.')
  })
})
