import { DashboardLayout, DashboardProvider } from "./components/DashboardLayout.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { useWorkspaces, WorkspaceBar, workspaceStorageKey } from "./components/WorkspaceBar.tsx";
import { TradingProvider } from "./context/TradingContext.tsx";

export default function App() {
  const { workspaces, activeId, handleSelect, handleChange } = useWorkspaces();

  return (
    <TradingProvider>
      <div className="flex flex-col h-screen bg-gray-950 text-gray-100 overflow-hidden">
        <WorkspaceBar
          workspaces={workspaces.value}
          activeId={activeId.value}
          onSelect={handleSelect}
          onWorkspacesChange={handleChange}
        />
        {/* Key forces DashboardProvider to remount (fresh localStorage read) on workspace switch */}
        <DashboardProvider key={activeId.value} storageKey={workspaceStorageKey(activeId.value)}>
          <StatusBar />
          <div className="flex-1 overflow-auto">
            <DashboardLayout />
          </div>
        </DashboardProvider>
      </div>
    </TradingProvider>
  );
}
