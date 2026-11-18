import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { Modal } from '../ui/Modal'

/**
 * Opened by the search button and Ctrl+K / ⌘K. The search itself (groups and expenses you can
 * see, matched in the browser) is built in Phase 6; until then the box says so plainly.
 */
export function SearchDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Search" onClose={onClose}>
      <Field
        label="Groups and expenses"
        type="search"
        placeholder="Search groups, expenses…"
        hint="Search is built in Phase 6. For now this box doesn't find anything."
      />
      <div className="mt-6 flex justify-end">
        <Button onClick={onClose}>Close</Button>
      </div>
    </Modal>
  )
}
