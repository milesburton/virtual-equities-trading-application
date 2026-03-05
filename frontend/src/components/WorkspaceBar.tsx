import { useSignal } from "@preact/signals-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppSelector } from "../store/hooks.ts";
import {
  makeAlgoModel,
  makeAnalysisModel,
  makeDefaultModel,
  useDashboard,
} from "./DashboardLayout.tsx";

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

// ─── View presets ─────────────────────────────────────────────────────────────

const VIEW_PRESETS = [
  { id: "trading", label: "Trading", icon: "▲", makeModel: makeDefaultModel },
  { id: "analysis", label: "Analysis", icon: "◈", makeModel: makeAnalysisModel },
  { id: "algo", label: "Algo", icon: "⊞", makeModel: makeAlgoModel },
] as const;

type ViewPresetId = (typeof VIEW_PRESETS)[number]["id"];

// ─── Vertical workspace sidebar ───────────────────────────────────────────────

interface Props {
  activeId: string;
  onSelect: (id: string) => void;
  onWorkspacesChange: (ws: Workspace[]) => void;
  workspaces: Workspace[];
}

export function WorkspaceSidebar({ activeId, onSelect, onWorkspacesChange, workspaces }: Props) {
  const expanded = useSignal(false);
  const editingId = useSignal<string | null>(null);
  const editValue = useSignal("");
  const activeView = useSignal<ViewPresetId>("trading");
  const inputRef = useRef<HTMLInputElement>(null);
  const userId = useAppSelector((s) => s.auth.user?.id ?? "anonymous");
  const { resetLayout } = useDashboard();

  useEffect(() => {
    if (editingId.value !== null) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingId.value]);

  const addWorkspace = useCallback(() => {
    const id = `ws-${Date.now()}`;
    const name = `Workspace ${workspaces.length + 1}`;
    const next = [...workspaces, { id, name }];
    saveWorkspaces(userId, next);
    onWorkspacesChange(next);
    onSelect(id);
    expanded.value = true;
  }, [workspaces, onSelect, onWorkspacesChange, userId, expanded]);

  const renameWorkspace = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const next = workspaces.map((w) => (w.id === id ? { ...w, name: trimmed } : w));
      saveWorkspaces(userId, next);
      onWorkspacesChange(next);
    },
    [workspaces, onWorkspacesChange, userId]
  );

  const removeWorkspace = useCallback(
    (id: string) => {
      if (workspaces.length <= 1) return;
      const next = workspaces.filter((w) => w.id !== id);
      saveWorkspaces(userId, next);
      onWorkspacesChange(next);
      if (activeId === id) onSelect(next[0].id);
    },
    [workspaces, activeId, onSelect, onWorkspacesChange, userId]
  );

  function commitRename() {
    if (editingId.value !== null) {
      renameWorkspace(editingId.value, editValue.value);
      editingId.value = null;
    }
  }

  const isExpanded = expanded.value;

  return (
    <nav
      aria-label="Workspace navigation"
      className={`flex flex-col shrink-0 bg-gray-950 border-r border-gray-800 transition-all duration-200 ${
        isExpanded ? "w-40" : "w-8"
      }`}
    >
      <button
        type="button"
        aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
        aria-expanded={isExpanded}
        title={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
        onClick={() => {
          expanded.value = !expanded.value;
        }}
        className="flex items-center justify-center h-8 w-full shrink-0 text-gray-600 hover:text-gray-300 hover:bg-gray-900/50 transition-colors border-b border-gray-800 text-xs"
      >
        {isExpanded ? "‹" : "›"}
      </button>

      <fieldset
        aria-label="View presets"
        className="shrink-0 border-b border-gray-800 border-0 m-0 p-0"
      >
        {isExpanded && (
          <div
            className="px-2 pt-2 pb-1 text-[9px] uppercase tracking-widest text-gray-600"
            aria-hidden="true"
          >
            Views
          </div>
        )}
        {VIEW_PRESETS.map((preset) => {
          const isActive = activeView.value === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              aria-label={`${preset.label} view`}
              aria-pressed={isActive}
              title={`${preset.label} — switch to ${preset.label.toLowerCase()} layout`}
              onClick={() => {
                activeView.value = preset.id;
                resetLayout(preset.makeModel());
              }}
              className={`flex items-center w-full border-b border-gray-800/40 transition-colors ${
                isActive
                  ? "bg-gray-800 text-emerald-400"
                  : "text-gray-500 hover:bg-gray-900/60 hover:text-gray-300"
              } ${isExpanded ? "gap-2 px-2.5 py-1.5" : "justify-center h-8"}`}
            >
              <span className="text-sm leading-none" aria-hidden="true">
                {preset.icon}
              </span>
              {isExpanded && <span className="text-[11px] font-medium">{preset.label}</span>}
            </button>
          );
        })}
      </fieldset>

      <ul
        aria-label="Workspaces"
        className="flex-1 overflow-y-auto overflow-x-hidden list-none m-0 p-0"
      >
        {workspaces.length > 1 &&
          workspaces.map((ws) => {
            const active = ws.id === activeId;
            const isEditing = editingId.value === ws.id;

            return (
              <li
                key={ws.id}
                className={`group relative flex items-center border-b border-gray-800/60 ${
                  active
                    ? "bg-gray-900 border-l-2 border-l-emerald-500"
                    : "border-l-2 border-l-transparent hover:bg-gray-900/40"
                }`}
              >
                {isExpanded ? (
                  <div className="flex items-center w-full min-w-0 px-2 py-1.5 gap-1">
                    {isEditing ? (
                      <input
                        ref={inputRef}
                        aria-label={`Rename workspace ${ws.name}`}
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
                        className="flex-1 min-w-0 bg-gray-800 text-gray-100 text-[11px] px-1 rounded outline-none border border-emerald-500"
                      />
                    ) : (
                      <button
                        type="button"
                        aria-label={`Switch to workspace: ${ws.name}`}
                        aria-current={active ? "page" : undefined}
                        title={
                          active
                            ? `${ws.name} (active — double-click to rename)`
                            : `Switch to ${ws.name}`
                        }
                        className={`flex-1 min-w-0 text-left text-[11px] truncate bg-transparent border-0 p-0 cursor-pointer ${
                          active ? "text-gray-200" : "text-gray-500 hover:text-gray-300"
                        }`}
                        onClick={() => onSelect(ws.id)}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          editingId.value = ws.id;
                          editValue.value = ws.name;
                        }}
                      >
                        {ws.name}
                      </button>
                    )}
                    {active && !isEditing && (
                      <button
                        type="button"
                        aria-label={`Remove workspace ${ws.name}`}
                        title={`Remove ${ws.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeWorkspace(ws.id);
                        }}
                        className="shrink-0 text-gray-700 hover:text-gray-400 text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-label={`Switch to workspace: ${ws.name}`}
                    aria-current={active ? "page" : undefined}
                    title={`Switch to workspace: ${ws.name}`}
                    onClick={() => onSelect(ws.id)}
                    className={`flex items-center justify-center w-8 h-8 text-[9px] font-semibold uppercase tracking-wider transition-colors ${
                      active ? "text-emerald-400" : "text-gray-600 hover:text-gray-300"
                    }`}
                  >
                    {ws.name.charAt(0)}
                  </button>
                )}
              </li>
            );
          })}
      </ul>

      <button
        type="button"
        aria-label="Add new workspace"
        title="Add new workspace"
        onClick={addWorkspace}
        className={`shrink-0 flex items-center border-t border-gray-800 text-gray-600 hover:text-gray-300 hover:bg-gray-900/50 transition-colors text-sm ${
          isExpanded ? "px-3 py-1.5 gap-1.5 text-[11px]" : "justify-center h-8"
        }`}
      >
        <span aria-hidden="true">+</span>
        {isExpanded && <span className="text-[11px]">New workspace</span>}
      </button>
    </nav>
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
