// All data.gov.in calls are proxied through our Express backend.
// Never call data.gov.in from the frontend directly.

const BASE = import.meta.env.BASE_URL; // e.g. "/mandimind/"

function apiUrl(path) {
  return `${BASE}api/${path}`;
}

/**
 * Fetch price history + current price for a crop+mandi.
 * Returns: { data[], currentPrice, priceRange, lastUpdated, stale, source }
 */
export async function fetchPrices(cropId, market, state = "Maharashtra", days = 30) {
  const url = apiUrl(
    `prices?crop=${cropId}&market=${encodeURIComponent(market)}&state=${encodeURIComponent(state)}&days=${days}`
  );

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
  } catch {
    try {
      const raw = localStorage.getItem(`mm_prices_${cropId}_${market}`);
      if (raw) {
        const cached = JSON.parse(raw);
        return { ...cached, source: "cache", stale: true };
      }
    } catch {}
    return { data: [], currentPrice: null, priceRange: { low: null, high: null }, source: "error" };
  }
}

/**
 * Fetch trend summary: MA5, MA10, currentPrice, priceDiff, trend direction.
 * Returns null on failure.
 */
export async function fetchTrend(cropId, market, state = "Maharashtra") {
  const url = apiUrl(
    `trend?crop=${cropId}&market=${encodeURIComponent(market)}&state=${encodeURIComponent(state)}`
  );
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Fetch all mandis for a crop in Maharashtra, with today's price and 7-day avg.
 * Returns: { mandis: [{mandi, todayPrice, avgPrice, lastUpdated, stale}], lastUpdated, source }
 */
export async function fetchCompare(cropId, state = "Maharashtra", days = 7) {
  const url = apiUrl(
    `compare?crop=${cropId}&state=${encodeURIComponent(state)}&days=${days}`
  );
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    try {
      localStorage.setItem(
        `mm_compare_${cropId}`,
        JSON.stringify({ ...data, cachedAt: new Date().toISOString() })
      );
    } catch {}
    return data;
  } catch {
    try {
      const raw = localStorage.getItem(`mm_compare_${cropId}`);
      if (raw) {
        const cached = JSON.parse(raw);
        return { ...cached, source: "cache", stale: true };
      }
    } catch {}
    return { mandis: [], source: "error" };
  }
}
