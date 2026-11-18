import { useTheme } from '../theme/theme'
import { Icon } from './Icon'

/**
 * Shows the theme you would switch to, like the prototype ("Dark" while in light mode).
 * `labelClassName` lets the shell hide the word on narrow widths and keep just the icon.
 */
export function ThemeButton({ labelClassName = '' }: { labelClassName?: string }) {
  const { theme, toggle } = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      className="inline-flex items-center gap-[7px] rounded-pen border-[1.5px] border-solid border-ink px-2.5 py-[7px] text-[.85rem] font-semibold whitespace-nowrap hover:bg-wash"
    >
      <Icon name={next === 'dark' ? 'moon' : 'sun'} className="size-[15px]" />
      <span className={labelClassName}>{next === 'dark' ? 'Dark' : 'Light'}</span>
    </button>
  )
}
