import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { fetchAvailableCrops, fetchAvailableMandis, getFreshnessMessage } from "../utils/mandiAvailability";
import MandiCard from "../components/MandiCard";

export default function Comparison() {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const initCrop = searchParams.get("crop") || "onion";
  const [selectedCrop, setSelectedCrop] = useState(initCrop);
  const [cropList, setCropList] = useState([]);
  const [cropLoading, setCropLoading] = useState(true);

  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(false);
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
    return () => { cancelled = true; };
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
    return () => { cancelled = true; };
  }, [selectedCrop]);

  const rawMandis = Array.isArray(compareData?.mandis) ? compareData.mandis : [];

  const rowsToRender =
    compareMode === "today"
      ? rawMandis.filter((m) => m.todayPrice != null)
      : rawMandis.filter((m) => m.todayPrice != null || m.avgPrice != null);

  const mandis = rowsToRender.map((item) => ({
    ...item,
    modePrice: item.todayPrice ?? item.avgPrice,
    modeDate: compareMode === "today" ? item.todayDate : (item.todayDate || item.lastUpdated),
    modeFreshnessDays: compareMode === "today" ? 0 : item.freshnessDays,
    modeHasData: compareMode === "today" ? item.todayPrice != null : (item.todayPrice != null || item.avgPrice != null),
  }));
  const todayMandiCount = rawMandis.filter((item) => item?.todayPrice != null).length;
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
  const displayedMandis = [...mandis].sort(sortFn);
  const bestMandi = displayedMandis.find((item) => Number.isFinite(item.modePrice) && item.modePrice > 0) || null;
  const bestLabel = bestMandi
    ? compareMode === "today"
      ? t.comparisonBestPriceToday
      : t.comparisonBestLatestPrice
    : "";
  const lastUpdated = compareData?.lastUpdated || displayedMandis[0]?.lastUpdated || rawMandis[0]?.lastUpdated;
  const comparableMandis = displayedMandis.filter(
    (item) => Number.isFinite(item.todayPrice) && Number.isFinite(item.avgPrice)
  );
  const avgTodayPrice = comparableMandis.length
    ? Math.round(comparableMandis.reduce((sum, item) => sum + item.todayPrice, 0) / comparableMandis.length)
    : null;
  const avgRecentPrice = comparableMandis.length
    ? Math.round(comparableMandis.reduce((sum, item) => sum + item.avgPrice, 0) / comparableMandis.length)
    : null;
  const hasInsightData = Number.isFinite(avgTodayPrice) && Number.isFinite(avgRecentPrice) && avgRecentPrice > 0;
  const comparisonGapPct = hasInsightData ? ((avgTodayPrice - avgRecentPrice) / avgRecentPrice) * 100 : null;
  const similarityThresholdPct = 1;
  const insightType = !hasInsightData
    ? null
    : comparisonGapPct > similarityThresholdPct
      ? "sell"
      : comparisonGapPct < -similarityThresholdPct
        ? "wait"
        : "neutral";
  const insightStyles = {
    sell: "bg-green-50 border-green-200 text-green-800",
    wait: "bg-amber-50 border-amber-200 text-amber-800",
    neutral: "bg-blue-50 border-blue-200 text-blue-800",
  };
  const insightTexts = {
    sell: t.comparisonInsightSell,
    wait: t.comparisonInsightWait,
    neutral: t.comparisonInsightNeutral,
  };
  const showTodayUpdatingNote = compareMode === "today"
    && !loading
    && !error
    && rawMandis.length > 0
    && todayMandiCount < rawMandis.length;
  const recentModeDate = compareMode === "latest"
    ? displayedMandis[0]?.modeDate || null
    : null;
  const freshnessBanner = getFreshnessMessage(compareData?.freshnessDays ?? displayedMandis[0]?.modeFreshnessDays, t);
  const showModeBanner = showTodayUpdatingNote || compareMode === "latest";
  const getLatestFreshnessLabel = (freshnessDays) => {
    if (!Number.isFinite(freshnessDays)) return t.latestAvailable;
    if (freshnessDays <= 0) return t.today;
    if (freshnessDays === 1) return t.oneDayAgo;
    if (freshnessDays === 2) return t.twoDaysAgo;
    if (freshnessDays === 3) return t.threeDaysAgo;
    return t.daysAgoGeneric.replace("{days}", freshnessDays);
  };

  return (
    <div className="min-h-screen bg-[#fff9eb] pb-24">
      <div className="px-4 pt-6 pb-4">
        <h1
          className="text-2xl font-extrabold text-[#004c22] mb-1"
          style={{ fontFamily: "Manrope, sans-serif" }}
        >
          {t.comparison}
        </h1>
        {lastUpdated && !loading && (
          <p className="text-xs text-gray-400 mb-3" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
            {t.updatedThrough}: {lastUpdated}
          </p>
        )}
        {!loading && !error && !showModeBanner && (
          <p className="text-xs text-blue-700 mb-3" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
            {freshnessBanner}
          </p>
        )}
        <select
          value={selectedCrop}
          onChange={(e) => setSelectedCrop(e.target.value)}
          disabled={cropLoading}
          className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-base text-[#1e1c10] outline-none focus:border-[#004c22]"
          style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
        >
          <option value="">{cropLoading ? t.loadingAvailableCrops : t.selectCrop}</option>
          {cropList.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <div className="mt-3 bg-white rounded-xl p-1 border border-gray-200 grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => setCompareMode("today")}
            className={`text-sm py-2 px-2 rounded-lg font-semibold transition-colors ${
              compareMode === "today" ? "bg-[#004c22] text-white" : "text-[#004c22] bg-transparent"
            }`}
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            {t.priceTypeToday}
          </button>
          <button
            type="button"
            onClick={() => setCompareMode("latest")}
            className={`text-sm py-2 px-2 rounded-lg font-semibold transition-colors ${
              compareMode === "latest" ? "bg-[#775d00] text-white" : "text-[#775d00] bg-transparent"
            }`}
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            {t.priceTypeLatest}
          </button>
        </div>
        {!loading && !error && showModeBanner && (
          <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
            {showTodayUpdatingNote ? (
              <p className="text-xs text-blue-800" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                {t.todayModeUpdatingNote}
              </p>
            ) : (
              <p className={`text-xs ${recentModeDate ? "text-blue-800" : "text-blue-600"}`} style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                {recentModeDate
                  ? t.recentModeDateNoteCompare.replace("{date}", recentModeDate)
                  : t.recentModeDateUnavailable}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="px-4">
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-[#004c22] animate-spin" />
            <p className="text-sm text-gray-400" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {t.fetchingLive}
            </p>
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-center">
            <p className="text-red-600 font-semibold text-sm" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {t.dataUnavailableTryAgain}
            </p>
            <p className="text-xs text-red-400 mt-1">{t.dataUnavailableTryAgain}</p>
          </div>
        )}

        {!loading && !error && rowsToRender.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-center">
            <p className="text-amber-700 font-semibold text-sm" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {t.noMandiDataLast3Days}
            </p>
            <p className="text-xs text-amber-500 mt-1">{t.todayDataUnavailable}</p>
          </div>
        )}

        {!loading && !error && rowsToRender.length > 0 && (
          <>
            {insightType && (
              <div className={`rounded-xl border p-3 mb-3 ${insightStyles[insightType]}`}>
                <p className="text-xs font-semibold mb-1" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                  {t.simpleInsight}
                </p>
                <p className="text-sm font-semibold" style={{ fontFamily: "Manrope, sans-serif" }}>
                  {insightTexts[insightType]}
                </p>
                <p className="text-xs mt-1" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                  {t.comparisonInsightBasis
                    .replace("{today}", avgTodayPrice.toLocaleString("en-IN"))
                    .replace("{recent}", avgRecentPrice.toLocaleString("en-IN"))}
                </p>
              </div>
            )}

            {bestMandi && displayedMandis.length > 0 && (
              <div className="bg-[#004c22] rounded-xl p-3 mb-4 flex items-center justify-between">
                <span className="text-white text-sm" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                  {bestLabel}:
                </span>
                <span className="text-[#feb234] font-bold text-base" style={{ fontFamily: "Manrope, sans-serif" }}>
                  {bestMandi.mandi} — {bestMandi.modePrice > 0 ? `₹${bestMandi.modePrice.toLocaleString("en-IN")}` : "—"}
                </span>
              </div>
            )}

            {displayedMandis.length > 0 && (
              <div className="mb-2">
                <h2
                  className={`text-base font-bold mb-2 ${compareMode === "today" ? "text-[#004c22]" : "text-[#775d00]"}`}
                  style={{ fontFamily: "Manrope, sans-serif" }}
                >
                  {compareMode === "today" ? t.liveToday : t.latestAvailableLast3Days}
                </h2>
                <div className="space-y-3">
                  {displayedMandis.map((item, idx) => (
                    <MandiCard
                      key={`${compareMode}-${item.mandi}`}
                      mandi={item.mandi}
                      price={item.todayPrice ?? item.avgPrice}
                      todayPrice={item.todayPrice ?? item.avgPrice}
                      avgPrice={item.avgPrice}
                      lastUpdated={item.modeDate || item.lastUpdated}
                      stale={compareMode === "latest"}
                      freshnessDays={item.modeFreshnessDays}
                      freshnessText={
                        compareMode === "today"
                          ? item.modeHasData
                            ? t.today
                            : t.todayDataUnavailable
                          : getLatestFreshnessLabel(item.modeFreshnessDays)
                      }
                      isBest={idx === 0}
                      rank={idx + 1}
                      bestLabel={idx === 0 ? bestLabel : ""}
                    />
                  ))}
                </div>
              </div>
            )}

            <p className="text-center text-xs text-gray-400 mt-4" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {t.mandiCountSummary.replace("{count}", rowsToRender.length)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
