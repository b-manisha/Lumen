import * as Popover from '@radix-ui/react-popover'
import { Battery, BatteryFull, Check, Flag, Hash, Search, X } from 'lucide-react'
import type { Priority } from '../lib/types'
import { cn, PRIORITY_META } from '../lib/utils'
import { useAllTags } from '../hooks/useDerived'
import { useUI } from '../store/useUI'
import { Kbd } from './ui'

export function FilterBar({ className }: { className?: string }) {
  const filters = useUI((s) => s.filters)
  const setFilters = useUI((s) => s.setFilters)
  const reset = useUI((s) => s.resetFilters)
  const tags = useAllTags()
  const active = filters.query || filters.priorities.length || filters.tags.length || filters.energy

  const togglePriority = (p: Priority) =>
    setFilters({ priorities: filters.priorities.includes(p) ? filters.priorities.filter((x) => x !== p) : [...filters.priorities, p] })

  const pill = (on: boolean) =>
    cn(
      'press inline-flex h-7 items-center gap-1.5 rounded-ctl border px-2 text-xs font-medium [&>svg]:size-3.5',
      on ? 'border-[rgba(var(--accent-rgb),0.45)] bg-accent-soft text-fg' : 'border-line text-muted hover:border-line-strong hover:text-fg',
    )

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <label className="group/search relative flex h-7 min-w-[180px] flex-1 items-center sm:max-w-[260px]">
        <Search className="pointer-events-none absolute left-2 size-3.5 text-faint" />
        <input
          id="filter-search"
          value={filters.query}
          onChange={(e) => setFilters({ query: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setFilters({ query: '' })
              e.currentTarget.blur()
            }
          }}
          placeholder="Filter tasks…"
          className="h-full w-full rounded-ctl border border-line bg-transparent pr-8 pl-7 text-xs text-fg outline-none transition-colors hover:border-line-strong focus:border-[rgba(var(--accent-rgb),0.55)]"
        />
        <span className="pointer-events-none absolute right-1.5 group-focus-within/search:hidden">
          <Kbd>/</Kbd>
        </span>
      </label>

      <div className="flex items-center gap-1">
        {([1, 2, 3] as Priority[]).map((p) => (
          <button
            key={p}
            onClick={() => togglePriority(p)}
            className={pill(filters.priorities.includes(p))}
            title={`${PRIORITY_META[p].label} priority`}
          >
            <Flag style={{ color: PRIORITY_META[p].color }} />
            {PRIORITY_META[p].short}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <button
          className={pill(filters.energy === 'high')}
          onClick={() => setFilters({ energy: filters.energy === 'high' ? null : 'high' })}
          title="Match my energy: high"
        >
          <BatteryFull className="text-warning" /> High
        </button>
        <button
          className={pill(filters.energy === 'low')}
          onClick={() => setFilters({ energy: filters.energy === 'low' ? null : 'low' })}
          title="Match my energy: low"
        >
          <Battery className="text-info" /> Low
        </button>
      </div>

      <Popover.Root>
        <Popover.Trigger className={pill(filters.tags.length > 0)}>
          <Hash />
          {filters.tags.length ? `${filters.tags.length} tag${filters.tags.length > 1 ? 's' : ''}` : 'Tags'}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content sideOffset={6} align="start" className="elevated z-50 max-h-72 w-52 overflow-y-auto rounded-row p-1">
            {tags.length === 0 && <div className="px-2 py-3 text-xs text-faint">No tags yet. Add some with #tag.</div>}
            {tags.map((t) => {
              const on = filters.tags.includes(t)
              return (
                <button
                  key={t}
                  onClick={() => setFilters({ tags: on ? filters.tags.filter((x) => x !== t) : [...filters.tags, t] })}
                  className="flex h-8 w-full items-center gap-2 rounded-ctl px-2 text-left text-[12.5px] text-muted hover:bg-surface-hover hover:text-fg"
                >
                  <span
                    className={cn(
                      'flex size-3.5 items-center justify-center rounded-[4px] border',
                      on ? 'border-accent bg-accent text-white' : 'border-line-strong',
                    )}
                  >
                    {on && <Check className="size-2.5" strokeWidth={3} />}
                  </span>
                  #{t}
                </button>
              )
            })}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {active ? (
        <button onClick={reset} className="press inline-flex h-7 items-center gap-1 rounded-ctl px-2 text-xs text-faint hover:text-fg">
          <X className="size-3.5" /> Clear
        </button>
      ) : null}
    </div>
  )
}
