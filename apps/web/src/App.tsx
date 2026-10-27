import { DetailDrawer } from './components/DetailDrawer'
import { GraphCanvas } from './components/GraphCanvas'
import { TopBar } from './components/TopBar'
import { usePanel } from './hooks/usePanel'

export default function App() {
  const p = usePanel()

  return (
    <div
      className={`app${p.panelOpen ? '' : ' panel-closed'}`}
      data-state={p.uiState}
      data-sending={p.sendingDemo ? 'on' : 'off'}
    >
      <TopBar
        uiState={p.uiState}
        sendingDemo={p.sendingDemo}
        onUiState={p.setUiState}
        onSendingDemo={p.setSendingDemo}
      />
      <div className="body">
        <GraphCanvas
          agents={p.agents}
          edges={p.edges}
          selectedChannelId={p.selectedChannelId}
          selectedAgentId={p.selectedAgentId}
          forceSending={p.sendingDemo}
          onSelectChannel={p.selectChannel}
          onSelectAgent={p.selectAgent}
        />
        <DetailDrawer
          channelId={p.selectedChannelId}
          edge={p.selectedEdge}
          messages={p.messages}
          loading={p.msgsLoading}
          onClose={p.closePanel}
        />
      </div>
    </div>
  )
}
