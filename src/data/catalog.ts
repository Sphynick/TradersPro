import type { CatalogItem, ServerConfig } from '../types/app';

export const BUILTIN_ITEMS: CatalogItem[] = [
  {
    id: 'engine-ai',
    name: 'Engine AI Bot (Built-In)',
    section: 'automated',
    category: 'digits',
    kind: 'builtin',
    platform: 'Deriv API',
    desc: 'Free built-in digit bot. Watches markets flagged by the cloud Market Engine and trades only when live browser ticks confirm the pattern.',
    how: 'Open Automated Trading, pick Engine AI Bot, connect your Deriv API token (Read + Trade), test on demo first, and press Start.',
    price: 0,
    status: 'live',
    locked: false,
  },
  {
    id: 'killer',
    name: 'TRADERSPRO Accumulator Killer',
    section: 'automated',
    category: 'accumulators',
    kind: 'strategy',
    platform: 'Deriv API',
    desc: 'Scans all markets. When the run that just ended lasted over 15 ticks, it waits 5 ticks into the new run, enters an accumulator at 5% and closes at 15 ticks. Shows the tick counter, profit and loss.',
    how: 'Open Automated Trading, connect your Deriv token, set stake and stop loss, and press Start. Test on demo first.',
    price: 5000,
    status: 'live',
    locked: true,
  },
  {
    id: 'ninja',
    name: 'TRADERSPRO Accumulators Ninja',
    section: 'automated',
    category: 'accumulators',
    kind: 'strategy',
    platform: 'Deriv API',
    desc: 'Scans all markets. When a run longer than 20 ticks crashes, that market is armed. The Ninja buys an accumulator at 5% growth 5 ticks into the new run, and closes after 5 to 10 ticks.',
    how: 'Open Automated Trading, connect your Deriv token, set stake and stop loss, and press Start. Test on demo first.',
    price: 7500,
    status: 'live',
    locked: true,
  },
  {
    id: 'recover-bot-v8',
    name: 'Recover Bot v8',
    section: 'deriv',
    category: 'over-under',
    kind: 'xml',
    platform: 'Deriv Bot',
    desc: 'Digit Over bot with loss recovery.',
    how: 'Unlock, download the .xml file, open Deriv Bot -> Import -> load the XML -> Run on demo first.',
    price: 1500,
    status: 'live',
    locked: true,
  },
  {
    id: 'under8-recovery',
    name: 'Under 8 Recovery',
    section: 'deriv',
    category: 'over-under',
    kind: 'xml',
    platform: 'Deriv Bot',
    desc: 'Digit Under bot with recovery, no market switcher.',
    how: 'Unlock, download the .xml file, open Deriv Bot -> Import -> load the XML -> Run on demo first.',
    price: 1500,
    status: 'live',
    locked: true,
  },
  {
    id: 'unstoppable-differ',
    name: 'Unstoppable Differ',
    section: 'deriv',
    category: 'digits',
    sub: 'differs',
    kind: 'xml',
    platform: 'Deriv Bot',
    desc: 'Digit Differs bot.',
    how: 'Unlock, download the .xml file, open Deriv Bot -> Import -> load the XML -> Run on demo first.',
    price: 1500,
    status: 'live',
    locked: true,
  },
  {
    id: 'ai-style-digitmatch',
    name: 'AI Style Digit Match',
    section: 'deriv',
    category: 'digits',
    sub: 'matches',
    kind: 'xml',
    platform: 'Deriv Bot',
    desc: 'Digit Matches bot. Repaired copy, test on demo.',
    how: 'Unlock, download the .xml file, open Deriv Bot -> Import -> load the XML -> Run on demo first.',
    price: 1500,
    status: 'live',
    locked: true,
  },
  {
    id: 'wallstreet-fast-match',
    name: 'Wallstreet Fast Match',
    section: 'deriv',
    category: 'digits',
    sub: 'matches',
    kind: 'xml',
    platform: 'Deriv Bot',
    desc: 'Fast Digit Matches bot. Repaired copy, test on demo.',
    how: 'Unlock, download the .xml file, open Deriv Bot -> Import -> load the XML -> Run on demo first.',
    price: 1500,
    status: 'live',
    locked: true,
  },
  {
    id: 'rise-fall-auto-direction',
    name: 'Rise/Fall Auto Direction',
    section: 'deriv',
    category: 'rise-fall',
    kind: 'xml',
    platform: 'Deriv Bot',
    desc: 'Chooses Rise or Fall automatically.',
    how: 'Unlock, download the .xml file, open Deriv Bot -> Import -> load the XML -> Run on demo first.',
    price: 1500,
    status: 'live',
    locked: true,
  },
  {
    id: 'accumulators-20-profit',
    name: 'Accumulators 20 Profit',
    section: 'deriv',
    category: 'accumulators',
    kind: 'xml',
    platform: 'Deriv Bot',
    desc: 'Accumulator bot targeting a fixed profit per trade.',
    how: 'Unlock, download the .xml file, open Deriv Bot -> Import -> load the XML -> Run on demo first.',
    price: 2000,
    status: 'live',
    locked: true,
  },
  {
    id: 'over-under-auto',
    name: 'TRADERSPRO Auto Over/Under Killer',
    section: 'automated',
    category: 'over-under',
    kind: 'strategy',
    platform: 'Deriv API',
    presets: ['over-under', 'under'],
    desc: 'No digits to enter. The AI scans every market, tests every Over and Under digit, and trades the one that beats chance the most, on its own.',
    how: 'Open Automated Trading, connect your Deriv token, set stake and stop loss, and press Start. Test on demo first.',
    price: 2500,
    status: 'live',
    locked: true,
  },
  {
    id: 'differs-auto',
    name: 'Auto Differs',
    section: 'automated',
    category: 'digits',
    sub: 'differs',
    kind: 'strategy',
    platform: 'Deriv API',
    presets: ['differs'],
    desc: 'Finds the least-appearing digit over 100 ticks, waits for it to print, then trades Differs.',
    how: 'Open Automated Trading, connect your Deriv token, set stake and stop loss, and press Start. Test on demo first.',
    price: 2500,
    status: 'live',
    locked: true,
  },
  {
    id: 'matches-auto',
    name: 'TRADERSPRO Auto Matches & Differs',
    section: 'automated',
    category: 'digits',
    sub: 'matches',
    kind: 'strategy',
    platform: 'Deriv API',
    presets: ['matches'],
    desc: 'The AI reads the last 100 ticks of all 10 markets, finds the digit that stands out most, and chooses Matches or Differs itself.',
    how: 'Open Automated Trading, connect your Deriv token, set stake and stop loss, and press Start. Test on demo first.',
    price: 2500,
    status: 'live',
    locked: true,
  },
  {
    id: 'even-odd-auto',
    name: 'TRADERSPRO Auto Even/Odd',
    section: 'automated',
    category: 'even-odd',
    kind: 'strategy',
    platform: 'Deriv API',
    presets: ['even', 'odd'],
    desc: 'The AI scans every market for 3 to 4 even (or odd) ticks in a row and trades the opposite on the best market.',
    how: 'Open Automated Trading, connect your Deriv token, set stake and stop loss, and press Start. Test on demo first.',
    price: 2500,
    status: 'live',
    locked: true,
  },
  {
    id: 'rise-fall-auto',
    name: 'Auto Rise / Fall',
    section: 'automated',
    category: 'rise-fall',
    kind: 'strategy',
    platform: 'Deriv API',
    presets: ['rise', 'fall'],
    desc: 'Scans all markets for a clear 5-tick direction and trades Rise or Fall.',
    how: 'Open Automated Trading, connect your Deriv token, set stake and stop loss, and press Start. Test on demo first.',
    price: 2500,
    status: 'live',
    locked: true,
  },
  {
    id: 'digit-trader',
    name: 'Auto Digit Trader (all contracts)',
    section: 'automated',
    category: 'over-under',
    kind: 'strategy',
    platform: 'Deriv API',
    presets: null,
    desc: 'One bot for Over, Under, Differs, Matches, Even, Odd, Rise and Fall.',
    how: 'Open Automated Trading, connect your Deriv token, set stake and stop loss, and press Start. Test on demo first.',
    price: 5000,
    status: 'live',
    locked: true,
  },
  {
    id: 'under-auto',
    name: 'TRADERSPRO Auto Under Bot',
    section: 'automated',
    category: 'even-odd',
    kind: 'strategy',
    platform: 'Deriv API',
    desc: 'Scans all markets. When the last digit touches 8 or 9 it places Under 8. After a loss it recovers with Under 7 when a 7, 8 or 9 touches.',
    how: 'Open Automated Trading, connect your Deriv token, set stake and stop loss, and press Start. Test on demo first.',
    price: 2500,
    status: 'live',
    locked: true,
  },
  {
    id: 'over-auto',
    name: 'TRADERSPRO Auto Over Bot',
    section: 'automated',
    category: 'even-odd',
    kind: 'strategy',
    platform: 'Deriv API',
    desc: 'Scans all markets. When the last digit touches 0 or 1 it places Over 1. After a loss it recovers with Over 2 when a 0, 1 or 2 touches.',
    how: 'Open Automated Trading, connect your Deriv token, set stake and stop loss, and press Start. Test on demo first.',
    price: 2500,
    status: 'live',
    locked: true,
  },
  {
    id: 'xauusd-system',
    name: 'ChartLord XAUUSD Auto System',
    section: 'forex',
    category: 'forex',
    sub: 'autosystem',
    kind: 'file',
    platform: 'MT5 Expert Advisor',
    desc: 'Gold (XAUUSD) robot for MT5: 4H/1H direction, liquidity sweep or FVG, 5M order-block entry, Intraday & Scalping modes controlled live from this website.',
    how: 'Pay, download the .mq5 file, put it in MT5 -> MQL5/Experts, compile (F7), allow this site in Tools -> Options -> Expert Advisors -> WebRequest, attach to XAUUSD, and paste your EA key from the Broker tab.',
    price: 10000,
    status: 'live',
    locked: true,
  },
  {
    id: 'straddle-system',
    name: 'ChartLord Straddle System',
    section: 'forex',
    category: 'forex',
    sub: 'autosystem',
    kind: 'file',
    platform: 'MT5 Expert Advisor',
    desc: 'Fast gold (XAUUSD) scalper for MT5. Trades on days with no high-impact USD news after liquidity sweeps, with tight stops and remote pause/lot control.',
    how: 'Pay, download the .mq5 file, put it in MT5 -> MQL5/Experts, compile (F7), allow this site in WebRequest, attach to XAUUSD, and paste your EA key from the Broker tab.',
    price: 10000,
    status: 'live',
    locked: true,
  },
];

