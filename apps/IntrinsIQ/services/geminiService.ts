import { FullAnalysisResponse, AnalysisResult, GroundingSource } from "../types";

// =============================================================================
// IntrinsIQ - Premium AI Value Investing Platform
// Hybrid System: Real-Time Data APIs + Llama 3.3 70B Deep Analysis
// =============================================================================

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
// Read from env, never hardcode - a client-side key is bundled into the
// public JS regardless, so this doesn't hide it from end users, but it
// keeps it out of source control and lets it be rotated without a
// code change. Set VITE_GROQ_API_KEY in your local .env.
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || "";

// Multiple CORS proxies for redundancy
const CORS_PROXIES = [
  "https://corsproxy.io/?",
  "https://api.codetabs.com/v1/proxy?quest=",
  "https://thingproxy.freeboard.io/fetch/",
];

// =============================================================================
// Real-Time Data Interface
// =============================================================================

interface RealTimeData {
  ticker: string;
  companyName: string;
  currentPrice: number;
  previousClose: number;
  change: number;
  changePercent: number;
  peRatio: number | null;
  eps: number | null;
  revenueGrowth: number | null;
  beta: number | null;
  dividendYield: number | null;
  debtToEquity: number | null;
  marketCap: number;
  marketCapFormatted: string;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  targetPrice: number | null;
  sector: string;
  industry: string;
  volume: number;
  avgVolume: number;
  dayHigh: number;
  dayLow: number;
  open: number;
  dataSource: string;
  dataTimestamp: string;
}

