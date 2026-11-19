// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CurrencyCode } from '../lib/money'
import { ExpenseForm, type ExpenseFormValues, type FormMember } from './ExpenseForm'

afterEach(cleanup)

// Members in the order they joined: equal splits give the odd kobo to the first names.
const members: FormMember[] = [
  { uid: 'ada', displayName: 'Ada', photoPath: null, photoURL: null },
  { uid: 'bayo', displayName: 'Bayo', photoPath: null, photoURL: null },
  { uid: 'chi', displayName: 'Chi', photoPath: null, photoURL: null },
]

function renderForm(
  opts: { currency?: CurrencyCode; initial?: Parameters<typeof ExpenseForm>[0]['initial'] } = {},
) {
  const onSubmit = vi.fn<(v: ExpenseFormValues) => void>()
  render(
    <ExpenseForm
      currency={opts.currency ?? 'NGN'}
      members={members}
      me="ada"
      initial={opts.initial}
      submitLabel="Add expense"
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
  )
  return onSubmit
}

const typeInto = (label: string, value: string) => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}
const share = (uid: string) => screen.getByTestId(`share-${uid}`).textContent
const status = () =>
  screen.getByText(/assign|too much|odd|Untick|Enter the amount first/).textContent
const submit = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Add expense' }))
}

describe('<ExpenseForm> equal split', () => {
  it('splits ₦100.00 three ways as 33.34 / 33.33 / 33.33 and says why', () => {
    renderForm()
    typeInto('Amount', '100')
    expect([share('ada'), share('bayo'), share('chi')]).toEqual(['₦33.34', '₦33.33', '₦33.33'])
    expect(status()).toBe('The odd kobo goes to the first names so the total always matches.')
  })

  it('re-splits when someone is unticked', () => {
    renderForm()
    typeInto('Amount', '100')
    fireEvent.click(screen.getByLabelText('Chi'))
    expect([share('ada'), share('bayo'), share('chi')]).toEqual(['₦50', '₦50', '—'])
    expect(status()).toBe('Untick anyone who was not part of it.')
  })

  it('splits yen in whole yen: ¥1,000 is 334 / 333 / 333', () => {
    renderForm({ currency: 'JPY' })
    typeInto('Amount', '1,000')
    expect([share('ada'), share('bayo'), share('chi')]).toEqual(['¥334', '¥333', '¥333'])
    expect(status()).toBe('The odd yen goes to the first names so the total always matches.')
  })

  it('submits shares that add up exactly to the amount', () => {
    const onSubmit = renderForm()
    typeInto('What was it for?', '  Suya and drinks ')
    typeInto('Amount', '100')
    submit()
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Suya and drinks',
      amountMinor: 10_000,
      paidBy: 'ada',
      splits: { ada: 3_334, bayo: 3_333, chi: 3_333 },
      receipt: { kind: 'none' },
    })
  })
})

describe('<ExpenseForm> custom amounts', () => {
  function startCustom() {
    const onSubmit = renderForm()
    typeInto('What was it for?', 'Jollof lunch')
    typeInto('Amount', '100')
    fireEvent.click(screen.getByRole('button', { name: 'Custom amounts' }))
    return onSubmit
  }

  it('starts from the equal shares, so the total already matches', () => {
    startCustom()
    expect(screen.getByLabelText<HTMLInputElement>('Amount for You').value).toBe('33.34')
    expect(status()).toBe('Every kobo is assigned.')
  })

  it('keeps a running total: left to assign, too much, then every kobo assigned', () => {
    startCustom()
    typeInto('Amount for You', '50')
    typeInto('Amount for Bayo', '30')
    typeInto('Amount for Chi', '')
    expect(status()).toBe('₦20 left to assign.')
    typeInto('Amount for Chi', '30')
    expect(status()).toBe('₦10 too much.')
    typeInto('Amount for Chi', '20')
    expect(status()).toBe('Every kobo is assigned.')
  })

  it('refuses to submit while the amounts do not add up', () => {
    const onSubmit = startCustom()
    typeInto('Amount for You', '50')
    typeInto('Amount for Bayo', '30')
    typeInto('Amount for Chi', '')
    submit()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe(
      '₦20 is still unassigned. Custom amounts must add up to the total.',
    )
    typeInto('Amount for Chi', '25.50')
    submit()
    expect(screen.getByRole('alert').textContent).toBe('Custom amounts are ₦5.50 over the total.')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits uneven custom shares in kobo, leaving out anyone with nothing', () => {
    const onSubmit = startCustom()
    typeInto('Amount for You', '66.67')
    typeInto('Amount for Bayo', '33.33')
    typeInto('Amount for Chi', '0')
    submit()
    expect(onSubmit.mock.lastCall?.[0]).toMatchObject({
      amountMinor: 10_000,
      splits: { ada: 6_667, bayo: 3_333 },
    })
  })

  it('marks a box that is not a number, and says so', () => {
    const onSubmit = startCustom()
    typeInto('Amount for Bayo', '3o')
    expect(screen.getByLabelText('Amount for Bayo').getAttribute('aria-invalid')).toBe('true')
    submit()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/isn't a number/)
  })
})

describe('<ExpenseForm> checks and editing', () => {
  it('asks for a title, an amount and at least one person', () => {
    const onSubmit = renderForm()
    submit()
    expect(screen.getByText(/Give it a short title/)).toBeTruthy()
    expect(screen.getByText('Enter an amount.')).toBeTruthy()
    typeInto('What was it for?', 'Taxi')
    typeInto('Amount', '10')
    for (const name of ['You', 'Bayo', 'Chi']) fireEvent.click(screen.getByLabelText(name))
    submit()
    expect(screen.getByRole('alert').textContent).toBe('Tick at least one person to split with.')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('opens an uneven saved expense in custom mode with its amounts', () => {
    renderForm({
      initial: {
        title: 'Rent',
        amountMinor: 7_777,
        paidBy: 'bayo',
        splits: { ada: 5_000, chi: 2_777 },
        receiptUrl: null,
      },
    })
    expect(
      screen.getByRole('button', { name: 'Custom amounts' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(screen.getByLabelText<HTMLInputElement>('Amount').value).toBe('77.77')
    expect(screen.getByLabelText<HTMLInputElement>('Amount for You').value).toBe('50')
    expect(screen.getByLabelText<HTMLInputElement>('Amount for Chi').value).toBe('27.77')
    expect(screen.getByLabelText<HTMLInputElement>('Bayo').checked).toBe(false)
    expect(screen.getByLabelText<HTMLSelectElement>('Paid by').value).toBe('bayo')
    expect(status()).toBe('Every kobo is assigned.')
  })

  it('opens an evenly split saved expense in equal mode', () => {
    renderForm({
      initial: {
        title: 'Suya',
        amountMinor: 10_000,
        paidBy: 'ada',
        splits: { ada: 3_334, bayo: 3_333, chi: 3_333 },
        receiptUrl: null,
      },
    })
    expect(screen.getByRole('button', { name: 'Equally' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    const list = screen.getByRole('list')
    expect(within(list).getAllByText(/₦33\.3/)).toHaveLength(3)
  })
})
