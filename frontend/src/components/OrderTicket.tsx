import { useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useTradingContext } from "../context/TradingContext.tsx";
import type {
  AlgoParams,
  AssetDef,
  LimitParams,
  MarketPrices,
  PovParams,
  Trade,
  TwapParams,
  VwapParams,
} from "../types.ts";

interface Props {
  assets: AssetDef[];
  prices: MarketPrices;
  onSubmit: (trade: Trade) => Promise<void>;
}

function formatPrice(symbol: string, price: number) {
  return symbol.includes("/") ? price.toFixed(4) : price.toFixed(2);
}

export function OrderTicket({ assets, prices, onSubmit }: Props) {
  const { activeStrategy, setActiveStrategy, activeSide, setActiveSide, registerTicketRef } =
    useTradingContext();

  const [assetSearch, setAssetSearch] = useState("AAPL");
  const [assetOpen, setAssetOpen] = useState(false);
  const [quantity, setQuantity] = useState("100");
  const [limitPrice, setLimitPrice] = useState("");
  const [expiresAt, setExpiresAt] = useState("300");
  const [twapSlices, setTwapSlices] = useState("10");
  const [twapCap, setTwapCap] = useState("25");
  const [povRate, setPovRate] = useState("10");
  const [povMin, setPovMin] = useState("10");
  const [povMax, setPovMax] = useState("500");
  const [vwapDev, setVwapDev] = useState("0.5");
  const [vwapStart, setVwapStart] = useState("0");
  const [vwapEnd, setVwapEnd] = useState("300");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const formRef = useRef<HTMLFormElement | null>(null);
  const assetInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    registerTicketRef(assetInputRef.current);
  }, [registerTicketRef]);

  const selectedAsset = assets.find((a) => a.symbol === assetSearch) ?? assets[0];
  const currentPrice = selectedAsset ? prices[selectedAsset.symbol] : undefined;

  useEffect(() => {
    if (currentPrice && !limitPrice) {
      setLimitPrice(formatPrice(selectedAsset?.symbol ?? "", currentPrice));
    }
  }, [selectedAsset?.symbol, currentPrice, limitPrice]);

  const filteredAssets = assets.filter((a) =>
    a.symbol.toLowerCase().includes(assetSearch.toLowerCase())
  );

  function selectAsset(symbol: string) {
    setAssetSearch(symbol);
    setAssetOpen(false);
    const price = prices[symbol];
    setLimitPrice(price ? formatPrice(symbol, price) : "");
  }

  const isValid =
    Number(quantity) > 0 &&
    Number(limitPrice) > 0 &&
    Number(expiresAt) > 0 &&
    selectedAsset !== undefined;

  function buildAlgoParams(): AlgoParams {
    if (activeStrategy === "TWAP") {
      const p: TwapParams = {
        strategy: "TWAP",
        numSlices: Number(twapSlices),
        participationCap: Number(twapCap),
      };
      return p;
    }
    if (activeStrategy === "POV") {
      const p: PovParams = {
        strategy: "POV",
        participationRate: Number(povRate),
        minSliceSize: Number(povMin),
        maxSliceSize: Number(povMax),
      };
      return p;
    }
    if (activeStrategy === "VWAP") {
      const p: VwapParams = {
        strategy: "VWAP",
        maxDeviation: Number(vwapDev) / 100,
        startOffsetSecs: Number(vwapStart),
        endOffsetSecs: Number(vwapEnd),
      };
      return p;
    }
    const p: LimitParams = { strategy: "LIMIT" };
    return p;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || submitting || !selectedAsset) return;

    setSubmitting(true);
    setFeedback(null);

    const trade: Trade = {
      asset: selectedAsset.symbol,
      side: activeSide,
      quantity: Number(quantity),
      limitPrice: Number(limitPrice),
      expiresAt: Number(expiresAt),
      algoParams: buildAlgoParams(),
    };

    try {
      await onSubmit(trade);
      setFeedback({ ok: true, msg: "Order submitted." });
      setQuantity("");
      setLimitPrice("");
    } catch {
      setFeedback({ ok: false, msg: "Failed to submit order." });
    } finally {
      setSubmitting(false);
      setTimeout(() => setFeedback(null), 4_000);
    }
  }

  useHotkeys(
    "ctrl+enter",
    () => {
      formRef.current?.requestSubmit();
    },
    { preventDefault: true }
  );

  useHotkeys(
    "escape",
    () => {
      setQuantity("");
      setLimitPrice("");
      setFeedback(null);
    },
    { preventDefault: false }
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Order Ticket
        </span>
        <span className="text-[10px] text-gray-600">? for shortcuts</span>
      </div>

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="flex flex-col gap-2.5 p-3 overflow-auto flex-1"
      >
        <div>
          <label htmlFor="strategy" className="block text-xs text-gray-500 mb-1">
            Strategy
          </label>
          <select
            id="strategy"
            value={activeStrategy}
            onChange={(e) => setActiveStrategy(e.target.value as typeof activeStrategy)}
            className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500"
          >
            <option value="LIMIT">Limit Order</option>
            <option value="TWAP">TWAP</option>
            <option value="POV">POV</option>
            <option value="VWAP">VWAP</option>
          </select>
        </div>

        <div className="relative">
          <label htmlFor="asset-search" className="block text-xs text-gray-500 mb-1">
            Asset
          </label>
          <div className="flex items-center gap-2">
            <input
              id="asset-search"
              ref={assetInputRef}
              type="text"
              autoComplete="off"
              value={assetSearch}
              onChange={(e) => {
                setAssetSearch(e.target.value);
                setAssetOpen(true);
              }}
              onFocus={() => setAssetOpen(true)}
              onBlur={() => setTimeout(() => setAssetOpen(false), 150)}
              className="flex-1 bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500"
            />
            {currentPrice ? (
              <span className="text-xs text-emerald-400 tabular-nums whitespace-nowrap">
                {formatPrice(selectedAsset?.symbol ?? "", currentPrice)}
              </span>
            ) : (
              <span className="text-xs text-gray-600">—</span>
            )}
          </div>
          {assetOpen && filteredAssets.length > 0 && (
            <ul className="absolute left-0 right-0 top-full mt-0.5 z-30 bg-gray-900 border border-gray-700 rounded shadow-xl max-h-48 overflow-auto text-xs">
              {filteredAssets.slice(0, 40).map((a) => (
                <li key={a.symbol}>
                  <button
                    type="button"
                    onMouseDown={() => selectAsset(a.symbol)}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-gray-700 flex items-center justify-between"
                  >
                    <span className="font-semibold text-gray-200">{a.symbol}</span>
                    <span className="text-gray-500">{a.sector}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <fieldset>
          <legend className="block text-xs text-gray-500 mb-1">
            Side <span className="text-gray-700">(B / S)</span>
          </legend>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveSide("BUY")}
              className={`flex-1 py-1.5 text-xs font-semibold rounded border transition-colors ${
                activeSide === "BUY"
                  ? "bg-emerald-700 border-emerald-500 text-emerald-100"
                  : "bg-gray-800 border-gray-700 text-gray-400 hover:border-emerald-700"
              }`}
            >
              BUY
            </button>
            <button
              type="button"
              onClick={() => setActiveSide("SELL")}
              className={`flex-1 py-1.5 text-xs font-semibold rounded border transition-colors ${
                activeSide === "SELL"
                  ? "bg-red-800 border-red-600 text-red-100"
                  : "bg-gray-800 border-gray-700 text-gray-400 hover:border-red-700"
              }`}
            >
              SELL
            </button>
          </div>
        </fieldset>

        <div>
          <label htmlFor="quantity" className="block text-xs text-gray-500 mb-1">
            Quantity
          </label>
          <input
            id="quantity"
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="100"
            className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="limitPrice" className="text-xs text-gray-500">
              Limit Price
            </label>
            {currentPrice && (
              <button
                type="button"
                onClick={() =>
                  setLimitPrice(formatPrice(selectedAsset?.symbol ?? "", currentPrice))
                }
                className="text-[10px] text-sky-400 hover:text-sky-300 transition-colors"
              >
                Use market
              </button>
            )}
          </div>
          <input
            id="limitPrice"
            type="number"
            step="0.0001"
            min="0"
            value={limitPrice}
            onChange={(e) => setLimitPrice(e.target.value)}
            placeholder="e.g. 150.00"
            className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
          />
        </div>

        <div>
          <label htmlFor="expiresAt" className="block text-xs text-gray-500 mb-1">
            Expiry (seconds)
          </label>
          <input
            id="expiresAt"
            type="number"
            min="1"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
          />
        </div>

        {activeStrategy === "TWAP" && (
          <div className="border border-gray-800 rounded p-2 space-y-2">
            <div className="text-[10px] text-gray-600 uppercase tracking-wider">TWAP Params</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="twapSlices" className="block text-xs text-gray-500 mb-1">
                  Slices
                </label>
                <input
                  id="twapSlices"
                  type="number"
                  min="1"
                  value={twapSlices}
                  onChange={(e) => setTwapSlices(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="twapCap" className="block text-xs text-gray-500 mb-1">
                  Part. Cap %
                </label>
                <input
                  id="twapCap"
                  type="number"
                  min="1"
                  max="100"
                  value={twapCap}
                  onChange={(e) => setTwapCap(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
                />
              </div>
            </div>
          </div>
        )}

        {activeStrategy === "POV" && (
          <div className="border border-gray-800 rounded p-2 space-y-2">
            <div className="text-[10px] text-gray-600 uppercase tracking-wider">POV Params</div>
            <div>
              <label htmlFor="povRate" className="block text-xs text-gray-500 mb-1">
                Participation Rate %
              </label>
              <input
                id="povRate"
                type="number"
                min="1"
                max="100"
                value={povRate}
                onChange={(e) => setPovRate(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="povMin" className="block text-xs text-gray-500 mb-1">
                  Min Slice
                </label>
                <input
                  id="povMin"
                  type="number"
                  min="0"
                  value={povMin}
                  onChange={(e) => setPovMin(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="povMax" className="block text-xs text-gray-500 mb-1">
                  Max Slice
                </label>
                <input
                  id="povMax"
                  type="number"
                  min="1"
                  value={povMax}
                  onChange={(e) => setPovMax(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
                />
              </div>
            </div>
          </div>
        )}

        {activeStrategy === "VWAP" && (
          <div className="border border-gray-800 rounded p-2 space-y-2">
            <div className="text-[10px] text-gray-600 uppercase tracking-wider">VWAP Params</div>
            <div>
              <label htmlFor="vwapDev" className="block text-xs text-gray-500 mb-1">
                Max Deviation %
              </label>
              <input
                id="vwapDev"
                type="number"
                min="0.01"
                step="0.01"
                value={vwapDev}
                onChange={(e) => setVwapDev(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="vwapStart" className="block text-xs text-gray-500 mb-1">
                  Start Offset (s)
                </label>
                <input
                  id="vwapStart"
                  type="number"
                  min="0"
                  value={vwapStart}
                  onChange={(e) => setVwapStart(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="vwapEnd" className="block text-xs text-gray-500 mb-1">
                  End Offset (s)
                </label>
                <input
                  id="vwapEnd"
                  type="number"
                  min="1"
                  value={vwapEnd}
                  onChange={(e) => setVwapEnd(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
                />
              </div>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={!isValid || submitting}
          className={`w-full py-2 rounded text-xs font-semibold uppercase tracking-wider transition-colors ${
            activeSide === "BUY"
              ? "bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900/50 text-white"
              : "bg-red-700 hover:bg-red-600 disabled:bg-red-900/50 text-white"
          } disabled:cursor-not-allowed`}
        >
          {submitting ? "Submitting…" : `${activeSide} ${selectedAsset?.symbol ?? ""}  ·  Ctrl+↵`}
        </button>

        {feedback && (
          <p className={`text-xs text-center ${feedback.ok ? "text-emerald-400" : "text-red-400"}`}>
            {feedback.msg}
          </p>
        )}
      </form>
    </div>
  );
}
