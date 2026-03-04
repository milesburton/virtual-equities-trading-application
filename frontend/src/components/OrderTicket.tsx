import { useSignal } from "@preact/signals-react";
import { useEffect, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useTradingContext } from "../context/TradingContext.tsx";
import { useChannelIn } from "../hooks/useChannelIn.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { submitOrderThunk } from "../store/ordersSlice.ts";
import { setActiveSide, setActiveStrategy } from "../store/uiSlice.ts";
import type { AlgoParams, LimitParams, PovParams, TwapParams, VwapParams } from "../types.ts";
import { AssetSelector } from "./AssetSelector";
import { StrategyParams } from "./StrategyParams";

function formatPrice(symbol: string, price: number) {
  return symbol.includes("/") ? price.toFixed(4) : price.toFixed(2);
}

function fmt2(n: number) {
  return n.toFixed(2);
}

function AssetInfoBar({ symbol }: { symbol: string }) {
  const assets = useAppSelector((s) => s.market.assets);
  const orderBook = useAppSelector((s) => s.market.orderBook);
  const asset = assets.find((a) => a.symbol === symbol);
  if (!asset) return null;

  const book = orderBook[symbol];
  const bid = book?.bids[0]?.price;
  const ask = book?.asks[0]?.price;
  const spreadBps = bid && ask ? (((ask - bid) / ((bid + ask) / 2)) * 10_000).toFixed(1) : null;

  return (
    <div className="rounded bg-gray-800/60 border border-gray-700/50 px-2.5 py-2 text-[10px] grid grid-cols-2 gap-x-4 gap-y-1">
      <div className="flex justify-between">
        <span className="text-gray-500">Bid</span>
        <span className="tabular-nums text-sky-400">{bid ? formatPrice(symbol, bid) : "—"}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Ask</span>
        <span className="tabular-nums text-red-400">{ask ? formatPrice(symbol, ask) : "—"}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Spread</span>
        <span className="tabular-nums text-gray-400">{spreadBps ? `${spreadBps}bp` : "—"}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Beta</span>
        <span className="tabular-nums text-gray-400">
          {asset.beta !== undefined ? asset.beta.toFixed(2) : "—"}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Mkt Cap</span>
        <span className="tabular-nums text-gray-400">
          {asset.marketCapB !== undefined
            ? asset.marketCapB >= 1000
              ? `$${(asset.marketCapB / 1000).toFixed(1)}T`
              : `$${asset.marketCapB.toFixed(0)}B`
            : "—"}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Div Yld</span>
        <span className="tabular-nums text-gray-400">
          {asset.dividendYield !== undefined && asset.dividendYield > 0
            ? `${(asset.dividendYield * 100).toFixed(2)}%`
            : "—"}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">P/E</span>
        <span className="tabular-nums text-gray-400">
          {asset.peRatio !== undefined && asset.peRatio > 0 ? asset.peRatio.toFixed(1) : "—"}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Exchange</span>
        <span className="tabular-nums text-gray-400">{asset.exchange ?? "—"}</span>
      </div>
    </div>
  );
}

function OrderPreview({
  symbol,
  qty,
  limitPx,
  side,
}: {
  symbol: string;
  qty: number;
  limitPx: number;
  side: "BUY" | "SELL";
}) {
  const orderBook = useAppSelector((s) => s.market.orderBook);
  if (qty <= 0 || limitPx <= 0) return null;

  const notional = qty * limitPx;
  const book = orderBook[symbol];
  const mid = book?.mid;
  const arrivalSlippageBps =
    mid && mid > 0 ? ((limitPx - mid) / mid) * 10_000 * (side === "BUY" ? 1 : -1) : null;

  return (
    <div className="rounded bg-gray-800/40 border border-gray-700/40 px-2.5 py-1.5 text-[10px] flex items-center justify-between gap-3">
      <div className="flex gap-3">
        <span className="text-gray-500">Notional</span>
        <span className="tabular-nums text-gray-200 font-semibold">
          $
          {notional >= 1_000_000
            ? `${(notional / 1_000_000).toFixed(2)}M`
            : notional >= 1_000
              ? `${(notional / 1_000).toFixed(1)}K`
              : fmt2(notional)}
        </span>
      </div>
      {arrivalSlippageBps !== null && (
        <div className="flex gap-1.5 items-center">
          <span className="text-gray-500">vs Mid</span>
          <span
            className={`tabular-nums font-semibold ${
              arrivalSlippageBps > 5
                ? "text-red-400"
                : arrivalSlippageBps < -5
                  ? "text-emerald-400"
                  : "text-gray-400"
            }`}
          >
            {arrivalSlippageBps > 0 ? "+" : ""}
            {arrivalSlippageBps.toFixed(1)}bp
          </span>
        </div>
      )}
    </div>
  );
}

