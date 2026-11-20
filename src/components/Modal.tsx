import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '../lib/utils'
import { EXPO_OUT } from '../lib/motion'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  hideHeader?: boolean
  children: ReactNode
  className?: string
  /** top-anchored (palette style) vs centered */
  position?: 'top' | 'center'
  /** slide-over drawer from the right */
  side?: boolean
}

export function Modal({ open, onClose, title, description, hideHeader, children, className, position = 'center', side }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-[var(--scrim)] backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.2 } }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              forceMount
              {...(description ? {} : { 'aria-describedby': undefined })}
              onPointerDownOutside={(e) => e.preventDefault()}
              onOpenAutoFocus={(e) => {
                // Let inputs with autoFocus keep focus; otherwise focus the panel itself (no stray focus ring).
                e.preventDefault()
                const el = e.currentTarget as HTMLElement | null
                requestAnimationFrame(() => {
                  if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true })
                })
              }}
            >
              <div
                tabIndex={-1}
                className={cn(
                  'fixed inset-0 z-50 flex outline-none',
                  side ? 'justify-end p-2' : 'justify-center px-3',
                  !side && (position === 'top' ? 'items-start pt-[12vh]' : 'items-center py-6'),
                )}
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) onClose()
                }}
              >
                <motion.div
                  className={cn(
                    'elevated relative flex max-h-full flex-col overflow-hidden rounded-modal',
                    side ? 'h-full w-[min(480px,100%)]' : 'w-[min(560px,100%)]',
                    className,
                  )}
                  initial={side ? { opacity: 0, x: 28 } : { opacity: 0, scale: 0.98, y: position === 'top' ? -6 : 8 }}
                  animate={
                    side
                      ? { opacity: 1, x: 0, transition: { duration: 0.34, ease: EXPO_OUT } }
                      : { opacity: 1, scale: 1, y: 0, transition: { duration: 0.24, ease: EXPO_OUT } }
                  }
                  exit={
                    side
                      ? { opacity: 0, x: 18, transition: { duration: 0.2 } }
                      : { opacity: 0, scale: 0.98, transition: { duration: 0.16 } }
                  }
                >
                  {hideHeader ? (
                    <>
                      <Dialog.Title className="sr-only">{title}</Dialog.Title>
                      {description && <Dialog.Description className="sr-only">{description}</Dialog.Description>}
                    </>
                  ) : (
                    <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-4">
                      <div>
                        <Dialog.Title className="display text-[16px] text-fg">{title}</Dialog.Title>
                        {description && <Dialog.Description className="mt-1 text-xs text-muted">{description}</Dialog.Description>}
                      </div>
                      <Dialog.Close className="press -mr-1 inline-flex size-7 items-center justify-center rounded-ctl text-faint hover:bg-surface-hover hover:text-fg">
                        <X className="size-4" />
                      </Dialog.Close>
                    </div>
                  )}
                  {children}
                </motion.div>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
