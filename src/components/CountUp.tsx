import { useEffect, useRef, useState } from 'react'
import { animate, useReducedMotion } from 'motion/react'
import { EXPO_OUT } from '../lib/motion'

/** Animated tabular number that counts from its previous value. */
export function CountUp({
  value,
  duration = 0.9,
  format = (n: number) => String(Math.round(n)),
  className,
}: {
  value: number
  duration?: number
  format?: (n: number) => string
  className?: string
}) {
  const reduce = useReducedMotion()
  const [display, setDisplay] = useState(reduce ? value : 0)
  const from = useRef(reduce ? value : 0)
  useEffect(() => {
    // Reduced motion renders `value` directly (below); just keep the origin in step for later animations.
    if (reduce) {
      from.current = value
      return
    }
    const controls = animate(from.current, value, {
      duration,
      ease: EXPO_OUT,
      onUpdate: (v) => setDisplay(v),
    })
    from.current = value
    return () => controls.stop()
  }, [value, duration, reduce])
  return <span className={className ?? 'tnum'}>{format(reduce ? value : display)}</span>
}
