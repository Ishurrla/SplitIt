import type { Group } from '../groups/types'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'

/** "Which group is this for?" before adding an expense or inviting from the dashboard. */
export function GroupPicker({
  title,
  groups,
  onPick,
  onClose,
}: {
  title: string
  groups: readonly Group[]
  onPick: (group: Group) => void
  onClose: () => void
}) {
  return (
    <Modal title={title} description="Which group is this for?" onClose={onClose}>
      <ul className="mt-2.5">
        {groups.map((g) => (
          <li key={g.id}>
            <button
              type="button"
              onClick={() => {
                onPick(g)
              }}
              className="flex w-full items-baseline justify-between gap-3 border-b border-rule px-2 py-[11px] text-left text-ink hover:bg-wash"
            >
              <span>{g.name}</span>
              <small className="text-muted">
                {g.memberIds.length} {g.memberIds.length === 1 ? 'person' : 'people'} · {g.currency}
              </small>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex justify-end">
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  )
}
