const fs = require('fs');
const path = require('path');

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(body));
}

function loadConfig() {
  const p = path.join(process.cwd(), 'config.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function getOutputText(data) {
  if (typeof data.output_text === 'string') return data.output_text;
  const chunks = [];
  for (const item of (data.output || [])) {
    if (item.type !== 'message') continue;
    for (const part of (item.content || [])) {
      if (part.type === 'output_text' && typeof part.text === 'string') chunks.push(part.text);
    }
  }
  return chunks.join('\n');
}

function errorText(data) {
  if (!data) return 'Unknown OpenAI error';
  if (typeof data.error?.message === 'string') return data.error.message;
  if (typeof data.message === 'string') return data.message;
  return JSON.stringify(data).slice(0, 1500);
}

function buildPrompt(config) {
  const today = new Date().toISOString().slice(0, 10);
  const radar = (config.seed || [])
    .map(x => `- ${x[0]} | ${x[1]} | ${x[2]} | ${x[3]}/100`)
    .join('\n');

  return `You are the 2030 HUNTER research agent. Today is ${today}.

MISSION
Find NEW publicly traded U.S.-listed companies that deserve entry into our live investment radar. Do not merely find companies that beat VOYG. Any genuinely strong new candidate scoring 80/100 or more belongs on the radar.

IMPORTANT INVESTMENT LENS
The ranking is a 10X HUNTER ranking, not a generic quality ranking. Imagine putting $1,000 into one company and holding for roughly five years. We are hunting for companies with a credible path to becoming $10,000+ positions through structural growth, technology, market expansion and operating leverage. High risk is acceptable. Early revenue or negative FCF is acceptable when supported by real technical/commercial evidence. Starting valuation and dilution matter. Do not confuse 'great company' with 'great 10X setup'.

INVESTMENT THESIS
We want the next generation of companies behind structural growth themes: companies building real products, infrastructure, technology or business models today that can become very large over 5-10 years. We are explicitly hunting for early winners analogous in trajectory—not guaranteed outcomes—to Nvidia, AMD, Tesla, OpenAI/Anthropic-style platform businesses. A company can be early and cash-flow negative if the burn is funding a credible, potentially enormous opportunity and there is real technical/commercial evidence. Do NOT automatically reject a moonshot for negative FCF or low current revenue. Do reject weak stories with no credible product/customer/technology evidence.

THE 26 THEMES
${(config.themes || []).map(x => `- ${x}`).join('\n')}

CURRENT RADAR — DO NOT RETURN THESE AS "NEW"
${radar}

RESEARCH METHOD
Search broadly first, then go deep on the best candidates. Use multiple independent sources. Prefer primary sources: SEC filings (10-K, 10-Q, 8-K, S-1), company investor-relations pages, earnings releases, investor presentations, customer/partner announcements and contracts. Use reputable financial/industry sources for corroboration. Search for small, mid-cap and newly public companies; do not limit discovery to famous names.

For every candidate investigate:
1) Structural theme strength: preference vs physical/legal necessity.
2) Bottleneck: what is scarce and who owns it?
3) Value-chain position: where does economic rent accrue?
4) Product/technology and moat: switching costs, IP, scale, learning curve, ecosystem, manufacturing know-how, scarce assets.
5) Customer validation: real production orders, contracts, backlog/RPO, design wins, repeat customers.
6) Growth: revenue trajectory, TAM, adoption runway, operating leverage.
7) Capital: FCF/cash burn, cash runway, debt, capex, dilution/share count.
8) Management: execution vs promises, capital allocation, insider activity where meaningful.
9) Accounting quality: one-offs, stock comp, non-GAAP exclusions, customer prepayments.
10) Valuation/asymmetry: what must be true for 15%/20%/30% annualized returns over five years; explicitly assess whether a 10X outcome is mathematically plausible from the current market capitalization.

MOONSHOT RULE
Negative FCF, low revenue, or early-stage status is NOT an automatic fail. Score the quality of the investment behind the burn. But a company with no credible product, no customer validation, repeated dilution with no progress, or a story supported mainly by social media should not reach 80.

HUNTER SCORE /100
Structural theme 15
TAM/runway 10
Bottleneck/scarcity 10
Future moat 15
Technology/product 10
Customer/commercial validation 10
Growth 5
Capital efficiency 5
Management/execution 10
Valuation/asymmetry 10

THRESHOLDS
80-84 = RADAR
85-89 = STRONG
90-93 = TOP TIER
94+ = CURRENT #1 LEVEL
Do not inflate scores. It is acceptable to return zero candidates.

OUTPUT — VERY IMPORTANT
Return ONLY new companies that score 80+.
Do NOT write a long report.
For each company use EXACTLY ONE LINE:
TICKER | COMPANY | THEME | SCORE | STATUS | ONE-SENTENCE REASON

The one-sentence reason must mention the concrete evidence that makes the candidate interesting (e.g. contract, backlog, revenue growth, technology milestone, production ramp) and may include short source citations/URLs if supported by the research.

Then one final line:
SCAN COMPLETE | X NEW COMPANIES | X RADAR+ | X TOP TIER+

No other prose.`;
}

async function openaiFetch(url, options) {
  const r = await fetch(url, options);
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { message: text }; }
  return { r, data };
}

module.exports = async (req, res) => {
  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return json(res, 500, { error: 'OPENAI_API_KEY is not configured in Vercel Environment Variables.' });

    if (req.method === 'POST') {
      const config = loadConfig();
      const payload = {
        model: 'o3-deep-research',
        input: buildPrompt(config),
        background: true,
        tools: [
          { type: 'web_search_preview' }
        ],
        max_tool_calls: 60
      };

      const { r, data } = await openaiFetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!r.ok) return json(res, 502, { error: `OpenAI START ${r.status}: ${errorText(data)}` });
      return json(res, 200, { id: data.id, status: data.status || 'queued' });
    }

    if (req.method === 'GET') {
      const id = req.query?.id;
      if (!id) return json(res, 400, { error: 'Missing research id.' });

      const { r, data } = await openaiFetch(`${OPENAI_API_URL}/${encodeURIComponent(id)}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${key}` }
      });

      if (!r.ok) return json(res, 502, { error: `OpenAI STATUS ${r.status}: ${errorText(data)}` });

      if (data.status === 'completed') {
        return json(res, 200, { status: 'completed', text: getOutputText(data) });
      }
      if (data.status === 'failed' || data.status === 'cancelled' || data.status === 'incomplete') {
        return json(res, 200, { status: 'failed', error: errorText(data) });
      }
      return json(res, 200, { status: data.status || 'in_progress' });
    }

    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Method not allowed.' });
  } catch (err) {
    return json(res, 500, { error: err?.message || String(err) });
  }
};
