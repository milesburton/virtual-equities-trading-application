import type React from "react";
import type { AssetDef, MarketPrices } from "../types.ts";

interface Props {
  assets: AssetDef[];
  value: string;
  onChange: (v: string) => void;
  onSelect: (symbol: string) => void;
  inputRef?: React.RefObject<HTMLInputElement>;
  prices: MarketPrices;
}

export function AssetSelector({ assets, value, onChange, onSelect, inputRef, prices }: Props) {
  const filtered = assets.filter((a) => a.symbol.toLowerCase().includes(value.toLowerCase()));
  const selected = assets.find((a) => a.symbol === value) ?? assets[0];
  const currentPrice = selected ? prices[selected.symbol] : undefined;

  return (
    <div className="relative">
      <label htmlFor="asset-search" className="block text-xs text-gray-500 mb-1">
        Asset
      </label>
      <div className="flex items-center gap-2">
        <input
          id="asset-search"
          ref={inputRef}
          type="text"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500"
        />
        {currentPrice ? (
          <span className="text-xs text-emerald-400 tabular-nums whitespace-nowrap">
            {selected
              ? selected.symbol.includes("/")
                ? currentPrice.toFixed(4)
                : currentPrice.toFixed(2)
              : "—"}
          </span>
        ) : (
          <span className="text-xs text-gray-600">—</span>
        )}
      </div>

      {filtered.length > 0 && value && (
        <ul className="absolute left-0 right-0 top-full mt-0.5 z-30 bg-gray-900 border border-gray-700 rounded shadow-xl max-h-48 overflow-auto text-xs">
          {filtered.slice(0, 40).map((a) => (
            <li key={a.symbol}>
              <button
                type="button"
                onMouseDown={() => onSelect(a.symbol)}
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
  );
}

export default AssetSelector;
