/**
 * Re-export barrel — all public symbols from the dashboard module.
 * Consumers continue to import from this path unchanged.
 */

export type { DashboardContextValue } from "./dashboard/DashboardContext.tsx";
export {
  DashboardContext,
  DashboardProvider,
  useDashboard,
} from "./dashboard/DashboardContext.tsx";
export { DashboardLayout } from "./dashboard/DashboardLayout.tsx";

export {
  LAYOUT_TEMPLATES,
  makeAdminModel,
  makeAlgoModel,
  makeAnalysisModel,
  makeClearModel,
  makeDefaultModel,
  makeExecutionModel,
  STORAGE_KEY,
  STORAGE_KEY_PREFIX,
} from "./dashboard/layoutModels.ts";

export type { LayoutItem } from "./dashboard/layoutUtils.ts";
export {
  DEFAULT_LAYOUT,
  modelToLayoutItems,
  wouldCreateCycleIn,
  wouldCreateCycleOut,
} from "./dashboard/layoutUtils.ts";
export type { ChannelNumber, PanelId, TabChannelConfig } from "./dashboard/panelRegistry.ts";
export {
  CHANNEL_COLOURS,
  PANEL_CHANNEL_CAPS,
  PANEL_DESCRIPTIONS,
  PANEL_IDS,
  PANEL_TITLES,
  SINGLETON_PANELS,
} from "./dashboard/panelRegistry.ts";
