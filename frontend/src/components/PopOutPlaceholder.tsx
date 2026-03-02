import { useAppDispatch } from "../store/hooks.ts";
import type { PanelId } from "../store/windowSlice.ts";
import { panelClosed } from "../store/windowSlice.ts";

export function PopOutPlaceholder({ panelId }: { panelId: PanelId }) {
  const dispatch = useAppDispatch();
  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-600 text-xs gap-2">
      <span>Panel open in external window</span>
      <button
        type="button"
        onClick={() => dispatch(panelClosed({ panelId }))}
        className="text-emerald-500 hover:text-emerald-300 transition-colors"
      >
        Restore here
      </button>
    </div>
  );
}
