import { useEffect, useMemo, useRef, useState } from "react";
import { fetchAvailableCrops, getFreshnessMessage } from "../utils/mandiAvailability";
import { fetchCompare } from "../utils/api";
import { shareResult } from "../utils/shareResult";
import { useLanguage } from "../context/LanguageContext";
import { trackEvent } from "../lib/analytics";

const COUNTRIES = [
  { id: "UAE", name: "UAE", multiplier: 1.8, cost: 6, transitDays: 7, realizationFactor: 0.9 },
  { id: "Bangladesh", name: "Bangladesh", multiplier: 1.4, cost: 4, transitDays: 4, realizationFactor: 0.93 },
  { id: "Sri Lanka", name: "Sri Lanka", multiplier: 1.3, cost: 5, transitDays: 6, realizationFactor: 0.9 },
  { id: "Saudi Arabia", name: "Saudi Arabia", multiplier: 1.7, cost: 5.5, transitDays: 8, realizationFactor: 0.89 },
  { id: "Oman", name: "Oman", multiplier: 1.55, cost: 5.2, transitDays: 8, realizationFactor: 0.9 },
  { id: "Malaysia", name: "Malaysia", multiplier: 1.65, cost: 5.8, transitDays: 10, realizationFactor: 0.88 },
  { id: "Nepal", name: "Nepal", multiplier: 1.35, cost: 3.8, transitDays: 3, realizationFactor: 0.94 },
  { id: "Iraq", name: "Iraq", multiplier: 1.6, cost: 5.6, transitDays: 9, realizationFactor: 0.88 },
  { id: "UK", name: "UK", multiplier: 2, cost: 8, transitDays: 14, realizationFactor: 0.84 },
];

const DEFAULT_QUANTITY = 1000;

function parsePrice(value) {
  const num = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(num) && num > 0 ? num : null;
}

function getDataConfidence({ canCalculate, priceSource, freshnessDays }) {
  if (!canCalculate) return "UNAVAILABLE";
  if (priceSource === "today" && freshnessDays === 0) return "HIGH";
  if (freshnessDays === 1) return "MEDIUM-HIGH";
  if (Number.isFinite(freshnessDays) && freshnessDays >= 2 && freshnessDays <= 5) return "MEDIUM";
  return "LOW";
}

function getDecisionTone(decision) {
  if (decision === "CANNOT_GENERATE") return { card: "bg-slate-100 text-slate-900", label: "text-slate-700" };
  if (decision === "NOT_PROFITABLE") return { card: "bg-red-100 text-red-900", label: "text-red-700" };
  if (decision === "MARGINAL") return { card: "bg-yellow-100 text-yellow-900", label: "text-yellow-700" };
  return { card: "bg-green-100 text-green-900", label: "text-green-700" };
}

function formatRange(min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "—";
  return `₹${Math.round(min).toLocaleString("en-IN")}–₹${Math.round(max).toLocaleString("en-IN")}`;
}

function calculateTradeMetrics({ canCalculate, mandiPricePerKg, selectedCountry, quantity }) {
  if (!canCalculate) {
    return {
      estimatedSellPrice: null,
      indicativeSellPricePerKg: null,
      breakEvenSellingPricePerKg: null,
      marginRangePerKg: null,
      totalMarginRange: null,
      decision: "CANNOT_GENERATE",
      riskLevel: "N/A",
      confidenceLevel: "LOW",
      delayRiskLevel: null,
      keyReasons: [],
    };
  }

  const estimatedSellPrice = mandiPricePerKg * selectedCountry.multiplier;
  const realizedSellPrice = estimatedSellPrice * selectedCountry.realizationFactor;
  const breakEvenSellingPricePerKg = mandiPricePerKg + selectedCountry.cost;
  const baseMarginPerKg = realizedSellPrice - breakEvenSellingPricePerKg;
  const uncertaintyBuffer = Math.max(1.2, estimatedSellPrice * (0.05 + (selectedCountry.transitDays > 9 ? 0.02 : 0)));

  const marginRangePerKg = { min: baseMarginPerKg - uncertaintyBuffer, max: baseMarginPerKg + uncertaintyBuffer };
  const totalMarginRange = { min: marginRangePerKg.min * quantity, max: marginRangePerKg.max * quantity };

  let decision = "NOT_PROFITABLE";
  if (marginRangePerKg.min > 2) decision = "PROFITABLE";
  else if (marginRangePerKg.max > 0) decision = "MARGINAL";

  let riskLevel = "HIGH";
  if (selectedCountry.transitDays <= 5 && marginRangePerKg.min > 2) riskLevel = "LOW";
  else if (selectedCountry.transitDays <= 9 && marginRangePerKg.max > 1) riskLevel = "MEDIUM";

  let confidenceLevel = "LOW";
  if (marginRangePerKg.min > 2 && selectedCountry.transitDays <= 8) confidenceLevel = "HIGH";
  else if (marginRangePerKg.max > 0) confidenceLevel = "MEDIUM";

  const delayRiskLevel = selectedCountry.transitDays >= 10 ? "high" : selectedCountry.transitDays >= 6 ? "medium" : "low";
  const keyReasons = [
    { key: "realization", value: Math.round(selectedCountry.realizationFactor * 100) },
    { key: "transit", value: selectedCountry.transitDays },
    { key: "breakEven", value: breakEvenSellingPricePerKg.toFixed(2) },
  ];

  return { estimatedSellPrice, indicativeSellPricePerKg: realizedSellPrice, breakEvenSellingPricePerKg, marginRangePerKg, totalMarginRange, decision, riskLevel, confidenceLevel, delayRiskLevel, keyReasons };
}

