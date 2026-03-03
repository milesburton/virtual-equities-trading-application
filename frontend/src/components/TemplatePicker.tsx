import { useEffect, useRef, useState } from "react";
import { LAYOUT_TEMPLATES, useDashboard } from "./DashboardLayout.tsx";

export function TemplatePicker() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { resetLayout } = useDashboard();

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title="Switch layout template"
        onClick={() => setOpen((o) => !o)}
        className="text-gray-500 hover:text-gray-300 transition-colors text-xs leading-none px-1.5 py-0.5 rounded hover:bg-gray-800"
      >
        ⊞ Layout
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-gray-900 border border-gray-700 rounded shadow-xl p-1.5 flex flex-col gap-0.5 min-w-[200px]">
          <span className="text-[9px] text-gray-500 px-2 py-1 uppercase tracking-wider">
            Layout Templates
          </span>
          {LAYOUT_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => {
                resetLayout(tpl.layout);
                setOpen(false);
              }}
              className="flex flex-col items-start gap-0.5 px-2 py-1.5 rounded text-left hover:bg-gray-800 transition-colors"
            >
              <span className="text-xs text-gray-200 font-medium">{tpl.label}</span>
              <span className="text-[10px] text-gray-500">{tpl.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
