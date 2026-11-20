import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { Menu } from 'lucide-react'
import { EXPO_OUT } from '../lib/motion'
import { useUI } from '../store/useUI'

export function MobileMenuButton() {
  const setMobileNav = useUI((s) => s.setMobileNav)
  return (
    <button
      onClick={() => setMobileNav(true)}
      aria-label="Open navigation"
      className="press -ml-1 inline-flex size-8 items-center justify-center rounded-ctl text-muted hover:bg-surface-hover hover:text-fg md:hidden"
    >
      <Menu className="size-[18px]" />
    </button>
  )
}

export function ViewHeader({
  icon,
  title,
  sub,
  right,
  children,
}: {
  icon?: ReactNode
  title: ReactNode
  sub?: ReactNode
  right?: ReactNode
  children?: ReactNode
}) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EXPO_OUT }}
      className="mb-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <MobileMenuButton />
          {icon && (
            <span className="flex size-8 items-center justify-center rounded-row border border-line bg-surface text-accent shadow-[inset_0_1px_0_var(--highlight)] [&>svg]:size-4">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="display truncate text-[22px] text-fg sm:text-[24px]">{title}</h1>
            {sub && <div className="tnum mt-0.5 text-xs text-faint">{sub}</div>}
          </div>
        </div>
        {right && <div className="flex items-center gap-2">{right}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </motion.header>
  )
}