const TIF_OPTIONS = [
  { value: "DAY", label: "DAY", title: "Day order — expires at market close" },
  { value: "GTC", label: "GTC", title: "Good Till Cancelled" },
  { value: "IOC", label: "IOC", title: "Immediate Or Cancel — fill what you can instantly" },
  { value: "FOK", label: "FOK", title: "Fill Or Kill — all or nothing immediately" },
] as const;

type TifValue = (typeof TIF_OPTIONS)[number]["value"];

export function OrderTicket() {
  const dispatch = useAppDispatch();
  const { registerTicketRef } = useTradingContext();
  const channelIn = useChannelIn();

  const assets = useAppSelector((s) => s.market.assets);
  const prices = useAppSelector((s) => s.market.prices);
  const activeStrategy = useAppSelector((s) => s.ui.activeStrategy);
  const activeSide = useAppSelector((s) => s.ui.activeSide);

  const assetSearch = useSignal("AAPL");
  const quantity = useSignal("100");
  const limitPrice = useSignal("");
  const expiresAt = useSignal("300");
  const tif = useSignal<TifValue>("DAY");
  const twapSlices = useSignal("10");
  const twapCap = useSignal("25");
  const povRate = useSignal("10");
  const povMin = useSignal("10");
  const povMax = useSignal("500");
  const vwapDev = useSignal("0.5");
  const vwapStart = useSignal("0");
  const vwapEnd = useSignal("300");
  const submitting = useSignal(false);
  const feedback = useSignal<{ ok: boolean; msg: string } | null>(null);

  const formRef = useRef<HTMLFormElement | null>(null);
  const assetInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    registerTicketRef(assetInputRef.current);
  }, [registerTicketRef]);

  const selectedAsset = assets.find((a) => a.symbol === assetSearch.value) ?? assets[0];
  const currentPrice = selectedAsset ? prices[selectedAsset.symbol] : undefined;

  const _priceInitialised = useRef(false);
  if (!_priceInitialised.current && currentPrice) {
    _priceInitialised.current = true;
    limitPrice.value = formatPrice(selectedAsset?.symbol ?? "", currentPrice);
  }

  function selectAsset(symbol: string) {
    assetSearch.value = symbol;
    const price = prices[symbol];
    limitPrice.value = price ? formatPrice(symbol, price) : "";
  }

  const channelAsset = channelIn.selectedAsset;
  // biome-ignore lint/correctness/useExhaustiveDependencies: signal read is reactive, selectAsset is stable
  useEffect(() => {
    if (channelAsset && channelAsset !== assetSearch.value) {
      selectAsset(channelAsset);
    }
  }, [channelAsset]);

  const qty = Number(quantity.value);
  const lx = Number(limitPrice.value);

  const isValid = qty > 0 && lx > 0 && Number(expiresAt.value) > 0 && selectedAsset !== undefined;

  function buildAlgoParams(): AlgoParams {
    if (activeStrategy === "TWAP") {
      const p: TwapParams = {
        strategy: "TWAP",
        numSlices: Number(twapSlices.value),
        participationCap: Number(twapCap.value),
      };
      return p;
    }
    if (activeStrategy === "POV") {
      const p: PovParams = {
        strategy: "POV",
        participationRate: Number(povRate.value),
        minSliceSize: Number(povMin.value),
        maxSliceSize: Number(povMax.value),
      };
      return p;
    }
    if (activeStrategy === "VWAP") {
      const p: VwapParams = {
        strategy: "VWAP",
        maxDeviation: Number(vwapDev.value) / 100,
        startOffsetSecs: Number(vwapStart.value),
        endOffsetSecs: Number(vwapEnd.value),
      };
      return p;
    }
    const p: LimitParams = { strategy: "LIMIT" };
    return p;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || submitting.value || !selectedAsset) return;

    submitting.value = true;
    feedback.value = null;

    const trade = {
      asset: selectedAsset.symbol,
      side: activeSide,
      quantity: qty,
      limitPrice: lx,
      expiresAt: Number(expiresAt.value),
      algoParams: buildAlgoParams(),
    };

    try {
      await dispatch(submitOrderThunk(trade)).unwrap();
      feedback.value = { ok: true, msg: "Order submitted." };
      quantity.value = "100";
      limitPrice.value = currentPrice ? formatPrice(selectedAsset.symbol, currentPrice) : "";
    } catch {
      feedback.value = { ok: false, msg: "Failed to submit order." };
    } finally {
      submitting.value = false;
      setTimeout(() => {
        feedback.value = null;
      }, 4_000);
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
      quantity.value = "100";
      limitPrice.value = currentPrice ? formatPrice(selectedAsset?.symbol ?? "", currentPrice) : "";
      feedback.value = null;
    },
    { preventDefault: false }
  );

  const symbol = selectedAsset?.symbol ?? "";

  return (
    <div className="flex flex-col h-full">
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
            aria-label="Execution strategy"
            title="Choose how the order is executed. LIMIT sends a single order. TWAP/POV/VWAP are algorithmic strategies that slice the order over time."
            value={activeStrategy}
            onChange={(e) => dispatch(setActiveStrategy(e.target.value as typeof activeStrategy))}
            className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500"
          >
            <option value="LIMIT">Limit Order</option>
            <option value="TWAP">TWAP — Time Weighted Avg Price</option>
            <option value="POV">POV — Percentage of Volume</option>
            <option value="VWAP">VWAP — Volume Weighted Avg Price</option>
          </select>
        </div>

        <AssetSelector
          assets={assets}
          value={assetSearch.value}
          onChange={(v) => {
            assetSearch.value = v;
          }}
          onSelect={selectAsset}
          inputRef={assetInputRef}
          prices={prices}
        />

        {symbol && <AssetInfoBar symbol={symbol} />}

        <fieldset>
          <legend className="block text-xs text-gray-500 mb-1">
            Side <span className="text-gray-700">(B / S)</span>
          </legend>
          <div className="flex gap-2">
            <button
              type="button"
              aria-pressed={activeSide === "BUY"}
              title="Buy — go long. Keyboard shortcut: B"
              onClick={() => dispatch(setActiveSide("BUY"))}
              className={`flex-1 py-2 text-xs font-semibold rounded border transition-colors ${
                activeSide === "BUY"
                  ? "bg-emerald-700 border-emerald-500 text-emerald-100"
                  : "bg-gray-800 border-gray-700 text-gray-400 hover:border-emerald-700"
              }`}
            >
              BUY
            </button>
            <button
              type="button"
              aria-pressed={activeSide === "SELL"}
              title="Sell — go short. Keyboard shortcut: S"
              onClick={() => dispatch(setActiveSide("SELL"))}
              className={`flex-1 py-2 text-xs font-semibold rounded border transition-colors ${
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
            Quantity <span className="text-gray-600">(shares)</span>
          </label>
          <input
            id="quantity"
            type="number"
            min="1"
            aria-label="Order quantity in shares"
            title="Number of shares to buy or sell"
            value={quantity.value}
            onChange={(e) => {
              quantity.value = e.target.value;
            }}
            placeholder="100"
            className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="limitPrice" className="text-xs text-gray-500">
              Limit Price
            </label>
            <div className="flex items-center gap-2">
              {currentPrice && (
                <>
                  <span className="text-[10px] text-gray-600 tabular-nums" title="Live mid price">
                    mid <span className="text-gray-400">{formatPrice(symbol, currentPrice)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      limitPrice.value = formatPrice(symbol, currentPrice);
                    }}
                    className="text-[10px] text-sky-400 hover:text-sky-300 transition-colors"
                    title="Snap limit price to current mid"
                  >
                    ↺
                  </button>
                </>
              )}
            </div>
          </div>
          <input
            id="limitPrice"
            type="number"
            step="0.0001"
            min="0"
            value={limitPrice.value}
            onChange={(e) => {
              limitPrice.value = e.target.value;
            }}
            placeholder="e.g. 150.00"
            className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
          />
        </div>

        {qty > 0 && lx > 0 && (
          <OrderPreview symbol={symbol} qty={qty} limitPx={lx} side={activeSide} />
        )}

        <div>
          <span className="block text-xs text-gray-500 mb-1">Time In Force</span>
          <div className="flex gap-1">
            {TIF_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                title={opt.title}
                onClick={() => {
                  tif.value = opt.value;
                }}
                className={`flex-1 py-1 text-[10px] font-mono rounded border transition-colors ${
                  tif.value === opt.value
                    ? "bg-gray-600 border-gray-500 text-gray-100"
                    : "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-500"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="expiresAt" className="block text-xs text-gray-500 mb-1">
            Duration <span className="text-gray-600">(seconds)</span>
          </label>
          <input
            id="expiresAt"
            type="number"
            min="1"
            aria-label="Order duration in seconds"
            title="How long the order remains active before expiring. 300 = 5 minutes."
            value={expiresAt.value}
            onChange={(e) => {
              expiresAt.value = e.target.value;
            }}
            className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
          />
        </div>

        <StrategyParams
          activeStrategy={activeStrategy}
          twapSlices={twapSlices.value}
          setTwapSlices={(v) => {
            twapSlices.value = v;
          }}
          twapCap={twapCap.value}
          setTwapCap={(v) => {
            twapCap.value = v;
          }}
          povRate={povRate.value}
          setPovRate={(v) => {
            povRate.value = v;
          }}
          povMin={povMin.value}
          setPovMin={(v) => {
            povMin.value = v;
          }}
          povMax={povMax.value}
          setPovMax={(v) => {
            povMax.value = v;
          }}
          vwapDev={vwapDev.value}
          setVwapDev={(v) => {
            vwapDev.value = v;
          }}
          vwapStart={vwapStart.value}
          setVwapStart={(v) => {
            vwapStart.value = v;
          }}
          vwapEnd={vwapEnd.value}
          setVwapEnd={(v) => {
            vwapEnd.value = v;
          }}
        />

        <button
          type="submit"
          disabled={!isValid || submitting.value}
          title={
            isValid
              ? `Submit order — keyboard shortcut: Ctrl+Enter`
              : "Fill in all required fields to submit"
          }
          aria-label={
            isValid
              ? `Submit ${activeSide} order for ${qty} shares of ${symbol} at $${lx}`
              : "Submit order (form incomplete)"
          }
          className={`w-full py-2.5 rounded text-xs font-semibold uppercase tracking-wider transition-colors ${
            activeSide === "BUY"
              ? "bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900/50 text-white"
              : "bg-red-700 hover:bg-red-600 disabled:bg-red-900/50 text-white"
          } disabled:cursor-not-allowed`}
        >
          {submitting.value
            ? "Submitting…"
            : `${activeSide} ${symbol}${qty > 0 && lx > 0 ? ` · $${(qty * lx).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : ""}`}
        </button>

        <p
          className={`text-xs text-center min-h-4 ${
            feedback.value
              ? feedback.value.ok
                ? "text-emerald-400"
                : "text-red-400"
              : "text-transparent"
          }`}
          aria-live="polite"
          aria-atomic="true"
        >
          {feedback.value?.msg ?? "\u00a0"}
        </p>
      </form>
    </div>
  );
}
