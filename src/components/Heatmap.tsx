import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { format } from 'date-fns'
import type { HeatCell } from '../lib/stats'
import { cn, fromKey, formatMinutes } from '../lib/utils'

const LEVEL_FILL = ['var(--heat-0)', 'var(--heat-1)', 'var(--heat-2)', 'var(--heat-3)', 'var(--heat-4)']
const LABEL_W = 28
const TOP = 18

/** Custom SVG year heatmap (53 × 7), responsive cell size, staggered mount, hover tooltip. */
export function Heatmap({ weeks: allWeeks }: { weeks: HeatCell[][] }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [hover, setHover] = useState<{ cell: HeatCell; x: number; y: number } | null>(null)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Fractional step so the grid spans the card edge-to-edge (no ragged gutter on the right).
  const gap = width < 640 ? 2.5 : 3
  // On narrow cards show only the most recent weeks that fit, instead of a clipped horizontal scroller.
  const fit = Math.max(8, Math.floor((width + gap) / (9 + gap)))
  const weeks = useMemo(() => (fit < allWeeks.length ? allWeeks.slice(-fit) : allWeeks), [allWeeks, fit])
  const cell = Math.max(9, Math.min(20, (width + gap) / weeks.length - gap))
  const step = cell + gap
  const svgW = Math.min(width, weeks.length * step - gap)
  const svgH = TOP + 7 * step - gap

  const months = useMemo(() => {
    const out: { x: number; label: string }[] = []
    let lastCol = -10
    weeks.forEach((w, i) => {
      const first = w.find((c) => fromKey(c.key).getDate() === 1)
      if (!first || i - lastCol < 3 || i > weeks.length - 2) return
      out.push({ x: i * step, label: format(fromKey(first.key), 'MMM') })
      lastCol = i
    })
    return out
  }, [weeks, step])

  return (
    <div className="relative flex">
      {/* Day labels live outside the scroller so they stay visible when the grid scrolls on mobile */}
      <svg width={LABEL_W} height={svgH} className="block shrink-0" aria-hidden>
        {['Mon', 'Wed', 'Fri'].map((d, i) => (
          <text
            key={d}
            x={0}
            y={TOP + (1 + i * 2) * step + cell / 2}
            dominantBaseline="central"
            className="fill-[var(--text-faint)] text-[10px]"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            {d}
          </text>
        ))}
      </svg>
      <div ref={wrap} className="min-w-0 flex-1 overflow-hidden">
        <svg
          width={svgW + 1}
          height={svgH}
          className="block"
          role="img"
          aria-label="Completion heatmap for the past year"
          onMouseLeave={() => setHover(null)}
        >
          {months.map((m) => (
            <text key={m.x} x={m.x} y={10} className="fill-[var(--text-faint)] text-[10px]" style={{ fontFamily: 'var(--font-sans)' }}>
              {m.label}
            </text>
          ))}
          {weeks.map((w, wi) =>
            w.map((c, di) => {
              const x = wi * step
              const y = TOP + di * step
              const isHover = hover?.cell.key === c.key
              return (
                <rect
                  key={c.key}
                  x={x}
                  y={y}
                  width={cell}
                  height={cell}
                  rx={Math.max(2, cell * 0.24)}
                  className="heat-cell"
                  style={{ animationDelay: `${wi * 9 + di * 6}ms` }}
                  fill={c.future ? 'transparent' : LEVEL_FILL[c.level]}
                  stroke={
                    c.future ? 'var(--border)' : isHover ? 'var(--text-muted)' : c.level === 0 ? 'var(--border)' : 'rgba(255,255,255,0.04)'
                  }
                  strokeWidth={1}
                  strokeDasharray={c.future ? '2 2' : undefined}
                  onMouseEnter={() => !c.future && setHover({ cell: c, x: LABEL_W + x + cell / 2, y })}
                />
              )
            }),
          )}
        </svg>
      </div>
      <AnimatePresence>
        {hover && (
          <motion.div
            key={hover.cell.key}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            className="elevated pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-ctl px-2.5 py-1.5 text-xs whitespace-nowrap"
            style={{ left: hover.x, top: hover.y - 6 }}
          >
            <div className="tnum font-medium text-fg">
              {hover.cell.count === 0 ? 'No tasks' : `${hover.cell.count} task${hover.cell.count === 1 ? '' : 's'}`}
              {hover.cell.focus > 0 && <span className="text-muted"> · {formatMinutes(hover.cell.focus)} focus</span>}
            </div>
            <div className="text-[11px] text-faint">{format(fromKey(hover.cell.key), 'EEEE, d MMM yyyy')}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function HeatLegend({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-1.5 text-[11px] text-faint', className)}>
      Less
      {LEVEL_FILL.map((f, i) => (
        <span
          key={i}
          className="size-[10px] rounded-[3px]"
          style={{ background: f, boxShadow: i === 0 ? 'inset 0 0 0 1px var(--border)' : undefined }}
        />
      ))}
      More
    </div>
  )
}
