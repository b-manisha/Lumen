import type { ReactNode } from 'react'
import type { AgentStatus, HireRole, Owner } from '../lib/types'
import { AGENT_STATUS_LABEL } from '../lib/piles'
import { cn } from '../lib/utils'
import { Tip } from './ui'
import { OWNER_META, roleMeta } from './ownerMeta'

export { OWNER_META }

/** Tiny owner mark used on task rows and cards. */
export function OwnerGlyph({ owner, size = 16, tip, className }: { owner: Owner | HireRole; size?: number; tip?: ReactNode; className?: string }) {
  const m = roleMeta(owner)
  const glyph = (
    <span
      role="img"
      aria-label={`Owner: ${m.label}`}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full [&>svg]:size-[62%]', className)}
      style={{
        width: size,
        height: size,
        color: m.color,
        background: `rgba(${m.rgb}, 0.12)`,
        boxShadow: `inset 0 0 0 1px rgba(${m.rgb}, 0.28)`,
      }}
    >
      {m.icon}
    </span>
  )
  return tip === null ? glyph : <Tip content={tip ?? m.label}>{glyph}</Tip>
}

/** Larger avatar for pile headers: a soft gradient tile with a lit top edge. */
export function OwnerAvatar({ owner, size = 34 }: { owner: Owner | HireRole; size?: number }) {
  const m = roleMeta(owner)
  return (
    <span
      aria-hidden
      className="relative inline-flex shrink-0 items-center justify-center rounded-[10px] [&>svg]:size-[48%]"
      style={{
        width: size,
        height: size,
        color: m.color,
        background: `linear-gradient(180deg, rgba(${m.rgb}, 0.26), rgba(${m.rgb}, 0.06))`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.14), inset 0 0 0 1px rgba(${m.rgb}, 0.38), 0 0 22px -6px rgba(${m.rgb}, 0.7)`,
      }}
    >
      {m.icon}
    </span>
  )
}

const STATUS_COLOR: Record<AgentStatus, string> = {
  queued: 'var(--text-muted)',
  working: 'var(--info)',
  review: 'var(--accent)',
  returned: 'var(--cho)',
  approved: 'var(--success)',
}

export function AgentStatusPill({ status, className }: { status: AgentStatus; className?: string }) {
  const color = STATUS_COLOR[status]
  return (
    <span
      className={cn('inline-flex h-[20px] shrink-0 items-center gap-1.5 rounded-full border px-2 text-[10.5px] font-medium whitespace-nowrap', className)}
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
        background: `color-mix(in srgb, ${color} ${status === 'queued' ? 6 : 11}%, transparent)`,
        boxShadow: status === 'review' ? `0 0 14px -4px color-mix(in srgb, ${color} 70%, transparent)` : undefined,
      }}
    >
      <span className={cn('size-1.5 rounded-full', status === 'working' && 'pulse-dot')} style={{ background: color }} />
      {AGENT_STATUS_LABEL[status]}
    </span>
  )
}