export default function Trade() {
  const { t, language } = useLanguage();
  const [cropList, setCropList] = useState([]);
  const [selectedCrop, setSelectedCrop] = useState("");
  const [cropLoading, setCropLoading] = useState(true);
  const [quantity, setQuantity] = useState(DEFAULT_QUANTITY);
  const [country, setCountry] = useState(COUNTRIES[0].id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mandis, setMandis] = useState([]);
  const [tradeFreshnessDays, setTradeFreshnessDays] = useState(null);
  const [shareMessage, setShareMessage] = useState("");
  const inputSectionRef = useRef(null);
  const lastTrackedTradeRef = useRef("");
  const hasLowMandiAvailability = selectedCrop && !loading && !error && mandis.length > 0 && mandis.length <= 2;

  useEffect(() => {
    let cancelled = false;
    async function loadCrops() {
      setCropLoading(true);
      const crops = await fetchAvailableCrops("Maharashtra");
      if (cancelled) return;
      setCropList(crops);
      setSelectedCrop((prev) => (prev && crops.some((crop) => crop.id === prev) ? prev : crops[0]?.id || ""));
      setCropLoading(false);
    }
    loadCrops();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadMandis() {
      if (!selectedCrop) {
        setMandis([]);
        return;
      }
      setLoading(true);
      setError(null);
      const result = await fetchCompare(selectedCrop, "Maharashtra", 5);
      if (cancelled) return;
      if (result?.source === "error" || !Array.isArray(result?.mandis)) {
        setMandis([]);
        setError(t.tradeCannotGenerateDecision);
        setLoading(false);
        return;
      }
      const sortedMandis = result.mandis
        .map((item) => {
          const todayPrice = parsePrice(item?.todayPrice);
          const recentPrice = parsePrice(item?.avgPrice ?? item?.price ?? item?.modal_price ?? item?.latestPrice);
          const effectivePrice = todayPrice ?? recentPrice;
          const priceSource = todayPrice !== null ? "today" : recentPrice !== null ? "recent" : "unavailable";
          const freshnessDays = priceSource === "today" ? 0 : Number.isFinite(item?.freshnessDays) ? item.freshnessDays : Number.isFinite(result?.freshnessDays) ? result.freshnessDays : null;
          return { ...item, todayPrice, recentPrice, effectivePrice, priceSource, freshnessDays };
        })
        .filter((item) => item.mandi && item.effectivePrice !== null)
        .sort((a, b) => b.effectivePrice - a.effectivePrice)
        .slice(0, 3);
      if (sortedMandis.length === 0) setError(t.tradeCannotGenerateDecision);
      setMandis(sortedMandis);
      setTradeFreshnessDays(Number.isFinite(result?.freshnessDays) ? result.freshnessDays : (sortedMandis[0]?.freshnessDays ?? null));
      setLoading(false);
    }
    loadMandis();
    return () => { cancelled = true; };
  }, [selectedCrop, t.tradeCannotGenerateDecision]);

  const selectedCountry = COUNTRIES.find((c) => c.id === country) || COUNTRIES[0];
  const bestMandi = mandis[0] ?? null;
  const baseMandiPricePerQuintal = mandis[0]?.effectivePrice ?? null;
  const baseMandiPricePerKg = baseMandiPricePerQuintal !== null ? baseMandiPricePerQuintal / 100 : null;
  const safeQuantity = Number.isFinite(Number(quantity)) && Number(quantity) > 0 ? Number(quantity) : 0;
  const dataCompleteness = mandis.length >= 3 ? "HIGH" : mandis.length >= 2 ? "MEDIUM" : "LOW";
  const hasReliableMandiCoverage = mandis.length > 0;
  const canCalculate = baseMandiPricePerKg !== null && safeQuantity > 0 && !loading && !error && hasReliableMandiCoverage;
  const rawDataConfidence = getDataConfidence({ canCalculate, priceSource: bestMandi?.priceSource, freshnessDays: bestMandi?.freshnessDays ?? tradeFreshnessDays });
  const isTradeFallbackMode = !loading && !error && bestMandi && bestMandi.priceSource !== "today";
  const showReliabilityWarning = !loading && !error && mandis.length > 0 && bestMandi?.priceSource !== "today";
  const dataConfidence = showReliabilityWarning ? "LOW" : rawDataConfidence;
  const mandiHeadingLabel = bestMandi?.priceSource === "recent" ? t.tradeBestMandiRecentData : t.tradeBestMandisTop3;
  const calculations = useMemo(() => calculateTradeMetrics({ canCalculate, mandiPricePerKg: baseMandiPricePerKg ?? 0, selectedCountry, quantity: safeQuantity }), [canCalculate, baseMandiPricePerKg, selectedCountry, safeQuantity]);
  const dataConfidenceLabel = dataConfidence === "HIGH" ? t.confidenceHigh : dataConfidence === "MEDIUM-HIGH" ? t.confidenceMediumHigh : dataConfidence === "MEDIUM" ? t.confidenceMedium : dataConfidence === "LOW" ? t.confidenceLow : t.dataStatusUpdating;
  const dataCompletenessLabel = dataCompleteness === "HIGH" ? t.confidenceHigh : dataCompleteness === "MEDIUM" ? t.confidenceMedium : t.confidenceLow;
  const riskLevelLabel = calculations.riskLevel === "LOW" ? t.confidenceLow : calculations.riskLevel === "MEDIUM" ? t.confidenceMedium : calculations.riskLevel === "HIGH" ? t.confidenceHigh : t.naLabel;
  const delayRiskNote = calculations.delayRiskLevel === "high" ? t.tradeDelayRiskHigh : calculations.delayRiskLevel === "medium" ? t.tradeDelayRiskMedium : calculations.delayRiskLevel === "low" ? t.tradeDelayRiskLow : null;
  const decisionTone = getDecisionTone(calculations.decision);
  const decisionLabel = calculations.decision === "PROFITABLE" ? t.tradeDecisionProfitable : calculations.decision === "MARGINAL" ? t.tradeDecisionMarginal : calculations.decision === "CANNOT_GENERATE" ? t.tradeCannotGenerateDecision : t.tradeDecisionNotProfitable;
  const selectedCropName = cropList.find((crop) => crop.id === selectedCrop)?.name || selectedCrop;

  useEffect(() => {
    if (!selectedCrop || !bestMandi?.mandi || !canCalculate) return;
    const tradeKey = `${selectedCrop}|${bestMandi.mandi}|${country}|${safeQuantity}|${calculations.decision}`;
    if (lastTrackedTradeRef.current === tradeKey) return;
    lastTrackedTradeRef.current = tradeKey;
    trackEvent("trade_profit_calculated", { page: "/trade", language, crop: selectedCrop, state: "Maharashtra", mandi: bestMandi.mandi, meta: { destinationCountry: selectedCountry.name, quantity: safeQuantity } });
  }, [bestMandi?.mandi, calculations.decision, canCalculate, country, language, safeQuantity, selectedCountry.name, selectedCrop]);

  async function handleShareTradeResult() {
    const shareText = `${t.tradeShareTitle}\n\n${t.cropLabel}: ${selectedCropName}\n${t.tradeDestinationCountry}: ${selectedCountry.name}\n${t.tradeEstimatedMarginRange}: ${formatRange(calculations.totalMarginRange?.min, calculations.totalMarginRange?.max)}\n${t.tradeDecision}: ${decisionLabel}\n${t.confidence}: ${dataConfidenceLabel}\n\n${t.tradeCheckLinkLabel}:\nhttps://mandimind.pages.dev/trade`;
    const result = await shareResult({ title: t.tradeShareTitle, text: shareText, url: "https://mandimind.pages.dev/trade", fallbackSuccessMessage: t.resultCopiedToClipboard });
    setShareMessage(result.message);
    window.setTimeout(() => setShareMessage(""), 2500);
  }

  function handleCheckAnotherTrade() {
    setSelectedCrop(cropList[0]?.id || "");
    setQuantity(DEFAULT_QUANTITY);
    setCountry(COUNTRIES[0].id);
    setShareMessage("");
    inputSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="min-h-screen bg-[#fff9eb] pb-24">
      <div ref={inputSectionRef} className="px-4 pt-6 pb-4">
        <div className="mb-4 space-y-2">
          <h1 className="text-[30px] leading-tight sm:text-4xl font-extrabold text-[#004c22] tracking-tight break-words" style={{ fontFamily: "Manrope, sans-serif" }}>
            <span className="block">{t.tradeHeroLine1}</span>
            <span className="block">{t.tradeHeroLine2}</span>
          </h1>
          <p className="text-sm sm:text-base text-[#1e1c10]">{t.tradeHeroDesc}</p>
          <p className="text-xs sm:text-sm text-gray-500">{t.tradeHeroSubDesc}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t.cropLabel}</label>
            <select value={selectedCrop} onChange={(e) => setSelectedCrop(e.target.value)} disabled={cropLoading} className="w-full bg-white border border-gray-300 rounded-xl px-3 py-3 text-sm text-[#1e1c10] outline-none focus:border-[#004c22]" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {cropLoading && <option value="">{t.loadingAvailableCrops}</option>}
              {cropList.map((crop) => <option key={crop.id} value={crop.id}>{crop.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t.tradeQuantityKg}</label>
            <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value === "" ? "" : Number(e.target.value))} className="w-full bg-white border border-gray-300 rounded-xl px-3 py-3 text-sm text-[#1e1c10] outline-none focus:border-[#004c22]" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t.tradeDestinationCountry}</label>
            <select value={country} onChange={(e) => setCountry(e.target.value)} className="w-full bg-white border border-gray-300 rounded-xl px-3 py-3 text-sm text-[#1e1c10] outline-none focus:border-[#004c22]">
              {COUNTRIES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          {error && <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1"><p className="text-sm text-amber-800 font-semibold">{t.tradeCannotGenerateDecision}</p><p className="text-xs text-amber-700">{t.noMandiGuidance}</p></div>}
          {showReliabilityWarning && <div className="bg-amber-50 border border-amber-200 rounded-lg p-3"><p className="text-sm text-amber-800 font-semibold">{t.tradeUsingLatestAvailableData}</p></div>}
          {hasLowMandiAvailability && <p className="text-xs text-amber-700 font-medium">{t.lowCropAvailabilityWarning}</p>}
        </div>
      </div>

      <div className="px-4 space-y-4">
        <section className="bg-[#004c22] rounded-xl p-4 text-white">
          <p className="text-xs text-green-100">{t.tradeDecision}</p>
          <p className="text-3xl font-extrabold mt-1">{decisionLabel}</p>
          <div className="grid grid-cols-2 gap-2 mt-4 text-center">
            <div className={`${decisionTone.card} rounded-lg p-2`}><p className={`text-[10px] ${decisionTone.label}`}>{t.tradeEstimatedMarginRange}</p><p className="text-xs font-bold">{calculations.marginRangePerKg ? `₹${calculations.marginRangePerKg.min.toFixed(1)} to ₹${calculations.marginRangePerKg.max.toFixed(1)}/kg` : "—"}</p></div>
            <div className={`${decisionTone.card} rounded-lg p-2`}><p className={`text-[10px] ${decisionTone.label}`}>{t.tradeRiskLevel}</p><p className="text-sm font-bold">{riskLevelLabel}</p></div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2 text-center">
            <div className="bg-white/10 rounded-lg p-2"><p className="text-[10px] text-green-100">{t.confidence}</p><p className="text-lg font-extrabold tracking-wide">{dataConfidenceLabel}</p></div>
            <div className="bg-white/10 rounded-lg p-2"><p className="text-[10px] text-green-100">{t.tradeDataCompleteness}</p><p className="text-lg font-extrabold tracking-wide">{dataCompletenessLabel}</p></div>
          </div>
          <p className="text-[11px] text-green-100 mt-3 leading-relaxed">{t.tradeApproximationNote}</p>
          {delayRiskNote && <p className="text-[11px] text-green-100/90 mt-2">{delayRiskNote}</p>}
          {!canCalculate && <p className="text-xs text-green-100 mt-3">{t.tradeCannotGenerateDecision}</p>}
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="text-base font-bold text-[#1e1c10] mb-3">{mandiHeadingLabel}</h2>
          {loading ? <p className="text-sm text-gray-500">{t.loadingMandiPrices}</p> : mandis.length === 0 ? <div className="space-y-1"><p className="text-sm text-gray-700">{t.tradeCannotGenerateDecision}</p><p className="text-xs text-gray-500">{t.noMandiGuidance}</p></div> : <div className="space-y-2">{mandis.map((mandi, index) => <div key={`${mandi.mandi}-${index}`} className="flex justify-between items-center bg-[#f8fafc] rounded-lg px-3 py-2"><p className="text-sm font-medium text-[#1e1c10]">{index + 1}. {mandi.mandi}</p><p className="text-sm font-bold text-[#004c22]">₹{mandi.effectivePrice.toLocaleString("en-IN")}/quintal (₹{(mandi.effectivePrice / 100).toFixed(2)}/kg)</p></div>)}</div>}
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="text-base font-bold text-[#1e1c10] mb-3">{t.tradeBreakdown}</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">{t.tradeBuyPrice}</span><span className="font-semibold">{baseMandiPricePerQuintal !== null ? `₹${baseMandiPricePerQuintal.toFixed(2)}/quintal (₹${baseMandiPricePerKg?.toFixed(2)}/kg)` : "—"}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">{t.tradeSellEstimate}</span><span className="font-semibold">{calculations.estimatedSellPrice !== null ? `₹${calculations.estimatedSellPrice.toFixed(2)}/kg` : "—"}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">{t.tradeRealizationApplied}</span><span className="font-semibold">{Math.round(selectedCountry.realizationFactor * 100)}%</span></div>
            <div className="flex justify-between"><span className="text-gray-500">{t.tradeTransitTime}</span><span className="font-semibold">{selectedCountry.transitDays} {t.tradeDays}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">{t.tradeCost}</span><span className="font-semibold">₹{selectedCountry.cost.toFixed(2)}/kg</span></div>
            <div className="flex justify-between pt-2 border-t border-gray-100"><span className="text-gray-700 font-medium">{t.tradeBreakEvenPrice}</span><span className="font-bold text-[#004c22]">{calculations.breakEvenSellingPricePerKg !== null ? `₹${calculations.breakEvenSellingPricePerKg.toFixed(2)}/kg` : "—"}</span></div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-1 text-[11px] text-gray-500"><p>{t.dataStatusSourceLine}</p><p>{t.dataStatusCoverageLine}</p><p>{t.dataStatusModeLine}</p><p>{t.dataStatusLabel}: {getFreshnessMessage(tradeFreshnessDays, t)}</p>{isTradeFallbackMode && <p className="text-amber-700 font-medium">{t.tradeUsingLatestAvailableData}</p>}</div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="text-base font-bold text-[#1e1c10] mb-3">{t.tradeKeyReasons}</h2>
          <div className="space-y-3 text-sm">{calculations.keyReasons.map((reason) => <p key={reason.key} className="bg-[#f8fafc] rounded-lg px-3 py-2 text-gray-700">• {reason.key === "realization" ? t.tradeReasonRealization.replace("{percent}", reason.value) : reason.key === "transit" ? t.tradeReasonTransit.replace("{days}", reason.value) : t.tradeReasonBreakEven.replace("{price}", reason.value)}</p>)}</div>
          {!canCalculate && <p className="text-xs text-gray-500 mt-3">{t.tradeExplainMissingData}</p>}
        </section>

        <section className="space-y-2">
          <button onClick={handleShareTradeResult} disabled={!canCalculate} className="w-full bg-white border border-[#004c22] text-[#004c22] font-bold py-3 rounded-xl active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed" style={{ fontFamily: "Manrope, sans-serif", minHeight: "52px" }}>{t.tradeShareResult}</button>
          {shareMessage && <p className="text-center text-xs text-gray-600">{shareMessage}</p>}
          <p className="text-center text-sm text-[#1e1c10]">{t.tradeTryCropMandiProfitLine}</p>
          <button onClick={handleCheckAnotherTrade} className="w-full bg-[#004c22] text-white font-bold py-3 rounded-xl active:scale-[0.98] transition-transform" style={{ fontFamily: "Manrope, sans-serif", minHeight: "52px" }}>{t.tradeCheckAnother}</button>
        </section>
      </div>
    </div>
  );
}
