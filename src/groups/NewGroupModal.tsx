import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type SyntheticEvent } from 'react'
import { useNavigate } from 'react-router'
import { COVERS, createGroupInput, type CoverName } from '../../server/shared/schemas'
import { useSignedIn } from '../auth/context'
import { callableErrorMessage, createGroup } from '../lib/callables'
import { ACCEPT_ATTR, imageProblem } from '../lib/images'
import { CURRENCIES, CURRENCY_CODES, type CurrencyCode } from '../lib/money'
import { Button } from '../ui/Button'
import { Field, labelClass, selectClass } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { useToast } from '../ui/toastContext'
import { CoverArt } from './Cover'
import { refreshGroup } from './queries'
import { STORAGE_UPLOADS, UPLOADS_NOTE } from '../lib/uploads'
import { uploadCover } from './uploadCover'

/** "Start a new group": name, currency, and an illustrated cover or your own photo. */
export function NewGroupModal({ onClose }: { onClose: () => void }) {
  const { profile } = useSignedIn()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const currencyId = useId()
  const coverLabelId = useId()
  const fileInput = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [currency, setCurrency] = useState<CurrencyCode>(profile?.defaultCurrency ?? 'NGN')
  const [cover, setCover] = useState<CoverName>('beach')
  /** The chosen photo and a local URL to preview it. */
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Free the preview's memory when the photo changes or the dialog closes.
  useEffect(() => {
    if (!photo) return
    return () => {
      URL.revokeObjectURL(photo.url)
    }
  }, [photo])

  function onPickFile(file: File | undefined) {
    if (!file) return
    const problem = imageProblem(file)
    setError(problem)
    if (!problem) setPhoto({ file, url: URL.createObjectURL(file) })
  }

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    // Same schema the createGroup function enforces, so the messages match.
    const parsed = createGroupInput.safeParse({ name, currency, cover })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the form and try again.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { groupId } = await createGroup({ name, currency, cover })
      // The group exists either way; a failed photo only means it keeps the illustration.
      const photoFailed = photo
        ? await uploadCover(groupId, photo.file).then(
            () => false,
            () => true,
          )
        : false
      await refreshGroup(queryClient, groupId)
      onClose()
      await navigate(`/app/groups/${groupId}`)
      toast(
        photoFailed
          ? `${parsed.data.name} is ready, but the photo didn't upload. Try again with Change cover.`
          : `${parsed.data.name} is ready. Invite your friends.`,
      )
    } catch (e) {
      setError(callableErrorMessage(e))
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Start a new group"
      description="A trip, a flat, a regular dinner. Invite people next."
      onClose={onClose}
    >
      <form noValidate onSubmit={(e) => void onSubmit(e)}>
        <Field
          label="Group name"
          placeholder="Abuja trip"
          autoComplete="off"
          maxLength={60}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
          }}
        />
        <label htmlFor={currencyId} className={labelClass}>
          Currency
        </label>
        <select
          id={currencyId}
          className={selectClass}
          value={currency}
          onChange={(e) => {
            setCurrency(e.target.value as CurrencyCode)
          }}
        >
          {CURRENCY_CODES.map((code) => (
            <option key={code} value={code}>
              {code} · {CURRENCIES[code].name}
            </option>
          ))}
        </select>
        <p className="mt-2 text-[.88rem] text-muted">
          Everyone in the group uses it. It can't be changed later.
        </p>

        <div className="mt-[22px] flex items-baseline justify-between border-b-[1.5px] border-solid border-ink pb-1">
          <span
            className="text-[.82rem] font-semibold tracking-[.02em] text-muted"
            id={coverLabelId}
          >
            Cover
          </span>
        </div>
        <div
          role="group"
          aria-labelledby={coverLabelId}
          className="mt-2.5 flex flex-wrap items-center gap-2.5"
        >
          {COVERS.map((c) => {
            const pressed = !photo && cover === c
            return (
              <button
                key={c}
                type="button"
                aria-label={`${c} cover`}
                aria-pressed={pressed}
                onClick={() => {
                  setCover(c)
                  setPhoto(null)
                }}
                className={`h-11 w-[78px] overflow-hidden rounded-tick border-2 border-solid p-0 ${
                  pressed ? 'border-biro outline-2 outline-offset-1 outline-biro' : 'border-rule'
                }`}
              >
                <CoverArt name={c} />
              </button>
            )
          })}
          {photo ? (
            <span className="h-11 w-[78px] overflow-hidden rounded-tick border-2 border-solid border-biro outline-2 outline-offset-1 outline-biro">
              <img src={photo.url} alt="Your photo" className="block size-full object-cover" />
            </span>
          ) : null}
          {STORAGE_UPLOADS ? (
            <>
              <Button
                variant="link"
                onClick={() => {
                  fileInput.current?.click()
                }}
              >
                {photo ? 'Choose another photo' : 'Upload a photo'}
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPT_ATTR}
                hidden
                onChange={(e) => {
                  onPickFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </>
          ) : null}
        </div>
        {STORAGE_UPLOADS ? null : <p className="mt-2 text-[.88rem] text-muted">{UPLOADS_NOTE}</p>}

        <p role="alert" className="mt-2.5 min-h-[1.4em] text-[.9rem] text-red">
          {error}
        </p>
        <div className="mt-4 flex items-center justify-end gap-2.5">
          <Button variant="link" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create group'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
