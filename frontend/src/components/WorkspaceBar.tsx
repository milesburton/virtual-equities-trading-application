import { useSignal } from "@preact/signals-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppSelector } from "../store/hooks.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Workspace {
  id: string;
  name: string;
}

const DEFAULT_WORKSPACES: Workspace[] = [{ id: "default", name: "Main" }];

// ─── Per-user storage helpers ─────────────────────────────────────────────────

/** Storage key for the workspace list, scoped per user to prevent cross-user contamination. */
function workspacesKey(userId: string) {
  return `workspaces:${userId}`;
}

/** Storage key for a workspace's panel layout, scoped per user. */
export function workspaceStorageKey(userId: string, workspaceId: string) {
  return `dashboard-layout:${userId}:${workspaceId}`;
}

function loadWorkspaces(userId: string): Workspace[] {
  try {
    const raw = localStorage.getItem(workspacesKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as Workspace[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // corrupted
  }
  return DEFAULT_WORKSPACES;
}

function saveWorkspaces(userId: string, ws: Workspace[]) {
  localStorage.setItem(workspacesKey(userId), JSON.stringify(ws));
}

// ─── History helpers ──────────────────────────────────────────────────────────

const WORKSPACE_PARAM = "ws";

function getWorkspaceFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get(WORKSPACE_PARAM);
}

function pushWorkspaceHistory(workspaceId: string, workspaceName: string) {
  const url = new URL(window.location.href);
  url.searchParams.set(WORKSPACE_PARAM, workspaceId);
  history.pushState({ workspaceId }, workspaceName, url.toString());
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  activeId: string;
  onSelect: (id: string) => void;
  onWorkspacesChange: (ws: Workspace[]) => void;
  workspaces: Workspace[];
}

export function WorkspaceBar({ activeId, onSelect, onWorkspacesChange, workspaces }: Props) {
  const editingId = useSignal<string | null>(null);
  const editValue = useSignal("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId.value !== null) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingId.value]);

  const addWorkspace = useCallback(
    (userId: string) => {
      const id = `ws-${Date.now()}`;
      const name = `Workspace ${workspaces.length + 1}`;
      const next = [...workspaces, { id, name }];
      saveWorkspaces(userId, next);
      onWorkspacesChange(next);
      onSelect(id);
    },
    [workspaces, onSelect, onWorkspacesChange]
  );

  const renameWorkspace = useCallback(
    (userId: string, id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const next = workspaces.map((w) => (w.id === id ? { ...w, name: trimmed } : w));
      saveWorkspaces(userId, next);
      onWorkspacesChange(next);
    },
    [workspaces, onWorkspacesChange]
  );

  const removeWorkspace = useCallback(
    (userId: string, id: string) => {
      if (workspaces.length <= 1) return;
      const next = workspaces.filter((w) => w.id !== id);
      saveWorkspaces(userId, next);
      onWorkspacesChange(next);
      if (activeId === id) onSelect(next[0].id);
    },
    [workspaces, activeId, onSelect, onWorkspacesChange]
  );

  const userId = useAppSelector((s) => s.auth.user?.id ?? "anonymous");

  function commitRename() {
    if (editingId.value !== null) {
      renameWorkspace(userId, editingId.value, editValue.value);
      editingId.value = null;
    }
  }

  return (
    <div className="flex items-center gap-0 bg-gray-950 border-b border-gray-800 px-2 h-8 shrink-0">
      {workspaces.map((ws) => {
        const active = ws.id === activeId;
        const isEditing = editingId.value === ws.id;

        return (
          <div
            key={ws.id}
            role="tab"
            tabIndex={0}
            className={`group relative flex items-center h-full px-3 border-r border-gray-800 text-[11px] cursor-pointer select-none appearance-none bg-transparent border-t-2 border-t-transparent ${
              active
                ? "bg-gray-900 text-gray-200 border-t-emerald-500"
                : "text-gray-500 hover:text-gray-300 hover:bg-gray-900/40"
            }`}
            onClick={() => {
              if (!isEditing) onSelect(ws.id);
            }}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !isEditing) onSelect(ws.id);
            }}
          >
            {isEditing ? (
              <input
                ref={inputRef}
                value={editValue.value}
                onChange={(e) => {
                  editValue.value = e.target.value;
                }}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") {
                    editingId.value = null;
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="bg-gray-800 text-gray-100 text-[11px] px-1 rounded outline-none w-24 border border-emerald-500"
              />
            ) : (
              <button
                type="button"
                className="text-[11px] cursor-pointer bg-transparent border-0 p-0 text-inherit"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  editingId.value = ws.id;
                  editValue.value = ws.name;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    editingId.value = ws.id;
                    editValue.value = ws.name;
                  }
                }}
                onClick={() => onSelect(ws.id)}
              >
                {ws.name}
              </button>
            )}

            {active && workspaces.length > 1 && !isEditing && (
              <button
                type="button"
                aria-label={`Close ${ws.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  removeWorkspace(userId, ws.id);
                }}
                className="ml-1.5 text-gray-600 hover:text-gray-300 leading-none opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ×
              </button>
            )}
          </div>
        );
      })}

      <button
        type="button"
        aria-label="New workspace"
        onClick={() => addWorkspace(userId)}
        className="flex items-center justify-center w-7 h-full text-gray-600 hover:text-gray-300 transition-colors text-base leading-none"
        title="New workspace"
      >
        +
      </button>
    </div>
  );
}

// ─── Hook: manages workspace list state, history, and user-scoped storage ─────

export function useWorkspaces(userId: string) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => loadWorkspaces(userId));

  // Determine initial active workspace: prefer URL param, then first workspace
  const [activeId, setActiveId] = useState<string>(() => {
    const fromUrl = getWorkspaceFromUrl();
    const ws = loadWorkspaces(userId);
    const valid = ws.find((w) => w.id === fromUrl);
    return valid?.id ?? ws[0].id;
  });

  // Push initial history entry if none exists (so back button works from the start).
  // Use a ref so we can read the initial values without Biome exhaustive-deps warnings.
  const initRef = useRef({ activeId, workspaces });
  useEffect(() => {
    const { activeId: id, workspaces: ws } = initRef.current;
    if (!getWorkspaceFromUrl()) {
      const match = ws.find((w) => w.id === id);
      pushWorkspaceHistory(id, match?.name ?? "Main");
    }
  }, []);

  // Listen for browser back/forward navigation
  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      const wsId = (e.state as { workspaceId?: string } | null)?.workspaceId;
      if (wsId) {
        const ws = loadWorkspaces(userId);
        const valid = ws.find((w) => w.id === wsId);
        if (valid) setActiveId(wsId);
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [userId]);

  const handleSelect = useCallback(
    (id: string) => {
      setActiveId(id);
      const ws = workspaces.find((w) => w.id === id);
      pushWorkspaceHistory(id, ws?.name ?? id);
    },
    [workspaces]
  );

  const handleChange = useCallback((next: Workspace[]) => {
    setWorkspaces(next);
  }, []);

  return { workspaces, activeId, handleSelect, handleChange };
}
