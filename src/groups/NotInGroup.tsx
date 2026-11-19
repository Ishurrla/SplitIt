import { Link } from 'react-router'
import { buttonClass } from '../ui/buttonStyles'

/**
 * Shown for any group the server refused, whether it exists or not. The log is real: it names the
 * live connection this page opened and the code Firestore answered with. `whileViewing` is for access that
 * ended while the group was open (someone removed you, or the group was deleted).
 */
export function NotInGroup({
  groupId,
  serverCode,
  whileViewing = false,
}: {
  groupId: string
  serverCode: string
  whileViewing?: boolean
}) {
  const shortId = groupId.length > 8 ? `${groupId.slice(0, 4)}…` : groupId
  return (
    <div>
      <p className="text-[.9rem] text-muted">
        {whileViewing ? 'Your access to this group just ended' : 'Someone sent you a group link'}
      </p>
      <h1 className="text-[clamp(2rem,5vw,3rem)] leading-[1.1] font-normal">
        {whileViewing ? "You're not in this group any more." : "You're not in this group."}
      </h1>
      <p className="mt-2.5 max-w-[52ch] font-display text-[clamp(1.5rem,3.5vw,2.1rem)] leading-[1.3]">
        {whileViewing
          ? 'You were removed, or the group was closed. Ask someone in the group if you think this is a mistake.'
          : 'Only members can see its expenses, balances or payments. Ask someone in the group to invite you.'}
      </p>
      <div className="mt-4 border-l-[5px] border-solid border-biro bg-sheet px-[18px] py-3.5">
        <b>
          {whileViewing
            ? 'What the server said to this page’s live connection'
            : 'What the server said when this page asked for the group'}
        </b>
        <pre className="mt-2.5 overflow-x-auto bg-wash p-3.5 font-mono text-[.82rem] leading-[1.75]">
          {`onSnapshot(groups/${shortId})    ${serverCode}`}
        </pre>
        <p className="mt-2 text-[.88rem] text-muted">
          Firestore refuses the whole request, reads and writes alike. It gives the same answer for
          a group that doesn&apos;t exist, so this page can&apos;t tell you which one it was.
        </p>
      </div>
      <div className="mt-[22px] flex flex-wrap gap-2.5">
        <Link to="/app/groups" className={buttonClass('primary')}>
          Back to my groups
        </Link>
      </div>
    </div>
  )
}
