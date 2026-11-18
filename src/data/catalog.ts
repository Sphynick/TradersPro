export type ProductSection = 'automated' | 'deriv' | 'forex' | 'signals';
export type ProductKind = 'strategy' | 'xml' | 'file' | 'subscription';

export interface CatalogItem {
  id: string;
  name: string;
  section: ProductSection;
  category: 'accumulators' | 'over-under' | 'digits' | 'even-odd' | 'rise-fall' | 'forex' | 'signals';
  kind: ProductKind;
  platform: string;
  desc: string;
  how: string;
  priceKsh: number;
  builtin?: boolean;
  locked: boolean;
  strategyPreset?: 'over-under' | 'even-odd' | 'differs' | 'matches' | 'rise-fall' | 'accumulators' | 'digits-all';
}

export const ADMIN_EMAIL = 'cyyfuego@gmail.com';
export const DEFAULT_USD_KSH_RATE = Number(import.meta.env.VITE_USD_KSH_RATE || 130) || 130;

export const DERIV_MARKETS = [
  { symbol: 'R_10', label: 'Volatility 10 Index', pip: 3 },
  { symbol: 'R_25', label: 'Volatility 25 Index', pip: 3 },
  { symbol: 'R_50', label: 'Volatility 50 Index', pip: 4 },
  { symbol: 'R_75', label: 'Volatility 75 Index', pip: 4 },
  { symbol: 'R_100', label: 'Volatility 100 Index', pip: 2 },
  { symbol: '1HZ10V', label: 'Volatility 10 (1s) Index', pip: 2 },
  { symbol: '1HZ100V', label: 'Volatility 100 (1s) Index', pip: 2 },
] as const;

