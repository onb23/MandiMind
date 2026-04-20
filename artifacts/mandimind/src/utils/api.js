// All API calls go to the Cloudflare Worker in production.
// In development (vite dev): empty string → uses Vite proxy to localhost:8080 Express server.
// In production (Cloudflare Pages build): uses the deployed Worker URL directly.

export const API_BASE = "https://mandimind.omkarborade-11.workers.dev";

function hasRequiredParam(value) {
  return typeof value === "string" && value.trim().length > 0;
}

async function fetchJsonWithGuard(url, fallbackError) {
  const res = await fetch(url);
  let data = null;

  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const message = typeof data?.error === "string"
      ? data.error
      : `HTTP ${res.status} from ${url}`;
    return { source: "error", error: message };
  }

  if (data && typeof data === "object" && typeof data.error === "string") {
    return { source: "error", error: data.error };
  }

  if (!data || typeof data !== "object") {
    return { source: "error", error: fallbackError };
  }

  return data;
}

/**
 * Fetch recent available crops for a state based on real Agmarknet records.
 * Returns: { crops: [{ id, name, commodity, latestDate, recordCount }], windowDays, source }
 */
export async function fetchCropUniverse(state = "Maharashtra", days = 15) {
  const url =
    `${API_BASE}/api/crops` +
    `?state=${encodeURIComponent(state)}` +
    `&days=${days}`;

  try {
    const data = await fetchJsonWithGuard(url, "Unable to fetch live crop availability");
    if (data?.source === "error") throw new Error(data.error);

    try {
      localStorage.setItem(
        `mm_crops_${state}_${days}`,
        JSON.stringify({ ...data, cachedAt: new Date().toISOString() })
      );
    } catch {}
    return data;
  } catch (err) {
    console.error("[MandiMind] fetchCropUniverse failed:", err);
    try {
      const raw = localStorage.getItem(`mm_crops_${state}_${days}`);
      if (raw) {
        const cached = JSON.parse(raw);
        console.warn("[MandiMind] fetchCropUniverse using cached data");
        return { ...cached, source: "cache", stale: true };
      }
    } catch {}
    return {
      crops: [],
      windowDays: days,
      source: "error",
      error: "Unable to fetch live crop availability",
    };
  }
}

/**
 * Fetch price history + current price for a crop+mandi.
 * Returns: { data[], currentPrice, priceRange, lastUpdated, stale, source }
 */
export async function fetchPrices(cropId, market, state = "Maharashtra", days = 30) {
  if (!hasRequiredParam(cropId) || !hasRequiredParam(market)) {
    return {
      data: [],
      currentPrice: null,
      priceRange: { low: null, high: null },
      source: "error",
      error: "crop and market are required",
    };
  }

  const safeCrop = cropId.trim();
  const safeMarket = market.trim();
  const url =
    `${API_BASE}/api/prices` +
    `?crop=${encodeURIComponent(safeCrop)}` +
    `&market=${encodeURIComponent(safeMarket)}` +
    `&state=${encodeURIComponent(state)}` +
    `&days=${days}`;

  try {
    const data = await fetchJsonWithGuard(url, "Unable to fetch live mandi data");
    if (data?.source === "error") throw new Error(data.error);

    if (data.data?.length) {
      try {
        localStorage.setItem(
          `mm_prices_${safeCrop}_${safeMarket}`,
          JSON.stringify({ ...data, cachedAt: new Date().toISOString() })
        );
      } catch {}
    }
    return data;
  } catch (err) {
    console.error("[MandiMind] fetchPrices failed:", err);
    try {
      const raw = localStorage.getItem(`mm_prices_${safeCrop}_${safeMarket}`);
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
  if (!hasRequiredParam(cropId) || !hasRequiredParam(market)) {
    return {
      source: "error",
      error: "crop and market are required",
    };
  }

  const url =
    `${API_BASE}/api/trend` +
    `?crop=${encodeURIComponent(cropId.trim())}` +
    `&market=${encodeURIComponent(market.trim())}` +
    `&state=${encodeURIComponent(state)}`;

  try {
    return await fetchJsonWithGuard(url, "Unable to fetch live mandi trend");
  } catch (err) {
    console.error("[MandiMind] fetchTrend failed:", err);
    return {
      source: "error",
      error: "Unable to fetch live mandi trend",
    };
  }
}

/**
 * Fetch all mandis for a crop in Maharashtra, sorted by today's price.
 * Returns: { mandis: [{mandi, todayPrice, avgPrice, lastUpdated, stale}], lastUpdated, source }
 */
export async function fetchCompare(cropId, state = "Maharashtra", days = 7) {
  if (!hasRequiredParam(cropId)) {
    return {
      mandis: [],
      source: "error",
      error: "crop is required",
    };
  }

  const safeCrop = cropId.trim();
  const url =
    `${API_BASE}/api/compare` +
    `?crop=${encodeURIComponent(safeCrop)}` +
    `&state=${encodeURIComponent(state)}` +
    `&days=${days}`;

  try {
    const data = await fetchJsonWithGuard(url, "Unable to fetch live mandi data");
    if (data?.source === "error") throw new Error(data.error);

    try {
      localStorage.setItem(
        `mm_compare_${safeCrop}`,
        JSON.stringify({ ...data, cachedAt: new Date().toISOString() })
      );
    } catch {}
    return data;
  } catch (err) {
    console.error("[MandiMind] fetchCompare failed:", err);
    try {
      const raw = localStorage.getItem(`mm_compare_${safeCrop}`);
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
