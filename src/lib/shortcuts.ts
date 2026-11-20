import { modKey } from './utils'

/** Keyboard shortcut reference shown in the shortcuts sheet. */
export const SHORTCUTS: { group: string; items: [string[], string][] }[] = [
  {
    group: 'General',
    items: [
      [[modKey, 'K'], 'Command menu'],
      [['Q'], 'Quick add task'],
      [['/'], 'Filter tasks'],
      [['⇧', 'T'], 'Toggle theme'],
      [[modKey, 'Z'], 'Undo'],
      [['?'], 'Show shortcuts'],
    ],
  },
  {
    group: 'Navigate',
    items: [
      [['G', 'D'], 'Dashboard'],
      [['G', 'I'], 'Inbox'],
      [['G', 'T'], 'Today'],
      [['G', 'U'], 'Upcoming'],
      [['G', 'L'], 'Logbook'],
      [['G', 'M'], 'Eisenhower matrix'],
      [['G', 'B'], 'Board'],
    ],
  },
  {
    group: 'Tasks',
    items: [
      [['J', '/', 'K'], 'Move selection'],
      [['X'], 'Complete selected'],
      [['E'], 'Edit selected'],
      [['1–4'], 'Set priority'],
      [['⌫'], 'Delete selected'],
      [['T'], 'Toggle planned for today'],
    ],
  },
  {
    group: 'Rituals',
    items: [
      [['P'], 'Plan my day'],
      [['F'], 'Focus on selected'],
      [['⇧', 'S'], 'Evening shutdown'],
    ],
  },
]
