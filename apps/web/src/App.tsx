import { FeedPanel } from './components/FeedPanel'
import { GraphCanvas } from './components/GraphCanvas'
import { TopBar } from './components/TopBar'
import { usePanel } from './hooks/usePanel'

export default function App() {
  const p = usePanel()

  return (
    <div className="app" data-state={p.uiState}>
      <TopBar wsStatus={p.wsStatus} />
      <div className="body">
        <GraphCanvas
          agents={p.agents}
          edges={p.edges}
          highlightChannelIds={p.highlightChannelIds}
          selectedAgentId={p.selectedAgentId}
          onSelectChannel={p.selectChannel}
          onSelectAgent={p.selectAgent}
        />
        <FeedPanel
          rows={p.feedRows}
          loading={p.feedLoading}
          uiState={p.uiState}
          highlightChannelIds={p.highlightChannelIds}
          edges={p.edges}
          freshEventId={p.freshEventId}
          onSelectChannel={p.selectFeedChannel}
        />
      </div>
    </div>
  )
}
