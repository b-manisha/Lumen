import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Battery, BatteryFull, Bot, BrainCircuit, CalendarDays, Clock, CornerDownLeft, Crown, Flag, Folder, Hash, Plus, Repeat } from 'lucide-react'
import { toast } from 'sonner'
import { OWNER_TOKEN_LABEL, parseQuickAdd, type ParsedToken, type TokenKind } from '../lib/parse'
import { classify } from '../lib/delegate'
import type { Task } from '../lib/types'
import { cn, todayKey } from '../lib/utils'
import { EXPO_OUT } from '../lib/motion'
import { useStore } from '../store/useStore'
import { Kbd } from './ui'

const TOKEN_STYLE: Record<TokenKind, { color: string; icon: ReactNode }> = {
  date: { color: 'var(--accent)', icon: <CalendarDays /> },
  tag: { color: 'var(--success)', icon: <Hash /> },
  priority: { color: 'var(--p1)', icon: <Flag /> },
  energy: { color: 'var(--warning)', icon: <BatteryFull /> },
  estimate: { color: 'var(--info)', icon: <Clock /> },
  project: { color: '#E879F9', icon: <Folder /> },
  recurrence: { color: '#2DD4BF', icon: <Repeat /> },
  owner: { color: 'var(--cho)', icon: <Crown /> },
}

function tokenIcon(t: ParsedToken): ReactNode {
  if (t.kind === 'energy' && t.label.startsWith('Low')) return <Battery />
  if (t.kind === 'owner') return t.label === OWNER_TOKEN_LABEL.manager ? <BrainCircuit /> : t.label === OWNER_TOKEN_LABEL.junior ? <Bot /> : <Crown />
  return TOKEN_STYLE[t.kind].icon
}

function tokenColor(t: ParsedToken) {
  if (t.kind === 'priority') {
    if (t.label.startsWith('P2')) return 'var(--p2)'
    if (t.label.startsWith('P3')) return 'var(--p3)'
    if (t.label.startsWith('P4')) return 'var(--p4)'
  }
  if (t.kind === 'energy' && t.label.startsWith('Low')) return 'var(--info)'
  if (t.kind === 'owner') return t.label === OWNER_TOKEN_LABEL.manager ? 'var(--mgr)' : t.label === OWNER_TOKEN_LABEL.junior ? 'var(--jr)' : 'var(--cho)'
  return TOKEN_STYLE[t.kind].color
}

interface Props {
  autoFocus?: boolean
  defaults?: Partial<Task>
  onCreated?: (id: string) => void
  onEscape?: () => void
  variant?: 'bar' | 'modal'
  prefill?: string
  placeholder?: string
}

