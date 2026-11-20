import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { EXPO_OUT } from '../lib/motion'
import { cn } from '../lib/utils'

export type EmptyArt = 'sun' | 'inbox' | 'calendar' | 'archive' | 'search' | 'folder' | 'sparkle'

function Art({ kind }: { kind: EmptyArt }) {
  const stroke = 'var(--border-strong)'
  const accent = 'var(--accent)'
  const common = { fill: 'none', strokeWidth: 1.25, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg viewBox="0 0 120 96" className="h-[88px] w-[110px]" aria-hidden>
      <defs>
        <radialGradient id={`eg-${kind}`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={accent} stopOpacity="0.28" />
          <stop offset="1" stopColor={accent} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`el-${kind}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={accent} stopOpacity="0.9" />
          <stop offset="1" stopColor={accent} stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="50" rx="52" ry="40" fill={`url(#eg-${kind})`} />
      {kind === 'sun' && (
        <g {...common}>
          <path d="M18 70h84" stroke={stroke} />
          <path d="M30 70a30 30 0 0 1 60 0" stroke={`url(#el-${kind})`} strokeWidth="1.75" />
          {[-60, -30, 0, 30, 60].map((a) => {
            const r = (a - 90) * (Math.PI / 180)
            return (
              <path
                key={a}
                d={`M${60 + Math.cos(r) * 38} ${70 + Math.sin(r) * 38}L${60 + Math.cos(r) * 46} ${70 + Math.sin(r) * 46}`}
                stroke={stroke}
              />
            )
          })}
          <path d="m50 62 7 7 14-15" stroke={accent} strokeWidth="2" />
          <path d="M36 80h48M46 87h28" stroke={stroke} opacity=".6" />
        </g>
      )}
      {kind === 'inbox' && (
        <g {...common}>
          <rect x="28" y="22" width="64" height="52" rx="10" stroke={stroke} />
          <path d="M28 54h18l5 8h18l5-8h18" stroke={stroke} />
          <path d="m50 38 7 7 14-14" stroke={accent} strokeWidth="2" />
        </g>
      )}
      {kind === 'calendar' && (
        <g {...common}>
          <rect x="26" y="22" width="68" height="56" rx="10" stroke={stroke} />
          <path d="M26 38h68M42 16v12M78 16v12" stroke={stroke} />
          {[0, 1, 2, 3].map((c) =>
            [0, 1].map((r) => (
              <rect
                key={`${c}${r}`}
                x={36 + c * 13}
                y={46 + r * 13}
                width="7"
                height="7"
                rx="2"
                stroke={c === 2 && r === 0 ? accent : stroke}
                fill={c === 2 && r === 0 ? 'rgba(var(--accent-rgb),.25)' : 'none'}
              />
            )),
          )}
        </g>
      )}
      {kind === 'archive' && (
        <g {...common}>
          <rect x="24" y="24" width="72" height="14" rx="5" stroke={stroke} />
          <path d="M30 38v30a8 8 0 0 0 8 8h44a8 8 0 0 0 8-8V38" stroke={stroke} />
          <path d="M52 50h16" stroke={accent} strokeWidth="2" />
        </g>
      )}
      {kind === 'search' && (
        <g {...common}>
          <circle cx="54" cy="44" r="20" stroke={stroke} />
          <path d="m69 59 16 16" stroke={accent} strokeWidth="2" />
          <path d="M46 44h16" stroke={stroke} />
        </g>
      )}
      {kind === 'folder' && (
        <g {...common}>
          <path d="M24 30a6 6 0 0 1 6-6h18l7 8h35a6 6 0 0 1 6 6v32a6 6 0 0 1-6 6H30a6 6 0 0 1-6-6Z" stroke={stroke} />
          <path d="M60 46v16M52 54h16" stroke={accent} strokeWidth="2" />
        </g>
      )}
      {kind === 'sparkle' && (
        <g {...common}>
          <path d="M60 18c2 14 6 18 20 20-14 2-18 6-20 20-2-14-6-18-20-20 14-2 18-6 20-20Z" stroke={accent} strokeWidth="1.75" />
          <path
            d="M88 58c1 6 3 8 9 9-6 1-8 3-9 9-1-6-3-8-9-9 6-1 8-3 9-9ZM30 60c.8 4 2 5 6 6-4 .8-5 2-6 6-.8-4-2-5-6-6 4-.8 5-2 6-6Z"
            stroke={stroke}
          />
        </g>
      )}
    </svg>
  )
}

export function EmptyState({
  art = 'sparkle',
  title,
  body,
  action,
  className,
  compact,
}: {
  art?: EmptyArt
  title: string
  body?: string
  action?: ReactNode
  className?: string
  compact?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EXPO_OUT }}
      className={cn('flex flex-col items-center justify-center text-center', compact ? 'py-6' : 'py-16', className)}
    >
      <Art kind={art} />
      <div className="display mt-3 text-[15px] text-fg">{title}</div>
      {body && <p className="mt-1 max-w-[300px] text-[12.5px] leading-relaxed text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </motion.div>
  )
}
