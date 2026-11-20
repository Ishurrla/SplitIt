import { doc, updateDoc } from 'firebase/firestore'
import { useId, useRef, useState, type ReactNode, type SyntheticEvent } from 'react'
import { useSignedIn } from '../auth/context'
import { callableErrorMessage, updateProfile } from '../lib/callables'
import { db } from '../lib/firebase'
import { STORAGE_UPLOADS, UPLOADS_NOTE, uploadJpeg } from '../lib/uploads'
import { ACCEPT_ATTR, imageProblem, newPhotoName, resizeToJpeg } from '../lib/images'
import { CURRENCIES, CURRENCY_CODES, type CurrencyCode } from '../lib/money'
import { LogOutButton } from '../shell/LogOutButton'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { inputClass, selectClass } from '../ui/Field'
import { ThemeButton } from '../ui/ThemeButton'
import { useToast } from '../ui/toastContext'

/** Avatars never show larger than 84px, so 512px is plenty. */
const AVATAR_PX = 512

/**
 * Profile and preferences. Name and photo go through the updateProfile function, which also
 * updates the copy on every group's member list; reminders and default currency are the two
 * fields the rules let a person write on their own users document.
 */
export function SettingsPage() {
  const { user, profile } = useSignedIn()
  const toast = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const nameId = useId()
  const currencyId = useId()
  const [name, setName] = useState(profile?.displayName ?? '')
  const [busy, setBusy] = useState<'photo' | 'name' | null>(null)

  if (!profile) return null
  const userRef = doc(db, 'users', user.uid)

  async function onPhotoChosen(file: File | undefined) {
    if (!file) return
    const problem = imageProblem(file)
    if (problem) {
      toast(problem)
      return
    }
    setBusy('photo')
    try {
      const path = `avatars/${user.uid}/${newPhotoName()}`
      await uploadJpeg(path, await resizeToJpeg(file, AVATAR_PX))
      await updateProfile({ photoPath: path })
      toast('Profile photo updated.')
    } catch (e) {
      toast(`The photo didn't upload. ${callableErrorMessage(e)}`)
    } finally {
      setBusy(null)
    }
  }

  async function removePhoto() {
    setBusy('photo')
    try {
      await updateProfile({ photoPath: null })
      toast('Profile photo removed.')
    } catch (e) {
      toast(callableErrorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  async function saveName(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length === 0 || trimmed.length > 60) {
      toast('Use a name between 1 and 60 characters.')
      return
    }
    setBusy('name')
    try {
      await updateProfile({ displayName: trimmed })
      toast('Name updated. Your groups see it straight away.')
    } catch (e) {
      toast(callableErrorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  async function setReminders(on: boolean) {
    try {
      await updateDoc(userRef, { weeklyReminders: on })
      toast(
        on
          ? 'Weekly reminders are on. You get an email each Monday while you owe money.'
          : 'Weekly reminders are off.',
      )
    } catch {
      toast("Couldn't save that. Check your connection and try again.")
    }
  }

  async function setDefaultCurrency(code: CurrencyCode) {
    try {
      await updateDoc(userRef, { defaultCurrency: code })
      toast(`New groups will start in ${code}.`)
    } catch {
      toast("Couldn't save that. Check your connection and try again.")
    }
  }

  return (
    <div>
      <h1 className="text-[clamp(2rem,5vw,3rem)] leading-[1.1] font-normal">Settings</h1>
      <p className="mt-2.5 font-display text-[clamp(1.5rem,3.5vw,2.1rem)] leading-[1.3]">
        Your profile and how SplitIt reaches you.
      </p>

      <div className="flex flex-wrap items-center gap-5 border-b border-rule py-5">
        <Avatar
          seed={user.uid}
          name={profile.displayName}
          photoPath={profile.photoPath}
          photoURL={profile.photoURL}
          size="xl"
        />
        <div>
          <b className="text-[1.1rem]">{profile.displayName}</b>
          <p className="mt-0.5 text-[.88rem] text-muted">
            Your photo shows next to your name for everyone in your groups.
          </p>
          <div hidden={!STORAGE_UPLOADS} className="mt-2.5 flex flex-wrap gap-2.5">
            <Button
              disabled={busy === 'photo'}
              onClick={() => {
                fileInput.current?.click()
              }}
            >
              {busy === 'photo' ? 'Saving…' : profile.photoPath ? 'Change photo' : 'Upload a photo'}
            </Button>
            {profile.photoPath ? (
              <Button variant="link" disabled={busy === 'photo'} onClick={() => void removePhoto()}>
                Remove
              </Button>
            ) : null}
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT_ATTR}
              hidden
              onChange={(e) => {
                void onPhotoChosen(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>
          {STORAGE_UPLOADS ? null : (
            <p className="mt-2 max-w-[46ch] text-[.85rem] text-muted">{UPLOADS_NOTE}</p>
          )}
          {STORAGE_UPLOADS && profile.photoPath === null && profile.photoURL ? (
            <p className="mt-2 text-[.85rem] text-muted">
              Showing your Google photo until you upload one.
            </p>
          ) : null}
        </div>
      </div>

      <Row title="Your name" text="What your groups see.">
        <form className="flex items-end gap-3" onSubmit={(e) => void saveName(e)}>
          <input
            id={nameId}
            aria-label="Your name"
            className={`${inputClass} w-[220px]`}
            maxLength={60}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
            }}
          />
          <Button type="submit" disabled={busy === 'name' || name.trim() === profile.displayName}>
            {busy === 'name' ? 'Saving…' : 'Save'}
          </Button>
        </form>
      </Row>

      <Row
        title="Weekly reminder email"
        text="Every Monday, only if you owe someone money. Not sent yet: the email isn't built."
      >
        <input
          type="checkbox"
          role="switch"
          aria-label="Weekly reminder email"
          checked={profile.weeklyReminders}
          onChange={(e) => void setReminders(e.target.checked)}
          className="size-[22px] accent-biro"
        />
      </Row>

      <Row title="Theme" text="Follows your device until you choose.">
        <ThemeButton />
      </Row>

      <Row title="Default currency" text="Used for new groups. Each group keeps its own currency.">
        <label htmlFor={currencyId} className="sr-only">
          Default currency
        </label>
        <select
          id={currencyId}
          className={`${selectClass} w-auto min-w-[200px]`}
          value={profile.defaultCurrency}
          onChange={(e) => void setDefaultCurrency(e.target.value as CurrencyCode)}
        >
          {CURRENCY_CODES.map((c) => (
            <option key={c} value={c}>
              {c} · {CURRENCIES[c].name}
            </option>
          ))}
        </select>
      </Row>

      <Row title="Log out" text="You can sign back in with email or Google.">
        <LogOutButton />
      </Row>
    </div>
  )
}

function Row({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rule py-[18px]">
      <div>
        <b className="block font-semibold">{title}</b>
        <span className="text-[.9rem] text-muted">{text}</span>
      </div>
      {children}
    </div>
  )
}
