import { motion, useReducedMotion } from 'motion/react'
import type { BreakdownRow } from '../lib/stats'
import { EXPO_OUT } from '../lib/motion'

export function Breakdown({ rows, onSelect }: { rows: BreakdownRow[]; onSelect?: (id: string) => void }) {
  const reduce = useReducedMotion()
  return (
    <div className="flex flex-col gap-3.5">
      {rows.map((r, i) => {
        const total = r.done + r.open
        const pct = total ? Math.round((r.done / total) * 100) : 0
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onSelect?.(r.id)}
            className="group/bd -mx-1.5 rounded-ctl px-1.5 py-1 text-left transition-colors hover:bg-surface-hover"
          >
            <div className="mb-1.5 flex items-center justify-between gap-3 text-[12.5px]">
              <span className="flex min-w-0 items-center gap-2 text-muted group-hover/bd:text-fg">
                <span className="size-2 shrink-0 rounded-[3px]" style={{ background: r.color, boxShadow: `0 0 8px -1px ${r.color}` }} />
                <span className="truncate">{r.label}</span>
              </span>
              <span className="tnum shrink-0 text-faint">
                <span className="text-fg">{r.done}</span>
                <span className="mx-0.5">/</span>
                {total}
                <span className="ml-2 inline-block w-8 text-right">{pct}%</span>
              </span>
            </div>
            {/* Track = all of this group's tasks, fill = share done, so the bar always matches the % label. */}
            <div
              className="relative h-1.5 overflow-hidden rounded-full"
              style={{ background: `color-mix(in srgb, ${r.color} 14%, color-mix(in srgb, var(--text) 5%, transparent))` }}
            >
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ background: r.color, boxShadow: `0 0 10px -2px ${r.color}` }}
                initial={{ width: reduce ? `${pct}%` : 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.9, ease: EXPO_OUT, delay: 0.2 + i * 0.05 }}
              />
            </div>
          </button>
        )
      })}
    </div>
  )
}
