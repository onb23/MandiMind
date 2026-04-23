import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import SpeakerButton from "../components/SpeakerButton";
import { fetchAvailableCrops, fetchAvailableMandis } from "../utils/mandiAvailability";
import MandiCard from "../components/MandiCard";
import { trackEvent } from "../lib/analytics";
import { useSpeechAssistant } from "../hooks/useSpeechAssistant";

function ComparisonSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((item) => (
        <div key={item} className="rounded-2xl border border-gray-200/90 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] animate-pulse">
          <div className="flex justify-between mb-4">
            <div className="h-4 w-28 rounded skeleton-shimmer" />
            <div className="h-5 w-16 rounded-full skeleton-shimmer" />
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className="h-3 w-20 rounded skeleton-shimmer mb-2" />
              <div className="h-9 w-32 rounded skeleton-shimmer" />
            </div>
            <div>
              <div className="h-3 w-16 rounded skeleton-shimmer mb-2" />
              <div className="h-6 w-20 rounded skeleton-shimmer" />
            </div>
          </div>
          <div className="h-3 w-40 rounded skeleton-shimmer mt-4" />
        </div>
      ))}
    </div>
  );
}

export default function Comparison() {
  const { t, language } = useLanguage();
  const { speakText, stopSpeaking, speaking, isSupported, selectedVoiceLang } = useSpeechAssistant();
  const [searchParams] = useSearchParams();
  const initCrop = searchParams.get("crop") || "onion";
  const [selectedCrop, setSelectedCrop] = useState(initCrop);
  const [cropList, setCropList] = useState([]);
  const [cropLoading, setCropLoading] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [compareData, setCompareData] = useState(null);
  const [compareMode, setCompareMode] = useState("today");
  const lastTrackedSearchRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    async function loadCrops() {
      setCropLoading(true);
      const crops = await fetchAvailableCrops("Maharashtra");
      if (!cancelled) {
        setCropList(crops);
        if (crops.length > 0 && !crops.some((crop) => crop.id === selectedCrop)) {
          setSelectedCrop(crops[0].id);
        }
        setCropLoading(false);
      }
    }

    loadCrops();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedCrop) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(false);
      const result = await fetchAvailableMandis(selectedCrop, "Maharashtra");
      if (!cancelled) {
        if (result.source === "error") {
          setError(true);
          setCompareData(null);
        } else {
          setCompareData(result);
          const searchKey = `${selectedCrop}|Maharashtra`;
          if (lastTrackedSearchRef.current !== searchKey) {
            lastTrackedSearchRef.current = searchKey;
            trackEvent("compare_searched", {
              page: "/compare",
              language,
              crop: selectedCrop,
              state: "Maharashtra",
            });
          }
        }
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedCrop, language]);

  const selectedCropName = cropList.find((crop) => crop.id === selectedCrop)?.name || selectedCrop;
  const mandis = Array.isArray(compareData?.mandis) ? compareData.mandis : [];
  const backendRanked = Array.isArray(compareData?.rankedMandis) ? compareData.rankedMandis : [];
  const backendFallbackOld = Array.isArray(compareData?.fallbackOldMandis)
    ? compareData.fallbackOldMandis
    : Array.isArray(compareData?.fallbackOldRows)
      ? compareData.fallbackOldRows
      : [];
  const rankingBasis = compareData?.rankingBasis || "fresh_recent_only";
  const bestConfidence = typeof compareData?.bestConfidence === "string" ? compareData.bestConfidence.toLowerCase() : "low";
  const freshnessCounts = compareData?.freshnessCounts || null;
  const latestAvailableDate = compareData?.latestAvailableDate || compareData?.lastUpdated || null;
  const bestMandiId = compareData?.bestMandi || null;
  const bestMandiMessage = compareData?.bestMandiMessage || "";
  const coverageMessage = compareData?.coverageMessage || "";
  const scorePrice = (value) => (typeof value === "number" && value > 0 ? value : Number.NEGATIVE_INFINITY);
  const normalizeMandiItem = (item) => ({
    ...item,
    mandi: item?.mandi || "Unknown",
    modePrice: Number.isFinite(item?.todayPrice)
      ? item.todayPrice
      : Number.isFinite(item?.price)
        ? item.price
        : Number.isFinite(item?.avgPrice)
          ? item.avgPrice
        : null,
    avgPrice: Number.isFinite(item?.avgPrice) ? item.avgPrice : null,
    modeFreshnessDays: Number.isFinite(item?.freshnessDays) ? item.freshnessDays : null,
    freshnessBucket: typeof item?.freshnessBucket === "string" ? item.freshnessBucket : null,
  });
  const normalizedBackendRanked = backendRanked
    .map(normalizeMandiItem)
    .filter((item) => item.mandi !== "No mandi data")
    .sort((a, b) => {
      const byPrice = scorePrice(b.modePrice) - scorePrice(a.modePrice);
      if (byPrice !== 0) return byPrice;
      const byFreshness = (a.modeFreshnessDays ?? 999) - (b.modeFreshnessDays ?? 999);
      if (byFreshness !== 0) return byFreshness;
      return a.mandi.localeCompare(b.mandi);
    });
  const normalizedMandis = mandis
    .map(normalizeMandiItem)
    .filter((item) => item.mandi !== "No mandi data")
    .sort((a, b) => {
      const byPrice = scorePrice(b.modePrice) - scorePrice(a.modePrice);
      if (byPrice !== 0) return byPrice;
      const byFreshness = (a.modeFreshnessDays ?? 999) - (b.modeFreshnessDays ?? 999);
      if (byFreshness !== 0) return byFreshness;
      return a.mandi.localeCompare(b.mandi);
    });
  const primaryRankedSource = normalizedBackendRanked.length > 0 ? normalizedBackendRanked : normalizedMandis;
  const splitRanked = primaryRankedSource.reduce(
    (acc, item) => {
      const isOldFromBucket = item.freshnessBucket === "old" || item.freshnessBucket === "expired";
      const isOldFromDays = Number.isFinite(item.modeFreshnessDays) && item.modeFreshnessDays > 3;
      if (isOldFromBucket || isOldFromDays) {
        acc.old.push(item);
      } else {
        acc.decision.push(item);
      }
      return acc;
    },
    { decision: [], old: [] }
  );
  const rankedMandis = compareMode === "today"
    ? splitRanked.decision.filter((item) => item.modeFreshnessDays === 0 || Number.isFinite(item?.todayPrice))
    : splitRanked.decision;
  const normalizedFallback = [...backendFallbackOld, ...splitRanked.old]
    .map((item) => ({
      ...normalizeMandiItem(item),
      freshnessBucket: item?.freshnessBucket || "old",
    }))
    .filter((item, idx, arr) => arr.findIndex((row) => row.mandi === item.mandi) === idx)
    .sort((a, b) => {
      const byPrice = scorePrice(b.modePrice) - scorePrice(a.modePrice);
      if (byPrice !== 0) return byPrice;
      return a.mandi.localeCompare(b.mandi);
    });
  const lastUpdated = latestAvailableDate;
  const displayedMandis = rankedMandis;
  const bestMandiName = typeof bestMandiId === "string"
    ? bestMandiId
    : typeof bestMandiId?.mandi === "string"
      ? bestMandiId.mandi
      : null;
  const bestMandi = rankedMandis.find((item) => item.mandi === bestMandiName) || null;
  const showBestMandiBadge = bestConfidence === "high";
  const bestLabel = t.bestMandi;
  const comparableMandis = displayedMandis.filter((item) => Number.isFinite(item.todayPrice) && Number.isFinite(item.avgPrice));
  const avgTodayPrice = comparableMandis.length
    ? Math.round(comparableMandis.reduce((sum, item) => sum + item.todayPrice, 0) / comparableMandis.length)
    : null;
  const avgRecentPrice = comparableMandis.length
    ? Math.round(comparableMandis.reduce((sum, item) => sum + item.avgPrice, 0) / comparableMandis.length)
    : null;
  const hasInsightData = Number.isFinite(avgTodayPrice) && Number.isFinite(avgRecentPrice) && avgRecentPrice > 0;
  const comparisonGapPct = hasInsightData ? ((avgTodayPrice - avgRecentPrice) / avgRecentPrice) * 100 : null;
  const similarityThresholdPct = 1;
  const insightType = !hasInsightData ? null : comparisonGapPct > similarityThresholdPct ? "sell" : comparisonGapPct < -similarityThresholdPct ? "wait" : "neutral";
  const insightStyles = {
    sell: "bg-emerald-50 border-emerald-200 text-emerald-900",
    wait: "bg-amber-50 border-amber-200 text-amber-900",
    neutral: "bg-blue-50 border-blue-200 text-blue-800",
  };
  const insightTexts = {
    sell: t.comparisonInsightSell,
    wait: t.comparisonInsightWait,
    neutral: t.comparisonInsightNeutral,
  };
  const hasToday = (compareData?.todayCount || 0) > 0
    || [...normalizedBackendRanked, ...normalizedMandis].some((row) => row?.modeFreshnessDays === 0)
    || [...backendRanked, ...mandis].some((row) => Number.isFinite(row?.todayPrice) && row.todayPrice > 0);
  const freshCount = freshnessCounts?.freshCount ?? 0;
  const recentCount = freshnessCounts?.recentCount ?? 0;
  const hasFreshOrRecent = freshCount > 0 || recentCount > 0;
  const hasBackendRanked = normalizedBackendRanked.length > 0;
  const hasMandis = normalizedMandis.length > 0;
  const hasBestAvailable = hasFreshOrRecent
    || hasBackendRanked
    || (backendFallbackOld.length || 0) > 0
    || hasMandis;
  const hasRankedForBest = rankedMandis.length > 0;
  const hasOldRows = normalizedFallback.length > 0;
  const isTodayMode = compareMode === "today";
  const isBestAvailableMode = compareMode === "latest";
  const shouldRenderRanked = isTodayMode
    ? hasToday && rankedMandis.length > 0
    : hasRankedForBest;
  const shouldRenderFallback = isBestAvailableMode && hasOldRows;
  const maxFreshnessDays = rankedMandis.reduce((max, item) => {
    if (!Number.isFinite(item.modeFreshnessDays)) return max;
    return Math.max(max, item.modeFreshnessDays);
  }, 0);
  const hasNonTodayDataInRanked = rankedMandis.some((item) => Number.isFinite(item.modeFreshnessDays) && item.modeFreshnessDays > 0);
  const showBestAvailableDataMessage = isBestAvailableMode && hasBestAvailable && (hasRankedForBest || shouldRenderFallback);
  const showOldFallbackMessage = isBestAvailableMode && hasBestAvailable && !hasRankedForBest && shouldRenderFallback;
  const showNoDataState = isTodayMode ? !hasToday : !hasBestAvailable;
  const hasRecentOrFreshBestAvailable = isBestAvailableMode && (hasFreshOrRecent || hasRankedForBest);
  const getModeMessage = () => {
    if (isTodayMode && !hasToday) {
      return language === "mr"
        ? "आजचा डेटा उपलब्ध नाही. कृपया नंतर पुन्हा तपासा."
        : "Today's data is not available yet. Please check again later.";
    }
    if (isBestAvailableMode && shouldRenderFallback && !hasRecentOrFreshBestAvailable) {
      return language === "mr"
        ? "सध्या फक्त जुना उपलब्ध डेटा दाखवला जात आहे."
        : "Only older available data is being shown right now.";
    }
    if (isBestAvailableMode && !hasToday && hasBestAvailable) {
      return language === "mr"
        ? "आजचा डेटा उपलब्ध नाही. मागील उपलब्ध भाव दाखवले जात आहेत."
        : "Today's data is not available. Showing latest available prices.";
    }
    if (showNoDataState) {
      return language === "mr"
        ? "सध्या या निवडीसाठी कोणताही वापरण्यायोग्य डेटा उपलब्ध नाही."
        : "No usable data is available for this selection right now.";
    }
    return null;
  };
  const modeMessage = getModeMessage();

  const spokenLang = (selectedVoiceLang || language || "mr").toLowerCase().startsWith("mr")
    ? "mr"
    : (selectedVoiceLang || language || "mr").toLowerCase().startsWith("hi")
      ? "hi"
      : "en";

  const speakByLang = ({ mr, hi, en }) => {
    if (spokenLang === "hi") return hi;
    if (spokenLang === "en") return en;
    return mr;
  };

  const buildContextSpeech = () => {
    if (compareMode === "latest") {
      return speakByLang({
        mr: `${selectedCropName} साठी मागील काही दिवसांतील उपलब्ध भाव दाखवत आहोत.`,
        hi: `${selectedCropName} के लिए पिछले कुछ दिनों के उपलब्ध भाव दिखा रहे हैं।`,
        en: `Showing latest available prices from recent days for ${selectedCropName}.`,
      });
    }

    return speakByLang({
      mr: `${selectedCropName} साठी महाराष्ट्र मधील सर्वोत्तम मंडी भाव दाखवत आहोत.`,
      hi: `${selectedCropName} के लिए महाराष्ट्र में सबसे अच्छे मंडी भाव दिखा रहे हैं।`,
      en: `Showing best mandi prices for ${selectedCropName} in Maharashtra.`,
    });
  };

  const buildFreshnessSpeech = () => {
    if (showNoDataState) {
      return speakByLang({
        mr: "सध्या वापरण्यासाठी डेटा उपलब्ध नाही. कृपया नंतर पुन्हा तपासा.",
        hi: "फिलहाल उपयोगी डेटा उपलब्ध नहीं है। कृपया बाद में फिर जांचें।",
        en: "No usable data is available right now. Please check again later.",
      });
    }
    if (showOldFallbackMessage) {
      return speakByLang({
        mr: "ताजे निर्णय-योग्य डेटा उपलब्ध नाही. ४ ते ७ दिवसांचा जुना फॉलबॅक डेटा दाखवत आहोत.",
        hi: "ताज़ा निर्णय-ग्रेड डेटा उपलब्ध नहीं है। 4 से 7 दिन पुराना फॉलबैक डेटा दिखा रहे हैं।",
        en: "No fresh decision-grade data is available. Showing 4 to 7 day old fallback data.",
      });
    }
    return speakByLang({
      mr: "निर्णयासाठी सर्वोत्तम उपलब्ध मंडी डेटा दाखवत आहोत.",
      hi: "निर्णय के लिए सबसे अच्छा उपलब्ध मंडी डेटा दिखा रहे हैं।",
      en: "Showing best available mandi data for decision making.",
    });
  };

  const buildInsightSpeech = () => {
    if (insightType === "sell") {
      return speakByLang({
        mr: `आत्ता विक्रीसाठी चांगला भाव आहे. ${bestMandi?.mandi || "ही"} मंडी योग्य आहे.`,
        hi: `अभी बेचने के लिए भाव अच्छा है। ${bestMandi?.mandi || "यह"} मंडी सही है।`,
        en: `Price is good to sell now. ${bestMandi?.mandi || "This"} mandi is a good choice.`,
      });
    }

    if (insightType === "wait") {
      return speakByLang({
        mr: "आत्ता थांबा. सध्याचा भाव कमी आहे.",
        hi: "अभी रुकिए। मौजूदा भाव कम है।",
        en: "Wait for now. Current price is low.",
      });
    }

    return speakByLang({
      mr: "दुसरी मंडी तपासा. चांगला भाव दुसरीकडे मिळू शकतो.",
      hi: "दूसरी मंडी जांचें। बेहतर भाव कहीं और मिल सकता है।",
      en: "Check another mandi. Better price may be available elsewhere.",
    });
  };

  const buildBestMandiSpeech = () => {
    if (!bestMandi || !Number.isFinite(bestMandi.modePrice)) {
      return speakByLang({
        mr: "या निवडीसाठी डेटा उपलब्ध नाही.",
        hi: "इस चयन के लिए डेटा उपलब्ध नहीं है।",
        en: "No data is available for this selection.",
      });
    }

    const priceValue = Math.round(bestMandi.modePrice).toLocaleString("en-IN");
    return speakByLang({
      mr: `${bestMandi.mandi} मंडी सर्वोत्तम आहे. भाव आहे ${priceValue} रुपये. इथे विकायला चांगले आहे.`,
      hi: `${bestMandi.mandi} मंडी सबसे बेहतर है। भाव ${priceValue} रुपये है। यहां बेचना सही रहेगा।`,
      en: `${bestMandi.mandi} mandi is best. Price is ${priceValue} rupees. Good place to sell.`,
    });
  };

  const buildCardSpeech = (item) => {
    if (!item || !Number.isFinite(item.modePrice)) {
      return speakByLang({
        mr: "या मंडीसाठी भाव उपलब्ध नाही.",
        hi: "इस मंडी के लिए भाव उपलब्ध नहीं है।",
        en: "Price is unavailable for this mandi.",
      });
    }

    return speakByLang({
      mr: `${item.mandi} मध्ये भाव आहे ${Math.round(item.modePrice).toLocaleString("en-IN")} रुपये.`,
      hi: `${item.mandi} में भाव ${Math.round(item.modePrice).toLocaleString("en-IN")} रुपये है।`,
      en: `Price in ${item.mandi} is ${Math.round(item.modePrice).toLocaleString("en-IN")} rupees.`,
    });
  };


  return (
    <div className="min-h-screen bg-[#fff9eb] pb-24">
      <div className="px-4 pt-5 pb-4">
        <h1 className="text-[1.7rem] font-extrabold text-[#063d25] mb-1 tracking-tight" style={{ fontFamily: "Manrope, sans-serif" }}>
          {t.comparison}
        </h1>
        <p className="text-xs text-gray-500 mb-3" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
          {t.comparePricesAcrossMaharashtra}
        </p>

        {!loading && !error && (
          <div className="mb-3 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm space-y-1.5">
            <p className="text-xs text-slate-600" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              <span className="font-semibold text-slate-700">Latest usable data date</span>: {lastUpdated || "—"}
            </p>
            <p className="text-xs text-slate-600" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              <span className="font-semibold text-slate-700">Coverage</span>: {coverageMessage || "—"}
              {freshnessCounts && (
                <span className="ml-2 text-[11px] text-slate-500">
                  ({`F ${freshnessCounts.freshCount ?? 0} · R ${freshnessCounts.recentCount ?? 0} · O ${freshnessCounts.oldCount ?? 0}`})
                </span>
              )}
            </p>
            <p className="text-xs text-slate-600" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              <span className="font-semibold text-slate-700">Decision confidence</span>: {bestConfidence === "high" ? "High" : "Low"}
              {bestConfidence === "low" && <span className="ml-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Low confidence</span>}
            </p>
            {bestMandiMessage && (
              <p className="text-xs text-slate-700" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                <span className="font-semibold text-slate-700">Best mandi message</span>: {bestMandiMessage}
              </p>
            )}
          </div>
        )}

        <select
          value={selectedCrop}
          onChange={(e) => setSelectedCrop(e.target.value)}
          disabled={cropLoading}
          className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-base text-[#1e1c10] outline-none focus:border-[#004c22] focus:ring-2 focus:ring-[#004c22]/10"
          style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
        >
          <option value="">{cropLoading ? t.loadingAvailableCrops : t.selectCrop}</option>
          {cropList.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <div className="mt-3 bg-white rounded-2xl p-1 border border-gray-200 shadow-[0_8px_18px_rgba(15,23,42,0.08)] grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => setCompareMode("today")}
            className={`text-sm py-2.5 px-2 rounded-xl font-semibold transition-all ${
              compareMode === "today" ? "bg-[#004c22] text-white shadow-[0_6px_14px_rgba(0,76,34,0.28)] ring-1 ring-[#004c22]/40 -translate-y-[1px]" : "text-[#004c22] bg-transparent"
            }`}
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            Today Only
          </button>
          <button
            type="button"
            onClick={() => setCompareMode("latest")}
            className={`text-sm py-2.5 px-2 rounded-xl font-semibold transition-all ${
              compareMode === "latest" ? "bg-[#775d00] text-white shadow-[0_6px_14px_rgba(119,93,0,0.28)] ring-1 ring-[#775d00]/40 -translate-y-[1px]" : "text-[#775d00] bg-transparent"
            }`}
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            Best Available
          </button>
        </div>
      </div>

      <div className="px-4">
        {loading && (
          <div className="pb-2">
            <p className="text-sm text-slate-500 mb-3" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {t.fetchingLive}
            </p>
            <ComparisonSkeleton />
          </div>
        )}

        {!loading && !error && (
          <div className="mb-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-800" style={{ fontFamily: "Manrope, sans-serif" }}>
                {selectedCropName} · Maharashtra
              </p>
              <SpeakerButton
                onSpeak={() => speakText(buildContextSpeech())}
                onStop={stopSpeaking}
                isSpeaking={speaking}
                isSupported={isSupported}
                ariaLabel="Hear compare summary"
                className="h-9 w-9"
              />
            </div>
            <p className="text-xs text-slate-600 mt-0.5" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {rankingBasis === "today_only" ? "Today only ranking" : "Fresh + recent ranking"}
            </p>
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center">
            <p className="text-red-700 font-semibold text-sm" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {t.dataUnavailableTryAgain}
            </p>
            <p className="text-xs text-red-500 mt-1">Please refresh in a minute. Live mandi feeds can be delayed.</p>
          </div>
        )}

        {!loading && !error && showBestAvailableDataMessage && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 text-center mb-3">
            <p className="text-blue-900 font-semibold text-sm" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {modeMessage || `Latest available (${maxFreshnessDays} ${maxFreshnessDays === 1 ? "day" : "days"} old)`}
            </p>
            {latestAvailableDate && (
              <p className="text-xs text-blue-800 mt-1" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                Latest available date: {latestAvailableDate}
              </p>
            )}
            {isBestAvailableMode && hasNonTodayDataInRanked && (
              <p className="text-xs text-blue-800 mt-1" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                Not today&apos;s data
              </p>
            )}
          </div>
        )}

        {!loading && !error && showOldFallbackMessage && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center mb-3">
            <p className="text-amber-900 font-semibold text-sm" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {modeMessage || "Showing older data (4–7 days old)"}
            </p>
          </div>
        )}

        {!loading && !error && showNoDataState && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-center">
            <p className="text-slate-800 font-semibold text-sm" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {modeMessage || (isTodayMode ? "No today's data available" : "No data")}
            </p>
            <div className="mt-3 flex justify-center">
              <SpeakerButton
                onSpeak={() => speakText(buildFreshnessSpeech())}
                onStop={stopSpeaking}
                isSpeaking={speaking}
                isSupported={isSupported}
                ariaLabel="Hear no-data status"
              />
            </div>
          </div>
        )}

        {!loading && !error && (shouldRenderRanked || shouldRenderFallback) && (
          <>
            {insightType && (
              <div className={`rounded-2xl border p-3 mb-3 ${insightStyles[insightType]}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold mb-1 uppercase tracking-wide" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                      {t.simpleInsight}
                    </p>
                    <p className="text-sm font-semibold" style={{ fontFamily: "Manrope, sans-serif" }}>
                      {insightTexts[insightType]}
                    </p>
                    <p className="text-xs mt-1" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                      {t.comparisonInsightBasis.replace("{today}", avgTodayPrice.toLocaleString("en-IN")).replace("{recent}", avgRecentPrice.toLocaleString("en-IN"))}
                    </p>
                  </div>
                  <SpeakerButton
                    onSpeak={() => speakText(buildInsightSpeech())}
                    onStop={stopSpeaking}
                    isSpeaking={speaking}
                    isSupported={isSupported}
                    ariaLabel="Hear recommendation"
                    className="h-9 w-9"
                  />
                </div>
              </div>
            )}

            {bestMandi && showBestMandiBadge && shouldRenderRanked && (
              <div className="bg-gradient-to-r from-[#083f26] to-[#0b5734] rounded-2xl p-3.5 mb-4 flex items-center justify-between gap-3 shadow-[0_8px_20px_rgba(6,61,37,0.25)]">
                <span className="text-white text-sm" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                  {bestLabel}:
                </span>
                <span className="text-[#ffd17a] font-bold text-base text-right" style={{ fontFamily: "Manrope, sans-serif" }}>
                  {bestMandi.mandi} — {bestMandi.modePrice > 0 ? `₹${bestMandi.modePrice.toLocaleString("en-IN")}` : "—"}
                </span>
                <SpeakerButton
                  onSpeak={() => speakText(buildBestMandiSpeech())}
                  onStop={stopSpeaking}
                  isSpeaking={speaking}
                  isSupported={isSupported}
                  ariaLabel="Hear best mandi recommendation"
                  className="h-9 w-9 border-white/20 bg-white/10 text-white hover:bg-white/20"
                />
              </div>
            )}

            {shouldRenderRanked && (
              <div className="mb-2">
                <h2 className="text-base font-bold mb-2 text-[#004c22]" style={{ fontFamily: "Manrope, sans-serif" }}>
                  Best available for decision
                </h2>
                <div className="space-y-4">
                  {rankedMandis.map((item, idx) => (
                    <div
                      key={`ranked-${item.mandi}`}
                      className="animate-fade-in-up"
                      style={{ animationDelay: `${idx * 45}ms` }}
                    >
                      <MandiCard
                      mandi={item.mandi}
                      todayPrice={item.modePrice}
                      avgPrice={item.avgPrice}
                      stale={false}
                      freshnessDays={item.modeFreshnessDays}
                      freshnessBucket={item.freshnessBucket}
                      isBest={showBestMandiBadge && item.mandi === bestMandiName}
                      rank={idx + 1}
                      bestLabel={bestLabel}
                      onSpeak={idx === 0 ? () => speakText(buildCardSpeech(item)) : undefined}
                      onStopSpeak={stopSpeaking}
                      isSpeaking={speaking && idx === 0}
                      isSpeechSupported={isSupported}
                      speakAriaLabel={idx === 0 ? "Hear top mandi price" : undefined}
                    />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {shouldRenderFallback && (
              <div className="mb-2 mt-4">
                <h2 className="text-base font-bold mb-2 text-slate-700" style={{ fontFamily: "Manrope, sans-serif" }}>
                  Older fallback data (4–7 days)
                </h2>
                <div className="space-y-3 opacity-90">
                  {normalizedFallback.map((item, idx) => (
                    <MandiCard
                      key={`fallback-${item.mandi}`}
                      mandi={item.mandi}
                      todayPrice={item.modePrice}
                      avgPrice={item.avgPrice}
                      stale={true}
                      freshnessDays={item.modeFreshnessDays}
                      forceBadge="FALLBACK_OLD"
                      freshnessBucket={item.freshnessBucket}
                      isBest={false}
                      rank={idx + 1}
                      bestLabel=""
                    />
                  ))}
                </div>
              </div>
            )}

            {(shouldRenderRanked || shouldRenderFallback) && (
              <p className="text-center text-xs text-gray-500 mt-4" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                {t.mandiCountSummary.replace("{count}", rankedMandis.length + normalizedFallback.length)}
              </p>
            )}
            <p className="text-center text-[11px] text-gray-400 mt-1" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              MandiMind · Smarter mandi decisions, grounded in data
            </p>
          </>
        )}
      </div>
    </div>
  );
}