export const SPECIAL_PRODUCTS: Record<string, { id: string; name: string; defaultPrice: number; desc: string }> = {
  signals: {
    id: 'signals',
    name: 'Forex signals, 1 week',
    defaultPrice: 500,
    desc: '7 days of unlimited live SMC/ICT forex setups across major pairs & Gold.',
  },
  aiscan: {
    id: 'aiscan',
    name: 'AI scanner, 5 signals',
    defaultPrice: 1000,
    desc: '5-signal pack for the Top-Down AI Scanner (Gold, EURUSD, GBPUSD, USDJPY, Oil).',
  },
  engine: {
    id: 'engine',
    name: 'TRADERSPRO Market Engine site (lifetime)',
    defaultPrice: 27000,
    desc: 'Lifetime unlock for cloud Market Engine entries, hourly AI market briefs, and Engine mode on MT5 robots.',
  },
};

export function mergeCatalog(
  dynamic: { extra?: CatalogItem[]; hide?: string[]; edit?: Record<string, Partial<CatalogItem>> } | null,
  prices: Record<string, number> | null,
  includeHidden = false
): CatalogItem[] {
  const hideSet = new Set(dynamic?.hide || []);
  const editMap = dynamic?.edit || {};
  const extras = Array.isArray(dynamic?.extra) ? dynamic!.extra : [];
  const all = [...BUILTIN_ITEMS, ...extras.map((e) => ({ ...e, extra: true }))];
  return all
    .map((item) => {
      const ov = editMap[item.id] || {};
      const livePrice = prices && typeof prices[item.id] === 'number' ? prices[item.id] : item.price;
      return {
        ...item,
        ...ov,
        price: item.id === 'engine-ai' ? 0 : livePrice,
        hidden: hideSet.has(item.id),
      };
    })
    .filter((item) => includeHidden || (!item.hidden && item.status !== 'soon'));
}

export function formatProductPrice(
  priceKsh: number,
  config: ServerConfig | null,
  options?: { short?: boolean }
): { primary: string; secondary: string | null; usd: number } {
  if (!priceKsh || priceKsh <= 0) {
    return { primary: 'Free', secondary: null, usd: 0 };
  }
  const usdRate = config?.usdRate || 130;
  const usd = Math.ceil(priceKsh / usdRate);
  const isKenya = config ? config.isKenya : true;
  if (isKenya) {
    return {
      primary: `${priceKsh.toLocaleString()} KSh`,
      secondary: options?.short ? null : `approx $${usd} USD`,
      usd,
    };
  }
  const cur = config?.currency;
  let localEst: string | null = null;
  if (cur && cur.code !== 'USD' && cur.rate > 0) {
    const val = Math.round(usd * cur.rate);
    localEst = `about ${cur.code} ${val.toLocaleString()}`;
  }
  return {
    primary: `$${usd} USD`,
    secondary: localEst,
    usd,
  };
}
