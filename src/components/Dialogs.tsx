import { useState, type ReactNode } from 'react'
import { Download, Eraser, Moon, RotateCcw, Sun, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { downloadExport, pickImport } from '../lib/actions'
import { cn, todayKey } from '../lib/utils'
import { SCHEMA_VERSION, useStore } from '../store/useStore'
import { useUI } from '../store/useUI'
import { Modal } from './Modal'
import { QuickAdd } from './QuickAdd'
import { Button, inputCls, Kbd, Segmented } from './ui'
import { SHORTCUTS } from '../lib/shortcuts'

/* ───────────── Quick add (modal) ───────────── */
export function QuickAddDialog() {
  const overlay = useUI((s) => s.overlay)
  const close = useUI((s) => s.close)
  const prefill = useUI((s) => s.quickAddPrefill)
  const view = useUI((s) => s.view)
  const defaults =
    view.kind === 'project'
      ? { projectId: view.id }
      : view.kind === 'today' || view.kind === 'dashboard'
        ? { plannedFor: todayKey() }
        : undefined
  return (
    <Modal open={overlay === 'quickadd'} onClose={close} title="New task" hideHeader position="top" className="w-[min(640px,100%)]">
      <QuickAdd variant="modal" autoFocus defaults={defaults} prefill={prefill} onCreated={close} onEscape={close} />
    </Modal>
  )
}

/* ───────────── Settings ───────────── */
function SettingRow({ title, body, children }: { title: string; body?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-fg">{title}</div>
        {body && <div className="mt-0.5 text-xs text-faint">{body}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function SettingsDialog() {
  const overlay = useUI((s) => s.overlay)
  const close = useUI((s) => s.close)
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const clearDemo = useStore((s) => s.clearDemo)
  const resetAll = useStore((s) => s.resetAll)
  const undo = useStore((s) => s.undo)
  const hasDemo = useStore((s) => s.tasks.some((t) => t.demo) || s.projects.some((p) => p.demo) || Object.keys(s.demoActivity).length > 0)
  const [confirmReset, setConfirmReset] = useState(false)

  return (
    <Modal
      open={overlay === 'settings'}
      onClose={close}
      title="Settings"
      description="Everything is stored locally in this browser."
      className="w-[min(600px,100%)]"
    >
      <div className="overflow-y-auto px-5 pb-4">
        <div className="divide-y divide-[var(--border)]">
          <SettingRow title="Your name" body="Used in the dashboard greeting.">
            <input
              value={settings.name}
              onChange={(e) => setSettings({ name: e.target.value })}
              placeholder="Optional"
              className={cn(inputCls, 'w-48')}
            />
          </SettingRow>
          <SettingRow title="Theme" body={`Toggle anytime with ⇧T.`}>
            <Segmented
              value={settings.theme}
              onChange={(theme) => setSettings({ theme })}
              options={[
                {
                  value: 'dark',
                  label: (
                    <>
                      <Moon />
                      Dark
                    </>
                  ),
                },
                {
                  value: 'light',
                  label: (
                    <>
                      <Sun />
                      Light
                    </>
                  ),
                },
              ]}
            />
          </SettingRow>
          <SettingRow title="Pomodoro" body="Focus / short break / long break, in minutes.">
            <div className="flex items-center gap-1.5">
              {(['work', 'short', 'long'] as const).map((k) => (
                <input
                  key={k}
                  type="number"
                  min={1}
                  max={180}
                  value={settings.pomodoro[k]}
                  onChange={(e) =>
                    setSettings({ pomodoro: { ...settings.pomodoro, [k]: Math.max(1, Math.min(180, Number(e.target.value) || 1)) } })
                  }
                  className={cn(inputCls, 'tnum w-16 text-center')}
                  aria-label={`${k} minutes`}
                />
              ))}
            </div>
          </SettingRow>
          <SettingRow title="Daily cap" body="Default number of tasks suggested by Plan my day.">
            <input
              type="number"
              min={1}
              max={20}
              value={settings.dailyCap}
              onChange={(e) => setSettings({ dailyCap: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })}
              className={cn(inputCls, 'tnum w-16 text-center')}
            />
          </SettingRow>
          <SettingRow title="Celebrations" body="Confetti when you clear today’s list.">
            <Segmented
              value={settings.confetti ? 'on' : 'off'}
              onChange={(v) => setSettings({ confetti: v === 'on' })}
              options={[
                { value: 'on', label: 'On' },
                { value: 'off', label: 'Off' },
              ]}
            />
          </SettingRow>
          <SettingRow title="Backup" body={`Export or restore a JSON file (schema v${SCHEMA_VERSION}).`}>
            <div className="flex gap-2">
              <Button size="sm" icon={<Download className="size-3.5" />} onClick={downloadExport}>
                Export
              </Button>
              <Button size="sm" icon={<Upload className="size-3.5" />} onClick={pickImport}>
                Import
              </Button>
            </div>
          </SettingRow>
          <SettingRow title="Demo data" body={hasDemo ? 'Remove the sample projects, tasks and history.' : 'No demo data left.'}>
            <Button
              size="sm"
              icon={<Eraser className="size-3.5" />}
              disabled={!hasDemo}
              onClick={() => {
                clearDemo()
                toast('Demo data cleared', {
                  description: 'A clean slate. Your own tasks were kept.',
                  action: { label: 'Undo', onClick: () => undo() },
                })
              }}
            >
              Clear demo data
            </Button>
          </SettingRow>
          <SettingRow title="Reset everything" body="Deletes all tasks, projects and history from this browser.">
            {confirmReset ? (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-danger text-white hover:bg-danger/90"
                  onClick={() => {
                    resetAll()
                    setConfirmReset(false)
                    toast('All data erased')
                  }}
                >
                  Erase all data
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="danger" icon={<RotateCcw className="size-3.5" />} onClick={() => setConfirmReset(true)}>
                Reset
              </Button>
            )}
          </SettingRow>
        </div>
      </div>
    </Modal>
  )
}

/* ───────────── Shortcuts ───────────── */

export function ShortcutsDialog() {
  const overlay = useUI((s) => s.overlay)
  const close = useUI((s) => s.close)
  return (
    <Modal
      open={overlay === 'shortcuts'}
      onClose={close}
      title="Keyboard shortcuts"
      description="Lumen is built to be driven from the keyboard."
      className="w-[min(680px,100%)]"
    >
      <div className="grid gap-x-8 gap-y-6 overflow-y-auto px-5 py-5 sm:grid-cols-2">
        {SHORTCUTS.map((g) => (
          <div key={g.group}>
            <div className="mb-2 text-[11px] font-medium tracking-wide text-faint uppercase">{g.group}</div>
            <div className="flex flex-col">
              {g.items.map(([keys, label]) => (
                <div
                  key={label}
                  className="flex h-8 items-center justify-between border-b border-line text-[13px] text-muted last:border-0"
                >
                  {label}
                  <span className="flex gap-1">
                    {keys.map((k) =>
                      k === '/' && keys.length > 1 ? (
                        <span key={k} className="text-faint">
                          /
                        </span>
                      ) : (
                        <Kbd key={k}>{k}</Kbd>
                      ),
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
