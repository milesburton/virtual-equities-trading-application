import { useEffect, useRef, useState } from "react";
import type { ObsEvent } from "../types.ts";

const OBS_URL = import.meta.env.VITE_OBS_URL ?? "http://localhost:5007";

export function useObservability() {
  const [events, setEvents] = useState<ObsEvent[]>([]);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // fetch historic events
    fetch(`${OBS_URL}/events`)
      .then(async (r) => {
        if (!r.ok) return;
        try {
          const data = await r.json();
          setEvents(data ?? []);
        } catch {}
      })
      .catch(() => {});

    // connect SSE
    const es = new EventSource(`${OBS_URL}/stream`);
    es.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data);
        setEvents((prev) => [parsed, ...prev].slice(0, 1000));
      } catch {
        // ignore parse errors
      }
    };
    es.onerror = () => {
      // reconnect logic handled by EventSource automatically in browsers
    };

    esRef.current = es;
    return () => {
      es.close();
    };
  }, []);

  function replay() {
    // simple replay: return current cached events
    return events.slice().reverse();
  }

  return { events, replay };
}
