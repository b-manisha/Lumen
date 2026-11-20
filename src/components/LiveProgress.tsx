import { motion } from 'motion/react'
import type { AgentRole, HireRole } from '../lib/types'
import { EXPO_OUT } from '../lib/motion'
import { cn } from '../lib/utils'
import type { LiveStatus } from '../lib/agentRun'
import { roleMeta } from './ownerMeta'

/** Thin animated progress track tinted with the agent's colour. */
export function ProgressTrack({ percent, by, stalled, className }: { percent: number; by?: AgentRole | HireRole; stalled?: boolean; className?: string }) {
  const color = stalled ? 'var(--warning)' : by ? roleMeta(by).color : 'var(--accent)'
  return (
    <div
      className={cn('h-[3px] overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_7%,transparent)]', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
    >
      <motion.div
        className="h-full rounded-full"
        style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${color} 55%, transparent), ${color})`, boxShadow: `0 0 8px -1px ${color}` }}
        initial={false}
        animate={{ width: `${Math.max(2, Math.min(100, percent))}%` }}
        transition={{ duration: 0.7, ease: EXPO_OUT }}
      />
    </div>
  )
}

/** Card footer line on the Delegation view: phase · percent and a thin bar. */
export function CardLiveProgress({ status }: { status: LiveStatus }) {
  const m = roleMeta(status.by)
  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] leading-[15px]">
        <span className={cn('shrink-0 font-medium whitespace-nowrap', status.stale ? 'text-warning' : '')} style={status.stale ? undefined : { color: m.color }}>
          {status.stale ? 'Stalled?' : status.phase}
        </span>
        {status.message && <span className="min-w-0 truncate text-faint">· {status.message}</span>}
        <span className="tnum ml-auto shrink-0 font-mono text-[10.5px] text-muted">{status.percent}%</span>
      </div>
      <ProgressTrack percent={status.percent} by={status.by} stalled={status.stale} />
    </div>
  )
}