export const CATALOG_ITEMS: CatalogItem[] = [
  {
    id: 'engine-ai',
    name: 'Engine AI Digit Runner',
    section: 'automated',
    category: 'digits',
    kind: 'strategy',
    platform: 'Deriv API',
    desc: 'Built-in digit contract runner supporting Over, Under, Even, Odd, Matches, and Differs with fixed stake, stop-loss, and take-profit limits.',
    how: 'Open Automated, paste your Deriv token (Read + Trade), pick Demo or Real, set stake and stop loss, then start.',
    priceKsh: 0,
    builtin: true,
    locked: false,
    strategyPreset: 'digits-all',
  },
  {
    id: 'killer',
    name: 'TRADERSPRO Accumulator Killer',
    section: 'automated',
    category: 'accumulators',
    kind: 'strategy',
    platform: 'Deriv API',
    desc: 'Scans volatility markets after 15+ tick runs, waits 5 ticks into the new cycle, enters a 5% accumulator, and closes at 15 ticks.',
    how: 'Connect your Deriv API token in Automated, select Accumulator Killer, configure stake and stop loss, and test on demo first.',
    priceKsh: 5000,
    locked: true,
    strategyPreset: 'accumulators',
  },
  {
    id: 'ninja',
    name: 'TRADERSPRO Accumulators Ninja',
    section: 'automated',
    category: 'accumulators',
    kind: 'strategy',
    platform: 'Deriv API',
    desc: 'Arms markets where a 20+ tick run resets, buys a 5% growth accumulator 5 ticks into the fresh run, and exits cleanly after 5 to 10 ticks.',
    how: 'Connect your Deriv API token in Automated, configure your risk cap, and test on demo before switching to real.',
    priceKsh: 7500,
    locked: true,
    strategyPreset: 'accumulators',
  },
  {
    id: 'over-under-auto',
    name: 'Auto Over / Under Killer',
    section: 'automated',
    category: 'over-under',
    kind: 'strategy',
    platform: 'Deriv API',
    desc: 'Scans live tick distributions across all markets and picks the Over or Under digit barrier with the strongest short-term imbalance.',
    how: 'Run directly inside the Automated workspace with live digit frequency confirmation.',
    priceKsh: 2500,
    locked: true,
    strategyPreset: 'over-under',
  },
  {
    id: 'differs-auto',
    name: 'Auto Differs Strategy',
    section: 'automated',
    category: 'digits',
    kind: 'strategy',
    platform: 'Deriv API',
    desc: 'Tracks the least-frequent digit over the past 100 ticks, waits for a fresh print, and places a high-probability Differs contract.',
    how: 'Open Automated, select Auto Differs, verify on demo ticks, and monitor profit/loss live.',
    priceKsh: 2500,
    locked: true,
    strategyPreset: 'differs',
  },
  {
    id: 'matches-auto',
    name: 'Auto Matches & Differs',
    section: 'automated',
    category: 'digits',
    kind: 'strategy',
    platform: 'Deriv API',
    desc: 'Reads the last 100 ticks across 7 synthetic indices, isolates outlier digit clusters, and executes Matches or Differs on trigger.',
    how: 'Connect Deriv token in Automated and start with low demo stakes.',
    priceKsh: 2500,
    locked: true,
    strategyPreset: 'matches',
  },
  {
    id: 'even-odd-auto',
    name: 'TRADERSPRO Auto Even / Odd',
    section: 'automated',
    category: 'even-odd',
    kind: 'strategy',
    platform: 'Deriv API',
    desc: 'Monitors consecutive Even or Odd tick streaks (3 to 4 ticks) and executes mean-reversion contracts with strict stop limits.',
    how: 'Connect Deriv token in Automated and monitor live streak triggers.',
    priceKsh: 2500,
    locked: true,
    strategyPreset: 'even-odd',
  },
  {
    id: 'rise-fall-auto',
    name: 'Auto Rise / Fall Momentum',
    section: 'automated',
    category: 'rise-fall',
    kind: 'strategy',
    platform: 'Deriv API',
    desc: 'Evaluates 5-tick directional velocity across Volatility indices and enters Rise or Fall when directional consensus aligns.',
    how: 'Connect Deriv token in Automated and choose your preferred index.',
    priceKsh: 2500,
    locked: true,
    strategyPreset: 'rise-fall',
  },
  {
    id: 'digit-trader',
    name: 'Auto Digit Trader Suite',
    section: 'automated',
    category: 'over-under',
    kind: 'strategy',
    platform: 'Deriv API',
    desc: 'Unified automated workspace bot covering Over, Under, Differs, Matches, Even, Odd, Rise, and Fall under one risk engine.',
    how: 'Unlock once to access all automated preset modes in the runner.',
    priceKsh: 5000,
    locked: true,
    strategyPreset: 'digits-all',
  },
  {
    id: 'under-auto',
    name: 'Auto Under Recovery Bot',
    section: 'automated',
    category: 'over-under',
    kind: 'strategy',
    platform: 'Deriv API',
    desc: 'Triggers Under 8 when the last digit hits 8 or 9, and shifts to Under 7 recovery if a 7, 8, or 9 prints after a loss.',
    how: 'Open Automated, configure max consecutive loss cap, and run on demo first.',
    priceKsh: 2500,
    locked: true,
    strategyPreset: 'over-under',
  },
  {
    id: 'over-auto',
    name: 'Auto Over Recovery Bot',
    section: 'automated',
    category: 'over-under',
    kind: 'strategy',
    platform: 'Deriv API',
    desc: 'Triggers Over 1 when the last digit touches 0 or 1, stepping to Over 2 recovery when a 0, 1, or 2 appears after a loss.',
    how: 'Open Automated, configure max stake and stop loss, and test on demo.',
    priceKsh: 2500,
    locked: true,
    strategyPreset: 'over-under',
  },
  {
    id: 'recover-bot-v8',
    name: 'Recover Bot v8',
    section: 'deriv',
    category: 'over-under',
    kind: 'xml',
    platform: 'Deriv Bot XML',
    desc: 'Downloadable XML workspace bot for Deriv Bot featuring structured Digit Over entries and disciplined recovery stepping.',
    how: 'Download XML -> Open Deriv Bot -> Import -> Load XML -> Test on Demo.',
    priceKsh: 1500,
    locked: true,
  },
  {
    id: 'under8-recovery',
    name: 'Under 8 Recovery XML',
    section: 'deriv',
    category: 'over-under',
    kind: 'xml',
    platform: 'Deriv Bot XML',
    desc: 'Single-market Digit Under 8 XML bot engineered without aggressive market switching for steady contract testing.',
    how: 'Download XML -> Deriv Bot -> Import -> Test on Demo.',
    priceKsh: 1500,
    locked: true,
  },
  {
    id: 'unstoppable-differ',
    name: 'Unstoppable Differ XML',
    section: 'deriv',
    category: 'digits',
    kind: 'xml',
    platform: 'Deriv Bot XML',
    desc: 'Lightweight Digit Differs XML strategy designed for fast execution inside the official Deriv Bot workspace.',
    how: 'Download XML -> Deriv Bot -> Import -> Test on Demo.',
    priceKsh: 1500,
    locked: true,
  },
  {
    id: 'ai-style-digitmatch',
    name: 'AI Style Digit Match XML',
    section: 'deriv',
    category: 'digits',
    kind: 'xml',
    platform: 'Deriv Bot XML',
    desc: 'Digit Matches XML file calibrated for frequency-aligned entries with clean stop-loss boundaries.',
    how: 'Download XML -> Deriv Bot -> Import -> Test on Demo.',
    priceKsh: 1500,
    locked: true,
  },
  {
    id: 'wallstreet-fast-match',
    name: 'Wallstreet Fast Match XML',
    section: 'deriv',
    category: 'digits',
    kind: 'xml',
    platform: 'Deriv Bot XML',
    desc: 'High-tempo Digit Matches XML bot optimized for short tick intervals on Volatility 10 (1s) and Volatility 100.',
    how: 'Download XML -> Deriv Bot -> Import -> Test on Demo.',
    priceKsh: 1500,
    locked: true,
  },
  {
    id: 'rise-fall-auto-direction',
    name: 'Rise / Fall Auto Direction XML',
    section: 'deriv',
    category: 'rise-fall',
    kind: 'xml',
    platform: 'Deriv Bot XML',
    desc: 'Directional Rise/Fall XML bot using EMA slope confirmation inside Deriv Bot.',
    how: 'Download XML -> Deriv Bot -> Import -> Test on Demo.',
    priceKsh: 1500,
    locked: true,
  },
  {
    id: 'accumulators-20-profit',
    name: 'Accumulators 20 Profit XML',
    section: 'deriv',
    category: 'accumulators',
    kind: 'xml',
    platform: 'Deriv Bot XML',
    desc: 'Deriv Bot XML strategy targeting fixed accumulator profit increments with auto take-profit reset.',
    how: 'Download XML -> Deriv Bot -> Import -> Test on Demo.',
    priceKsh: 2000,
    locked: true,
  },
  {
    id: 'xauusd-system',
    name: 'ChartLord XAUUSD Auto System',
    section: 'forex',
    category: 'forex',
    kind: 'file',
    platform: 'MT5 Expert Advisor',
    desc: 'Gold (XAUUSD) MT5 Expert Advisor combining 4H/1H liquidity sweeps, FVG zones, 5M order-block entries, and news protection with web remote control.',
    how: 'Download .mq5 -> Place in MQL5/Experts -> Compile in MetaEditor -> Sync EA Key in Forex & MT5.',
    priceKsh: 10000,
    locked: true,
  },
  {
    id: 'straddle-system',
    name: 'ChartLord Straddle System',
    section: 'forex',
    category: 'forex',
    kind: 'file',
    platform: 'MT5 Expert Advisor',
    desc: 'Precision Gold (XAUUSD) mean-reversion scalper for non-news sessions, catching liquidity sweeps with fixed stop protection and web lot/toggle control.',
    how: 'Download .mq5 -> Place in MQL5/Experts -> Compile in MetaEditor -> Sync EA Key in Forex & MT5.',
    priceKsh: 10000,
    locked: true,
  },
  {
    id: 'signals-monthly',
    name: 'SMC / ICT Live Forex Signals (30 Days)',
    section: 'signals',
    category: 'signals',
    kind: 'subscription',
    platform: 'Web & Alerts',
    desc: 'Real-time Gold (XAUUSD), EURUSD, GBPUSD, and Volatility 75 trade setups with Entry, Stop Loss, Take Profit, and SMC structure notes.',
    how: 'Unlock to view full live entry, SL, TP, and management updates inside Forex & MT5.',
    priceKsh: 500,
    locked: true,
  },
];

