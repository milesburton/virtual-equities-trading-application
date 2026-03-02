import { usePopOut } from "../hooks/usePopOut.ts";
import type { PanelId } from "../store/windowSlice.ts";

export function PopOutButton({ panelId }: { panelId: PanelId }) {
  const { isPopOut, popOut } = usePopOut(panelId);
  return (
    <button
      type="button"
      onClick={popOut}
      disabled={isPopOut}
      title="Pop out panel"
      className="text-gray-600 hover:text-gray-300 transition-colors text-xs disabled:opacity-30"
      aria-label="Pop out panel"
    >
      ⬡
    </button>
  );
}
