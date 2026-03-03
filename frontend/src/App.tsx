import { useEffect } from "react";
import { DashboardLayout, DashboardProvider } from "./components/DashboardLayout.tsx";
import { LoginPage } from "./components/LoginPage.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { useWorkspaces, WorkspaceBar, workspaceStorageKey } from "./components/WorkspaceBar.tsx";
import { TradingProvider } from "./context/TradingContext.tsx";
import type { AuthUser } from "./store/authSlice.ts";
import { setStatus, setUser } from "./store/authSlice.ts";
import { useAppDispatch, useAppSelector } from "./store/hooks.ts";

function AuthGate({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const status = useAppSelector((s) => s.auth.status);

  useEffect(() => {
    fetch("/api/user-service/sessions/me", { credentials: "include" })
      .then(async (res) => {
        if (res.ok) {
          const user: AuthUser = await res.json();
          dispatch(setUser(user));
        } else {
          dispatch(setStatus("unauthenticated"));
        }
      })
      .catch(() => dispatch(setStatus("unauthenticated")));
  }, [dispatch]);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950 text-gray-500 text-sm">
        Loading...
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <LoginPage />;
  }

  return <>{children}</>;
}

function TradingApp() {
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

export default function App() {
  return (
    <AuthGate>
      <TradingApp />
    </AuthGate>
  );
}
