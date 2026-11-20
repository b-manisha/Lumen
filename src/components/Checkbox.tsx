import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { cn } from '../lib/utils'
import { popSpring } from '../lib/motion'
import type { Priority } from '../lib/types'

interface Props {
  checked: boolean
  onToggle: () => void
  priority?: Priority
  size?: number
  label?: string
}

/** Round checkbox with a spring pop, a drawn check stroke and a burst ring. */
export function Checkbox({ checked, onToggle, priority = 4, size = 18, label = 'Toggle complete' }: Props) {
  const reduce = useReducedMotion()
  const ring = priority === 4 ? 'var(--border-strong)' : `var(--p${priority})`
  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      whileTap={reduce ? undefined : { scale: 0.85 }}
      animate={checked && !reduce ? { scale: [1, 1.18, 1] } : { scale: 1 }}
      transition={popSpring}
      className="group/cb relative inline-flex shrink-0 items-center justify-center rounded-full outline-offset-2"
      style={{ width: size, height: size }}
    >
      <span
        className={cn('absolute inset-0 rounded-full border-[1.5px] transition-colors duration-150')}
        style={{
          borderColor: checked ? 'var(--accent)' : ring,
          background: checked
            ? 'var(--accent)'
            : priority !== 4
              ? `color-mix(in srgb, var(--p${priority}) 10%, transparent)`
              : 'transparent',
          boxShadow: checked ? '0 0 12px -2px rgba(var(--accent-rgb),0.7)' : undefined,
        }}
      />
      {!checked && (
        <svg viewBox="0 0 16 16" className="relative size-[62%] opacity-0 transition-opacity duration-150 group-hover/cb:opacity-60">
          <path d="M3.5 8.5l3 3 6-6.5" fill="none" stroke={ring} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      <AnimatePresence>
        {checked && (
          <motion.svg viewBox="0 0 16 16" className="relative size-[62%]" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.path
              d="M3.5 8.5l3 3 6-6.5"
              fill="none"
              stroke="white"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: reduce ? 1 : 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1], delay: 0.04 }}
            />
          </motion.svg>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {checked && !reduce && (
          <motion.span
            className="pointer-events-none absolute inset-0 rounded-full border-2 border-accent"
            initial={{ scale: 1, opacity: 0.7 }}
            animate={{ scale: 2.1, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          />
        )}
      </AnimatePresence>
    </motion.button>
  )
}
