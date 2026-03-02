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

const panelParam = new URLSearchParams(window.location.search).get("panel");

if (panelParam) {
  // Pop-out window mode: render just the requested panel
  createRoot(root).render(
    <StrictMode>
      <Provider store={store}>
        <PopOutHost panelId={panelParam} />
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
