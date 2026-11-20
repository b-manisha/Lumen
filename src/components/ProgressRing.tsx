import { useId } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { EXPO_OUT } from '../lib/motion'
import { CountUp } from './CountUp'

interface Props {
  value: number
  total: number
  size?: number
  stroke?: number
}

/** Gradient ring with accent glow, tick marks and an animated fill. */
export function ProgressRing({ value, total, size = 92, stroke = 7 }: Props) {
  const id = useId().replace(/:/g, '')
  const reduce = useReducedMotion()
  const pct = total > 0 ? Math.min(1, value / total) : 0
  const r = (size - stroke) / 2 - 3
  const c = 2 * Math.PI * r
  const complete = total > 0 && value >= total
  const ticks = 40
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id={`rg-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent-hover)" />
            <stop offset="100%" stopColor={complete ? 'var(--success)' : 'var(--accent)'} />
          </linearGradient>
          <filter id={`glow-${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* tick marks */}
        {Array.from({ length: ticks }, (_, i) => {
          const a = (i / ticks) * Math.PI * 2
          const r1 = r + stroke / 2 + 2.5
          const r2 = r1 + (i % 5 === 0 ? 3 : 1.5)
          return (
            <line
              key={i}
              x1={size / 2 + Math.cos(a) * r1}
              y1={size / 2 + Math.sin(a) * r1}
              x2={size / 2 + Math.cos(a) * r2}
              y2={size / 2 + Math.sin(a) * r2}
              stroke="var(--border-strong)"
              strokeWidth="1"
              opacity={i / ticks <= pct ? 0.9 : 0.4}
            />
          )
        })}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-hover)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={1} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#rg-${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          filter={`url(#glow-${id})`}
          initial={{ strokeDashoffset: reduce ? c * (1 - pct) : c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: reduce ? 0 : 0.9, ease: EXPO_OUT, delay: reduce ? 0 : 0.15 }}
          style={{ opacity: pct === 0 ? 0 : 1 }}
        />
      </svg>
      {/* The tile beside the ring already shows "done / total", so the centre carries only the percentage. */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="display tnum flex items-baseline text-[22px] text-fg">
          <CountUp value={Math.round(pct * 100)} />
          <span className="ml-px text-[12px] font-medium text-faint">%</span>
        </div>
      </div>
    </div>
  )
}
