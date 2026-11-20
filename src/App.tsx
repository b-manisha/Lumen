import { lazy, Suspense, useEffect } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { Toaster } from 'sonner'
import type { ViewId } from './lib/types'
import { EXPO_OUT } from './lib/motion'
import { useStore } from './store/useStore'
import { hashToView, useUI } from './store/useUI'
import { useShortcuts } from './hooks/useShortcuts'
import { useAgentBridge } from './lib/bridge'
import { useRunPolling } from './lib/agentRun'
import { AgentStatusBar } from './components/AgentStatusBar'
import { ReportReader } from './components/ReportReader'
import { Sidebar } from './components/Sidebar'
import { CommandPalette } from './components/CommandPalette'
import { TaskDetail } from './components/TaskDetail'
import { QuickAddDialog, SettingsDialog, ShortcutsDialog } from './components/Dialogs'
import { Dashboard } from './views/Dashboard'
import { ListView } from './views/ListView'
import { FocusMode } from './views/FocusMode'
import { PlanDay } from './views/PlanDay'
import { Shutdown } from './views/Shutdown'

// Drag-and-drop views are split into their own chunks
const BoardView = lazy(() => import('./views/BoardView').then((m) => ({ default: m.BoardView })))
const MatrixView = lazy(() => import('./views/MatrixView').then((m) => ({ default: m.MatrixView })))
const DelegationView = lazy(() => import('./views/DelegationView').then((m) => ({ default: m.DelegationView })))
const ReportsView = lazy(() => import('./views/ReportsView').then((m) => ({ default: m.ReportsView })))

function viewKey(v: ViewId) {
  return v.kind === 'project' ? `project-${v.id}` : v.kind
}

function CurrentView({ view }: { view: ViewId }) {
  switch (view.kind) {
    case 'dashboard':
      return <Dashboard />
    case 'board':
      return <BoardView />
    case 'matrix':
      return <MatrixView />
    case 'delegation':
      return <DelegationView />
    case 'reports':
      return <ReportsView />
    default:
      return <ListView view={view} />
  }
}

export default function App() {
  const theme = useStore((s) => s.settings.theme)
  const view = useUI((s) => s.view)
  useShortcuts()
  useAgentBridge()
  useRunPolling()

  // Theme → <html data-theme>
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#08090A' : '#FAFAFA')
  }, [theme])

  // Back/forward navigation
  useEffect(() => {
    const onPop = () => {
      const next = hashToView(window.location.hash)
      const cur = useUI.getState().view
      if (JSON.stringify(next) !== JSON.stringify(cur)) useUI.setState({ view: next, selectedId: null })
    }
    window.addEventListener('popstate', onPop)
    window.addEventListener('hashchange', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('hashchange', onPop)
    }
  }, [])

  // Reset scroll + filters' selection on view change
  useEffect(() => {
    document.getElementById('main-scroll')?.scrollTo({ top: 0 })
  }, [view])

  return (
    <MotionConfig reducedMotion="user" transition={{ ease: EXPO_OUT }}>
      <Tooltip.Provider delayDuration={350} skipDelayDuration={150}>
        <div className="ambient" aria-hidden />
        <div className="noise" aria-hidden />
        {/* shell: sidebar + main on top, the agent status bar docked underneath (in flow, so it never covers content) */}
        <div className="relative z-10 flex h-full flex-col">
          <div className="flex min-h-0 flex-1">
            <Sidebar />
            <main id="main-scroll" className="relative min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
              <div className="px-4 pt-5 sm:px-6 md:px-8 md:pt-8 lg:px-10">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={viewKey(view)}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0, transition: { duration: 0.36, ease: EXPO_OUT } }}
                    exit={{ opacity: 0, y: -4, transition: { duration: 0.14 } }}
                  >
                    <Suspense fallback={<div className="h-[60vh]" />}>
                      <CurrentView view={view} />
                    </Suspense>
                  </motion.div>
                </AnimatePresence>
              </div>
            </main>
          </div>
          <AgentStatusBar />
        </div>

        <CommandPalette />
        <QuickAddDialog />
        <TaskDetail />
        <ReportReader />
        <PlanDay />
        <Shutdown />
        <SettingsDialog />
        <ShortcutsDialog />
        <FocusMode />
        <Toaster theme={theme} position="bottom-right" gap={8} offset={{ bottom: 54, right: 20 }} mobileOffset={{ bottom: 46 }} toastOptions={{ classNames: { toast: 'lumen-toast' } }} />
      </Tooltip.Provider>
    </MotionConfig>
  )
}
