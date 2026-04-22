type EventName =
  | "home_search_submitted"
  | "compare_searched"
  | "recommendation_generated"
  | "trade_profit_calculated";

type EventPayload = {
  page: string;
  language?: string;
  crop?: string;
  state?: string;
  mandi?: string;
  meta?: Record<string, unknown>;
};

const EVENTS_ENDPOINT = "https://api.mandimind.tech/api/events";

export function trackEvent(event: EventName, payload: EventPayload): void {
  const body = {
    event,
    page: payload.page,
    language: payload.language,
    crop: payload.crop,
    state: payload.state,
    mandi: payload.mandi,
    meta: payload.meta,
    ts: Date.now(),
  };

  fetch(EVENTS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    keepalive: true,
    body: JSON.stringify(body),
  }).catch((error) => {
    if (import.meta.env.DEV) {
      console.error("[MandiMind] analytics trackEvent failed:", error);
    }
  });
}