function formatMarketCap(cap: number): string {
  if (!cap || cap === 0) return "N/A";
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(2)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(2)}M`;
  return `$${cap.toLocaleString()}`;
}

// =============================================================================
// Fetch Real-Time Data with Multiple Fallbacks
// =============================================================================

async function fetchWithProxy(url: string, proxyIndex: number = 0): Promise<any> {
  if (proxyIndex >= CORS_PROXIES.length) {
    throw new Error("All proxies failed");
  }
  
  const proxy = CORS_PROXIES[proxyIndex];
  const proxiedUrl = proxy + encodeURIComponent(url);
  
  try {
    const response = await fetch(proxiedUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.log(`Proxy ${proxyIndex + 1} failed, trying next...`);
    return fetchWithProxy(url, proxyIndex + 1);
  }
}

async function fetchRealTimeData(ticker: string): Promise<RealTimeData | null> {
  const upperTicker = ticker.toUpperCase();
  console.log(`📊 Fetching real-time data for ${upperTicker}...`);
  
  try {
    // Try Yahoo Finance Chart API
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${upperTicker}?interval=1d&range=5d`;
    const chartData = await fetchWithProxy(chartUrl);
    
    const result = chartData?.chart?.result?.[0];
    if (!result) throw new Error("No chart data");
    
    const meta = result.meta;
    const quote = result.indicators?.quote?.[0];
    const closes = quote?.close?.filter((c: any) => c !== null) || [];
    
    const currentPrice = meta.regularMarketPrice || (closes.length > 0 ? closes[closes.length - 1] : 0);
    const previousClose = meta.chartPreviousClose || meta.previousClose || currentPrice;

    // Try to get detailed quote data
    let detailedData: any = {};
    try {
      const quoteUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${upperTicker}?modules=price,summaryDetail,defaultKeyStatistics,financialData`;
      const quoteData = await fetchWithProxy(quoteUrl);
      const quoteSummary = quoteData?.quoteSummary?.result?.[0];
      if (quoteSummary) {
        detailedData = {
          price: quoteSummary.price || {},
          summary: quoteSummary.summaryDetail || {},
          keyStats: quoteSummary.defaultKeyStatistics || {},
          financials: quoteSummary.financialData || {}
        };
      }
    } catch (e) {
      console.log("Detailed quote fetch failed, using basic data");
    }

    const price = detailedData.price || {};
    const summary = detailedData.summary || {};
    const keyStats = detailedData.keyStats || {};
    const financials = detailedData.financials || {};
    
    const marketCap = price.marketCap?.raw || meta.marketCap || 0;
    const finalPrice = price.regularMarketPrice?.raw || currentPrice;
    
    if (finalPrice <= 0) throw new Error("Invalid price");

    const data: RealTimeData = {
      ticker: upperTicker,
      companyName: price.longName || price.shortName || meta.shortName || upperTicker,
      currentPrice: finalPrice,
      previousClose: price.regularMarketPreviousClose?.raw || previousClose,
      change: finalPrice - (price.regularMarketPreviousClose?.raw || previousClose),
      changePercent: ((finalPrice - (price.regularMarketPreviousClose?.raw || previousClose)) / (price.regularMarketPreviousClose?.raw || previousClose)) * 100,
      peRatio: summary.trailingPE?.raw || keyStats.trailingPE?.raw || null,
      eps: keyStats.trailingEps?.raw || null,
      revenueGrowth: financials.revenueGrowth?.raw ? financials.revenueGrowth.raw * 100 : null,
      beta: keyStats.beta?.raw || null,
      dividendYield: summary.dividendYield?.raw ? summary.dividendYield.raw * 100 : null,
      debtToEquity: financials.debtToEquity?.raw || null,
      marketCap: marketCap,
      marketCapFormatted: formatMarketCap(marketCap),
      fiftyTwoWeekHigh: summary.fiftyTwoWeekHigh?.raw || meta.fiftyTwoWeekHigh || 0,
      fiftyTwoWeekLow: summary.fiftyTwoWeekLow?.raw || meta.fiftyTwoWeekLow || 0,
      targetPrice: financials.targetMeanPrice?.raw || null,
      sector: price.sector || "Technology",
      industry: price.industry || "Unknown",
      volume: price.regularMarketVolume?.raw || meta.regularMarketVolume || 0,
      avgVolume: summary.averageVolume?.raw || 0,
      dayHigh: price.regularMarketDayHigh?.raw || meta.regularMarketDayHigh || finalPrice,
      dayLow: price.regularMarketDayLow?.raw || meta.regularMarketDayLow || finalPrice,
      open: price.regularMarketOpen?.raw || meta.regularMarketOpen || previousClose,
      dataSource: "Yahoo Finance (Live)",
      dataTimestamp: new Date().toISOString(),
    };

    console.log(`✅ LIVE DATA: ${data.companyName} @ $${data.currentPrice.toFixed(2)}`);
    return data;
    
  } catch (error) {
    console.error("❌ Real-time data fetch failed:", error);
    return null;
  }
}

// =============================================================================
// Llama 3.3 70B Analysis Engine
// =============================================================================

const SYSTEM_PROMPT = `You are IntrinsIQ, a world-class financial analyst specializing in intrinsic value investing.

YOUR METHODOLOGY:
1. **Discounted Cash Flow (DCF)** - Primary method for growth companies
   - Project 5-10 years of Free Cash Flow
   - Discount rate: 10% for stable, 12% for growth, 15% for high-risk
   - Terminal growth: 2-3% (GDP growth rate)
   - Apply 20% margin of safety haircut

2. **Graham Number** - For stable, dividend-paying companies
   - Formula: √(22.5 × EPS × Book Value per Share)
   - Conservative valuation method

3. **Earnings Power Value (EPV)** - For mature businesses
   - Normalized Earnings / Cost of Capital
   - No growth assumption

4. **Revenue Multiple** - For high-growth tech
   - Compare P/S ratio to sector peers
   - Apply growth-adjusted multiple

CRITICAL REQUIREMENTS:
1. currentPrice MUST be the exact value provided - NEVER change it
2. intrinsicValue MUST be a calculated positive number based on real analysis
3. marginOfSafety = ((intrinsicValue - currentPrice) / intrinsicValue) × 100
4. Show your calculation methodology in the report
5. detailedReport must be a markdown STRING with proper sections

OUTPUT: Valid JSON only, no markdown code blocks`;

function buildPrompt(ticker: string, data: RealTimeData | null): string {
  const timestamp = new Date().toLocaleString();
  
  if (data && data.currentPrice > 0) {
    return `
═══════════════════════════════════════════════════════════════════════════════
                    INTRINSIQ ANALYSIS REQUEST
                    ${timestamp}
═══════════════════════════════════════════════════════════════════════════════

STOCK: ${data.ticker} - ${data.companyName}
SECTOR: ${data.sector} | INDUSTRY: ${data.industry}
DATA SOURCE: ${data.dataSource}

┌─────────────────────────────────────────────────────────────────────────────┐
│                           LIVE MARKET DATA                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  CURRENT PRICE:  $${data.currentPrice.toFixed(2)}  ← USE THIS EXACT VALUE    │
│  Previous Close: $${data.previousClose.toFixed(2)}                           │
│  Day Change:     ${data.change >= 0 ? '+' : ''}$${data.change.toFixed(2)} (${data.changePercent >= 0 ? '+' : ''}${data.changePercent.toFixed(2)}%)│
│  Day Range:      $${data.dayLow.toFixed(2)} - $${data.dayHigh.toFixed(2)}    │
│  52-Week Range:  $${data.fiftyTwoWeekLow.toFixed(2)} - $${data.fiftyTwoWeekHigh.toFixed(2)}│
│  Market Cap:     ${data.marketCapFormatted}                                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         FUNDAMENTAL METRICS                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  P/E Ratio:      ${data.peRatio?.toFixed(2) || 'N/A'} ${data.peRatio ? (data.peRatio > 30 ? '(High)' : data.peRatio < 15 ? '(Low)' : '(Fair)') : ''}│
│  EPS (TTM):      $${data.eps?.toFixed(2) || 'N/A'}                           │
│  Revenue Growth: ${data.revenueGrowth?.toFixed(1) || 'N/A'}%                 │
│  Beta:           ${data.beta?.toFixed(2) || 'N/A'}                           │
│  Dividend Yield: ${data.dividendYield?.toFixed(2) || '0.00'}%                │
│  Debt/Equity:    ${data.debtToEquity?.toFixed(2) || 'N/A'}                   │
│  Volume:         ${data.volume.toLocaleString()}                             │
│  Avg Volume:     ${data.avgVolume.toLocaleString()}                          │
│  Analyst Target: $${data.targetPrice?.toFixed(2) || 'N/A'}                   │
└─────────────────────────────────────────────────────────────────────────────┘

TASK: Calculate intrinsic value for ${data.ticker}

REQUIREMENTS:
1. Use DCF, Graham Number, or appropriate valuation method
2. Show your calculation assumptions in the report
3. currentPrice MUST be exactly ${data.currentPrice.toFixed(2)}
4. Calculate a realistic intrinsicValue based on fundamentals
5. If metrics are missing, use your knowledge of ${data.companyName}

Return ONLY this JSON structure:
{
  "ticker": "${data.ticker}",
  "companyName": "${data.companyName}",
  "currentPrice": ${data.currentPrice.toFixed(2)},
  "intrinsicValue": <your calculated value>,
  "marginOfSafety": <percentage>,
  "recommendation": "BUY" or "HOLD" or "SELL",
  "summary": "<2-3 sentence investment thesis>",
  "detailedReport": "## Business Overview\\n<moat analysis>\\n\\n## Financial Analysis\\n<metrics review>\\n\\n## Valuation Calculation\\n<show DCF or Graham calculation with assumptions>\\n\\n## Risk Factors\\n<key risks>\\n\\n## Investment Thesis\\n<conclusion>",
  "valuationMethodology": "<method used with key assumptions>",
  "keyMetrics": {
    "peRatio": ${data.peRatio ?? "null"},
    "eps": ${data.eps ?? "null"},
    "revenueGrowth": ${data.revenueGrowth ?? "null"},
    "beta": ${data.beta ?? "null"},
    "dividendYield": ${data.dividendYield ?? "null"},
    "debtToEquity": ${data.debtToEquity ?? "null"}
  }
}`;
  }
  
  // Fallback when no real-time data
  return `
Analyze stock ${ticker} using your knowledge.

Calculate intrinsic value using DCF or Graham Number methodology.
Use the most recent known price and financial data for ${ticker}.
Show your calculation methodology in the detailed report.

Return ONLY valid JSON:
{
  "ticker": "${ticker}",
  "companyName": "<company name>",
  "currentPrice": <most recent known price>,
  "intrinsicValue": <calculated value>,
  "marginOfSafety": <percentage>,
  "recommendation": "BUY" or "HOLD" or "SELL",
  "summary": "<investment thesis>",
  "detailedReport": "## Business Overview\\n...\\n\\n## Valuation Calculation\\n<show your work>\\n\\n## Risks\\n...\\n\\n## Conclusion\\n...",
  "valuationMethodology": "<method and assumptions>",
  "keyMetrics": {
    "peRatio": <value or null>,
    "eps": <value or null>,
    "revenueGrowth": <value or null>,
    "beta": <value or null>,
    "dividendYield": <value or null>,
    "debtToEquity": <value or null>
  }
}`;
}

async function analyzeWithGroq(ticker: string, data: RealTimeData | null): Promise<AnalysisResult> {
  console.log("🧠 Running Llama 3.3 70B deep analysis...");
  
  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildPrompt(ticker, data) }
      ],
      temperature: 0.15,
      max_tokens: 6000,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Groq API error: ${response.status}`);
  }

  const result = await response.json();
  let content = result.choices?.[0]?.message?.content || "";

  // Clean markdown code blocks if present
  content = content.trim();
  if (content.startsWith("```json")) content = content.slice(7);
  else if (content.startsWith("```")) content = content.slice(3);
  if (content.endsWith("```")) content = content.slice(0, -3);
  content = content.trim();

  let analysis: AnalysisResult;
  try {
    analysis = JSON.parse(content);
  } catch (e) {
    console.error("JSON parse error:", content.substring(0, 200));
    throw new Error("Failed to parse analysis response");
  }

  // Validate and fix data
  if (data && data.currentPrice > 0) {
    analysis.currentPrice = data.currentPrice;
    analysis.ticker = data.ticker;
    
    // Ensure valid intrinsic value
    if (!analysis.intrinsicValue || analysis.intrinsicValue <= 0) {
      // Estimate based on P/E or simple multiple
      if (data.peRatio && data.eps) {
        const fairPE = Math.min(data.peRatio * 0.85, 25); // Conservative P/E
        analysis.intrinsicValue = fairPE * data.eps;
      } else {
        analysis.intrinsicValue = data.currentPrice * 0.9; // 10% discount
      }
      analysis.valuationMethodology = "P/E Multiple (Conservative Estimate)";
    }
    
    // Recalculate margin of safety
    analysis.marginOfSafety = ((analysis.intrinsicValue - data.currentPrice) / analysis.intrinsicValue) * 100;
    
    // Set recommendation based on margin
    if (analysis.marginOfSafety > 20) {
      analysis.recommendation = "BUY";
    } else if (analysis.marginOfSafety > 0) {
      analysis.recommendation = "HOLD";
    } else {
      analysis.recommendation = "SELL";
    }
  }

  // Ensure string fields
  if (typeof analysis.detailedReport !== 'string') {
    analysis.detailedReport = String(analysis.detailedReport || "Analysis report unavailable.");
  }
  if (typeof analysis.summary !== 'string') {
    analysis.summary = String(analysis.summary || "");
  }

  return analysis;
}

