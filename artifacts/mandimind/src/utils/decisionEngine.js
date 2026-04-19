import { getVariantPriceOffset } from "../data/mockPrices";

export function calculateMovingAverage(prices, days) {
  if (prices.length < days) return null;
  const recent = prices
    .slice(-days)
    .map((p) => p.price)
    .filter((price) => Number.isFinite(price));
  if (recent.length < days) return null;
  return recent.reduce((sum, price) => sum + price, 0) / days;
}

function norm(val) {
  return (val || "").toUpperCase().trim();
}

function getEstimatedImpact(trend) {
  if (trend === "RISING") {
    return {
      summary: "+₹80–₹120 per quintal if trend continues",
      direction: "positive",
    };
  }

  if (trend === "FALLING") {
    return {
      summary: "-₹60–₹100 per quintal if decline continues",
      direction: "negative",
    };
  }

  return {
    summary: "+₹10–₹30 per quintal with close monitoring",
    direction: "neutral",
  };
}

function getMainAndSecondaryRisk({ trend, storage, urgency, harvest }) {
  const s = norm(storage);
  const u = norm(urgency);
  const h = norm(harvest);

  const mainRisk = trend === "FALLING"
    ? "Main risk: prices may slip further over the next 2–3 market sessions"
    : s === "NO"
      ? "Main risk: no storage may force a distress sale if mandi traffic increases"
      : "Main risk: short-term volatility can reverse gains after sudden arrivals";

  const secondaryRisk = (u === "NEED_MONEY" || u === "NEED MONEY")
    ? "Secondary risk: urgent cash need reduces your negotiating power"
    : h === "READY"
      ? "Secondary risk: delayed sale can increase quality-loss exposure"
      : "Secondary risk: waiting too long may miss a favorable local peak";

  return { mainRisk, secondaryRisk };
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

  const q = norm(quality);
  if (q === "HIGH")   score += 20;
  else if (q === "MEDIUM") score += 10;

  const h = norm(harvest);
  if (h === "READY")     score += 20;
  else if (h === "SOON" || h === "5-7 DAYS") score += 10;

  const s = norm(storage);
  if (s === "YES") score += 15;

  const u = norm(urgency);
  if (u === "NEED_MONEY" || u === "NEED MONEY") score -= 20;
  else if (u === "CAN_WAIT" || u === "CAN WAIT") score += 15;

  let decision;
  if (score <= 30) decision = "SELL";
  else if (score <= 60) decision = "WAIT";
  else decision = "HOLD";

  const priceValues = prices
    .map((p) => p.price)
    .filter((price) => Number.isFinite(price));
  const baseCurrentPrice = Number.isFinite(prices[prices.length - 1]?.price)
    ? prices[prices.length - 1].price
    : null;
  const variantOffset = variety && cropId ? getVariantPriceOffset(cropId, variety) : 0;

  const currentPrice = baseCurrentPrice == null ? null : baseCurrentPrice + variantOffset;
  const priceRange = {
    min: priceValues.length ? Math.min(...priceValues) + variantOffset : null,
    max: priceValues.length ? Math.max(...priceValues) + variantOffset : null,
  };

  const qualityStr = q === "HIGH" ? "High quality commands a premium — buyers willing to pay more"
    : q === "MEDIUM" ? "Medium quality — average market rate expected"
    : "Low quality may fetch below-market prices";

  const urgencyStr = (u === "NEED_MONEY" || u === "NEED MONEY")
    ? "Immediate cash need reduces bargaining power"
    : (u === "CAN_WAIT" || u === "CAN WAIT")
    ? "Flexibility to wait lets you capture better prices"
    : "Moderate flexibility — watch prices for 2-3 days";

  const storageStr = (s === "YES")
    ? "Storage available — can hold crop to wait for better rate"
    : "No storage — selling soon reduces spoilage risk";

  const explanation = {
    trend:
      trend === "RISING" ? "Prices trending upward — 5-day avg above 10-day avg"
      : trend === "FALLING" ? "Prices trending downward — 5-day avg below 10-day avg"
      : "Prices are holding steady",
    quality: qualityStr,
    urgency: urgencyStr,
    storage: storageStr,
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
    estimatedImpact: getEstimatedImpact(trend),
    risks: getMainAndSecondaryRisk({ trend, storage, urgency, harvest }),
    ma5:  ma5  ? Math.round(ma5)  : null,
    ma10: ma10 ? Math.round(ma10) : null,
  };
}
