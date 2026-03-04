export interface AssetDef {
  symbol: string;
  initialPrice: number;
  volatility: number;
  sector: string;
  /** Average daily volume in shares (realistic ADV for liquidity modelling). */
  dailyVolume: number;
  // ── Enriched market reference data ──────────────────────────────────────────
  /** Market capitalisation in billions USD (approximated from price × float shares). */
  marketCapB: number;
  /** Beta vs S&P 500 (1.0 = market, >1 more volatile, <1 less volatile). */
  beta: number;
  /** Trailing 12-month dividend yield as a decimal (0.012 = 1.2 %). Zero for non-dividend payers. */
  dividendYield: number;
  /** Trailing P/E ratio.  0 = loss-making / not applicable. */
  peRatio: number;
  /** Public float as a fraction of shares outstanding (e.g. 0.95 = 95 % tradeable). */
  float: number;
  /** Primary listing exchange MIC code. */
  exchange: "XNAS" | "XNYS" | "XCHI" | "ARCX";
  /** ISO 4217 settlement currency. */
  currency: "USD";
  /** Simulated ISIN (format: US + 9 uppercase alphanum + 1 check digit). */
  isin: string;
}

type RawAsset = Omit<AssetDef, "marketCapB" | "beta" | "dividendYield" | "peRatio" | "float" | "exchange" | "currency" | "isin">;

