import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { cleanRules, describeRules, RULES_SCHEMA_HELP, type BotRules } from './rules-core.ts';

let geminiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiClient;
}

export function hasAiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_KEY);
}

// Per-user simple sliding rate limiter (10 calls/minute)
const rateMap = new Map<string, number[]>();
export function checkAiRateLimit(userKey: string, maxPerMin = 10): boolean {
  const now = Date.now();
  const prev = (rateMap.get(userKey) || []).filter((t) => now - t < 60000);
  if (prev.length >= maxPerMin) return false;
  prev.push(now);
  rateMap.set(userKey, prev);
  return true;
}

async function generateAiJson(systemInstruction: string, userContent: string): Promise<Record<string, unknown>> {
  const ai = getGemini();
  if (ai) {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: userContent,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
    const txt = (response.text ?? '').trim();
    const match = txt.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : txt);
  }

  if (process.env.ANTHROPIC_KEY) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-latest',
        max_tokens: 1200,
        system: systemInstruction,
        messages: [{ role: 'user', content: userContent }],
      }),
    });
    const j = (await r.json().catch(() => ({}))) as { content?: Array<{ text?: string }>; error?: { message?: string } };
    if (!r.ok) throw new Error(j?.error?.message || 'The AI service refused the request.');
    const txt = (j.content || []).map((x) => x.text || '').join('');
    const match = txt.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : txt);
  }

  throw new Error('AI key is not configured on the server.');
}

export async function analyzeNewsEventAi(ev: {
  id: string;
  title: string;
  country: string;
  impact: string;
  forecast?: string;
  previous?: string;
  ts: number;
}) {
  const sys =
    'You are a careful market analyst writing for retail forex and gold traders. You explain an economic news event: what it measures, what officials or the data may say, and how the market can react. You NEVER predict the result as certain and never promise profit. Reply with ONLY one JSON object, no other text, with these keys: summary (2 sentences, plain words), whySpoken (array of 2-4 short strings: what may be talked about or what to watch in the details), better (string: if the number beats the forecast), worse (string: if it misses), inline (string: if it matches), gold (string: how gold usually reacts and why), usd (string), indices (string), risk (one sentence: the main danger for a trader). Keep every string under 220 characters.';
  const payload = JSON.stringify({
    event: ev.title,
    currency: ev.country,
    impact: ev.impact,
    forecast: ev.forecast || 'not given',
    previous: ev.previous || 'not given',
    time_utc: new Date(ev.ts).toISOString(),
  });
  const a = await generateAiJson(sys, payload);
  const S = (v: unknown, n = 260) => String(v ?? '').slice(0, n);
  return {
    id: ev.id,
    summary: S(a.summary, 400),
    whySpoken: (Array.isArray(a.whySpoken) ? a.whySpoken : []).slice(0, 4).map((x) => S(x)),
    better: S(a.better),
    worse: S(a.worse),
    inline: S(a.inline),
    gold: S(a.gold),
    usd: S(a.usd),
    indices: S(a.indices),
    risk: S(a.risk) || 'High volatility around release can widen spreads and slip stops. Wait for reaction confirmation and never over-leverage.',
    disclaimer: 'Educational analysis only — not financial advice or a guaranteed outcome.',
    made: Date.now(),
  };
}

export async function generateEngineBriefAi(heads: string[], soon: string[]) {
  const sys =
    'You are a careful macro analyst for forex and gold traders. From the headlines and the coming economic events, say what is going on in the world and how it may lean each currency. Never promise outcomes. Reply with ONLY one JSON object: {"summary":"2 short sentences","themes":["up to 4 short themes"],"bias":{"USD":n,"EUR":n,"GBP":n,"JPY":n,"AUD":n,"CAD":n,"CHF":n,"NZD":n,"GOLD":n}} where each n is a number from -1 (weak/bearish) to 1 (strong/bullish), 0 if unclear.';
  const a = await generateAiJson(
    sys,
    JSON.stringify({ headlines: heads, upcoming_events: soon, now_utc: new Date().toISOString() })
  );
  const bias: Record<string, number> = {};
  const bObj = (a.bias && typeof a.bias === 'object' ? a.bias : {}) as Record<string, unknown>;
  for (const k of ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'GOLD']) {
    bias[k] = Math.max(-1, Math.min(1, Number(bObj[k]) || 0));
  }
  return {
    t: Date.now(),
    summary: String(a.summary || '').slice(0, 400),
    themes: (Array.isArray(a.themes) ? a.themes : []).slice(0, 4).map((x) => String(x).slice(0, 80)),
    bias,
    disclaimer: 'Macro overview for situational awareness only; not trade advice.',
  };
}

export async function synthesizeRulesAi(text: string, current?: BotRules | null) {
  const cur = current ? JSON.stringify(cleanRules(current)) : 'none';
  const sys =
    "You turn a trader's plain-words instructions into the settings of a Deriv digit trading bot. Reply with ONLY one JSON object, no other text. Start from the current rules and change only what the trader asks for. " +
    RULES_SCHEMA_HELP;
  const parsed = await generateAiJson(sys, `Current rules: ${cur}\nTrader says: ${text}`);
  const rules = cleanRules({ ...(current || {}), ...parsed });
  return { rules, summary: describeRules(rules) };
}
