import { useSignal } from "@preact/signals-react";
import { useCallback, useEffect, useRef } from "react";
import { clearUser } from "../store/authSlice.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Workspace {
  id: string;
  name: string;
}

const WORKSPACES_KEY = "workspaces";
const DEFAULT_WORKSPACES: Workspace[] = [{ id: "default", name: "Main" }];

// ─── Persistence helpers ──────────────────────────────────────────────────────

function loadWorkspaces(): Workspace[] {
  try {
    const raw = localStorage.getItem(WORKSPACES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Workspace[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // corrupted
  }
  return DEFAULT_WORKSPACES;
}

function saveWorkspaces(ws: Workspace[]) {
  localStorage.setItem(WORKSPACES_KEY, JSON.stringify(ws));
}

/** Storage key for a workspace's panel layout. */
export function workspaceStorageKey(id: string) {
  return `dashboard-layout:${id}`;
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
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);

  async function handleLogout() {
    try {
      await fetch("/api/user-service/sessions", { method: "DELETE", credentials: "include" });
    } finally {
      dispatch(clearUser());
    }
  }

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
    saveWorkspaces(next);
    onWorkspacesChange(next);
    onSelect(id);
  }, [workspaces, onSelect, onWorkspacesChange]);

  const renameWorkspace = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const next = workspaces.map((w) => (w.id === id ? { ...w, name: trimmed } : w));
      saveWorkspaces(next);
      onWorkspacesChange(next);
    },
    [workspaces, onWorkspacesChange]
  );

  const removeWorkspace = useCallback(
    (id: string) => {
      if (workspaces.length <= 1) return; // always keep at least one
      const next = workspaces.filter((w) => w.id !== id);
      saveWorkspaces(next);
      // remove persisted layout for this workspace
      localStorage.removeItem(workspaceStorageKey(id));
      onWorkspacesChange(next);
      if (activeId === id) onSelect(next[0].id);
    },
    [workspaces, activeId, onSelect, onWorkspacesChange]
  );

  function commitRename() {
    if (editingId.value !== null) {
      renameWorkspace(editingId.value, editValue.value);
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
                onClick={(e) => e.stopPropagation()}
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
                  removeWorkspace(ws.id);
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
        onClick={addWorkspace}
        className="flex items-center justify-center w-7 h-full text-gray-600 hover:text-gray-300 transition-colors text-base leading-none"
        title="New workspace"
      >
        +
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* User chip */}
      {user && (
        <div className="flex items-center gap-2 px-2">
          <span className="text-[11px] text-gray-400 flex items-center gap-1.5">
            <span className="text-base leading-none">{user.avatar_emoji}</span>
            <span>{user.name}</span>
            <span
              className={`text-[9px] font-medium uppercase px-1 py-0.5 rounded ${
                user.role === "admin"
                  ? "bg-orange-900/50 text-orange-400"
                  : "bg-blue-900/50 text-blue-400"
              }`}
            >
              {user.role}
            </span>
          </span>
          <button
            type="button"
            onClick={handleLogout}
            title="Log out"
            className="text-gray-600 hover:text-gray-300 transition-colors text-[10px] leading-none px-1.5 py-0.5 border border-gray-700 hover:border-gray-500 rounded"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Hook: manages workspace list state and provides initial load ─────────────

export function useWorkspaces() {
  const workspaces = useSignal<Workspace[]>(loadWorkspaces());
  const activeId = useSignal<string>(workspaces.value[0].id);

  const handleSelect = useCallback(
    (id: string) => {
      activeId.value = id;
    },
    [activeId]
  );

  const handleChange = useCallback(
    (next: Workspace[]) => {
      workspaces.value = next;
    },
    [workspaces]
  );

  return { workspaces, activeId, handleSelect, handleChange };
}
