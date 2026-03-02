import type { ServiceHealth } from "../types.ts";
import { StatusDot } from "./StatusDot";

export function ServiceRow({ svc }: { svc: ServiceHealth }) {
  function label(state: ServiceHealth["state"]) {
    if (state === "ok") return <span className="text-emerald-400">ok</span>;
    if (state === "error") return <span className="text-red-400">error</span>;
    return <span className="text-gray-500">—</span>;
  }

  return (
    <tr className="border-b border-gray-800/40">
      <td className="px-3 py-2 flex items-center gap-2 whitespace-nowrap">
        <StatusDot state={svc.state} />
        {svc.link ? (
          <a
            href={svc.link}
            target="_blank"
            rel="noreferrer"
            className="text-gray-200 hover:text-emerald-400 transition-colors underline-offset-2 hover:underline"
          >
            {svc.name}
          </a>
        ) : (
          <span className="text-gray-200">{svc.name}</span>
        )}
      </td>
      <td className="px-3 py-2">{label(svc.state)}</td>
      <td className="px-3 py-2 font-mono text-gray-400">{svc.version}</td>
      <td className="px-3 py-2 text-gray-500">
        {Object.entries(svc.meta).length > 0
          ? Object.entries(svc.meta)
              .map(([k, v]) => `${k}: ${v}`)
              .join(", ")
          : svc.lastChecked
            ? new Date(svc.lastChecked).toLocaleTimeString()
            : "—"}
      </td>
    </tr>
  );
}

export default ServiceRow;
