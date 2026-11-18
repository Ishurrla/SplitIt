// Shared by <Button> and by router links that should look like buttons.
export type ButtonVariant = 'default' | 'primary' | 'danger' | 'link'

const base =
  'inline-flex items-center gap-2 font-semibold disabled:pointer-events-none disabled:opacity-55 aria-disabled:pointer-events-none aria-disabled:opacity-55'

const variants: Record<ButtonVariant, string> = {
  default:
    'rounded-pen border-[1.5px] border-solid border-ink bg-transparent px-4 py-[9px] hover:bg-wash',
  primary:
    'rounded-pen border-[1.5px] border-solid border-biro bg-biro px-4 py-[9px] text-biro-ink hover:brightness-112',
  danger:
    'rounded-pen border-[1.5px] border-solid border-red bg-red px-4 py-[9px] text-biro-ink hover:brightness-110',
  link: 'p-0 text-biro underline underline-offset-3 hover:decoration-2',
}

export function buttonClass(
  variant: ButtonVariant = 'default',
  opts: { block?: boolean; big?: boolean } = {},
): string {
  return [
    base,
    variants[variant],
    opts.block ? 'w-full justify-center' : '',
    opts.big ? 'px-[22px] py-[13px]' : '',
  ]
    .filter(Boolean)
    .join(' ')
}
