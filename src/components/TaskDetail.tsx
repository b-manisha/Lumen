import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Battery,
  BatteryFull,
  CalendarDays,
  Clock,
  Flag,
  Folder,
  Hash,
  ListChecks,
  Plus,
  Repeat,
  Sun,
  Timer,
  Trash2,
  X,
} from 'lucide-react'
import type { Energy, Priority, Task } from '../lib/types'
import { cn, formatMinutes, PRIORITY_META, todayKey } from '../lib/utils'
import { clampInterval, MAX_INTERVAL, RECURRENCE_OPTIONS } from '../lib/recurrence'
import { completeTask, deleteTask } from '../lib/actions'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'
import { Modal } from './Modal'
import { Checkbox } from './Checkbox'
import { Button, inputCls, Kbd, Segmented } from './ui'

export function TaskDetail() {
  const editingId = useUI((s) => s.editingId)
  const edit = useUI((s) => s.edit)
  const task = useStore((s) => s.tasks.find((t) => t.id === editingId))
  return (
    <Modal open={!!task} onClose={() => edit(null)} title={task?.title ?? 'Task'} side hideHeader>
      {task && <DetailBody key={task.id} task={task} />}
    </Modal>
  )
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_1fr] items-center gap-3 py-1.5">
      <div className="flex items-center gap-2 text-xs text-faint [&>svg]:size-3.5">
        {icon}
        {label}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function parseTags(input: string): string[] {
  return input
    .split(/[,\s]+/)
    .map((t) => t.replace(/^#/, '').toLowerCase())
    .filter(Boolean)
}

function DetailBody({ task }: { task: Task }) {
  const update = useStore((s) => s.updateTask)
  const projects = useStore((s) => s.projects)
  const addSubtask = useStore((s) => s.addSubtask)
  const toggleSubtask = useStore((s) => s.toggleSubtask)
  const updateSubtask = useStore((s) => s.updateSubtask)
  const deleteSubtask = useStore((s) => s.deleteSubtask)
  const edit = useUI((s) => s.edit)
  const startFocus = useUI((s) => s.startFocus)
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes)
  const [tagInput, setTagInput] = useState('')
  const [subInput, setSubInput] = useState('')
  const today = todayKey()

  // Esc / overlay click unmounts the drawer before inputs blur, so flush every pending edit on unmount:
  // title, notes, a half-typed tag, a half-typed new subtask and in-progress subtask renames.
  const draft = useRef({ title, notes, tagInput, subInput })
  const subEdits = useRef(new Map<string, string>())
  useEffect(() => {
    draft.current = { title, notes, tagInput, subInput }
  }, [title, notes, tagInput, subInput])
  useEffect(() => {
    const edits = subEdits.current
    return () => {
      const store = useStore.getState()
      const cur = store.tasks.find((t) => t.id === task.id)
      if (!cur) return
      const { title: t, notes: n, tagInput: tg, subInput: sb } = draft.current
      const patch: Partial<Task> = {}
      if (t.trim() && t.trim() !== cur.title) patch.title = t.trim()
      if (n !== cur.notes) patch.notes = n
      const newTags = parseTags(tg).filter((x) => !cur.tags.includes(x))
      if (newTags.length) patch.tags = [...new Set([...cur.tags, ...newTags])]
      if (Object.keys(patch).length) store.updateTask(task.id, patch)
      for (const [subId, value] of edits) {
        const sub = cur.subtasks.find((x) => x.id === subId)
        if (sub && value.trim() && value.trim() !== sub.title) store.updateSubtask(task.id, subId, value.trim())
      }
      if (sb.trim()) store.addSubtask(task.id, sb.trim())
    }
  }, [task.id])

  const recValue = task.recurrence?.type ?? 'none'
  const subDone = task.subtasks.filter((s) => s.done).length
  const done = task.status === 'done'

  const addTag = () => {
    const tags = parseTags(tagInput)
    if (tags.length) update(task.id, { tags: [...new Set([...task.tags, ...tags])] })
    setTagInput('')
  }

  return (
    <>
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-1.5 text-xs text-faint">
          {task.projectId ? (
            <>
              <span className="size-2 rounded-full" style={{ background: projects.find((p) => p.id === task.projectId)?.color }} />
              {projects.find((p) => p.id === task.projectId)?.name}
            </>
          ) : (
            'Inbox'
          )}
          {task.focusMinutes > 0 && (
            <span className="tnum ml-2 inline-flex items-center gap-1 text-muted">
              <Timer className="size-3" /> {formatMinutes(task.focusMinutes)} focused
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!done && (
            <Button size="sm" variant="ghost" icon={<Timer className="size-3.5" />} onClick={() => startFocus(task.id)}>
              Focus
            </Button>
          )}
          <button
            onClick={() => edit(null)}
            aria-label="Close"
            className="press inline-flex size-7 items-center justify-center rounded-ctl text-faint hover:bg-surface-hover hover:text-fg"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-6">
        <div className="flex items-start gap-3">
          <div className="pt-[5px]">
            <Checkbox checked={done} onToggle={() => completeTask(task.id)} priority={task.priority} size={20} />
          </div>
          <textarea
            value={title}
            rows={1}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== task.title && update(task.id, { title: title.trim() })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
            className={cn(
              'display field-sizing-content min-h-[30px] w-full resize-none bg-transparent text-[20px] text-fg outline-none',
              done && 'text-muted line-through decoration-[var(--text-faint)]',
            )}
            aria-label="Title"
          />
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== task.notes && update(task.id, { notes })}
          placeholder="Add notes…"
          className="mt-3 field-sizing-content min-h-[64px] w-full resize-none rounded-row border border-transparent bg-transparent px-0 text-[13px] leading-relaxed text-muted outline-none placeholder:text-faint focus:text-fg"
          aria-label="Notes"
        />

        <div className="mt-2 border-t border-line pt-3">
          <Row icon={<CalendarDays />} label="Due">
            <div className="flex gap-2">
              <input
                type="date"
                value={task.due ?? ''}
                onChange={(e) => update(task.id, { due: e.target.value || null })}
                className={cn(inputCls, 'tnum flex-1')}
              />
              <input
                type="time"
                value={task.dueTime ?? ''}
                onChange={(e) => update(task.id, { dueTime: e.target.value || null })}
                className={cn(inputCls, 'tnum w-[124px] shrink-0')}
              />
            </div>
          </Row>
          <Row icon={<Sun />} label="Today list">
            <Segmented
              size="sm"
              value={task.plannedFor === today ? 'yes' : 'no'}
              onChange={(v) => update(task.id, { plannedFor: v === 'yes' ? today : null })}
              options={[
                { value: 'no', label: 'Not planned' },
                { value: 'yes', label: 'Planned today' },
              ]}
            />
          </Row>
          <Row icon={<Flag />} label="Priority">
            <Segmented<Priority>
              size="sm"
              value={task.priority}
              onChange={(p) => update(task.id, { priority: p })}
              options={([1, 2, 3, 4] as Priority[]).map((p) => ({
                value: p,
                title: PRIORITY_META[p].label,
                label: (
                  <>
                    <Flag style={{ color: PRIORITY_META[p].color }} />
                    {PRIORITY_META[p].short}
                  </>
                ),
              }))}
            />
          </Row>
          <Row icon={<Folder />} label="Project">
            <select
              value={task.projectId ?? ''}
              onChange={(e) => update(task.id, { projectId: e.target.value || null })}
              className={cn(inputCls, 'appearance-none')}
            >
              <option value="">Inbox</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Row>
          <Row icon={<BatteryFull />} label="Energy">
            <Segmented<Energy | 'none'>
              size="sm"
              value={task.energy ?? 'none'}
              onChange={(v) => update(task.id, { energy: v === 'none' ? null : v })}
              options={[
                { value: 'none', label: 'Any' },
                {
                  value: 'high',
                  label: (
                    <>
                      <BatteryFull />
                      High
                    </>
                  ),
                },
                {
                  value: 'low',
                  label: (
                    <>
                      <Battery />
                      Low
                    </>
                  ),
                },
              ]}
            />
          </Row>
          <Row icon={<Clock />} label="Estimate">
            <div className="flex flex-wrap gap-1">
              {[null, 15, 30, 45, 60, 90, 120].map((m) => (
                <button
                  key={String(m)}
                  onClick={() => update(task.id, { estimate: m })}
                  className={cn(
                    'press tnum h-6 rounded-chip border px-1.5 text-[11px] font-medium',
                    task.estimate === m
                      ? 'border-[rgba(var(--accent-rgb),0.5)] bg-accent-soft text-accent'
                      : 'border-line text-faint hover:text-muted',
                  )}
                >
                  {m == null ? 'None' : formatMinutes(m)}
                </button>
              ))}
            </div>
          </Row>
          <Row icon={<Repeat />} label="Repeat">
            <div className="flex items-center gap-2">
              <select
                value={recValue}
                onChange={(e) => {
                  const opt = RECURRENCE_OPTIONS.find((o) => o.value === e.target.value)
                  update(task.id, { recurrence: opt ? opt.make(task.due) : null })
                }}
                className={cn(inputCls, 'min-w-0 flex-1 appearance-none')}
                aria-label="Repeat"
              >
                {RECURRENCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {task.recurrence?.type === 'interval' && (
                <IntervalInput
                  value={task.recurrence.interval ?? 1}
                  onCommit={(n) => update(task.id, { recurrence: { type: 'interval', interval: n } })}
                />
              )}
            </div>
          </Row>
          <Row icon={<Hash />} label="Tags">
            <div className="flex flex-wrap items-center gap-1.5">
              {task.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex h-6 items-center gap-1 rounded-chip border border-line bg-surface-hover pr-1 pl-2 text-[11.5px] text-muted"
                >
                  #{t}
                  <button
                    aria-label={`Remove ${t}`}
                    onClick={() => update(task.id, { tags: task.tags.filter((x) => x !== t) })}
                    className="inline-flex size-4 items-center justify-center rounded-[3px] text-faint hover:text-fg"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault()
                    addTag()
                  } else if (e.key === 'Backspace' && !tagInput && task.tags.length) {
                    update(task.id, { tags: task.tags.slice(0, -1) })
                  }
                }}
                onBlur={addTag}
                placeholder="Add tag"
                className="h-6 min-w-[80px] flex-1 bg-transparent text-xs text-fg outline-none"
              />
            </div>
          </Row>
        </div>

        {/* Subtasks */}
        <div className="mt-5 border-t border-line pt-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-muted">
              <ListChecks className="size-3.5 text-faint" /> Subtasks
              {task.subtasks.length > 0 && (
                <span className="tnum text-faint">
                  {subDone}/{task.subtasks.length}
                </span>
              )}
            </div>
            {task.subtasks.length > 0 && (
              <div className="h-1 w-24 overflow-hidden rounded-full bg-surface-hover">
                <motion.div
                  className="h-full rounded-full bg-accent"
                  initial={false}
                  animate={{ width: `${(subDone / task.subtasks.length) * 100}%` }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
            )}
          </div>
          <div className="flex flex-col">
            <AnimatePresence initial={false}>
              {task.subtasks.map((s) => (
                <motion.div
                  key={s.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="group/sub flex items-center gap-2.5 rounded-ctl px-1 py-1 hover:bg-surface-hover"
                >
                  <Checkbox checked={s.done} onToggle={() => toggleSubtask(task.id, s.id)} size={15} />
                  <input
                    defaultValue={s.title}
                    onChange={(e) => subEdits.current.set(s.id, e.target.value)}
                    onBlur={(e) => {
                      subEdits.current.delete(s.id)
                      const v = e.target.value.trim()
                      if (v && v !== s.title) updateSubtask(task.id, s.id, v)
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    className={cn('flex-1 bg-transparent text-[13px] outline-none', s.done ? 'text-faint line-through' : 'text-fg')}
                  />
                  <button
                    aria-label="Delete subtask"
                    onClick={() => deleteSubtask(task.id, s.id)}
                    className="inline-flex size-5 items-center justify-center rounded-[4px] text-faint opacity-0 group-hover/sub:opacity-100 hover:text-danger"
                  >
                    <X className="size-3" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
            <div className="flex items-center gap-2.5 px-1 py-1">
              <Plus className="size-[15px] text-faint" />
              <input
                value={subInput}
                onChange={(e) => setSubInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && subInput.trim()) {
                    addSubtask(task.id, subInput.trim())
                    setSubInput('')
                  }
                }}
                placeholder="Add subtask"
                className="flex-1 bg-transparent text-[13px] text-fg outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-line px-4 py-3">
        <div className="text-[11px] text-faint">
          Created {new Date(task.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
          <span className="mx-2">·</span>
          <Kbd>Esc</Kbd> to close
        </div>
        <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} onClick={() => deleteTask(task.id)}>
          Delete
        </Button>
      </div>
    </>
  )
}

/** "every [N] days" stepper. Keeps a local string so the field can be cleared while typing. */
function IntervalInput({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value))
  const commit = (raw: string) => {
    const n = clampInterval(parseInt(raw, 10))
    setText(String(n))
    if (n !== value) onCommit(n)
  }
  return (
    <label className="flex shrink-0 items-center gap-1.5 text-xs text-faint">
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={MAX_INTERVAL}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const n = parseInt(e.target.value, 10)
          if (n >= 1 && n <= MAX_INTERVAL && n !== value) onCommit(n)
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className={cn(
          inputCls,
          'tnum w-[56px] [appearance:textfield] text-center [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
        )}
        aria-label="Repeat every N days"
      />
      days
    </label>
  )
}