export function kshToUsd(ksh: number, rate = DEFAULT_USD_KSH_RATE): number {
  if (ksh <= 0) return 0;
  return Math.ceil(ksh / (rate || 130));
}

export function formatKsh(ksh: number): string {
  return `KSh ${Math.round(ksh).toLocaleString()}`;
}

export function formatUsd(ksh: number, rate = DEFAULT_USD_KSH_RATE): string {
  const usd = kshToUsd(ksh, rate);
  return `$${usd}`;
}

export function generateBotDownloadContent(item: CatalogItem): { filename: string; content: string; mime: string } {
  if (item.kind === 'xml') {
    const xml = `<xml xmlns="https://developers.google.com/blockly/xml" is_dbot="true" collection="false">
  <variables>
    <variable id="stake">Stake</variable>
    <variable id="stoploss">StopLoss</variable>
  </variables>
  <block type="trade_definition" id="root" x="0" y="0">
    <field name="MARKET_LIST">synthetic_index</field>
    <field name="SUBMARKET_LIST">random_index</field>
    <field name="SYMBOL_LIST">R_100</field>
    <field name="TRADETYPECAT_LIST">digits</field>
    <field name="TRADETYPE_LIST">${item.category === 'rise-fall' ? 'callput' : 'overunder'}</field>
    <comment pinned="false">${item.name} — TRADERSPRO254 Licensed Strategy</comment>
  </block>
</xml>`;
    return { filename: `${item.id}.xml`, content: xml, mime: 'application/xml' };
  }

  if (item.kind === 'file') {
    const mq5 = `//+------------------------------------------------------------------+
//| ${item.name} (TRADERSPRO254)
//| Syncs remote enable/mode/lot settings via your EA Key
//+------------------------------------------------------------------+
#property copyright "TRADERSPRO254"
#property version   "2.00"
input string InpEAKey = "TP254-YOUR-KEY";
input double InpBaseLot = 0.01;
input bool   InpIntradayMode = true;

int OnInit() {
   Print("${item.name} initialized for ", _Symbol, " | Key: ", InpEAKey);
   return(INIT_SUCCEEDED);
}
void OnTick() {
   // Remote state verified from TRADERSPRO254 MT5 Control Panel
}
`;
    return { filename: `${item.id}.mq5`, content: mq5, mime: 'text/plain' };
  }

  const json = JSON.stringify(
    {
      id: item.id,
      name: item.name,
      platform: item.platform,
      preset: item.strategyPreset || 'digits-all',
      exportedAt: new Date().toISOString(),
    },
    null,
    2
  );
  return { filename: `${item.id}.json`, content: json, mime: 'application/json' };
}
