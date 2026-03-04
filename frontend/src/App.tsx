import { useEffect } from "react";
import { DashboardLayout, DashboardProvider } from "./components/DashboardLayout.tsx";
import { LoginPage } from "./components/LoginPage.tsx";
import { AppHeader, WorkspaceToolbar } from "./components/StatusBar.tsx";
import {
  useWorkspaces,
  WorkspaceSidebar,
  workspaceStorageKey,
} from "./components/WorkspaceBar.tsx";
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
  const userId = useAppSelector((s) => s.auth.user?.id ?? "anonymous");
  const { workspaces, activeId, handleSelect, handleChange } = useWorkspaces(userId);

  return (
    <TradingProvider>
      <div className="flex flex-col h-screen bg-gray-950 text-gray-100 overflow-hidden">
        {/* Global header: brand, feed status, services, clock, user */}
        <AppHeader />

        {/* Body: left workspace sidebar + main content */}
        <div className="flex flex-1 min-h-0">
          {/* Main content area: sidebar + toolbar + dashboard, all inside DashboardProvider */}
          {/* Key scoped to userId+workspaceId — ensures each user's workspaces are isolated */}
          <DashboardProvider
            key={`${userId}:${activeId}`}
            storageKey={workspaceStorageKey(userId, activeId)}
          >
            {/* Left workspace sidebar — inside provider so it can access resetLayout */}
            <WorkspaceSidebar
              workspaces={workspaces}
              activeId={activeId}
              onSelect={handleSelect}
              onWorkspacesChange={handleChange}
            />
            <div className="flex flex-col flex-1 min-w-0 min-h-0">
              {/* Layout controls scoped to the active workspace/provider */}
              <WorkspaceToolbar />
              {/* flexlayout needs a positioned container with explicit height */}
              <div className="flex-1 relative min-h-0">
                <DashboardLayout />
              </div>
            </div>
          </DashboardProvider>
        </div>
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
