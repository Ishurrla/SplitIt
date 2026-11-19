import { useQueries } from '@tanstack/react-query'
import { useId, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import { useSignedIn } from '../auth/context'
import { expensesQuery, useMyGroups } from '../groups/queries'
import type { Group } from '../groups/types'
import type { Expense } from '../expenses/types'
import { formatMinor } from '../lib/money'
import { search, type SearchResult } from '../search/search'
import { Button } from '../ui/Button'
import { inputClass } from '../ui/Field'
import { Modal } from '../ui/Modal'

/**
 * Ctrl+K / ⌘K search over your groups and their latest expenses. It runs in the browser on data
 * loaded from Firestore (which has no substring search), so it only finds what you can read.
 * Up and down to move, Enter to open, Esc to close.
 */
export function SearchDialog({ onClose }: { onClose: () => void }) {
  const { user } = useSignedIn()
  const navigate = useNavigate()
  const listId = useId()
  const [text, setText] = useState('')
  const [active, setActive] = useState(0)

  const groups = useMyGroups(user.uid)
  const list = groups.data ?? []
  const expenseQueries = useQueries({ queries: list.map((g) => expensesQuery(g.id)) })
  const expensesByGroup = new Map(list.map((g, i) => [g.id, expenseQueries[i]?.data ?? []]))
  const stillLoading = groups.isPending || expenseQueries.some((q) => q.isPending)

  const results = search<Group, Expense>(text, list, expensesByGroup)
  const current = Math.min(active, Math.max(0, results.length - 1))
  const optionId = (i: number) => `${listId}-option-${i}`

  function open(result: SearchResult<Group, Expense> | undefined) {
    if (!result) return
    onClose()
    void navigate(
      result.kind === 'group'
        ? `/app/groups/${result.group.id}`
        : `/app/groups/${result.group.id}?expense=${result.expense.id}`,
    )
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive(Math.min(results.length - 1, current + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive(Math.max(0, current - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      open(results[current])
    }
  }

  return (
    <Modal title="Search" onClose={onClose}>
      <input
        type="search"
        role="combobox"
        aria-label="Search groups and expenses"
        aria-expanded={results.length > 0}
        aria-controls={listId}
        aria-activedescendant={results.length > 0 ? optionId(current) : undefined}
        autoComplete="off"
        placeholder="Search groups and expenses"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setActive(0)
        }}
        onKeyDown={onKeyDown}
        className={`${inputClass} mt-3`}
      />
      <ul id={listId} role="listbox" aria-label="Results" className="mt-2.5">
        {results.map((r, i) => {
          const selected = i === current
          return (
            <li
              key={r.kind === 'group' ? `g-${r.group.id}` : `e-${r.expense.id}`}
              id={optionId(i)}
              role="option"
              aria-selected={selected}
              onMouseEnter={() => {
                setActive(i)
              }}
              onClick={() => {
                open(r)
              }}
              className={`flex cursor-pointer items-baseline justify-between gap-3 border-b border-rule px-2 py-[11px] ${
                selected ? 'bg-wash' : ''
              }`}
            >
              <span>{r.kind === 'group' ? r.group.name : r.expense.title}</span>
              <small className="text-muted">
                {r.kind === 'group'
                  ? 'Group'
                  : `${r.group.name} · ${formatMinor(r.expense.amountMinor, r.group.currency)}`}
              </small>
            </li>
          )
        })}
        {results.length === 0 && text.trim() !== '' && !stillLoading ? (
          <li className="px-0.5 py-3.5 text-[.88rem] text-muted">
            Nothing matches that. Try a group name or an expense title.
          </li>
        ) : null}
      </ul>
      <p className="mt-2 text-[.88rem] text-muted">
        {stillLoading
          ? 'Loading your groups and expenses…'
          : 'Searches your groups and their latest expenses, here in your browser. Up and down to move, Enter to open, Esc to close.'}
      </p>
      <div className="mt-6 flex justify-end">
        <Button variant="link" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  )
}
