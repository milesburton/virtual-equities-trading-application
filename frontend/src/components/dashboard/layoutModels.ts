import type { IJsonModel } from "flexlayout-react";
import type { TabChannelConfig } from "./panelRegistry.ts";
import { PANEL_TITLES } from "./panelRegistry.ts";

export const STORAGE_KEY_PREFIX = "dashboard-layout";
export const STORAGE_KEY = STORAGE_KEY_PREFIX;

export function makeDefaultModel(): IJsonModel {
  return {
    global: {
      tabEnableClose: true,
      tabEnableRename: false,
      tabSetEnableMaximize: true,
      tabSetEnableDeleteWhenEmpty: true,
      tabSetEnableSingleTabStretch: false,
      splitterSize: 4,
      splitterExtra: 4,
    },
    layout: {
      type: "row",
      children: [
        // ── Column 1: Order Ticket + Heatmap (tabset, pinned) ────────────────
        {
          type: "tabset",
          weight: 18,
          enableDrag: false,
          children: [
            {
              type: "tab",
              id: "order-ticket",
              name: PANEL_TITLES["order-ticket"],
              component: "order-ticket",
              enableDrag: false,
              enableClose: false,
              config: {
                panelType: "order-ticket",
                incoming: 1,
                pinned: true,
              } satisfies TabChannelConfig,
            },
            {
              type: "tab",
              id: "market-heatmap",
              name: PANEL_TITLES["market-heatmap"],
              component: "market-heatmap",
              config: {
                panelType: "market-heatmap",
                outgoing: 1,
              } satisfies TabChannelConfig,
            },
          ],
        },
        // ── Column 2: Market Ladder (2/3) + Candle Chart (1/3) ───────────────
        {
          type: "row",
          weight: 22,
          children: [
            {
              type: "tabset",
              weight: 67,
              enableDrag: false,
              children: [
                {
                  type: "tab",
                  id: "market-ladder",
                  name: PANEL_TITLES["market-ladder"],
                  component: "market-ladder",
                  enableDrag: false,
                  enableClose: false,
                  config: {
                    panelType: "market-ladder",
                    outgoing: 1,
                    pinned: true,
                  } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 33,
              children: [
                {
                  type: "tab",
                  id: "candle-chart",
                  name: PANEL_TITLES["candle-chart"],
                  component: "candle-chart",
                  config: {
                    panelType: "candle-chart",
                    incoming: 1,
                  } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
        // ── Column 3: Orders+FillProgress | Executions | Algo | Decision Log ───
        {
          type: "row",
          weight: 60,
          children: [
            // Order Blotter + Fill Progress side by side
            {
              type: "row",
              weight: 30,
              children: [
                {
                  type: "tabset",
                  weight: 60,
                  children: [
                    {
                      type: "tab",
                      id: "order-blotter",
                      name: PANEL_TITLES["order-blotter"],
                      component: "order-blotter",
                      config: {
                        panelType: "order-blotter",
                        outgoing: 2,
                      } satisfies TabChannelConfig,
                    },
                  ],
                },
                {
                  type: "tabset",
                  weight: 40,
                  children: [
                    {
                      type: "tab",
                      id: "order-progress",
                      name: PANEL_TITLES["order-progress"],
                      component: "order-progress",
                      config: {
                        panelType: "order-progress",
                        incoming: 2,
                      } satisfies TabChannelConfig,
                    },
                  ],
                },
              ],
            },
            {
              type: "tabset",
              weight: 23,
              children: [
                {
                  type: "tab",
                  id: "executions",
                  name: PANEL_TITLES.executions,
                  component: "executions",
                  config: { panelType: "executions", incoming: 2 } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 23,
              children: [
                {
                  type: "tab",
                  id: "algo-monitor",
                  name: PANEL_TITLES["algo-monitor"],
                  component: "algo-monitor",
                  config: { panelType: "algo-monitor", incoming: 2 } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 24,
              children: [
                {
                  type: "tab",
                  id: "decision-log",
                  name: PANEL_TITLES["decision-log"],
                  component: "decision-log",
                  config: { panelType: "decision-log", incoming: 2 } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

export function makeExecutionModel(): IJsonModel {
  return {
    global: makeDefaultModel().global,
    layout: {
      type: "row",
      children: [
        {
          type: "tabset",
          weight: 22,
          children: [
            {
              type: "tab",
              id: "order-ticket",
              name: PANEL_TITLES["order-ticket"],
              component: "order-ticket",
              config: { panelType: "order-ticket", incoming: 1 } satisfies TabChannelConfig,
            },
          ],
        },
        {
          type: "tabset",
          weight: 36,
          children: [
            {
              type: "tab",
              id: "market-ladder",
              name: PANEL_TITLES["market-ladder"],
              component: "market-ladder",
              config: { panelType: "market-ladder", outgoing: 1 } satisfies TabChannelConfig,
            },
          ],
        },
        {
          type: "tabset",
          weight: 42,
          children: [
            {
              type: "tab",
              id: "order-blotter",
              name: PANEL_TITLES["order-blotter"],
              component: "order-blotter",
              config: { panelType: "order-blotter" } satisfies TabChannelConfig,
            },
          ],
        },
      ],
    },
  };
}

export function makeAlgoModel(): IJsonModel {
  return {
    global: makeDefaultModel().global,
    layout: {
      type: "row",
      children: [
        {
          type: "row",
          weight: 65,
          children: [
            {
              type: "tabset",
              weight: 60,
              children: [
                {
                  type: "tab",
                  id: "candle-chart",
                  name: PANEL_TITLES["candle-chart"],
                  component: "candle-chart",
                  config: { panelType: "candle-chart", incoming: 1 } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 40,
              children: [
                {
                  type: "tab",
                  id: "market-depth",
                  name: PANEL_TITLES["market-depth"],
                  component: "market-depth",
                  config: { panelType: "market-depth", incoming: 1 } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
        {
          type: "row",
          weight: 35,
          children: [
            {
              type: "tabset",
              weight: 50,
              children: [
                {
                  type: "tab",
                  id: "algo-monitor",
                  name: PANEL_TITLES["algo-monitor"],
                  component: "algo-monitor",
                  config: { panelType: "algo-monitor", incoming: 2 } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 50,
              children: [
                {
                  type: "tab",
                  id: "order-blotter",
                  name: PANEL_TITLES["order-blotter"],
                  component: "order-blotter",
                  config: { panelType: "order-blotter", outgoing: 2 } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

export function makeAnalysisModel(): IJsonModel {
  return {
    global: makeDefaultModel().global,
    layout: {
      type: "row",
      children: [
        // ── Left: Market Ladder ───────────────────────────────────────────────
        {
          type: "tabset",
          weight: 25,
          children: [
            {
              type: "tab",
              id: "market-ladder",
              name: PANEL_TITLES["market-ladder"],
              component: "market-ladder",
              config: { panelType: "market-ladder", outgoing: 1 } satisfies TabChannelConfig,
            },
          ],
        },
        // ── Centre: Chart (top) + Market Depth (bottom) ───────────────────────
        {
          type: "row",
          weight: 45,
          children: [
            {
              type: "tabset",
              weight: 62,
              children: [
                {
                  type: "tab",
                  id: "candle-chart",
                  name: PANEL_TITLES["candle-chart"],
                  component: "candle-chart",
                  config: { panelType: "candle-chart", incoming: 1 } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 38,
              children: [
                {
                  type: "tab",
                  id: "market-depth",
                  name: PANEL_TITLES["market-depth"],
                  component: "market-depth",
                  config: { panelType: "market-depth", incoming: 1 } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
        // ── Right: News & Signals ─────────────────────────────────────────────
        {
          type: "tabset",
          weight: 30,
          children: [
            {
              type: "tab",
              id: "news",
              name: PANEL_TITLES.news,
              component: "news",
              config: { panelType: "news" } satisfies TabChannelConfig,
            },
          ],
        },
      ],
    },
  };
}

export function makeClearModel(): IJsonModel {
  return {
    global: makeDefaultModel().global,
    layout: {
      type: "row",
      children: [
        {
          type: "tabset",
          weight: 100,
          children: [],
        },
      ],
    },
  };
}

/**
 * Admin-focused default layout — read-only market surveillance + admin tools.
 * Admins cannot trade; no Order Ticket is included.
 *
 * Left:   Market Heatmap (primary) + Market Ladder (read-only price feed)
 * Centre: Admin config / Observability / News Sources + Candle Chart
 * Right:  Decision Log / Executions / Algo Monitor / Order Blotter (read-only audit)
 */
export function makeAdminModel(): IJsonModel {
  return {
    global: makeDefaultModel().global,
    layout: {
      type: "row",
      children: [
        // ── Column 1: Market surveillance (read-only) ─────────────────────────
        {
          type: "row",
          weight: 30,
          children: [
            {
              type: "tabset",
              weight: 60,
              children: [
                {
                  type: "tab",
                  id: "market-heatmap",
                  name: PANEL_TITLES["market-heatmap"],
                  component: "market-heatmap",
                  config: { panelType: "market-heatmap", outgoing: 1 } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 40,
              children: [
                {
                  type: "tab",
                  id: "market-ladder",
                  name: PANEL_TITLES["market-ladder"],
                  component: "market-ladder",
                  config: { panelType: "market-ladder", outgoing: 1 } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
        // ── Column 2: Admin config + Chart ────────────────────────────────────
        {
          type: "row",
          weight: 35,
          children: [
            {
              type: "tabset",
              weight: 50,
              children: [
                {
                  type: "tab",
                  id: "admin",
                  name: PANEL_TITLES.admin,
                  component: "admin",
                  config: { panelType: "admin" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "observability",
                  name: PANEL_TITLES.observability,
                  component: "observability",
                  config: { panelType: "observability" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "news-sources",
                  name: PANEL_TITLES["news-sources"],
                  component: "news-sources",
                  config: { panelType: "news-sources" } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 50,
              children: [
                {
                  type: "tab",
                  id: "candle-chart",
                  name: PANEL_TITLES["candle-chart"],
                  component: "candle-chart",
                  config: { panelType: "candle-chart", incoming: 1 } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
        // ── Column 3: Audit trail + Monitoring ───────────────────────────────
        {
          type: "row",
          weight: 35,
          children: [
            {
              type: "tabset",
              weight: 35,
              children: [
                {
                  type: "tab",
                  id: "decision-log",
                  name: PANEL_TITLES["decision-log"],
                  component: "decision-log",
                  config: { panelType: "decision-log", incoming: 1 } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 35,
              children: [
                {
                  type: "tab",
                  id: "executions",
                  name: PANEL_TITLES.executions,
                  component: "executions",
                  config: { panelType: "executions" } satisfies TabChannelConfig,
                },
                {
                  type: "tab",
                  id: "order-blotter",
                  name: PANEL_TITLES["order-blotter"],
                  component: "order-blotter",
                  config: { panelType: "order-blotter", outgoing: 2 } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 30,
              children: [
                {
                  type: "tab",
                  id: "algo-monitor",
                  name: PANEL_TITLES["algo-monitor"],
                  component: "algo-monitor",
                  config: { panelType: "algo-monitor", incoming: 1 } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

export const LAYOUT_TEMPLATES: {
  id: string;
  label: string;
  description: string;
  model: IJsonModel;
}[] = [
  {
    id: "full",
    label: "Full Dashboard",
    description: "All panels — complete trading view",
    model: makeDefaultModel(),
  },
  {
    id: "execution",
    label: "Execution",
    description: "Order entry, ladder, and blotter",
    model: makeExecutionModel(),
  },
  {
    id: "algo",
    label: "Algo Trading",
    description: "Algorithm monitor, chart, and blotter",
    model: makeAlgoModel(),
  },
  {
    id: "analysis",
    label: "Market Analysis",
    description: "Chart, depth, and ladder — no order entry",
    model: makeAnalysisModel(),
  },
  {
    id: "admin",
    label: "Mission Control",
    description: "Heatmap + mission control panels — observability, system config, news sources",
    model: makeAdminModel(),
  },
  {
    id: "clear",
    label: "Clear Layout",
    description: "Empty canvas — add panels from the panel picker",
    model: makeClearModel(),
  },
];
