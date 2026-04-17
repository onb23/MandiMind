// All API calls go to the Cloudflare Worker in production.
// In development (vite dev): empty string → uses Vite proxy to localhost:8080 Express server.
// In production (Cloudflare Pages build): uses the deployed Worker URL directly.

export const API_BASE = import.meta.env.DEV
  ? ""
  : (import.meta.env.VITE_API_BASE ?? "https://mandimind.omkarborade-11.workers.dev");

/**
 * Fetch price history + current price for a crop+mandi.
 * Returns: { data[], currentPrice, priceRange, lastUpdated, stale, source }
 */
export async function fetchPrices(cropId, market, state = "Maharashtra", days = 30) {
  const url =
    `${API_BASE}/api/prices` +
    `?crop=${encodeURIComponent(cropId)}` +
    `&market=${encodeURIComponent(market)}` +
    `&state=${encodeURIComponent(state)}` +
    `&days=${days}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    const data = await res.json();
    if (data.data?.length) {
      try {
        localStorage.setItem(
          `mm_prices_${cropId}_${market}`,
          JSON.stringify({ ...data, cachedAt: new Date().toISOString() })
        );
      } catch {}
    }
    return data;
  } catch (err) {
    console.error("[MandiMind] fetchPrices failed:", err);
    try {
      const raw = localStorage.getItem(`mm_prices_${cropId}_${market}`);
      if (raw) {
        const cached = JSON.parse(raw);
        console.warn("[MandiMind] fetchPrices using cached data");
        return { ...cached, source: "cache", stale: true };
      }
    } catch {}
    return {
      data: [],
      currentPrice: null,
      priceRange: { low: null, high: null },
      source: "error",
      error: "Unable to fetch live mandi data",
    };
  }
}

/**
 * Fetch trend summary: MA5, MA10, currentPrice, priceDiff, trend direction.
 * Returns null on failure.
 */
export async function fetchTrend(cropId, market, state = "Maharashtra") {
  const url =
    `${API_BASE}/api/trend` +
    `?crop=${encodeURIComponent(cropId)}` +
    `&market=${encodeURIComponent(market)}` +
    `&state=${encodeURIComponent(state)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return res.json();
  } catch (err) {
    console.error("[MandiMind] fetchTrend failed:", err);
    return null;
  }
}

/**
 * Fetch all mandis for a crop in Maharashtra, sorted by today's price.
 * Returns: { mandis: [{mandi, todayPrice, avgPrice, lastUpdated, stale}], lastUpdated, source }
 */
export async function fetchCompare(cropId, state = "Maharashtra", days = 7) {
  const url =
    `${API_BASE}/api/compare` +
    `?crop=${encodeURIComponent(cropId)}` +
    `&state=${encodeURIComponent(state)}` +
    `&days=${days}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    const data = await res.json();
    try {
      localStorage.setItem(
        `mm_compare_${cropId}`,
        JSON.stringify({ ...data, cachedAt: new Date().toISOString() })
      );
    } catch {}
    return data;
  } catch (err) {
    console.error("[MandiMind] fetchCompare failed:", err);
    try {
      const raw = localStorage.getItem(`mm_compare_${cropId}`);
      if (raw) {
        const cached = JSON.parse(raw);
        console.warn("[MandiMind] fetchCompare using cached data");
        return { ...cached, source: "cache", stale: true };
      }
    } catch {}
    return {
      mandis: [],
      source: "error",
      error: "Unable to fetch live mandi data",
    };
  }
}