const _RAW_ASSETS: RawAsset[] = [
  // dailyVolume = realistic ADV (average daily shares traded)
  { symbol: "AAPL", initialPrice: 189.30, volatility: 0.018, sector: "Technology", dailyVolume: 55_000_000 },
  { symbol: "MSFT", initialPrice: 415.26, volatility: 0.016, sector: "Technology", dailyVolume: 20_000_000 },
  { symbol: "AMZN", initialPrice: 185.07, volatility: 0.021, sector: "Consumer Discretionary", dailyVolume: 35_000_000 },
  { symbol: "NVDA", initialPrice: 875.40, volatility: 0.035, sector: "Technology", dailyVolume: 45_000_000 },
  { symbol: "GOOGL", initialPrice: 175.50, volatility: 0.019, sector: "Communication Services", dailyVolume: 25_000_000 },
  { symbol: "GOOG", initialPrice: 176.75, volatility: 0.019, sector: "Communication Services", dailyVolume: 18_000_000 },
  { symbol: "META", initialPrice: 527.10, volatility: 0.026, sector: "Communication Services", dailyVolume: 15_000_000 },
  { symbol: "TSLA", initialPrice: 248.50, volatility: 0.045, sector: "Consumer Discretionary", dailyVolume: 100_000_000 },
  { symbol: "BRK.B", initialPrice: 388.20, volatility: 0.012, sector: "Financials", dailyVolume: 3_500_000 },
  { symbol: "LLY", initialPrice: 789.50, volatility: 0.022, sector: "Health Care", dailyVolume: 3_200_000 },
  { symbol: "JPM", initialPrice: 198.40, volatility: 0.017, sector: "Financials", dailyVolume: 9_000_000 },
  { symbol: "V", initialPrice: 279.30, volatility: 0.015, sector: "Financials", dailyVolume: 6_500_000 },
  { symbol: "UNH", initialPrice: 525.80, volatility: 0.018, sector: "Health Care", dailyVolume: 2_800_000 },
  { symbol: "XOM", initialPrice: 113.50, volatility: 0.020, sector: "Energy", dailyVolume: 16_000_000 },
  { symbol: "MA", initialPrice: 472.60, volatility: 0.016, sector: "Financials", dailyVolume: 3_000_000 },
  { symbol: "JNJ", initialPrice: 152.30, volatility: 0.013, sector: "Health Care", dailyVolume: 7_000_000 },
  { symbol: "PG", initialPrice: 162.40, volatility: 0.012, sector: "Consumer Staples", dailyVolume: 6_000_000 },
  { symbol: "HD", initialPrice: 378.90, volatility: 0.017, sector: "Consumer Discretionary", dailyVolume: 3_000_000 },
  { symbol: "CVX", initialPrice: 156.20, volatility: 0.021, sector: "Energy", dailyVolume: 9_500_000 },
  { symbol: "MRK", initialPrice: 126.80, volatility: 0.016, sector: "Health Care", dailyVolume: 8_500_000 },
  { symbol: "ABBV", initialPrice: 165.40, volatility: 0.019, sector: "Health Care", dailyVolume: 5_500_000 },
  { symbol: "AVGO", initialPrice: 1342.00, volatility: 0.030, sector: "Technology", dailyVolume: 2_200_000 },
  { symbol: "COST", initialPrice: 785.20, volatility: 0.014, sector: "Consumer Staples", dailyVolume: 1_800_000 },
  { symbol: "PEP", initialPrice: 173.50, volatility: 0.012, sector: "Consumer Staples", dailyVolume: 4_000_000 },
  { symbol: "ADBE", initialPrice: 525.60, volatility: 0.023, sector: "Technology", dailyVolume: 2_500_000 },
  { symbol: "CRM", initialPrice: 298.40, volatility: 0.025, sector: "Technology", dailyVolume: 4_000_000 },
  { symbol: "AMD", initialPrice: 178.90, volatility: 0.038, sector: "Technology", dailyVolume: 55_000_000 },
  { symbol: "NFLX", initialPrice: 625.30, volatility: 0.030, sector: "Communication Services", dailyVolume: 4_500_000 },
  { symbol: "TXN", initialPrice: 172.40, volatility: 0.017, sector: "Technology", dailyVolume: 5_500_000 },
  { symbol: "WMT", initialPrice: 64.20, volatility: 0.011, sector: "Consumer Staples", dailyVolume: 18_000_000 },
  { symbol: "QCOM", initialPrice: 168.50, volatility: 0.026, sector: "Technology", dailyVolume: 9_000_000 },
  { symbol: "ORCL", initialPrice: 127.80, volatility: 0.020, sector: "Technology", dailyVolume: 6_500_000 },
  { symbol: "INTU", initialPrice: 645.30, volatility: 0.022, sector: "Technology", dailyVolume: 1_500_000 },
  { symbol: "PM", initialPrice: 96.40, volatility: 0.014, sector: "Consumer Staples", dailyVolume: 4_500_000 },
  { symbol: "MCD", initialPrice: 298.70, volatility: 0.013, sector: "Consumer Discretionary", dailyVolume: 2_800_000 },
  { symbol: "HON", initialPrice: 197.50, volatility: 0.015, sector: "Industrials", dailyVolume: 2_500_000 },
  { symbol: "AMGN", initialPrice: 289.60, volatility: 0.019, sector: "Health Care", dailyVolume: 2_500_000 },
  { symbol: "UPS", initialPrice: 149.30, volatility: 0.018, sector: "Industrials", dailyVolume: 2_500_000 },
  { symbol: "IBM", initialPrice: 167.80, volatility: 0.016, sector: "Technology", dailyVolume: 3_500_000 },
  { symbol: "CAT", initialPrice: 348.50, volatility: 0.021, sector: "Industrials", dailyVolume: 2_000_000 },
  { symbol: "BA", initialPrice: 192.40, volatility: 0.030, sector: "Industrials", dailyVolume: 5_000_000 },
  { symbol: "GS", initialPrice: 452.30, volatility: 0.020, sector: "Financials", dailyVolume: 1_800_000 },
  { symbol: "MS", initialPrice: 96.80, volatility: 0.019, sector: "Financials", dailyVolume: 9_000_000 },
  { symbol: "BLK", initialPrice: 826.40, volatility: 0.018, sector: "Financials", dailyVolume: 700_000 },
  { symbol: "SPGI", initialPrice: 472.60, volatility: 0.016, sector: "Financials", dailyVolume: 900_000 },
  { symbol: "AXP", initialPrice: 234.50, volatility: 0.019, sector: "Financials", dailyVolume: 2_500_000 },
  { symbol: "DE", initialPrice: 398.20, volatility: 0.020, sector: "Industrials", dailyVolume: 1_200_000 },
  { symbol: "SCHW", initialPrice: 72.40, volatility: 0.023, sector: "Financials", dailyVolume: 10_000_000 },
  { symbol: "C", initialPrice: 62.30, volatility: 0.021, sector: "Financials", dailyVolume: 18_000_000 },
  { symbol: "USB", initialPrice: 43.80, volatility: 0.018, sector: "Financials", dailyVolume: 7_000_000 },
  { symbol: "TJX", initialPrice: 98.60, volatility: 0.015, sector: "Consumer Discretionary", dailyVolume: 5_500_000 },
  { symbol: "LOW", initialPrice: 238.40, volatility: 0.017, sector: "Consumer Discretionary", dailyVolume: 2_500_000 },
  { symbol: "SBUX", initialPrice: 94.30, volatility: 0.020, sector: "Consumer Discretionary", dailyVolume: 7_000_000 },
  { symbol: "MDLZ", initialPrice: 65.40, volatility: 0.013, sector: "Consumer Staples", dailyVolume: 5_000_000 },
  { symbol: "ADI", initialPrice: 214.60, volatility: 0.022, sector: "Technology", dailyVolume: 3_500_000 },
  { symbol: "GILD", initialPrice: 83.20, volatility: 0.017, sector: "Health Care", dailyVolume: 5_500_000 },
  { symbol: "LRCX", initialPrice: 978.40, volatility: 0.032, sector: "Technology", dailyVolume: 800_000 },
  { symbol: "REGN", initialPrice: 1048.30, volatility: 0.024, sector: "Health Care", dailyVolume: 500_000 },
  { symbol: "VRTX", initialPrice: 462.80, volatility: 0.023, sector: "Health Care", dailyVolume: 700_000 },
  { symbol: "ISRG", initialPrice: 385.60, volatility: 0.024, sector: "Health Care", dailyVolume: 900_000 },
  { symbol: "ZTS", initialPrice: 175.30, volatility: 0.016, sector: "Health Care", dailyVolume: 1_800_000 },
  { symbol: "SYK", initialPrice: 352.80, volatility: 0.017, sector: "Health Care", dailyVolume: 1_500_000 },
  { symbol: "BKNG", initialPrice: 3856.40, volatility: 0.022, sector: "Consumer Discretionary", dailyVolume: 350_000 },
  { symbol: "PANW", initialPrice: 325.40, volatility: 0.033, sector: "Technology", dailyVolume: 3_500_000 },
  { symbol: "KLAC", initialPrice: 745.60, volatility: 0.030, sector: "Technology", dailyVolume: 700_000 },
  { symbol: "AMAT", initialPrice: 196.40, volatility: 0.030, sector: "Technology", dailyVolume: 6_500_000 },
  { symbol: "MCHP", initialPrice: 82.40, volatility: 0.025, sector: "Technology", dailyVolume: 4_500_000 },
  { symbol: "SNPS", initialPrice: 525.80, volatility: 0.022, sector: "Technology", dailyVolume: 800_000 },
  { symbol: "CDNS", initialPrice: 295.30, volatility: 0.022, sector: "Technology", dailyVolume: 1_200_000 },
  { symbol: "MU", initialPrice: 128.50, volatility: 0.035, sector: "Technology", dailyVolume: 18_000_000 },
  { symbol: "INTC", initialPrice: 24.80, volatility: 0.030, sector: "Technology", dailyVolume: 40_000_000 },
  { symbol: "NOW", initialPrice: 825.40, volatility: 0.028, sector: "Technology", dailyVolume: 1_200_000 },
  { symbol: "UBER", initialPrice: 72.30, volatility: 0.032, sector: "Technology", dailyVolume: 18_000_000 },
  { symbol: "ABNB", initialPrice: 148.60, volatility: 0.030, sector: "Consumer Discretionary", dailyVolume: 5_000_000 },
  { symbol: "DDOG", initialPrice: 138.40, volatility: 0.035, sector: "Technology", dailyVolume: 5_500_000 },
  { symbol: "NET", initialPrice: 95.30, volatility: 0.038, sector: "Technology", dailyVolume: 8_000_000 },
  { symbol: "SNOW", initialPrice: 154.80, volatility: 0.040, sector: "Technology", dailyVolume: 9_000_000 },
  { symbol: "CRWD", initialPrice: 348.50, volatility: 0.038, sector: "Technology", dailyVolume: 3_500_000 },
  { symbol: "ZS", initialPrice: 218.60, volatility: 0.036, sector: "Technology", dailyVolume: 3_500_000 },
  { symbol: "WDAY", initialPrice: 268.40, volatility: 0.027, sector: "Technology", dailyVolume: 2_000_000 },
  { symbol: "TTD", initialPrice: 95.60, volatility: 0.040, sector: "Technology", dailyVolume: 5_500_000 },
  { symbol: "TEAM", initialPrice: 218.30, volatility: 0.032, sector: "Technology", dailyVolume: 2_500_000 },
  { symbol: "HUBS", initialPrice: 598.40, volatility: 0.030, sector: "Technology", dailyVolume: 600_000 },
  { symbol: "SHOP", initialPrice: 78.60, volatility: 0.038, sector: "Technology", dailyVolume: 12_000_000 },
  { symbol: "SQ", initialPrice: 72.40, volatility: 0.040, sector: "Technology", dailyVolume: 10_000_000 },
  { symbol: "PYPL", initialPrice: 65.30, volatility: 0.030, sector: "Financials", dailyVolume: 13_000_000 },
  { symbol: "COIN", initialPrice: 198.40, volatility: 0.055, sector: "Financials", dailyVolume: 8_000_000 },
  { symbol: "SOFI", initialPrice: 8.40, volatility: 0.050, sector: "Financials", dailyVolume: 25_000_000 },
  { symbol: "HOOD", initialPrice: 18.60, volatility: 0.055, sector: "Financials", dailyVolume: 12_000_000 },
  { symbol: "WFC", initialPrice: 58.40, volatility: 0.019, sector: "Financials", dailyVolume: 18_000_000 },
  { symbol: "BAC", initialPrice: 38.60, volatility: 0.020, sector: "Financials", dailyVolume: 45_000_000 },
  { symbol: "PNC", initialPrice: 168.40, volatility: 0.018, sector: "Financials", dailyVolume: 2_500_000 },
  { symbol: "TFC", initialPrice: 38.20, volatility: 0.019, sector: "Financials", dailyVolume: 9_000_000 },
  { symbol: "MTB", initialPrice: 168.30, volatility: 0.019, sector: "Financials", dailyVolume: 1_000_000 },
  { symbol: "KEY", initialPrice: 15.40, volatility: 0.022, sector: "Financials", dailyVolume: 12_000_000 },
  { symbol: "RF", initialPrice: 22.60, volatility: 0.021, sector: "Financials", dailyVolume: 10_000_000 },
  { symbol: "FITB", initialPrice: 36.80, volatility: 0.021, sector: "Financials", dailyVolume: 7_000_000 },
  { symbol: "CFG", initialPrice: 33.40, volatility: 0.022, sector: "Financials", dailyVolume: 7_000_000 },
  { symbol: "HBAN", initialPrice: 14.80, volatility: 0.022, sector: "Financials", dailyVolume: 15_000_000 },
  { symbol: "ZION", initialPrice: 48.30, volatility: 0.024, sector: "Financials", dailyVolume: 2_500_000 },
  { symbol: "NEE", initialPrice: 62.40, volatility: 0.014, sector: "Utilities", dailyVolume: 9_000_000 },
  { symbol: "DUK", initialPrice: 98.60, volatility: 0.012, sector: "Utilities", dailyVolume: 3_500_000 },
  { symbol: "SO", initialPrice: 68.40, volatility: 0.012, sector: "Utilities", dailyVolume: 5_000_000 },
  { symbol: "D", initialPrice: 48.30, volatility: 0.013, sector: "Utilities", dailyVolume: 5_000_000 },
  { symbol: "AEP", initialPrice: 86.40, volatility: 0.013, sector: "Utilities", dailyVolume: 3_000_000 },
  { symbol: "EXC", initialPrice: 36.80, volatility: 0.014, sector: "Utilities", dailyVolume: 8_000_000 },
  { symbol: "XEL", initialPrice: 58.40, volatility: 0.013, sector: "Utilities", dailyVolume: 3_500_000 },
  { symbol: "WEC", initialPrice: 86.30, volatility: 0.013, sector: "Utilities", dailyVolume: 1_800_000 },
  { symbol: "ES", initialPrice: 62.40, volatility: 0.013, sector: "Utilities", dailyVolume: 1_800_000 },
  { symbol: "ETR", initialPrice: 98.60, volatility: 0.014, sector: "Utilities", dailyVolume: 1_200_000 },
  { symbol: "LIN", initialPrice: 452.40, volatility: 0.015, sector: "Materials", dailyVolume: 1_500_000 },
  { symbol: "APD", initialPrice: 248.60, volatility: 0.017, sector: "Materials", dailyVolume: 1_200_000 },
  { symbol: "SHW", initialPrice: 328.40, volatility: 0.016, sector: "Materials", dailyVolume: 800_000 },
  { symbol: "FCX", initialPrice: 42.60, volatility: 0.030, sector: "Materials", dailyVolume: 18_000_000 },
  { symbol: "NEM", initialPrice: 36.40, volatility: 0.028, sector: "Materials", dailyVolume: 12_000_000 },
  { symbol: "PPG", initialPrice: 128.60, volatility: 0.018, sector: "Materials", dailyVolume: 1_200_000 },
  { symbol: "ECL", initialPrice: 218.40, volatility: 0.016, sector: "Materials", dailyVolume: 800_000 },
  { symbol: "DOW", initialPrice: 48.30, volatility: 0.022, sector: "Materials", dailyVolume: 5_500_000 },
  { symbol: "DD", initialPrice: 72.40, volatility: 0.020, sector: "Materials", dailyVolume: 4_500_000 },
  { symbol: "ALB", initialPrice: 92.40, volatility: 0.035, sector: "Materials", dailyVolume: 3_000_000 },
  { symbol: "UNP", initialPrice: 238.40, volatility: 0.016, sector: "Industrials", dailyVolume: 2_500_000 },
  { symbol: "CSX", initialPrice: 36.80, volatility: 0.017, sector: "Industrials", dailyVolume: 9_000_000 },
  { symbol: "NSC", initialPrice: 248.60, volatility: 0.016, sector: "Industrials", dailyVolume: 1_200_000 },
  { symbol: "FDX", initialPrice: 248.40, volatility: 0.021, sector: "Industrials", dailyVolume: 1_500_000 },
  { symbol: "RTX", initialPrice: 98.60, volatility: 0.017, sector: "Industrials", dailyVolume: 5_000_000 },
  { symbol: "LMT", initialPrice: 448.40, volatility: 0.015, sector: "Industrials", dailyVolume: 800_000 },
  { symbol: "NOC", initialPrice: 498.60, volatility: 0.015, sector: "Industrials", dailyVolume: 500_000 },
  { symbol: "GD", initialPrice: 268.40, volatility: 0.015, sector: "Industrials", dailyVolume: 1_000_000 },
  { symbol: "GE", initialPrice: 148.30, volatility: 0.022, sector: "Industrials", dailyVolume: 5_500_000 },
  { symbol: "MMM", initialPrice: 98.40, volatility: 0.018, sector: "Industrials", dailyVolume: 3_500_000 },
  { symbol: "ETN", initialPrice: 298.60, volatility: 0.019, sector: "Industrials", dailyVolume: 1_800_000 },
  { symbol: "EMR", initialPrice: 98.40, volatility: 0.018, sector: "Industrials", dailyVolume: 2_500_000 },
  { symbol: "PH", initialPrice: 548.60, volatility: 0.018, sector: "Industrials", dailyVolume: 600_000 },
  { symbol: "ITW", initialPrice: 248.30, volatility: 0.015, sector: "Industrials", dailyVolume: 800_000 },
  { symbol: "WM", initialPrice: 198.40, volatility: 0.014, sector: "Industrials", dailyVolume: 1_200_000 },
  { symbol: "RSG", initialPrice: 198.60, volatility: 0.014, sector: "Industrials", dailyVolume: 1_000_000 },
  { symbol: "PCAR", initialPrice: 98.40, volatility: 0.020, sector: "Industrials", dailyVolume: 1_800_000 },
  { symbol: "CTAS", initialPrice: 748.60, volatility: 0.016, sector: "Industrials", dailyVolume: 400_000 },
  { symbol: "ROK", initialPrice: 298.40, volatility: 0.019, sector: "Industrials", dailyVolume: 700_000 },
  { symbol: "OTIS", initialPrice: 86.40, volatility: 0.015, sector: "Industrials", dailyVolume: 1_500_000 },
  { symbol: "CARR", initialPrice: 62.30, volatility: 0.018, sector: "Industrials", dailyVolume: 3_500_000 },
  { symbol: "AMT", initialPrice: 198.40, volatility: 0.018, sector: "Real Estate", dailyVolume: 2_500_000 },
  { symbol: "PLD", initialPrice: 128.60, volatility: 0.019, sector: "Real Estate", dailyVolume: 4_500_000 },
  { symbol: "CCI", initialPrice: 98.40, volatility: 0.018, sector: "Real Estate", dailyVolume: 3_500_000 },
  { symbol: "EQIX", initialPrice: 798.40, volatility: 0.018, sector: "Real Estate", dailyVolume: 500_000 },
  { symbol: "PSA", initialPrice: 298.60, volatility: 0.017, sector: "Real Estate", dailyVolume: 1_000_000 },
  { symbol: "SBAC", initialPrice: 218.40, volatility: 0.018, sector: "Real Estate", dailyVolume: 1_000_000 },
  { symbol: "O", initialPrice: 52.40, volatility: 0.015, sector: "Real Estate", dailyVolume: 6_000_000 },
  { symbol: "WELL", initialPrice: 96.30, volatility: 0.016, sector: "Real Estate", dailyVolume: 2_500_000 },
  { symbol: "AVB", initialPrice: 198.40, volatility: 0.017, sector: "Real Estate", dailyVolume: 700_000 },
  { symbol: "EQR", initialPrice: 62.30, volatility: 0.017, sector: "Real Estate", dailyVolume: 2_000_000 },
  { symbol: "T", initialPrice: 17.60, volatility: 0.016, sector: "Communication Services", dailyVolume: 50_000_000 },
  { symbol: "VZ", initialPrice: 40.30, volatility: 0.015, sector: "Communication Services", dailyVolume: 20_000_000 },
  { symbol: "TMUS", initialPrice: 168.40, volatility: 0.017, sector: "Communication Services", dailyVolume: 3_500_000 },
  { symbol: "CMCSA", initialPrice: 42.60, volatility: 0.016, sector: "Communication Services", dailyVolume: 18_000_000 },
  { symbol: "CHTR", initialPrice: 398.40, volatility: 0.022, sector: "Communication Services", dailyVolume: 1_200_000 },
  { symbol: "DIS", initialPrice: 108.40, volatility: 0.022, sector: "Communication Services", dailyVolume: 12_000_000 },
  { symbol: "WBD", initialPrice: 8.60, volatility: 0.035, sector: "Communication Services", dailyVolume: 25_000_000 },
  { symbol: "PARA", initialPrice: 12.40, volatility: 0.038, sector: "Communication Services", dailyVolume: 15_000_000 },
  { symbol: "EA", initialPrice: 128.40, volatility: 0.022, sector: "Communication Services", dailyVolume: 2_500_000 },
  { symbol: "TTWO", initialPrice: 148.60, volatility: 0.030, sector: "Communication Services", dailyVolume: 2_000_000 },
  { symbol: "CVS", initialPrice: 72.40, volatility: 0.018, sector: "Health Care", dailyVolume: 7_000_000 },
  { symbol: "WBA", initialPrice: 15.60, volatility: 0.030, sector: "Health Care", dailyVolume: 10_000_000 },
  { symbol: "CI", initialPrice: 318.40, volatility: 0.019, sector: "Health Care", dailyVolume: 1_200_000 },
  { symbol: "ELV", initialPrice: 438.60, volatility: 0.019, sector: "Health Care", dailyVolume: 900_000 },
  { symbol: "HUM", initialPrice: 348.40, volatility: 0.021, sector: "Health Care", dailyVolume: 800_000 },
  { symbol: "BMY", initialPrice: 48.30, volatility: 0.016, sector: "Health Care", dailyVolume: 12_000_000 },
  { symbol: "PFE", initialPrice: 28.40, volatility: 0.018, sector: "Health Care", dailyVolume: 35_000_000 },
  { symbol: "MRNA", initialPrice: 98.60, volatility: 0.040, sector: "Health Care", dailyVolume: 8_000_000 },
  { symbol: "BIIB", initialPrice: 228.40, volatility: 0.025, sector: "Health Care", dailyVolume: 1_500_000 },
  { symbol: "IQV", initialPrice: 228.60, volatility: 0.020, sector: "Health Care", dailyVolume: 900_000 },
  { symbol: "ABT", initialPrice: 108.40, volatility: 0.015, sector: "Health Care", dailyVolume: 5_500_000 },
  { symbol: "TMO", initialPrice: 548.40, volatility: 0.017, sector: "Health Care", dailyVolume: 1_200_000 },
  { symbol: "DHR", initialPrice: 248.60, volatility: 0.017, sector: "Health Care", dailyVolume: 2_000_000 },
  { symbol: "MDT", initialPrice: 82.40, volatility: 0.016, sector: "Health Care", dailyVolume: 5_000_000 },
  { symbol: "BSX", initialPrice: 68.30, volatility: 0.018, sector: "Health Care", dailyVolume: 6_000_000 },
  { symbol: "EW", initialPrice: 78.40, volatility: 0.022, sector: "Health Care", dailyVolume: 3_500_000 },
  { symbol: "BDX", initialPrice: 248.60, volatility: 0.015, sector: "Health Care", dailyVolume: 1_000_000 },
  { symbol: "DXCM", initialPrice: 82.40, volatility: 0.030, sector: "Health Care", dailyVolume: 4_000_000 },
  { symbol: "CL", initialPrice: 92.30, volatility: 0.012, sector: "Consumer Staples", dailyVolume: 3_500_000 },
  { symbol: "KMB", initialPrice: 128.40, volatility: 0.012, sector: "Consumer Staples", dailyVolume: 2_000_000 },
  { symbol: "KO", initialPrice: 60.30, volatility: 0.011, sector: "Consumer Staples", dailyVolume: 15_000_000 },
  { symbol: "MO", initialPrice: 42.40, volatility: 0.013, sector: "Consumer Staples", dailyVolume: 9_000_000 },
  { symbol: "GIS", initialPrice: 68.60, volatility: 0.012, sector: "Consumer Staples", dailyVolume: 3_000_000 },
  { symbol: "K", initialPrice: 62.40, volatility: 0.013, sector: "Consumer Staples", dailyVolume: 2_000_000 },
  { symbol: "HRL", initialPrice: 28.60, volatility: 0.014, sector: "Consumer Staples", dailyVolume: 2_500_000 },
  { symbol: "CPB", initialPrice: 42.40, volatility: 0.013, sector: "Consumer Staples", dailyVolume: 1_500_000 },
  { symbol: "SJM", initialPrice: 108.60, volatility: 0.014, sector: "Consumer Staples", dailyVolume: 800_000 },
  { symbol: "CAG", initialPrice: 28.40, volatility: 0.015, sector: "Consumer Staples", dailyVolume: 3_500_000 },
  { symbol: "NKE", initialPrice: 92.40, volatility: 0.022, sector: "Consumer Discretionary", dailyVolume: 8_000_000 },
  { symbol: "GM", initialPrice: 46.80, volatility: 0.025, sector: "Consumer Discretionary", dailyVolume: 15_000_000 },
  { symbol: "F", initialPrice: 12.40, volatility: 0.028, sector: "Consumer Discretionary", dailyVolume: 50_000_000 },
  { symbol: "RIVN", initialPrice: 12.60, volatility: 0.055, sector: "Consumer Discretionary", dailyVolume: 30_000_000 },
  { symbol: "LCID", initialPrice: 2.80, volatility: 0.060, sector: "Consumer Discretionary", dailyVolume: 40_000_000 },
  { symbol: "NIO", initialPrice: 5.60, volatility: 0.055, sector: "Consumer Discretionary", dailyVolume: 35_000_000 },
  { symbol: "LUV", initialPrice: 28.40, volatility: 0.025, sector: "Industrials", dailyVolume: 7_000_000 },
  { symbol: "UAL", initialPrice: 52.60, volatility: 0.030, sector: "Industrials", dailyVolume: 8_000_000 },
  { symbol: "DAL", initialPrice: 48.40, volatility: 0.028, sector: "Industrials", dailyVolume: 9_000_000 },
  { symbol: "AAL", initialPrice: 14.60, volatility: 0.038, sector: "Industrials", dailyVolume: 25_000_000 },
  { symbol: "CCL", initialPrice: 18.40, volatility: 0.038, sector: "Consumer Discretionary", dailyVolume: 25_000_000 },
  { symbol: "RCL", initialPrice: 128.60, volatility: 0.035, sector: "Consumer Discretionary", dailyVolume: 4_500_000 },
  { symbol: "MAR", initialPrice: 228.40, volatility: 0.022, sector: "Consumer Discretionary", dailyVolume: 1_500_000 },
  { symbol: "HLT", initialPrice: 198.60, volatility: 0.021, sector: "Consumer Discretionary", dailyVolume: 2_000_000 },
  { symbol: "YUM", initialPrice: 128.40, volatility: 0.016, sector: "Consumer Discretionary", dailyVolume: 1_500_000 },
  { symbol: "CMG", initialPrice: 2798.40, volatility: 0.022, sector: "Consumer Discretionary", dailyVolume: 200_000 },
  { symbol: "DPZ", initialPrice: 398.60, volatility: 0.020, sector: "Consumer Discretionary", dailyVolume: 300_000 },
  { symbol: "WH", initialPrice: 86.40, volatility: 0.019, sector: "Consumer Discretionary", dailyVolume: 800_000 },
  { symbol: "AZO", initialPrice: 2948.40, volatility: 0.018, sector: "Consumer Discretionary", dailyVolume: 150_000 },
  { symbol: "ORLY", initialPrice: 968.60, volatility: 0.018, sector: "Consumer Discretionary", dailyVolume: 300_000 },
  { symbol: "BBY", initialPrice: 78.40, volatility: 0.024, sector: "Consumer Discretionary", dailyVolume: 3_000_000 },
  { symbol: "ROST", initialPrice: 148.60, volatility: 0.017, sector: "Consumer Discretionary", dailyVolume: 2_500_000 },
  { symbol: "DLTR", initialPrice: 98.40, volatility: 0.022, sector: "Consumer Discretionary", dailyVolume: 4_000_000 },
  { symbol: "DG", initialPrice: 148.60, volatility: 0.020, sector: "Consumer Discretionary", dailyVolume: 3_000_000 },
  { symbol: "TSCO", initialPrice: 248.40, volatility: 0.018, sector: "Consumer Discretionary", dailyVolume: 800_000 },
  { symbol: "OXY", initialPrice: 62.40, volatility: 0.028, sector: "Energy", dailyVolume: 12_000_000 },
  { symbol: "MPC", initialPrice: 168.60, volatility: 0.025, sector: "Energy", dailyVolume: 3_500_000 },
  { symbol: "PSX", initialPrice: 148.40, volatility: 0.024, sector: "Energy", dailyVolume: 2_500_000 },
  { symbol: "VLO", initialPrice: 148.60, volatility: 0.025, sector: "Energy", dailyVolume: 3_500_000 },
  { symbol: "SLB", initialPrice: 42.40, volatility: 0.026, sector: "Energy", dailyVolume: 12_000_000 },
  { symbol: "HAL", initialPrice: 32.60, volatility: 0.030, sector: "Energy", dailyVolume: 12_000_000 },
  { symbol: "BKR", initialPrice: 32.40, volatility: 0.028, sector: "Energy", dailyVolume: 7_000_000 },
  { symbol: "DVN", initialPrice: 42.60, volatility: 0.030, sector: "Energy", dailyVolume: 8_000_000 },
  { symbol: "FANG", initialPrice: 168.40, volatility: 0.028, sector: "Energy", dailyVolume: 2_000_000 },
  { symbol: "EOG", initialPrice: 118.60, volatility: 0.026, sector: "Energy", dailyVolume: 4_000_000 },
  { symbol: "PXD", initialPrice: 248.40, volatility: 0.024, sector: "Energy", dailyVolume: 2_500_000 },
  { symbol: "COP", initialPrice: 118.60, volatility: 0.024, sector: "Energy", dailyVolume: 5_500_000 },
  { symbol: "HES", initialPrice: 148.40, volatility: 0.026, sector: "Energy", dailyVolume: 2_500_000 },
  { symbol: "MRO", initialPrice: 18.60, volatility: 0.030, sector: "Energy", dailyVolume: 12_000_000 },
  { symbol: "APA", initialPrice: 28.40, volatility: 0.033, sector: "Energy", dailyVolume: 8_000_000 },
  { symbol: "WTI", initialPrice: 12.60, volatility: 0.040, sector: "Energy", dailyVolume: 5_000_000 },
  { symbol: "SPY", initialPrice: 498.40, volatility: 0.010, sector: "ETF", dailyVolume: 80_000_000 },
  { symbol: "QQQ", initialPrice: 428.60, volatility: 0.013, sector: "ETF", dailyVolume: 40_000_000 },
  { symbol: "IWM", initialPrice: 198.40, volatility: 0.016, sector: "ETF", dailyVolume: 30_000_000 },
  { symbol: "DIA", initialPrice: 388.60, volatility: 0.011, sector: "ETF", dailyVolume: 3_000_000 },
  { symbol: "XLK", initialPrice: 198.40, volatility: 0.016, sector: "ETF", dailyVolume: 8_000_000 },
  { symbol: "XLF", initialPrice: 38.60, volatility: 0.015, sector: "ETF", dailyVolume: 30_000_000 },
  { symbol: "XLE", initialPrice: 78.40, volatility: 0.021, sector: "ETF", dailyVolume: 12_000_000 },
  { symbol: "XLV", initialPrice: 128.60, volatility: 0.014, sector: "ETF", dailyVolume: 8_000_000 },
  { symbol: "XLI", initialPrice: 108.40, volatility: 0.015, sector: "ETF", dailyVolume: 5_000_000 },
  { symbol: "XLU", initialPrice: 62.60, volatility: 0.013, sector: "ETF", dailyVolume: 5_000_000 },
  { symbol: "XLB", initialPrice: 82.40, volatility: 0.017, sector: "ETF", dailyVolume: 4_000_000 },
  { symbol: "XLRE", initialPrice: 38.60, volatility: 0.016, sector: "ETF", dailyVolume: 3_000_000 },
  { symbol: "XLP", initialPrice: 72.40, volatility: 0.011, sector: "ETF", dailyVolume: 5_000_000 },
  { symbol: "XLY", initialPrice: 178.60, volatility: 0.019, sector: "ETF", dailyVolume: 4_000_000 },
  { symbol: "GLD", initialPrice: 186.40, volatility: 0.014, sector: "ETF", dailyVolume: 8_000_000 },
  { symbol: "SLV", initialPrice: 22.60, volatility: 0.022, sector: "ETF", dailyVolume: 15_000_000 },
  { symbol: "USO", initialPrice: 68.40, volatility: 0.025, sector: "ETF", dailyVolume: 4_000_000 },
  { symbol: "TLT", initialPrice: 92.60, volatility: 0.014, sector: "ETF", dailyVolume: 15_000_000 },
  { symbol: "HYG", initialPrice: 76.40, volatility: 0.009, sector: "ETF", dailyVolume: 20_000_000 },
  { symbol: "LQD", initialPrice: 108.60, volatility: 0.009, sector: "ETF", dailyVolume: 5_000_000 },
  { symbol: "EEM", initialPrice: 38.40, volatility: 0.018, sector: "ETF", dailyVolume: 40_000_000 },
  { symbol: "EFA", initialPrice: 72.60, volatility: 0.015, sector: "ETF", dailyVolume: 20_000_000 },
  { symbol: "VXX", initialPrice: 18.40, volatility: 0.050, sector: "ETF", dailyVolume: 35_000_000 },
  { symbol: "SQQQ", initialPrice: 12.60, volatility: 0.055, sector: "ETF", dailyVolume: 50_000_000 },
  { symbol: "TQQQ", initialPrice: 52.40, volatility: 0.055, sector: "ETF", dailyVolume: 60_000_000 },
];

