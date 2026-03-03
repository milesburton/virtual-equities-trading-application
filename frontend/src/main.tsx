import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import "./index.css";
import App from "./App.tsx";
import { PopOutHost } from "./components/PopOutHost.tsx";
import { listenForStateRequests } from "./store/channel.ts";
import { store } from "./store/index.ts";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

const searchParams = new URLSearchParams(window.location.search);
const instanceId = searchParams.get("panel");
const panelType = searchParams.get("type") ?? instanceId ?? "";
const layoutKey = searchParams.get("layout") ?? "dashboard-layout";

if (instanceId) {
  // Pop-out window mode: render just the requested panel
  createRoot(root).render(
    <StrictMode>
      <Provider store={store}>
        <PopOutHost instanceId={instanceId} panelType={panelType} layoutKey={layoutKey} />
      </Provider>
    </StrictMode>
  );
} else {
  // Main window: start BroadcastChannel state listener for pop-outs
  listenForStateRequests(() => store.getState());

  createRoot(root).render(
    <StrictMode>
      <Provider store={store}>
        <App />
      </Provider>
    </StrictMode>
  );
}
