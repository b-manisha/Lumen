import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { Task } from '../lib/types'
import { EXPO_OUT, STANDARD } from '../lib/motion'
import { TaskItem } from './TaskItem'

interface Props {
  tasks: Task[]
  showProject?: boolean
  compact?: boolean
  /** base delay (s) for the staggered mount */
  delay?: number
}

export function TaskList({ tasks, showProject = true, compact, delay = 0 }: Props) {
  const reduce = useReducedMotion()
  return (
    <div className="flex flex-col">
      <AnimatePresence initial={true} mode="popLayout">
        {tasks.map((t, i) => (
          <motion.div
            key={t.id}
            layout={reduce ? false : 'position'}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.34, ease: EXPO_OUT, delay: delay + Math.min(i, 14) * 0.02 } }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98, transition: { duration: 0.22, ease: STANDARD } }}
            transition={{ layout: { type: 'spring', stiffness: 400, damping: 30 } }}
          >
            <TaskItem task={t} showProject={showProject} compact={compact} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