// ─── Enrichment ────────────────────────────────────────────────────────────────
// Curated metadata for the most-traded names.  Remaining assets are filled in
// algorithmically from their sector/volatility profile so every field is present.

interface RawMeta {
  marketCapB: number;
  beta: number;
  dividendYield: number;
  peRatio: number;
  float: number;
  exchange: "XNAS" | "XNYS" | "XCHI" | "ARCX";
}

const CURATED_META: Record<string, RawMeta> = {
  // ── Mega-cap Technology (XNAS) ───────────────────────────────────────────────
  AAPL:  { marketCapB: 2950, beta: 1.24, dividendYield: 0.0052, peRatio: 30.2, float: 0.9985, exchange: "XNAS" },
  MSFT:  { marketCapB: 3100, beta: 0.90, dividendYield: 0.0072, peRatio: 37.4, float: 0.9978, exchange: "XNAS" },
  NVDA:  { marketCapB: 2150, beta: 1.68, dividendYield: 0.0004, peRatio: 62.8, float: 0.9991, exchange: "XNAS" },
  GOOGL: { marketCapB: 2100, beta: 1.04, dividendYield: 0.0000, peRatio: 24.8, float: 0.9972, exchange: "XNAS" },
  GOOG:  { marketCapB: 2100, beta: 1.04, dividendYield: 0.0000, peRatio: 24.8, float: 0.9940, exchange: "XNAS" },
  META:  { marketCapB: 1350, beta: 1.22, dividendYield: 0.0038, peRatio: 26.0, float: 0.9985, exchange: "XNAS" },
  AMZN:  { marketCapB: 1950, beta: 1.15, dividendYield: 0.0000, peRatio: 42.1, float: 0.9979, exchange: "XNAS" },
  TSLA:  { marketCapB:  790, beta: 2.10, dividendYield: 0.0000, peRatio: 68.5, float: 0.8250, exchange: "XNAS" },
  AMD:   { marketCapB:  290, beta: 1.72, dividendYield: 0.0000, peRatio: 85.2, float: 0.9982, exchange: "XNAS" },
  INTC:  { marketCapB:  105, beta: 0.87, dividendYield: 0.0150, peRatio:  0.0, float: 0.9989, exchange: "XNAS" },
  AVGO:  { marketCapB:  630, beta: 1.16, dividendYield: 0.0160, peRatio: 30.5, float: 0.9985, exchange: "XNAS" },
  QCOM:  { marketCapB:  185, beta: 1.21, dividendYield: 0.0190, peRatio: 18.6, float: 0.9986, exchange: "XNAS" },
  ADBE:  { marketCapB:  235, beta: 1.30, dividendYield: 0.0000, peRatio: 45.2, float: 0.9980, exchange: "XNAS" },
  CRM:   { marketCapB:  288, beta: 1.23, dividendYield: 0.0000, peRatio: 65.8, float: 0.9975, exchange: "XNAS" },
  INTU:  { marketCapB:  180, beta: 1.17, dividendYield: 0.0065, peRatio: 58.3, float: 0.9982, exchange: "XNAS" },
  NOW:   { marketCapB:  170, beta: 1.25, dividendYield: 0.0000, peRatio: 72.4, float: 0.9985, exchange: "XNAS" },
  PANW:  { marketCapB:  108, beta: 1.33, dividendYield: 0.0000, peRatio: 60.8, float: 0.9980, exchange: "XNAS" },
  // ── Financials (XNYS / XNAS) ────────────────────────────────────────────────
  JPM:   { marketCapB:  580, beta: 1.10, dividendYield: 0.0230, peRatio: 12.2, float: 0.9990, exchange: "XNYS" },
  BAC:   { marketCapB:  305, beta: 1.40, dividendYield: 0.0260, peRatio: 13.0, float: 0.9991, exchange: "XNYS" },
  WFC:   { marketCapB:  215, beta: 1.35, dividendYield: 0.0240, peRatio: 11.5, float: 0.9988, exchange: "XNYS" },
  GS:    { marketCapB:  148, beta: 1.45, dividendYield: 0.0240, peRatio: 16.4, float: 0.9985, exchange: "XNYS" },
  MS:    { marketCapB:  155, beta: 1.48, dividendYield: 0.0340, peRatio: 16.8, float: 0.9988, exchange: "XNYS" },
  V:     { marketCapB:  565, beta: 0.95, dividendYield: 0.0080, peRatio: 31.5, float: 0.9985, exchange: "XNYS" },
  MA:    { marketCapB:  445, beta: 1.02, dividendYield: 0.0058, peRatio: 36.8, float: 0.9988, exchange: "XNYS" },
  BLK:   { marketCapB:  128, beta: 1.32, dividendYield: 0.0280, peRatio: 22.4, float: 0.9978, exchange: "XNYS" },
  SCHW:  { marketCapB:  133, beta: 1.25, dividendYield: 0.0138, peRatio: 30.2, float: 0.9985, exchange: "XNYS" },
  C:     { marketCapB:  117, beta: 1.55, dividendYield: 0.0325, peRatio: 12.8, float: 0.9992, exchange: "XNYS" },
  AXP:   { marketCapB:  175, beta: 1.12, dividendYield: 0.0115, peRatio: 19.2, float: 0.9985, exchange: "XNYS" },
  PYPL:  { marketCapB:   70, beta: 1.38, dividendYield: 0.0000, peRatio: 18.6, float: 0.9985, exchange: "XNAS" },
  COIN:  { marketCapB:   48, beta: 2.65, dividendYield: 0.0000, peRatio:  0.0, float: 0.4820, exchange: "XNAS" },
  // ── Health Care ─────────────────────────────────────────────────────────────
  LLY:   { marketCapB:  750, beta: 0.42, dividendYield: 0.0072, peRatio: 62.1, float: 0.9988, exchange: "XNYS" },
  UNH:   { marketCapB:  485, beta: 0.55, dividendYield: 0.0155, peRatio: 22.4, float: 0.9990, exchange: "XNYS" },
  JNJ:   { marketCapB:  365, beta: 0.55, dividendYield: 0.0310, peRatio: 16.8, float: 0.9990, exchange: "XNYS" },
  MRK:   { marketCapB:  320, beta: 0.40, dividendYield: 0.0255, peRatio: 16.2, float: 0.9989, exchange: "XNYS" },
  ABBV:  { marketCapB:  290, beta: 0.55, dividendYield: 0.0368, peRatio: 22.8, float: 0.9989, exchange: "XNYS" },
  AMGN:  { marketCapB:  155, beta: 0.48, dividendYield: 0.0320, peRatio: 18.4, float: 0.9985, exchange: "XNAS" },
  TMO:   { marketCapB:  210, beta: 0.62, dividendYield: 0.0032, peRatio: 30.8, float: 0.9988, exchange: "XNYS" },
  PFE:   { marketCapB:  160, beta: 0.60, dividendYield: 0.0580, peRatio:  0.0, float: 0.9992, exchange: "XNYS" },
  MRNA:  { marketCapB:   38, beta: 1.45, dividendYield: 0.0000, peRatio:  0.0, float: 0.9550, exchange: "XNAS" },
  // ── Consumer ────────────────────────────────────────────────────────────────
  HD:    { marketCapB:  375, beta: 1.05, dividendYield: 0.0235, peRatio: 24.2, float: 0.9990, exchange: "XNYS" },
  MCD:   { marketCapB:  210, beta: 0.72, dividendYield: 0.0248, peRatio: 24.5, float: 0.9992, exchange: "XNYS" },
  COST:  { marketCapB:  345, beta: 0.78, dividendYield: 0.0055, peRatio: 52.8, float: 0.9988, exchange: "XNAS" },
  WMT:   { marketCapB:  520, beta: 0.52, dividendYield: 0.0125, peRatio: 32.8, float: 0.9972, exchange: "XNYS" },
  NKE:   { marketCapB:  142, beta: 1.02, dividendYield: 0.0158, peRatio: 22.6, float: 0.9965, exchange: "XNYS" },
  // ── Energy ──────────────────────────────────────────────────────────────────
  XOM:   { marketCapB:  458, beta: 0.98, dividendYield: 0.0350, peRatio: 14.2, float: 0.9992, exchange: "XNYS" },
  CVX:   { marketCapB:  295, beta: 0.94, dividendYield: 0.0395, peRatio: 14.8, float: 0.9990, exchange: "XNYS" },
  COP:   { marketCapB:  148, beta: 1.12, dividendYield: 0.0180, peRatio: 13.8, float: 0.9988, exchange: "XNYS" },
  OXY:   { marketCapB:   55, beta: 1.85, dividendYield: 0.0126, peRatio: 12.5, float: 0.9280, exchange: "XNYS" },
  // ── Industrials ──────────────────────────────────────────────────────────────
  BA:    { marketCapB:  115, beta: 1.45, dividendYield: 0.0000, peRatio:  0.0, float: 0.9990, exchange: "XNYS" },
  CAT:   { marketCapB:  178, beta: 1.18, dividendYield: 0.0175, peRatio: 16.4, float: 0.9990, exchange: "XNYS" },
  HON:   { marketCapB:  130, beta: 0.95, dividendYield: 0.0218, peRatio: 25.2, float: 0.9990, exchange: "XNAS" },
  UPS:   { marketCapB:  124, beta: 1.08, dividendYield: 0.0460, peRatio: 18.5, float: 0.9988, exchange: "XNYS" },
  FDX:   { marketCapB:   62, beta: 1.28, dividendYield: 0.0198, peRatio: 15.4, float: 0.9988, exchange: "XNYS" },
  GE:    { marketCapB:  161, beta: 1.30, dividendYield: 0.0025, peRatio: 32.4, float: 0.9992, exchange: "XNYS" },
  // ── Communication Services ──────────────────────────────────────────────────
  T:     { marketCapB:  125, beta: 0.62, dividendYield: 0.0640, peRatio: 10.4, float: 0.9992, exchange: "XNYS" },
  VZ:    { marketCapB:  167, beta: 0.40, dividendYield: 0.0660, peRatio: 10.8, float: 0.9992, exchange: "XNYS" },
  CMCSA: { marketCapB:  172, beta: 1.05, dividendYield: 0.0308, peRatio: 11.2, float: 0.9985, exchange: "XNAS" },
  DIS:   { marketCapB:  198, beta: 1.25, dividendYield: 0.0000, peRatio: 42.5, float: 0.9988, exchange: "XNYS" },
  NFLX:  { marketCapB:  275, beta: 1.38, dividendYield: 0.0000, peRatio: 48.2, float: 0.9985, exchange: "XNAS" },
  // ── ETFs ────────────────────────────────────────────────────────────────────
  SPY:   { marketCapB:  505, beta: 1.00, dividendYield: 0.0132, peRatio:  0.0, float: 1.0000, exchange: "ARCX" },
  QQQ:   { marketCapB:  225, beta: 1.10, dividendYield: 0.0058, peRatio:  0.0, float: 1.0000, exchange: "XNAS" },
  IWM:   { marketCapB:   72, beta: 1.15, dividendYield: 0.0150, peRatio:  0.0, float: 1.0000, exchange: "ARCX" },
  GLD:   { marketCapB:   65, beta: 0.05, dividendYield: 0.0000, peRatio:  0.0, float: 1.0000, exchange: "ARCX" },
  TLT:   { marketCapB:   52, beta:-0.18, dividendYield: 0.0390, peRatio:  0.0, float: 1.0000, exchange: "ARCX" },
  VXX:   { marketCapB:    1, beta: 4.50, dividendYield: 0.0000, peRatio:  0.0, float: 1.0000, exchange: "ARCX" },
  TQQQ:  { marketCapB:   22, beta: 3.50, dividendYield: 0.0000, peRatio:  0.0, float: 1.0000, exchange: "XNAS" },
  SQQQ:  { marketCapB:    5, beta:-3.30, dividendYield: 0.0000, peRatio:  0.0, float: 1.0000, exchange: "XNAS" },
  // ── Consumer Staples ────────────────────────────────────────────────────────
  PG:    { marketCapB:  385, beta: 0.55, dividendYield: 0.0240, peRatio: 27.5, float: 0.9982, exchange: "XNYS" },
  KO:    { marketCapB:  260, beta: 0.55, dividendYield: 0.0305, peRatio: 22.8, float: 0.9992, exchange: "XNYS" },
  PEP:   { marketCapB:  238, beta: 0.58, dividendYield: 0.0295, peRatio: 23.5, float: 0.9990, exchange: "XNAS" },
  PM:    { marketCapB:  150, beta: 0.80, dividendYield: 0.0532, peRatio: 18.4, float: 0.9992, exchange: "XNYS" },
  // ── Utilities ───────────────────────────────────────────────────────────────
  NEE:   { marketCapB:  126, beta: 0.50, dividendYield: 0.0295, peRatio: 20.8, float: 0.9990, exchange: "XNYS" },
  DUK:   { marketCapB:   75, beta: 0.42, dividendYield: 0.0385, peRatio: 19.5, float: 0.9992, exchange: "XNYS" },
  SO:    { marketCapB:   70, beta: 0.48, dividendYield: 0.0370, peRatio: 18.8, float: 0.9990, exchange: "XNYS" },
};

