import { describe, expect, it } from "vitest";
import type { NewsItem } from "../newsSlice";
import { newsBatchReceived, newsItemReceived, newsSlice } from "../newsSlice";

const { reducer } = newsSlice;

function makeItem(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id: "item-1",
    symbol: "AAPL",
    headline: "Apple reports record earnings",
    source: "Reuters",
    url: "https://example.com/1",
    publishedAt: 1_000_000,
    sentiment: "positive",
    sentimentScore: 0.8,
    relatedSymbols: ["MSFT"],
    ...overrides,
  };
}

describe("newsSlice", () => {
  it("starts with empty bySymbol map", () => {
    const state = reducer(undefined, { type: "@@INIT" });
    expect(state.bySymbol).toEqual({});
  });

  describe("newsItemReceived", () => {
    it("adds an item for a new symbol", () => {
      const state = reducer(undefined, newsItemReceived(makeItem()));
      expect(state.bySymbol.AAPL).toHaveLength(1);
      expect(state.bySymbol.AAPL[0].id).toBe("item-1");
    });

    it("prepends newer items (newest first)", () => {
      let state = reducer(undefined, newsItemReceived(makeItem({ id: "old", publishedAt: 1000 })));
      state = reducer(state, newsItemReceived(makeItem({ id: "new", publishedAt: 2000 })));
      expect(state.bySymbol.AAPL[0].id).toBe("new");
      expect(state.bySymbol.AAPL[1].id).toBe("old");
    });

    it("deduplicates items with the same id", () => {
      let state = reducer(undefined, newsItemReceived(makeItem()));
      state = reducer(state, newsItemReceived(makeItem()));
      expect(state.bySymbol.AAPL).toHaveLength(1);
    });

    it("keeps items for different symbols separate", () => {
      let state = reducer(undefined, newsItemReceived(makeItem({ symbol: "AAPL", id: "a1" })));
      state = reducer(state, newsItemReceived(makeItem({ symbol: "MSFT", id: "m1" })));
      expect(state.bySymbol.AAPL).toHaveLength(1);
      expect(state.bySymbol.MSFT).toHaveLength(1);
    });

    it("caps at 50 items per symbol", () => {
      let state = reducer(undefined, { type: "@@INIT" });
      for (let i = 0; i < 55; i++) {
        state = reducer(state, newsItemReceived(makeItem({ id: `item-${i}`, publishedAt: i })));
      }
      expect(state.bySymbol.AAPL).toHaveLength(50);
    });
  });

  describe("newsBatchReceived", () => {
    it("adds multiple items in one dispatch", () => {
      const items = [
        makeItem({ id: "b1", publishedAt: 2000 }),
        makeItem({ id: "b2", publishedAt: 1000 }),
      ];
      const state = reducer(undefined, newsBatchReceived(items));
      expect(state.bySymbol.AAPL).toHaveLength(2);
    });

    it("sorts descending by publishedAt after batch", () => {
      const items = [
        makeItem({ id: "old", publishedAt: 1000 }),
        makeItem({ id: "new", publishedAt: 3000 }),
        makeItem({ id: "mid", publishedAt: 2000 }),
      ];
      const state = reducer(undefined, newsBatchReceived(items));
      const ids = state.bySymbol.AAPL.map((i) => i.id);
      expect(ids).toEqual(["new", "mid", "old"]);
    });

    it("deduplicates items in a batch", () => {
      const items = [makeItem({ id: "dup" }), makeItem({ id: "dup" })];
      const state = reducer(undefined, newsBatchReceived(items));
      expect(state.bySymbol.AAPL).toHaveLength(1);
    });

    it("does not duplicate items already in state", () => {
      let state = reducer(undefined, newsItemReceived(makeItem({ id: "existing" })));
      state = reducer(
        state,
        newsBatchReceived([makeItem({ id: "existing" }), makeItem({ id: "new" })])
      );
      expect(state.bySymbol.AAPL).toHaveLength(2);
    });
  });
});
