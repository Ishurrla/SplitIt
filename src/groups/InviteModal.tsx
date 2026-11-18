import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState, type SyntheticEvent } from 'react'
import { email as emailSchema } from '../../functions/src/shared/schemas'
import { callableErrorMessage, createInvite } from '../lib/callables'
import { Button } from '../ui/Button'
import { inputClass, labelClass } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { keys, usePendingInvites } from './queries'
import type { Group } from './types'

const joinUrl = (token: string) => `${window.location.origin}/join/${token}`
const shortDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/**
 * Share the group's link, or make a personal invite for one email address.
 * No email is sent yet (choosing a sender is a Phase 9 decision), so a personal invite gives you
 * a link to send yourself. Only the owner sees the pending list, because only the owner may read
 * invites (firestore.rules).
 */
export function InviteModal({
  group,
  isOwner,
  onClose,
}: {
  group: Group
  isOwner: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const linkId = useId()
  const emailId = useId()

  // The function returns the existing link while it has more than a day left, so this is safe to repeat.
  const link = useQuery({
    queryKey: ['inviteLink', group.id],
    queryFn: () => createInvite({ groupId: group.id }),
    staleTime: 60_000,
  })
  const pending = usePendingInvites(group.id, isOwner)

  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [personal, setPersonal] = useState<{ email: string; url: string; reused: boolean } | null>(
    null,
  )

  async function onInviteEmail(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = emailSchema.safeParse(email)
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message ?? 'Enter a full email address.')
      return
    }
    setSending(true)
    setEmailError(null)
    try {
      const result = await createInvite({ groupId: group.id, email: parsed.data })
      setPersonal({ email: parsed.data, url: joinUrl(result.token), reused: result.reused })
      setEmail('')
      await queryClient.invalidateQueries({ queryKey: keys.invites(group.id) })
    } catch (e) {
      setEmailError(callableErrorMessage(e))
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal
      title={`Invite to ${group.name}`}
      description="Share a link, or make an invite for one email address."
      onClose={onClose}
    >
      <label htmlFor={linkId} className={labelClass}>
        Invite link
      </label>
      {link.isError ? (
        <p className="mt-2 text-[.9rem] text-red">
          {callableErrorMessage(link.error)}{' '}
          <Button variant="link" onClick={() => void link.refetch()}>
            Try again
          </Button>
        </p>
      ) : (
        <CopyRow
          id={linkId}
          value={link.data ? joinUrl(link.data.token) : 'Making a link…'}
          disabled={!link.data}
        />
      )}
      {link.data ? (
        <p className="mt-2 text-[.88rem] text-muted">
          Anyone with this link can join until {shortDate(new Date(link.data.expiresAt))}.
        </p>
      ) : null}

      <form noValidate onSubmit={(e) => void onInviteEmail(e)}>
        <label htmlFor={emailId} className={labelClass}>
          Or for one email address
        </label>
        <div className="flex items-end gap-3">
          <input
            id={emailId}
            type="email"
            autoComplete="off"
            placeholder="friend@example.com"
            className={inputClass}
            value={email}
            aria-invalid={emailError ? true : undefined}
            onChange={(e) => {
              setEmail(e.target.value)
            }}
          />
          <Button type="submit" variant="primary" disabled={sending}>
            {sending ? 'One moment…' : 'Invite'}
          </Button>
        </div>
        <p role="alert" className="mt-2.5 min-h-[1.4em] text-[.9rem] text-red">
          {emailError}
        </p>
      </form>

      {personal ? (
        <div className="mt-1 border-l-[5px] border-solid border-biro bg-paper px-4 py-3">
          <p className="text-[.95rem]">
            {personal.reused ? 'This address already has an invite. ' : ''}
            SplitIt doesn&apos;t send emails yet. Send <b>{personal.email}</b> this link yourself.
            Only that address can use it, once.
          </p>
          <CopyRow value={personal.url} label={`Personal invite link for ${personal.email}`} />
        </div>
      ) : null}

      {isOwner && pending.data && pending.data.length > 0 ? (
        <ul className="mt-3">
          {pending.data.map((inv) => (
            <li
              key={inv.token}
              className="flex justify-between gap-3 border-b border-rule py-2 text-[.95rem]"
            >
              <span>{inv.email ?? 'Shareable link'}</span>
              <small className="text-muted">
                {inv.email ? 'invite pending' : 'active'} · until{' '}
                {shortDate(inv.expiresAt.toDate())}
              </small>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 flex justify-end">
        <Button onClick={onClose}>Done</Button>
      </div>
    </Modal>
  )
}

/** A read-only field with a Copy button; falls back to selecting the text if the clipboard is blocked. */
function CopyRow({
  value,
  id,
  label,
  disabled,
}: {
  value: string
  id?: string
  label?: string
  disabled?: boolean
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle')
  const [input, setInput] = useState<HTMLInputElement | null>(null)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setState('copied')
    } catch {
      input?.select()
      setState('manual')
    }
  }

  return (
    <div className="mt-1 flex items-end gap-3">
      <input
        ref={setInput}
        id={id}
        aria-label={label}
        readOnly
        value={value}
        className={`${inputClass} font-mono text-[.9rem]`}
        onFocus={(e) => {
          e.target.select()
        }}
      />
      <Button disabled={disabled} onClick={() => void copy()}>
        {state === 'copied' ? 'Copied' : state === 'manual' ? 'Press Ctrl+C' : 'Copy'}
      </Button>
    </div>
  )
}