/** Deterministic exchange assignment based on sector when not in curated list. */
function deriveExchange(sector: string): "XNAS" | "XNYS" | "XCHI" | "ARCX" {
  switch (sector) {
    case "Technology":
    case "ETF":
      return "XNAS";
    case "Communication Services":
    case "Consumer Discretionary":
      return "XNAS";
    default:
      return "XNYS";
  }
}

/** Simulated ISIN: US + 9 uppercase alphanum derived from symbol + check digit 0. */
function deriveIsin(symbol: string): string {
  const padded = symbol.replace(/[^A-Z0-9]/g, "").padEnd(9, "0").slice(0, 9);
  return `US${padded}0`;
}

/** Approximate market cap from price × estimated shares outstanding. */
function deriveMarketCapB(price: number, dailyVolume: number): number {
  // Rough estimate: larger ADV → larger float → larger company
  const sharesOutstandingM = Math.sqrt(dailyVolume / 1_000) * 100; // heuristic
  return parseFloat(((price * sharesOutstandingM * 1_000_000) / 1e9).toFixed(1));
}

/** Derive beta from volatility relative to market volatility (~1.0% daily for SPY). */
function deriveBeta(volatility: number): number {
  return parseFloat((volatility / 0.010).toFixed(2));
}

/** Estimate dividend yield: lower-vol, established names pay dividends. */
function deriveDividendYield(sector: string, volatility: number): number {
  if (volatility > 0.030) return 0.000; // high-growth / speculative
  const base: Record<string, number> = {
    "Utilities": 0.035,
    "Consumer Staples": 0.025,
    "Real Estate": 0.040,
    "Financials": 0.022,
    "Health Care": 0.018,
    "Industrials": 0.015,
    "Materials": 0.018,
    "Energy": 0.030,
    "Communication Services": 0.012,
    "Consumer Discretionary": 0.008,
    "Technology": 0.005,
    "ETF": 0.012,
  };
  return parseFloat((base[sector] ?? 0.010).toFixed(4));
}