export function QuickAdd({ autoFocus, defaults, onCreated, onEscape, variant = 'bar', prefill = '', placeholder }: Props) {
  const [value, setValue] = useState(prefill)
  const [focused, setFocused] = useState(false)
  const [scroll, setScroll] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const projects = useStore((s) => s.projects)
  const addTask = useStore((s) => s.addTask)
  const addProject = useStore((s) => s.addProject)
  const parsed = useMemo(() => parseQuickAdd(value, projects), [value, projects])

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])
  useLayoutEffect(() => {
    setScroll(inputRef.current?.scrollLeft ?? 0)
  }, [value])

  const submit = () => {
    if (!parsed.title.trim()) {
      if (value.trim()) toast('Add a title', { description: 'Tokens were parsed, but the task needs a name.' })
      return
    }
    let projectId = parsed.projectId ?? defaults?.projectId ?? null
    if (!projectId && parsed.newProjectName) projectId = addProject(parsed.newProjectName)
    const owner = parsed.owner ?? defaults?.owner
    const projectName = projects.find((p) => p.id === projectId)?.name ?? parsed.newProjectName
    const sorted = classify({ title: parsed.title, tags: parsed.tags.length ? parsed.tags : (defaults?.tags ?? []), project: projectName })
    const refused = owner && owner !== 'human' && sorted.locked
    const id = addTask({
      ...defaults,
      title: parsed.title,
      due: parsed.due ?? defaults?.due ?? null,
      dueTime: parsed.dueTime,
      priority: parsed.priority ?? defaults?.priority ?? 4,
      tags: parsed.tags.length ? parsed.tags : (defaults?.tags ?? []),
      energy: parsed.energy ?? defaults?.energy ?? null,
      estimate: parsed.estimate,
      projectId,
      recurrence: parsed.recurrence,
      owner: owner ?? undefined,
      // a future date beats the "planned for today" default of the current view
      plannedFor: parsed.due && parsed.due > todayKey() ? null : (defaults?.plannedFor ?? null),
    })
    if (refused) toast('Added to your pile', { description: `${sorted.reason}. Agents can’t take this one.` })
    else toast.success('Task added', { description: parsed.title })
    setValue('')
    onCreated?.(id)
  }

  // Mirror segments for inline token highlighting
  const segments = useMemo(() => {
    const out: { text: string; token?: ParsedToken }[] = []
    let i = 0
    for (const t of parsed.tokens) {
      if (t.start < i) continue
      if (t.start > i) out.push({ text: value.slice(i, t.start) })
      out.push({ text: value.slice(t.start, t.end), token: t })
      i = t.end
    }
    if (i < value.length) out.push({ text: value.slice(i) })
    return out
  }, [parsed.tokens, value])

  const isModal = variant === 'modal'

  return (
    <div className={cn(!isModal && 'w-full')}>
      <div
        className={cn(
          'relative flex items-center gap-3 transition-[border-color,box-shadow,background-color] duration-200',
          isModal
            ? 'h-14 px-5'
            : cn(
                'h-11 rounded-row border bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] px-3.5 shadow-[inset_0_1px_0_var(--highlight)]',
                focused
                  ? 'border-[rgba(var(--accent-rgb),0.55)] shadow-[0_0_0_3px_rgba(var(--accent-rgb),0.12)]'
                  : 'border-line hover:border-line-strong',
              ),
        )}
      >
        <Plus className={cn('size-4 shrink-0 transition-colors', focused || isModal ? 'text-accent' : 'text-faint')} />
        <div className="relative min-w-0 flex-1 overflow-hidden">
          {/* highlight mirror */}
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-y-0 left-0 flex items-center whitespace-pre text-transparent',
              isModal ? 'text-[16px]' : 'text-[13.5px]',
            )}
            style={{ transform: `translateX(${-scroll}px)` }}
          >
            {segments.map((s, i) =>
              s.token ? (
                <span
                  key={i}
                  className="rounded-[3px]"
                  style={{
                    background: `color-mix(in srgb, ${tokenColor(s.token)} 18%, transparent)`,
                    boxShadow: `0 0 0 1px color-mix(in srgb, ${tokenColor(s.token)} 30%, transparent)`,
                  }}
                >
                  {s.text}
                </span>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )}
          </div>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onScroll={(e) => setScroll(e.currentTarget.scrollLeft)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault()
                submit()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                if (value) setValue('')
                else {
                  inputRef.current?.blur()
                  onEscape?.()
                }
              }
            }}
            placeholder={placeholder ?? 'Add a task… try “Call mom tomorrow 5pm #family !high ~low-energy”'}
            className={cn('relative w-full bg-transparent text-fg caret-accent outline-none', isModal ? 'text-[16px]' : 'text-[13.5px]')}
            aria-label="Quick add task"
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        {!isModal && !focused && !value && (
          <div className="hidden items-center gap-1 sm:flex">
            <Kbd>Q</Kbd>
          </div>
        )}
        {value && (
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={submit}
            className="press inline-flex h-7 shrink-0 items-center gap-1.5 rounded-ctl bg-accent px-2.5 text-xs font-medium text-white shadow-[0_0_16px_-4px_rgba(var(--accent-rgb),0.7)] hover:bg-accent-hover"
          >
            Add <CornerDownLeft className="size-3" />
          </button>
        )}
      </div>

      {/* Live parsed chips */}
      <AnimatePresence initial={false}>
        {(parsed.tokens.length > 0 || ((isModal || focused) && !value)) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1, transition: { duration: 0.26, ease: EXPO_OUT } }}
            exit={{ height: 0, opacity: 0, transition: { duration: 0.16 } }}
            className="overflow-hidden"
          >
            <div className={cn('flex flex-wrap items-center gap-1.5', isModal ? 'border-t border-line px-5 py-3' : 'px-1 pt-2')}>
              {parsed.tokens.length === 0 ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px] text-faint">
                  <Hint k="tomorrow 5pm">date</Hint>
                  <Hint k="#tag">tag</Hint>
                  <Hint k="!high">priority</Hint>
                  <Hint k="@project">project</Hint>
                  <Hint k="~low">energy</Hint>
                  <Hint k="~30m">estimate</Hint>
                  <Hint k="every mon">repeat</Hint>
                  <Hint k="^jr">delegate</Hint>
                </div>
              ) : (
                <>
                  <AnimatePresence mode="popLayout" initial={false}>
                    {parsed.tokens.map((t) => {
                      const color = tokenColor(t)
                      const Icon = tokenIcon(t)
                      return (
                        <motion.span
                          layout
                          key={`${t.kind}-${t.label}`}
                          initial={{ opacity: 0, scale: 0.9, y: 2 }}
                          animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 600, damping: 26 } }}
                          exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.12 } }}
                          className="inline-flex h-[22px] items-center gap-1 rounded-chip border px-1.5 font-mono text-[11px] font-medium [&>svg]:size-3"
                          style={{
                            color,
                            borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
                            background: `color-mix(in srgb, ${color} 10%, transparent)`,
                          }}
                        >
                          {Icon}
                          {t.label}
                        </motion.span>
                      )
                    })}
                  </AnimatePresence>
                  {parsed.title && <span className="ml-1 truncate text-[11.5px] text-faint">→ “{parsed.title}”</span>}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Hint({ k, children }: { k: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <code className="rounded-[3px] border border-line px-1 py-px font-mono text-[10.5px] text-muted">{k}</code>
      {children}
    </span>
  )
}
