import { forwardRef, useCallback, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { cn } from '../lib/utils'

/* ───────────── Button ───────────── */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  kbd?: string
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-hover shadow-[0_0_0_1px_rgba(var(--accent-rgb),0.5),0_0_24px_-6px_rgba(var(--accent-rgb),0.6),inset_0_1px_0_rgba(255,255,255,0.18)]',
  secondary:
    'bg-surface text-fg border border-line hover:bg-surface-hover hover:border-line-strong shadow-[inset_0_1px_0_var(--highlight)]',
  ghost: 'text-muted hover:text-fg hover:bg-surface-hover',
  danger: 'text-danger hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]',
}
const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-ctl',
  md: 'h-8 px-3 text-sm gap-2 rounded-ctl',
  lg: 'h-10 px-4 text-sm gap-2 rounded-row',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, kbd, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'press inline-flex shrink-0 select-none items-center justify-center font-medium whitespace-nowrap disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
      {kbd && <Kbd className={cn('ml-0.5', variant === 'primary' && 'border-white/25 bg-white/10 text-white/80')}>{kbd}</Kbd>}
    </button>
  )
})

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: 'sm' | 'md' }>(
  function IconButton({ label, className, children, size = 'md', ...rest }, ref) {
    return (
      <button
        ref={ref}
        aria-label={label}
        title={label}
        className={cn(
          'press inline-flex shrink-0 items-center justify-center rounded-ctl text-muted hover:bg-surface-hover hover:text-fg',
          size === 'sm' ? 'size-7' : 'size-8',
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    )
  },
)

/* ───────────── Kbd ───────────── */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-line bg-[color-mix(in_srgb,var(--text)_4%,transparent)] px-1 font-mono text-[10.5px] font-medium leading-none text-muted',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

/* ───────────── Card with cursor spotlight ───────────── */
export function Card({ className, children, spotlight = true, ...rest }: HTMLAttributes<HTMLDivElement> & { spotlight?: boolean }) {
  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--x', `${e.clientX - r.left}px`)
    e.currentTarget.style.setProperty('--y', `${e.clientY - r.top}px`)
  }, [])
  return (
    <div className={cn('card', spotlight && 'spotlight', className)} onMouseMove={spotlight ? onMove : undefined} {...rest}>
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  icon,
  right,
  sub,
  subClassName,
}: {
  title: ReactNode
  icon?: ReactNode
  right?: ReactNode
  sub?: ReactNode
  subClassName?: string
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-3">
      <div className="min-w-0 flex-1 basis-[140px]">
        {/* min-h-7 keeps the title optically centred against size="sm" buttons on the right */}
        <div className="flex min-h-7 items-center gap-2 text-[13px] font-medium text-fg">
          {icon && <span className="flex text-faint [&>svg]:size-[15px]">{icon}</span>}
          <span className="truncate">{title}</span>
        </div>
        {sub && <div className={cn('-mt-0.5 text-xs text-pretty text-faint', subClassName)}>{sub}</div>}
      </div>
      {right && <div className="flex shrink-0 items-center">{right}</div>}
    </div>
  )
}

/* ───────────── Chip ───────────── */
export function Chip({
  children,
  color,
  className,
  icon,
  mono,
}: {
  children: ReactNode
  color?: string
  className?: string
  icon?: ReactNode
  mono?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex h-[20px] shrink-0 items-center gap-1 rounded-chip border px-1.5 text-[11px] font-medium leading-none whitespace-nowrap [&>svg]:size-3',
        mono && 'font-mono',
        !color && 'border-line bg-[color-mix(in_srgb,var(--text)_3%,transparent)] text-muted',
        className,
      )}
      style={
        color
          ? {
              color,
              borderColor: `color-mix(in srgb, ${color} 28%, transparent)`,
              background: `color-mix(in srgb, ${color} 10%, transparent)`,
            }
          : undefined
      }
    >
      {icon}
      {children}
    </span>
  )
}

/* ───────────── Segmented control ───────────── */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; title?: string }[]
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div className={cn('inline-flex rounded-ctl border border-line bg-[color-mix(in_srgb,var(--text)_2%,transparent)] p-0.5', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            'press inline-flex flex-1 items-center justify-center gap-1.5 rounded-[5px] px-2.5 font-medium whitespace-nowrap [&>svg]:size-3.5',
            size === 'sm' ? 'h-6 text-[11px]' : 'h-7 text-xs',
            value === o.value
              ? 'bg-surface-hover text-fg shadow-[inset_0_1px_0_var(--highlight),0_0_0_1px_var(--border)]'
              : 'text-faint hover:text-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ───────────── Tooltip ───────────── */
export function Tip({
  content,
  children,
  side = 'top',
}: {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
}) {
  return (
    <Tooltip.Root delayDuration={350}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          sideOffset={6}
          className="elevated z-[100] rounded-ctl px-2 py-1 text-xs text-fg data-[state=delayed-open]:animate-in"
        >
          {content}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn('h-px bg-line', className)} />
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mb-1.5 text-[11px] font-medium tracking-wide text-faint uppercase', className)}>{children}</div>
}

export const inputCls =
  'h-8 w-full rounded-ctl border border-line bg-[color-mix(in_srgb,var(--text)_2%,transparent)] px-2.5 text-sm text-fg outline-none transition-[border-color,box-shadow] duration-150 hover:border-line-strong focus:border-[rgba(var(--accent-rgb),0.6)] focus:shadow-[0_0_0_3px_rgba(var(--accent-rgb),0.15)]'
