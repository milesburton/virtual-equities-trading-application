import type { TabNode } from "flexlayout-react";
import { Model } from "flexlayout-react";
import type { ChannelNumber } from "../../store/channelsSlice.ts";
import { makeDefaultModel } from "./layoutModels.ts";
import type { PanelId, TabChannelConfig } from "./panelRegistry.ts";

export type { TabChannelConfig };

export interface LayoutItem {
  i: string;
  panelType: PanelId;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  outgoing?: ChannelNumber;
  incoming?: ChannelNumber;
}

export function modelToLayoutItems(model: Model): LayoutItem[] {
  const items: LayoutItem[] = [];
  model.visitNodes((node) => {
    if (node.getType() === "tab") {
      const tab = node as TabNode;
      const cfg = tab.getConfig() as TabChannelConfig | undefined;
      if (cfg?.panelType) {
        items.push({
          i: tab.getId(),
          panelType: cfg.panelType,
          x: 0,
          y: 0,
          w: 4,
          h: 6,
          outgoing: cfg.outgoing,
          incoming: cfg.incoming,
        });
      }
    }
  });
  return items;
}

export function wouldCreateCycleOut(
  N: ChannelNumber,
  instanceId: string,
  allItems: LayoutItem[]
): boolean {
  const myIncoming = allItems.find((i) => i.i === instanceId)?.incoming ?? null;
  if (myIncoming === null) return false;

  const visited = new Set<string>();
  const queue = allItems.filter((i) => i.incoming === N).map((i) => i.i);

  while (queue.length > 0) {
    const cur = queue.shift() as string;
    if (cur === instanceId) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const item = allItems.find((i) => i.i === cur);
    if (item?.outgoing != null) {
      queue.push(...allItems.filter((i) => i.incoming === item.outgoing).map((i) => i.i));
    }
  }
  return false;
}

export function wouldCreateCycleIn(
  N: ChannelNumber,
  instanceId: string,
  allItems: LayoutItem[]
): boolean {
  const myOutgoing = allItems.find((i) => i.i === instanceId)?.outgoing ?? null;
  if (myOutgoing === null) return false;
  if (myOutgoing === N) return true;

  const visited = new Set<ChannelNumber>();
  const channelQueue: ChannelNumber[] = [myOutgoing];

  while (channelQueue.length > 0) {
    const ch = channelQueue.shift() as ChannelNumber;
    if (visited.has(ch)) continue;
    visited.add(ch);
    for (const item of allItems) {
      if (item.incoming === ch && item.outgoing != null) {
        if (item.outgoing === N) return true;
        channelQueue.push(item.outgoing);
      }
    }
  }
  return false;
}

export const DEFAULT_LAYOUT: LayoutItem[] = modelToLayoutItems(Model.fromJson(makeDefaultModel()));
