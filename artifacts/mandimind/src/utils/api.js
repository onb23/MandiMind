// All data.gov.in calls are proxied through our Express backend.
// Never call data.gov.in from the frontend directly.

const BASE = import.meta.env.BASE_URL; // e.g. "/mandimind/"

function apiUrl(path) {
  return `${BASE}api/${path}`;
}

/**
 * Fetch price history + current price for a crop+mandi.
 * Returns: { data[], currentPrice, priceRange, lastUpdated, source }
 */
export async function fetchPrices(cropId, market, state = "Maharashtra", days = 30) {
  const url = apiUrl(
    `prices?crop=${cropId}&market=${encodeURIComponent(market)}&state=${encodeURIComponent(state)}&days=${days}`
  );

  // Try live first, fall back to localStorage cache
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.data?.length) {
      try {
        localStorage.setItem(
          `mm_prices_${cropId}_${market}`,
          JSON.stringify({ ...data, cachedAt: new Date().toLocaleDateString("en-IN") })
        );
      } catch {}
    }
    return data;
  } catch {
    // Return localStorage cache with stale flag
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
 * Fetch 7-day trend: MA5, MA10, currentPrice, priceDiff
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