/** Rough P/E from sector — growth sectors command higher multiples. */
function derivePeRatio(sector: string, volatility: number): number {
  if (volatility > 0.040) return 0; // speculative / loss-making
  const base: Record<string, number> = {
    "Technology": 38,
    "ETF": 0,
    "Communication Services": 22,
    "Consumer Discretionary": 28,
    "Health Care": 25,
    "Financials": 14,
    "Industrials": 21,
    "Consumer Staples": 22,
    "Energy": 13,
    "Materials": 18,
    "Real Estate": 30,
    "Utilities": 20,
  };
  return base[sector] ?? 20;
}

function enrichAsset(raw: Omit<AssetDef, "marketCapB" | "beta" | "dividendYield" | "peRatio" | "float" | "exchange" | "currency" | "isin">): AssetDef {
  const curated = CURATED_META[raw.symbol];
  return {
    ...raw,
    marketCapB: curated?.marketCapB ?? deriveMarketCapB(raw.initialPrice, raw.dailyVolume),
    beta:          curated?.beta          ?? deriveBeta(raw.volatility),
    dividendYield: curated?.dividendYield ?? deriveDividendYield(raw.sector, raw.volatility),
    peRatio:       curated?.peRatio       ?? derivePeRatio(raw.sector, raw.volatility),
    float:         curated?.float         ?? (raw.volatility > 0.04 ? 0.72 : 0.98),
    exchange:      curated?.exchange      ?? deriveExchange(raw.sector),
    currency: "USD",
    isin: deriveIsin(raw.symbol),
  };
}

// Re-export the array with all fields populated
export const SP500_ASSETS: AssetDef[] = _RAW_ASSETS.map(enrichAsset);

export const ASSET_MAP = new Map<string, AssetDef>(SP500_ASSETS.map((a) => [a.symbol, a]));
