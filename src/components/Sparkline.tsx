import { useId } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { EXPO_OUT } from '../lib/motion'

/** Smooth area sparkline with a highlighted last point. */
export function Sparkline({
  data,
  width = 120,
  height = 36,
  color = 'var(--accent)',
}: {
  data: number[]
  width?: number
  height?: number
  color?: string
}) {
  const id = useId().replace(/:/g, '')
  const reduce = useReducedMotion()
  if (data.length < 2) return null
  const max = Math.max(1, ...data)
  const pad = 3
  const pts = data.map(
    (v, i) => [pad + (i / (data.length - 1)) * (width - pad * 2), height - pad - (v / max) * (height - pad * 2)] as const,
  )
  // Catmull-Rom → Bezier for a soft line
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`
  }
  const last = pts[pts.length - 1]
  const area = `${d} L${last[0]},${height} L${pts[0][0]},${height} Z`
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={`sg-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        d={area}
        fill={`url(#sg-${id})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.3 }}
      />
      <motion.path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        initial={{ pathLength: reduce ? 1 : 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1, ease: EXPO_OUT, delay: 0.1 }}
      />
      <circle cx={last[0]} cy={last[1]} r="5" fill={color} opacity="0.18" />
      <circle cx={last[0]} cy={last[1]} r="2.25" fill={color} />
    </svg>
  )
}
