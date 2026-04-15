export function calculateMovingAverage(prices, days) {
  if (prices.length < days) return null;
  const recent = prices.slice(-days);
  return recent.reduce((sum, p) => sum + p.price, 0) / days;
}

export function getDecision(prices, inputs) {
  const { quality, harvest, storage, urgency } = inputs;

  const ma5 = calculateMovingAverage(prices, 5);
  const ma10 = calculateMovingAverage(prices, 10);

  let trend = "STABLE";
  if (ma5 && ma10) {
    if (ma5 > ma10) trend = "RISING";
    else if (ma5 < ma10) trend = "FALLING";
  }

  let score = 0;

  if (trend === "RISING") score += 30;
  else if (trend === "STABLE") score += 15;

  if (quality === "HIGH") score += 20;
  else if (quality === "MEDIUM") score += 10;

  if (harvest === "READY") score += 20;
  else if (harvest === "5-7 DAYS") score += 10;

  if (storage === "YES") score += 15;

  if (urgency === "NEED MONEY") score -= 20;
  else if (urgency === "CAN WAIT") score += 15;

  let decision;
  if (score >= 60) decision = "SELL";
  else if (score >= 35) decision = "HOLD";
  else decision = "WAIT";

  const priceValues = prices.map((p) => p.price);
  const priceRange = {
    min: Math.min(...priceValues),
    max: Math.max(...priceValues),
  };

  const currentPrice = prices[prices.length - 1]?.price || 0;

  const explanation = {
    trend:
      trend === "RISING"
        ? "Prices are trending upward"
        : trend === "FALLING"
          ? "Prices are trending downward"
          : "Prices are stable",
    quality:
      quality === "HIGH"
        ? "High quality crop commands better prices"
        : quality === "MEDIUM"
          ? "Medium quality - average market price"
          : "Low quality may get lower prices",
    urgency:
      urgency === "NEED MONEY"
        ? "Immediate need reduces bargaining power"
        : urgency === "CAN WAIT"
          ? "Flexibility allows waiting for better rates"
          : "Moderate flexibility in timing",
    storage:
      storage === "YES"
        ? "Storage available - can hold for better price"
        : "No storage - sell soon to avoid spoilage",
  };

  return {
    decision,
    score: Math.max(0, Math.min(100, score)),
    trend,
    priceRange,
    currentPrice,
    explanation,
    ma5: ma5 ? Math.round(ma5) : null,
    ma10: ma10 ? Math.round(ma10) : null,
  };
}
