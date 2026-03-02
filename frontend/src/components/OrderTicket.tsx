import { useEffect, useRef } from "react";
import { useSignal } from "@preact/signals-react";
import { useHotkeys } from "react-hotkeys-hook";
import { useTradingContext } from "../context/TradingContext.tsx";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { setActiveSide, setActiveStrategy } from "../store/uiSlice.ts";
import { submitOrderThunk } from "../store/ordersSlice.ts";
import type {
  AlgoParams,
  LimitParams,
  PovParams,
  TwapParams,
  VwapParams,
} from "../types.ts";
import { AssetSelector } from "./AssetSelector";
import { StrategyParams } from "./StrategyParams";

function formatPrice(symbol: string, price: number) {
  return symbol.includes("/") ? price.toFixed(4) : price.toFixed(2);
}

export function OrderTicket() {
  const dispatch = useAppDispatch();
  const { registerTicketRef } = useTradingContext();

  const assets = useAppSelector((s) => s.market.assets);
  const prices = useAppSelector((s) => s.market.prices);
  const activeStrategy = useAppSelector((s) => s.ui.activeStrategy);
  const activeSide = useAppSelector((s) => s.ui.activeSide);

  const assetSearch = useSignal("AAPL");
  const quantity = useSignal("100");
  const limitPrice = useSignal("");
  const expiresAt = useSignal("300");
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

  useEffect(() => {
    if (currentPrice && !limitPrice.value) {
      limitPrice.value = formatPrice(selectedAsset?.symbol ?? "", currentPrice);
    }
  }, [selectedAsset?.symbol, currentPrice, limitPrice]);

  function selectAsset(symbol: string) {
    assetSearch.value = symbol;
    const price = prices[symbol];
    limitPrice.value = price ? formatPrice(symbol, price) : "";
  }

  const isValid =
    Number(quantity.value) > 0 &&
    Number(limitPrice.value) > 0 &&
    Number(expiresAt.value) > 0 &&
    selectedAsset !== undefined;

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
      quantity: Number(quantity.value),
      limitPrice: Number(limitPrice.value),
      expiresAt: Number(expiresAt.value),
      algoParams: buildAlgoParams(),
    };

    try {
      await dispatch(submitOrderThunk(trade)).unwrap();
      feedback.value = { ok: true, msg: "Order submitted." };
      quantity.value = "";
      limitPrice.value = "";
    } catch {
      feedback.value = { ok: false, msg: "Failed to submit order." };
    } finally {
      submitting.value = false;
      setTimeout(() => { feedback.value = null; }, 4_000);
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
      quantity.value = "";
      limitPrice.value = "";
      feedback.value = null;
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
            onChange={(e) => dispatch(setActiveStrategy(e.target.value as typeof activeStrategy))}
            className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500"
          >
            <option value="LIMIT">Limit Order</option>
            <option value="TWAP">TWAP</option>
            <option value="POV">POV</option>
            <option value="VWAP">VWAP</option>
          </select>
        </div>

        <AssetSelector
          assets={assets}
          value={assetSearch.value}
          onChange={(v) => { assetSearch.value = v; }}
          onSelect={selectAsset}
          inputRef={assetInputRef}
          prices={prices}
        />

        <fieldset>
          <legend className="block text-xs text-gray-500 mb-1">
            Side <span className="text-gray-700">(B / S)</span>
          </legend>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => dispatch(setActiveSide("BUY"))}
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
              onClick={() => dispatch(setActiveSide("SELL"))}
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
            value={quantity.value}
            onChange={(e) => { quantity.value = e.target.value; }}
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
                onClick={() => {
                  limitPrice.value = formatPrice(selectedAsset?.symbol ?? "", currentPrice);
                }}
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
            value={limitPrice.value}
            onChange={(e) => { limitPrice.value = e.target.value; }}
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
            value={expiresAt.value}
            onChange={(e) => { expiresAt.value = e.target.value; }}
            className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
          />
        </div>

        <StrategyParams
          activeStrategy={activeStrategy}
          twapSlices={twapSlices.value}
          setTwapSlices={(v) => { twapSlices.value = v; }}
          twapCap={twapCap.value}
          setTwapCap={(v) => { twapCap.value = v; }}
          povRate={povRate.value}
          setPovRate={(v) => { povRate.value = v; }}
          povMin={povMin.value}
          setPovMin={(v) => { povMin.value = v; }}
          povMax={povMax.value}
          setPovMax={(v) => { povMax.value = v; }}
          vwapDev={vwapDev.value}
          setVwapDev={(v) => { vwapDev.value = v; }}
          vwapStart={vwapStart.value}
          setVwapStart={(v) => { vwapStart.value = v; }}
          vwapEnd={vwapEnd.value}
          setVwapEnd={(v) => { vwapEnd.value = v; }}
        />

        <button
          type="submit"
          disabled={!isValid || submitting.value}
          className={`w-full py-2 rounded text-xs font-semibold uppercase tracking-wider transition-colors ${
            activeSide === "BUY"
              ? "bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900/50 text-white"
              : "bg-red-700 hover:bg-red-600 disabled:bg-red-900/50 text-white"
          } disabled:cursor-not-allowed`}
        >
          {submitting.value ? "Submitting…" : `${activeSide} ${selectedAsset?.symbol ?? ""}  ·  Ctrl+↵`}
        </button>

        {feedback.value && (
          <p className={`text-xs text-center ${feedback.value.ok ? "text-emerald-400" : "text-red-400"}`}>
            {feedback.value.msg}
          </p>
        )}
      </form>
    </div>
  );
}