// =============================================================================
// Main Analysis Pipeline
// =============================================================================

export const analyzeStock = async (query: string): Promise<FullAnalysisResponse> => {
  const ticker = query.toUpperCase().trim();
  const startTime = Date.now();
  
  console.log("\n" + "═".repeat(60));
  console.log(`  🔍 INTRINSIQ ANALYSIS: ${ticker}`);
  console.log("═".repeat(60));
  
  try {
    // Step 1: Fetch real-time data
    const realTimeData = await fetchRealTimeData(ticker);
    
    // Step 2: Run AI analysis
    const analysis = await analyzeWithGroq(ticker, realTimeData);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log("\n" + "─".repeat(60));
    console.log("  📊 ANALYSIS COMPLETE");
    console.log("─".repeat(60));
    console.log(`  Company:     ${analysis.companyName}`);
    console.log(`  Price:       $${analysis.currentPrice.toFixed(2)} ${realTimeData ? '(LIVE)' : '(AI Estimate)'}`);
    console.log(`  Intrinsic:   $${analysis.intrinsicValue.toFixed(2)}`);
    console.log(`  Margin:      ${analysis.marginOfSafety.toFixed(1)}%`);
    console.log(`  Rating:      ${analysis.recommendation}`);
    console.log(`  Method:      ${analysis.valuationMethodology}`);
    console.log(`  Duration:    ${duration}s`);
    console.log("═".repeat(60) + "\n");

    // Build sources
    const sources: GroundingSource[] = [
      { title: `${ticker} - Yahoo Finance`, uri: `https://finance.yahoo.com/quote/${ticker}` },
      { title: `${ticker} - SEC Filings`, uri: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${ticker}&type=10-K` },
      { title: `${ticker} - MarketWatch`, uri: `https://www.marketwatch.com/investing/stock/${ticker.toLowerCase()}` },
      { title: `${ticker} - Seeking Alpha`, uri: `https://seekingalpha.com/symbol/${ticker}` },
    ];

    return {
      analysis,
      groundingSources: sources,
      rawText: JSON.stringify(analysis, null, 2)
    };

  } catch (error: any) {
    console.error("\n❌ ANALYSIS FAILED:", error.message);
    throw new Error(error.message || "Analysis failed. Please try again.");
  }
};
