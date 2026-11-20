import type { ReactNode } from 'react'
import { BrainCircuit, Bot, Crown } from 'lucide-react'
import type { Owner } from '../lib/types'

export const OWNER_META: Record<Owner, { label: string; long: string; short: string; color: string; rgb: string; icon: ReactNode; blurb: string }> = {
  human: {
    label: 'You',
    long: 'You · Chief Human Officer',
    short: 'You',
    color: 'var(--cho)',
    rgb: 'var(--cho-rgb)',
    icon: <Crown />,
    blurb: 'Calls, decisions, errands, money and anything personal',
  },
  manager: {
    label: 'Manager agent',
    long: 'Manager agent',
    short: 'Manager',
    color: 'var(--mgr)',
    rgb: 'var(--mgr-rgb)',
    icon: <BrainCircuit />,
    blurb: 'Plans, researches, compares, reviews and breaks work down',
  },
  junior: {
    label: 'Junior agent',
    long: 'Junior agent',
    short: 'Junior',
    color: 'var(--jr)',
    rgb: 'var(--jr-rgb)',
    icon: <Bot />,
    blurb: 'Drafts, summarises, looks things up and formats',
  },
}
