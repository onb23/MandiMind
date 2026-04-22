import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import SpeakerButton from "../components/SpeakerButton";
import { useSpeechAssistant } from "../utils/speechSynthesis";
import { fetchAvailableCrops, fetchAvailableMandis, getMandisForPriceMode, getFreshnessMessage } from "../utils/mandiAvailability";
import MandiCard from "../components/MandiCard";

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
        }
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedCrop]);

  const selectedCropName = cropList.find((crop) => crop.id === selectedCrop)?.name || selectedCrop;
  const mandis = compareData?.mandis || [];
  const dataStatus = compareData?.status || "today_has_data";
  const isTodayDataAvailable = dataStatus === "today_has_data";
  const hasRecentFallbackData = dataStatus === "today_no_data_recent_exists";
  const noTodayOrRecentData = dataStatus === "today_no_data_no_recent";
  const isTodayModeWithFallback = compareMode === "today" && hasRecentFallbackData;
  const modeMandis = getMandisForPriceMode(mandis, compareMode, { includeTodayInLatest: true });
  const todayMandiCount = mandis.filter((item) => item?.todayOption?.isUsable).length;
  const scorePrice = (value) => (typeof value === "number" && value > 0 ? value : Number.NEGATIVE_INFINITY);
  const sortFn = (a, b) => {
    if (compareMode === "latest") {
      const byFreshness = (a.modeFreshnessDays ?? 999) - (b.modeFreshnessDays ?? 999);
      if (byFreshness !== 0) return byFreshness;
      const byPrice = scorePrice(b.modePrice) - scorePrice(a.modePrice);
      if (byPrice !== 0) return byPrice;
      return a.mandi.localeCompare(b.mandi);
    }
    const byPrice = scorePrice(b.modePrice) - scorePrice(a.modePrice);
    if (byPrice !== 0) return byPrice;
    const byFreshness = (a.modeFreshnessDays ?? 999) - (b.modeFreshnessDays ?? 999);
    if (byFreshness !== 0) return byFreshness;
    return a.mandi.localeCompare(b.mandi);
  };
  const displayedMandis = [...modeMandis].sort(sortFn);
  const bestMandi = displayedMandis.find((item) => Number.isFinite(item.modePrice) && item.modePrice > 0) || null;
  const bestLabel = bestMandi ? (compareMode === "today" ? t.comparisonBestPriceToday : t.comparisonBestLatestPrice) : "";
  const lastUpdated = compareData?.lastUpdated || displayedMandis[0]?.lastUpdated || mandis[0]?.lastUpdated;
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
  const showTodayUpdatingNote = compareMode === "today" && !isTodayModeWithFallback && !loading && !error && mandis.length > 0 && todayMandiCount < mandis.length;
  const recentModeDate = compareMode === "latest" ? displayedMandis[0]?.modeDate || null : null;
  const freshnessBanner = getFreshnessMessage(compareData?.freshnessDays ?? displayedMandis[0]?.modeFreshnessDays, t);
  const showModeBanner = showTodayUpdatingNote || compareMode === "latest";
  const shouldShowNoDataState = noTodayOrRecentData && compareMode === "today";
  const shouldRenderCards = !shouldShowNoDataState && displayedMandis.length > 0;
  const modeSectionTitle = isTodayModeWithFallback ? "शेवटचा उपलब्ध डेटा" : compareMode === "today" ? t.liveToday : t.latestAvailableLast3Days;
  const contextLine = isTodayDataAvailable
    ? "आजचे लाईव्ह • महाराष्ट्र"
    : hasRecentFallbackData
      ? "शेवटचा उपलब्ध डेटा • महाराष्ट्र"
      : "डेटा उपलब्ध नाही • महाराष्ट्र";
  const contextBadge = isTodayDataAvailable ? "LIVE" : hasRecentFallbackData ? "RECENT" : "STALE";
  const contextBadgeClass = isTodayDataAvailable
    ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
    : hasRecentFallbackData
      ? "bg-amber-50 text-amber-700 border border-amber-100"
      : "bg-rose-50 text-rose-700 border border-rose-100";

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
    if (isTodayDataAvailable) {
      return speakByLang({
        mr: "आजचा ताजा डेटा उपलब्ध आहे.",
        hi: "आज का ताज़ा डेटा उपलब्ध है।",
        en: "Fresh data for today is available.",
      });
    }

    if (hasRecentFallbackData) {
      return speakByLang({
        mr: "आजचा डेटा उपलब्ध नाही. शेवटचा उपलब्ध डेटा दाखवत आहोत.",
        hi: "आज का डेटा उपलब्ध नहीं है। आखिरी उपलब्ध डेटा दिखा रहे हैं।",
        en: "Today's data is unavailable. Showing the latest available data.",
      });
    }

    return speakByLang({
      mr: "सध्या डेटा उपलब्ध नाही. कृपया नंतर पुन्हा तपासा.",
      hi: "फिलहाल डेटा उपलब्ध नहीं है। कृपया बाद में फिर जांचें।",
      en: "Data is currently unavailable. Please check again later.",
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

        {lastUpdated && !loading && (
          <div className="mb-3 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 shadow-sm">
            <p className="text-xs text-slate-600" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              <span className="font-semibold text-slate-700">{t.updatedThrough}</span>: {lastUpdated}
            </p>
            {!showModeBanner && <p className="text-[11px] text-slate-500 mt-1">{freshnessBanner}</p>}
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
            {t.priceTypeToday}
          </button>
          <button
            type="button"
            onClick={() => setCompareMode("latest")}
            className={`text-sm py-2.5 px-2 rounded-xl font-semibold transition-all ${
              compareMode === "latest" ? "bg-[#775d00] text-white shadow-[0_6px_14px_rgba(119,93,0,0.28)] ring-1 ring-[#775d00]/40 -translate-y-[1px]" : "text-[#775d00] bg-transparent"
            }`}
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            {t.priceTypeLatest}
          </button>
        </div>

        {!loading && !error && hasRecentFallbackData && compareMode === "today" && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2.5">
            <p className="text-xs text-amber-900" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              आजचा डेटा उपलब्ध नाही — शेवटचा उपलब्ध डेटा दाखवत आहोत
            </p>
            {lastUpdated && (
              <p className="text-[11px] text-amber-800 mt-1" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                शेवटचा अपडेट: {lastUpdated}
              </p>
            )}
          </div>
        )}

        {!loading && !error && !hasRecentFallbackData && showModeBanner && (
          <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5">
            {showTodayUpdatingNote ? (
              <p className="text-xs text-blue-800" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                {t.todayModeUpdatingNote}
              </p>
            ) : (
              <p className={`text-xs ${recentModeDate ? "text-blue-800" : "text-blue-600"}`} style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                {recentModeDate ? t.recentModeDateNoteCompare.replace("{date}", recentModeDate) : t.recentModeDateUnavailable}
              </p>
            )}
          </div>
        )}
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

        {!loading && !error && (mandis.length > 0 || noTodayOrRecentData) && (
          <div className="mb-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
            <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              Market context
            </p>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-800" style={{ fontFamily: "Manrope, sans-serif" }}>
                {selectedCropName} · Maharashtra
              </p>
              <div className="flex items-center gap-2">
              <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold tracking-wide shrink-0 ${contextBadgeClass}`}>
                {contextBadge}
              </span>
                <SpeakerButton
                  onSpeak={() => speakText(buildContextSpeech())}
                  onStop={stopSpeaking}
                  isSpeaking={speaking}
                  isSupported={isSupported}
                  ariaLabel="Hear compare summary"
                  className="h-9 w-9"
                />
              </div>
            </div>
            <p className="text-xs text-slate-600 mt-0.5" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {contextLine}
              {!noTodayOrRecentData && ` • ${freshnessBanner}`}
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

        {!loading && !error && mandis.length === 0 && !noTodayOrRecentData && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center">
            <p className="text-amber-800 font-semibold text-sm" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {t.noMandiDataLast3Days}
            </p>
            <p className="text-xs text-amber-700 mt-1">{t.todayDataUnavailable}. Try another crop or check later as updates arrive.</p>
          </div>
        )}

        {!loading && !error && shouldShowNoDataState && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-center">
            <p className="text-slate-800 font-semibold text-sm" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              आजचा डेटा उपलब्ध नाही
            </p>
            <p className="text-xs text-slate-600 mt-1">कृपया नंतर पुन्हा तपासा</p>
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

        {!loading && !error && mandis.length > 0 && (
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

            {bestMandi && shouldRenderCards && (
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

            {shouldRenderCards && (
              <div className="mb-2">
                <h2 className={`text-base font-bold mb-2 ${compareMode === "today" ? "text-[#004c22]" : "text-[#775d00]"}`} style={{ fontFamily: "Manrope, sans-serif" }}>
                  {modeSectionTitle}
                </h2>
                <div className="space-y-4">
                  {displayedMandis.map((item, idx) => (
                    <div
                      key={`${compareMode}-${item.mandi}`}
                      className="animate-fade-in-up"
                      style={{ animationDelay: `${idx * 45}ms` }}
                    >
                      <MandiCard
                      mandi={item.mandi}
                      todayPrice={item.modePrice}
                      avgPrice={item.avgPrice}
                      stale={compareMode === "latest" || isTodayModeWithFallback}
                      freshnessDays={item.modeFreshnessDays}
                      forceBadge={isTodayModeWithFallback ? "RECENT" : undefined}
                      isBest={idx === 0}
                      rank={idx + 1}
                      bestLabel={idx === 0 ? bestLabel : ""}
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

            {shouldRenderCards && (
              <p className="text-center text-xs text-gray-500 mt-4" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                {t.mandiCountSummary.replace("{count}", displayedMandis.length)}
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
