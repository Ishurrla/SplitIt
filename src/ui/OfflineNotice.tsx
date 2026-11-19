import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

const isOnline = () => navigator.onLine

/**
 * A bar across the top while the browser is offline. Firestore keeps showing what it already
 * loaded, but every change goes through a Cloud Function, so nothing can be saved until the
 * connection is back. The live listeners pick up anything missed when it returns.
 */
export function OfflineNotice() {
  const online = useSyncExternalStore(subscribe, isOnline)
  return (
    <div role="status" aria-live="polite">
      {online ? null : (
        <p className="sticky top-0 z-40 border-b-[1.5px] border-solid border-ink bg-mark px-4 py-2 text-center text-[.92rem] font-semibold">
          You&apos;re offline. You can still look around, but changes can&apos;t be saved until
          you&apos;re back online.
        </p>
      )}
    </div>
  )
}
