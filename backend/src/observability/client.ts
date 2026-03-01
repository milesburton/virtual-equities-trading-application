import "https://deno.land/std@0.210.0/dotenv/load.ts";

const OBS_HOST = Deno.env.get("OBSERVABILITY_HOST") || "localhost";
const OBS_PORT = Number(Deno.env.get("OBSERVABILITY_PORT")) || 5007;
const OBS_URL = Deno.env.get("OBSERVABILITY_URL") || `http://${OBS_HOST}:${OBS_PORT}`;

export async function sendDecisionEvent(type: string, payload: Record<string, unknown>) {
  try {
    await fetch(`${OBS_URL}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: `decision.${type}`, payload }),
    });
  } catch {
    // best-effort, don't crash algos on observability failures
  }
}
