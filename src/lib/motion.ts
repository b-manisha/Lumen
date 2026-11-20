import type { Transition, Variants } from 'motion/react'

export const EXPO_OUT = [0.16, 1, 0.3, 1] as const
export const STANDARD = [0.4, 0, 0.2, 1] as const

export const spring: Transition = { type: 'spring', stiffness: 400, damping: 30 }
export const popSpring: Transition = { type: 'spring', stiffness: 600, damping: 20 }

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EXPO_OUT } },
}

export const stagger = (step = 0.04, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: step, delayChildren: delay } },
})

export const listItem: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: EXPO_OUT } },
  exit: {
    opacity: 0,
    height: 0,
    marginTop: 0,
    marginBottom: 0,
    paddingTop: 0,
    paddingBottom: 0,
    transition: { duration: 0.24, ease: STANDARD },
  },
}

export const pop: Variants = {
  hidden: { opacity: 0, scale: 0.98, y: 6 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.24, ease: EXPO_OUT } },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: { duration: 0.17, ease: STANDARD } },
}
