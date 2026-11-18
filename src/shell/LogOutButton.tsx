import { useNavigate } from 'react-router'
import { logOut } from '../auth/actions'
import { Button } from '../ui/Button'
import type { ButtonVariant } from '../ui/buttonStyles'
import { useToast } from '../ui/toastContext'

/** Signs out, returns to the landing page and says so. Used in the sidebar and in Settings. */
export function LogOutButton({
  variant = 'default',
  className = '',
}: {
  variant?: ButtonVariant
  className?: string
}) {
  const navigate = useNavigate()
  const toast = useToast()
  async function onClick() {
    // Leave /app first. Signing out while still inside makes <RequireAuth> react before we can
    // navigate, and it would send the visitor to /auth?next=… as if their session had expired.
    await navigate('/')
    await logOut()
    toast('You are logged out.')
  }
  return (
    <Button variant={variant} className={className} onClick={() => void onClick()}>
      Log out
    </Button>
  )
}
