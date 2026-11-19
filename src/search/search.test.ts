import { describe, expect, it } from 'vitest'
import { normalise, search } from './search'

const groups = [
  { id: 'g1', name: 'Lekki weekend' },
  { id: 'g2', name: 'Flat 4B' },
]
const expenses = new Map([
  [
    'g1',
    [
      { id: 'e1', title: 'Suya and drinks', amountMinor: 1_860_000 },
      { id: 'e2', title: 'Airbnb, 2 nights', amountMinor: 18_000_000 },
    ],
  ],
  ['g2', [{ id: 'e3', title: 'Electricity token', amountMinor: 1_500_000 }]],
])

const labels = (q: string) =>
  search(q, groups, expenses).map((r) =>
    r.kind === 'group' ? `group:${r.group.name}` : `expense:${r.expense.title}`,
  )

describe('search', () => {
  it('lists the groups when nothing is typed', () => {
    expect(labels('')).toEqual(['group:Lekki weekend', 'group:Flat 4B'])
    expect(labels('   ')).toEqual(['group:Lekki weekend', 'group:Flat 4B'])
  })

  it('finds groups and expenses by any part of the name, ignoring case', () => {
    expect(labels('SUYA')).toEqual(['expense:Suya and drinks'])
    expect(labels('flat')).toEqual(['group:Flat 4B'])
    expect(labels('night')).toEqual(['expense:Airbnb, 2 nights'])
  })

  it('needs every word, in any order', () => {
    expect(labels('drinks suya')).toEqual(['expense:Suya and drinks'])
    expect(labels('suya taxi')).toEqual([])
  })

  it('puts groups before expenses', () => {
    expect(labels('e')[0]).toBe('group:Lekki weekend')
  })

  it('ignores accents', () => {
    expect(normalise('Café  Ọja')).toBe('cafe oja')
    expect(search('cafe', [{ id: 'g', name: 'Café Neo' }], new Map())).toHaveLength(1)
  })

  it('stops at 20 results', () => {
    const many = new Map([
      [
        'g1',
        Array.from({ length: 40 }, (_, i) => ({ id: `x${i}`, title: `Taxi ${i}`, amountMinor: 1 })),
      ],
    ])
    expect(search('taxi', groups, many)).toHaveLength(20)
  })
})
