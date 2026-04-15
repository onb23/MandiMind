import { getVariantPriceOffset } from "../data/mockPrices";

export function calculateMovingAverage(prices, days) {
  if (prices.length < days) return null;
  const recent = prices.slice(-days);
  return recent.reduce((sum, p) => sum + p.price, 0) / days;
}

export function getDecision(prices, inputs) {
  const { quality, harvest, storage, urgency, variety, cropId } = inputs;

  const ma5  = calculateMovingAverage(prices, 5);
  const ma10 = calculateMovingAverage(prices, 10);

  let trend = "STABLE";
  if (ma5 && ma10) {
    if (ma5 > ma10) trend = "RISING";
    else if (ma5 < ma10) trend = "FALLING";
  }

  let score = 0;

  if (trend === "RISING")  score += 30;
  else if (trend === "STABLE") score += 15;

  if (quality === "HIGH")   score += 20;
  else if (quality === "MEDIUM") score += 10;

  if (harvest === "READY")     score += 20;
  else if (harvest === "5-7 DAYS") score += 10;

  if (storage === "YES") score += 15;

  if (urgency === "NEED MONEY") score -= 20;
  else if (urgency === "CAN WAIT") score += 15;

  let decision;
  if (score >= 60) decision = "SELL";
  else if (score >= 35) decision = "HOLD";
  else decision = "WAIT";

  const priceValues = prices.map((p) => p.price);
  const baseCurrentPrice = prices[prices.length - 1]?.price || 0;
  const variantOffset = variety && cropId ? getVariantPriceOffset(cropId, variety) : 0;

  const currentPrice = baseCurrentPrice + variantOffset;
  const priceRange = {
    min: Math.min(...priceValues) + variantOffset,
    max: Math.max(...priceValues) + variantOffset,
  };

  const explanation = {
    trend:
      trend === "RISING"
        ? "Prices trending upward — 5-day avg above 10-day avg"
        : trend === "FALLING"
          ? "Prices trending downward — 5-day avg below 10-day avg"
          : "Prices are holding steady",
    quality:
      quality === "HIGH"
        ? "High quality commands a premium — buyers willing to pay more"
        : quality === "MEDIUM"
          ? "Medium quality — average market rate expected"
          : "Low quality may fetch below-market prices",
    urgency:
      urgency === "NEED MONEY"
        ? "Immediate cash need reduces bargaining power"
        : urgency === "CAN WAIT"
          ? "Flexibility to wait lets you capture better prices"
          : "Moderate flexibility — watch prices for 2-3 days",
    storage:
      storage === "YES"
        ? "Storage available — can hold crop to wait for better rate"
        : "No storage — selling soon reduces spoilage risk",
    variety: variety
      ? variantOffset > 0
        ? `${variety} variety fetches ₹${variantOffset} premium over base price`
        : variantOffset < 0
          ? `${variety} variety is ₹${Math.abs(variantOffset)} below base price`
          : `${variety} variety is priced at market average`
      : null,
  };

  return {
    decision,
    score: Math.max(0, Math.min(100, score)),
    trend,
    priceRange,
    currentPrice,
    variantOffset,
    explanation,
    ma5:  ma5  ? Math.round(ma5)  : null,
    ma10: ma10 ? Math.round(ma10) : null,
  };
}
