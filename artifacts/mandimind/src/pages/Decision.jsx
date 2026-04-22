import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { getCropById } from "../data/mockPrices";
import { getDecision, getDecisionStrengthModel } from "../utils/decisionEngine";
import { fetchPrices, fetchCompare } from "../utils/api";
import { getMandiAvailabilityFromRecords } from "../utils/mandiAvailability";
import { shareResult } from "../utils/shareResult";
import { trackEvent } from "../lib/analytics";
import { useSpeechAssistant } from "../hooks/useSpeechAssistant";
import DecisionCard from "../components/DecisionCard";
import TrendChart from "../components/TrendChart";

export default function Decision() {
  const { t, language } = useLanguage();
  const { speakText, stopSpeaking, speaking, isSupported, selectedVoiceLang } = useSpeechAssistant();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [shareMessage, setShareMessage] = useState("");
  const lastTrackedRecommendationRef = useRef("");

  const cropId   = searchParams.get("crop")     || "onion";
  const mandi    = searchParams.get("mandi")    || "";
  const stateVal = searchParams.get("state")    || "Maharashtra";
  const variety  = searchParams.get("variety")  || "";
  const quality  = searchParams.get("quality")  || "medium";
  const harvest  = searchParams.get("harvest")  || "ready";
  const storage  = searchParams.get("storage")  || "yes";
  const urgency  = searchParams.get("urgency")  || "flexible";
  const quantity = searchParams.get("quantity") || "0";

  const cropInfo = getCropById(cropId);
  const formatTemplate = (template, params) =>
    Object.entries(params).reduce(
      (result, [key, value]) => result.replace(new RegExp(`\\{${key}\\}`, "g"), value),
      template
    );

  // ── Live price data from Cloudflare Worker (/api/prices) ─────────────────
  const [livePrices, setLivePrices] = useState(null);
  const [liveCurrent, setLiveCurrent] = useState(null);
  const [liveRange, setLiveRange] = useState(null);
  const [liveError, setLiveError] = useState("");

  useEffect(() => {
    if (!cropId || !mandi) {
      setLivePrices(null);
      setLiveCurrent(null);
      setLiveRange(null);
      setLiveError("");
      return;
    }

    setLiveError("");
    fetchPrices(cropId, mandi, stateVal, 30).then((res) => {
      if (res?.source === "error" || res?.error) {
        const message = res?.error || t.liveMandiTemporarilyUnavailable;
        console.error("[MandiMind] Decision prices:", message);
        setLivePrices([]);
        setLiveCurrent(null);
        setLiveRange(null);
        setLiveError(message);
        return;
      }

      setLivePrices(Array.isArray(res?.data) ? res.data : []);
      setLiveCurrent(Number.isFinite(res?.currentPrice) ? res.currentPrice : null);
      setLiveRange(res?.priceRange || null);
    });
  }, [cropId, mandi, stateVal, t.liveMandiTemporarilyUnavailable]);

  // Prices used for decision engine: prefer live, fallback to empty
  const prices = useMemo(
    () => (livePrices ?? []).map((r) => ({ price: r.modal_price ?? r.price, date: r.date })),
    [livePrices]
  );

  const localResult = useMemo(
    () => getDecision(prices, { quality, harvest, storage, urgency, variety, cropId }),
    [prices, quality, harvest, storage, urgency, variety, cropId]
  );

  const mandiDataStatus = useMemo(() => {
    const availability = getMandiAvailabilityFromRecords(livePrices, { maxFreshnessDays: 3 });
    if (!availability.isUsable) return { type: "unavailable", isUsable: false };
    return {
      ...availability,
      type: availability.bucket === "live_today" ? "today" : "fallback_recent",
    };
  }, [livePrices]);

  // ── Mandi comparison from Cloudflare Worker (/api/compare) ───────────────
  const [mandiCompare, setMandiCompare] = useState([]);
  const [compareMeta, setCompareMeta] = useState({
    confidenceScore: null,
    source: "fallback",
    freshnessDays: null,
    priceVariance: null,
  });
  const [compareLoading, setCompareLoading] = useState(true);
  const [compareError, setCompareError] = useState("");

  useEffect(() => {
    if (!cropId) {
      setMandiCompare([]);
      setCompareLoading(false);
      setCompareError("");
      return;
    }

    setCompareLoading(true);
    setCompareError("");

    fetchCompare(cropId, stateVal, 7)
      .then((res) => {
        if (res?.source === "error" || res?.error) {
          const message = res?.error || t.liveMandiTemporarilyUnavailable;
          console.error("[MandiMind] fetchCompare error:", message);
          setCompareError(message);
          setMandiCompare([]);
          setCompareMeta({
            confidenceScore: null,
            source: "fallback",
            freshnessDays: null,
            priceVariance: null,
          });
        } else if (res.mandis?.length) {
          setMandiCompare(res.mandis);
          setCompareMeta({
            confidenceScore: Number.isFinite(res.confidenceScore) ? res.confidenceScore : null,
            source: res.source || "fallback",
            freshnessDays: Number.isFinite(res.freshnessDays) ? res.freshnessDays : null,
            priceVariance: Number.isFinite(res.priceVariance) ? res.priceVariance : null,
          });
        } else {
          setMandiCompare([]);
          setCompareMeta({
            confidenceScore: null,
            source: res.source || "fallback",
            freshnessDays: Number.isFinite(res.freshnessDays) ? res.freshnessDays : null,
            priceVariance: Number.isFinite(res.priceVariance) ? res.priceVariance : null,
          });
        }
      })
      .catch((err) => {
        console.error("[MandiMind] fetchCompare caught:", err);
        setCompareError(t.liveMandiTemporarilyUnavailable);
        setMandiCompare([]);
        setCompareMeta({
          confidenceScore: null,
          source: "fallback",
          freshnessDays: null,
          priceVariance: null,
        });
      })
      .finally(() => setCompareLoading(false));
  }, [cropId, stateVal, t.liveMandiTemporarilyUnavailable]);

  const hasUsableMandiData = mandiDataStatus.isUsable;
  const usesTodayData = mandiDataStatus.type === "today";
  const usesFallbackData = mandiDataStatus.type === "fallback_recent";
  const forceNotEnoughData = !hasUsableMandiData;

  const currentPrice = hasUsableMandiData
    ? (mandiDataStatus.selectedPrice ?? liveCurrent ?? localResult.currentPrice)
    : null;
  const priceRangeLow = hasUsableMandiData ? (liveRange?.low ?? localResult.priceRange.min) : null;
  const priceRangeHigh = hasUsableMandiData ? (liveRange?.high ?? localResult.priceRange.max) : null;

  const decisionResult = forceNotEnoughData
    ? {
        ...localResult,
        decision: "NOT ENOUGH DATA",
        explanation: {
          ...localResult.explanation,
          trend: t.noRecentMandiDataForCropMandi,
        },
      }
    : localResult;

  useEffect(() => {
    if (!cropId || !mandi || !decisionResult?.decision) return;
    const recommendationKey = `${cropId}|${mandi}|${stateVal}|${decisionResult.decision}`;
    if (lastTrackedRecommendationRef.current === recommendationKey) return;
    lastTrackedRecommendationRef.current = recommendationKey;
    trackEvent("recommendation_generated", {
      page: "/",
      language,
      crop: cropId,
      state: stateVal,
      mandi,
      meta: { recommendation: decisionResult.decision },
    });
  }, [cropId, decisionResult?.decision, language, mandi, stateVal]);

  const formatPrice = (value) => (
    Number.isFinite(value) ? `₹${value.toLocaleString("en-IN")}` : t.dataUnavailable
  );

  const formatRoundedPrice = (value) => (
    Number.isFinite(value) ? `₹${Math.round(value).toLocaleString("en-IN")}` : t.dataUnavailable
  );

  const trendText =
    decisionResult.trend === "RISING" ? t.rising
      : decisionResult.trend === "FALLING" ? t.falling
        : t.stable;

  const trendClass =
    decisionResult.trend === "RISING" ? "bg-green-100 text-green-700"
      : decisionResult.trend === "FALLING" ? "bg-red-100 text-red-700"
        : "bg-gray-100 text-gray-700";

  const totalValue = Number(quantity) > 0 && Number.isFinite(currentPrice)
    ? `₹${(currentPrice * Number(quantity)).toLocaleString("en-IN")}`
    : null;

  const bestOpportunity = mandiCompare.length > 0 ? mandiCompare[0] : null;
  const selectedMandiSummary = mandiCompare.find(
    (row) => (row?.mandi || "").toLowerCase() === mandi.toLowerCase()
  ) || null;
  const spread = bestOpportunity && Number.isFinite(bestOpportunity.todayPrice) && Number.isFinite(currentPrice)
    ? bestOpportunity.todayPrice - currentPrice
    : null;
  const decisionStrength = getDecisionStrengthModel({
    spread,
    variance7d: selectedMandiSummary?.variance7d ?? compareMeta.priceVariance,
    confidenceScore: compareMeta.confidenceScore ?? decisionResult.score,
    source: compareMeta.source,
    freshnessDays: compareMeta.freshnessDays,
    mandiCount: mandiCompare.length,
  });
  const coverageCount = mandiCompare.length > 0 ? mandiCompare.length : (mandi ? 1 : 0);
  const decisionUrgency = urgency === "need_money"
    ? { label: t.high, className: "bg-red-100 text-red-700 border-red-200" }
    : urgency === "flexible"
      ? { label: t.medium, className: "bg-amber-100 text-amber-700 border-amber-200" }
      : { label: t.low, className: "bg-green-100 text-green-700 border-green-200" };

  const uncertaintyConditions = forceNotEnoughData
    ? t.uncertaintyNoRecentData
    : usesFallbackData
      ? formatTemplate(t.uncertaintyFallbackData, { days: mandiDataStatus.freshnessDays })
      : t.uncertaintyLiveData;
  const bestOpportunityText = (() => {
    if (!bestOpportunity || !Number.isFinite(bestOpportunity.todayPrice)) {
      return t.bestOpportunityUnavailable;
    }

    const selectedComparablePrice = Number.isFinite(currentPrice) ? currentPrice : null;
    const priceEdge = selectedComparablePrice == null
      ? null
      : Math.round(bestOpportunity.todayPrice - selectedComparablePrice);

    if (priceEdge == null) {
      return formatTemplate(t.bestOpportunityHighestQuoted, { mandi: bestOpportunity.mandi });
    }

    if (priceEdge > 0) {
      return formatTemplate(t.bestOpportunityMorePerQuintal, {
        mandi: bestOpportunity.mandi,
        amount: priceEdge.toLocaleString("en-IN"),
      });
    }

    if (priceEdge === 0) {
      return formatTemplate(t.bestOpportunityMatchesPrice, { mandi: bestOpportunity.mandi });
    }

    return formatTemplate(t.selectedMandiAlreadyStronger, {
      mandi: bestOpportunity.mandi,
      amount: Math.abs(priceEdge).toLocaleString("en-IN"),
    });
  })();

  async function handleShareDecision() {
    const shareText = `${t.shareTitle}

${t.cropLabel}: ${cropInfo.name.split(" / ")[0]}
${t.mandiLabel}: ${mandi}
${t.currentPrice}: ${Number.isFinite(currentPrice) ? `₹${currentPrice.toLocaleString("en-IN")}` : t.dataUnavailable}
${t.decisionLabel}: ${decisionResult.decision}
${t.reasonLabel}: ${decisionResult.explanation?.trend || t.naLabel}

${t.checkOnMandimind}:
https://mandimind.pages.dev/`;

    const result = await shareResult({
      title: t.shareTitle,
      text: shareText,
      url: "https://mandimind.pages.dev/",
      fallbackSuccessMessage: t.resultCopiedToClipboard,
    });

    setShareMessage(result.message);
    window.setTimeout(() => setShareMessage(""), 2500);
  }

  return (
    <div className="min-h-screen bg-[#fff9eb] pb-24">
      <div className="px-4 pt-6 pb-4">
        <button onClick={() => navigate(-1)}
          className="text-sm text-[#004c22] font-medium mb-3"
          style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
          {t.back}
        </button>
        <h1 className="text-2xl font-extrabold text-[#004c22] mb-0.5"
          style={{ fontFamily: "Manrope, sans-serif" }}>
          {t.decision}
        </h1>
        <p className="text-sm text-gray-400" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
          {cropInfo.name.split(" / ")[0]}{variety ? ` · ${variety}` : ""} — {mandi} · {stateVal}
        </p>
      </div>

      <div className="px-4 space-y-4">
        <DecisionCard
          decision={decisionResult.decision}
          score={decisionResult.score}
          confidenceScore={decisionStrength.confidenceScore}
          classification={decisionStrength.classification}
          keyReasons={decisionStrength.keyReasons}
          riskExplanation={decisionStrength.riskExplanation}
          confidencePenalty={usesFallbackData ? 1 : 0}
          disallowHighConfidence={usesFallbackData}
        />

        {/* Data source status badge */}
        {usesTodayData ? (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
            <span className="text-green-500">✓</span>
            <p className="text-xs text-green-700" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {t.liveDataAgmarknet}
            </p>
          </div>
        ) : usesFallbackData ? (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
            <span className="text-amber-500">⚠</span>
            <p className="text-xs text-amber-700" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {t.latestAvailableDataAgmarknet}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
            <span className="text-red-500">✕</span>
            <p className="text-xs text-red-700" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {t.dataUnavailable}
            </p>
          </div>
        )}

        {/* Price summary card */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">{t.trendLabel}</span>
            <span className={`text-sm font-bold px-3 py-1 rounded-full ${trendClass}`}>{trendText}</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: t.currentPriceLabel, value: formatPrice(currentPrice), accent: false },
              { label: t.sevenDayLow, value: formatRoundedPrice(priceRangeLow), accent: "green" },
              { label: t.fifteenDayHigh, value: formatRoundedPrice(priceRangeHigh), accent: "yellow" },
            ].map((item) => (
              <div key={item.label}
                className={`rounded-xl p-3 text-center ${
                  item.accent === "green" ? "bg-green-50"
                    : item.accent === "yellow" ? "bg-yellow-50" : "bg-gray-50"
                }`}>
                <p className="text-[10px] text-gray-400 mb-0.5">{item.label}</p>
                <p className={`text-base font-extrabold ${
                  item.accent === "green" ? "text-green-700"
                    : item.accent === "yellow" ? "text-yellow-700" : "text-[#004c22]"
                }`} style={{ fontFamily: "Manrope, sans-serif" }}>
                  {item.value}
                </p>
                <p className="text-[10px] text-gray-400">{t.per}</p>
              </div>
            ))}
          </div>

          {/* Data source badge */}
          <div className="flex items-center justify-between border-t border-gray-50 pt-2">
            <span className="text-[10px] text-gray-400">
              {usesTodayData
                ? t.updatedToday
                : usesFallbackData
                  ? formatTemplate(t.dateUsedFreshness, { date: mandiDataStatus.usedDate, days: mandiDataStatus.freshnessDays })
                  : t.dataUnavailable}
            </span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              usesTodayData
                ? "text-green-600 bg-green-50"
                : usesFallbackData
                  ? "text-amber-600 bg-amber-50"
                  : "text-red-600 bg-red-50"
            }`}>
              {usesTodayData
                ? `● ${t.liveDataAgmarknet}`
                : usesFallbackData
                  ? `● ${t.latestAvailableDataAgmarknet}`
                  : `● ${t.dataUnavailable}`}
            </span>
          </div>

          {decisionResult.variantOffset !== 0 && variety && (
            <div className="flex justify-between items-center pt-1 border-t border-gray-100">
              <span className="text-sm text-gray-500">{variety} {t.premiumLabel}</span>
              <span className={`text-sm font-semibold ${decisionResult.variantOffset > 0 ? "text-green-600" : "text-red-600"}`}>
                {decisionResult.variantOffset > 0 ? "+" : ""}₹{decisionResult.variantOffset.toLocaleString("en-IN")}
              </span>
            </div>
          )}

          {totalValue && (
            <div className="flex justify-between items-center border-t border-gray-100 pt-3">
              <span className="text-sm text-gray-500">{formatTemplate(t.quintalTotal, { quantity })}</span>
              <span className="text-base font-bold text-[#004c22]" style={{ fontFamily: "Manrope, sans-serif" }}>
                {totalValue}
              </span>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 space-y-3">
          <h3 className="text-base font-bold text-[#1e1c10]" style={{ fontFamily: "Manrope, sans-serif" }}>
            {t.estimatedImpact}
          </h3>
          <p className={`text-sm font-semibold ${
            decisionResult.estimatedImpact?.direction === "positive"
              ? "text-green-700"
              : decisionResult.estimatedImpact?.direction === "negative"
                ? "text-red-700"
                : "text-amber-700"
          }`} style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
            {decisionResult.estimatedImpact?.summary || t.estimatedImpactDefault}
          </p>
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-bold uppercase text-[#004c22] mb-1">{t.bestOpportunity}</p>
            <p className="text-sm text-gray-700" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {bestOpportunityText}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 space-y-2">
          <h3 className="text-base font-bold text-[#1e1c10]" style={{ fontFamily: "Manrope, sans-serif" }}>
            {t.risksToWatch}
          </h3>
          <p className="text-sm text-red-700" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
            {decisionResult.risks?.mainRisk || t.mainRiskDefault}
          </p>
          <p className="text-sm text-amber-700" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
            {decisionResult.risks?.secondaryRisk || t.secondaryRiskDefault}
          </p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 space-y-3">
          <h3 className="text-base font-bold text-[#1e1c10]" style={{ fontFamily: "Manrope, sans-serif" }}>
            {t.trustAndTransparency}
          </h3>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{t.dataCoverage}</span>
            <span className="text-sm font-semibold text-[#004c22]">
              {formatTemplate(
                coverageCount === 1 ? t.mandiCoverageSingle : t.mandiCoveragePlural,
                { count: coverageCount }
              )}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{t.decisionUrgency}</span>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${decisionUrgency.className}`}>
              {decisionUrgency.label}
            </span>
          </div>

          <div className="border-t border-gray-100 pt-2">
            <p className="text-xs font-bold uppercase text-[#004c22] mb-1">{t.whenThisMayChange}</p>
            <p className="text-sm text-gray-700" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {uncertaintyConditions}
            </p>
          </div>

          <p className="text-xs text-gray-500 border-t border-gray-100 pt-2" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
            {t.guidanceNotGuarantee}
          </p>
        </div>

        {/* Decision explanation */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <h3 className="text-base font-bold text-[#1e1c10] mb-3" style={{ fontFamily: "Manrope, sans-serif" }}>
            {t.explanation}
          </h3>
          <div className="space-y-2">
            {[
              { label: t.trendLabel, value: decisionResult.explanation.trend },
              { label: t.qualityLabel, value: decisionResult.explanation.quality },
              { label: t.urgencyLabel, value: decisionResult.explanation.urgency },
              { label: t.storageLabel, value: decisionResult.explanation.storage },
              ...(decisionResult.explanation.variety
                ? [{ label: variety, value: decisionResult.explanation.variety }]
                : []),
            ].map((item) => (
              <div key={item.label} className="flex items-start gap-2 py-1 border-b border-gray-50 last:border-0">
                <span className="text-xs font-bold text-[#004c22] min-w-[80px] shrink-0 pt-0.5 uppercase">
                  {item.label}
                </span>
                <span className="text-sm text-gray-600" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top mandis for this crop (live from Worker /api/compare) */}
        {compareLoading ? (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 flex items-center gap-3">
            <div className="w-5 h-5 rounded-full border-2 border-[#004c22]/20 border-t-[#004c22] animate-spin" />
            <p className="text-xs text-gray-400" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {t.loadingMandiPrices}
            </p>
          </div>
        ) : compareError ? (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-xs text-red-700" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {t.unableToFetchLiveMandiData}
            </p>
            <p className="text-xs text-red-600 mt-1" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {compareError}
            </p>
          </div>
        ) : mandiCompare.length > 0 ? (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <h3 className="text-base font-bold text-[#1e1c10] mb-3" style={{ fontFamily: "Manrope, sans-serif" }}>
              {t.topMandis}
            </h3>
            <div className="space-y-2">
              {mandiCompare.slice(0, 5).map((m, idx) => (
                <div key={m.mandi || idx}
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${
                    idx === 0 ? "bg-[#004c22] text-white" : "bg-gray-50"
                  }`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center ${
                      idx === 0 ? "bg-[#feb234] text-[#004c22]" : "bg-gray-200 text-gray-600"
                    }`}>{idx + 1}</span>
                    <span className={`text-sm font-medium ${idx === 0 ? "text-white" : "text-gray-700"}`}>
                      {m.mandi}
                    </span>
                  </div>
                  <span className={`text-sm font-bold ${idx === 0 ? "text-[#feb234]" : "text-[#004c22]"}`}>
                    {formatPrice(m.todayPrice)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Price trend chart */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <h3 className="text-base font-bold text-[#1e1c10] mb-3" style={{ fontFamily: "Manrope, sans-serif" }}>
            {t.priceTrend} — {t.last30Days}
          </h3>
          {liveError && (
            <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <p className="text-xs text-amber-700" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                {liveError}
              </p>
            </div>
          )}
          <TrendChart data={prices} />
        </div>

        <section className="space-y-2">
          <button
            onClick={handleShareDecision}
            className="w-full bg-white border border-[#004c22] text-[#004c22] font-bold py-3 rounded-xl active:scale-[0.98] transition-transform"
            style={{ fontFamily: "Manrope, sans-serif", minHeight: "52px" }}
          >
            📤 {t.shareMandiDecision}
          </button>
          {shareMessage && (
            <p className="text-center text-xs text-gray-600">{shareMessage}</p>
          )}
        </section>

        <button
          onClick={() => navigate(`/compare?crop=${cropId}`)}
          className="w-full bg-[#004c22] text-white font-bold text-lg py-4 rounded-xl shadow-md active:scale-[0.98] transition-transform"
          style={{ fontFamily: "Manrope, sans-serif", minHeight: "56px" }}
        >
          {t.compareMandis}
        </button>
      </div>
    </div>
  );
}
