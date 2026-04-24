import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { fetchAvailableCrops, fetchAvailableMandis } from "../utils/mandiAvailability";
import MandiCard from "../components/MandiCard";

export default function Comparison() {
  const { t } = useLanguage();
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

  const rawMandis = Array.isArray(compareData?.mandis) ? compareData.mandis : [];
  const allAvailableRows = rawMandis
    .map((m) => {
      const displayPrice = m?.todayPrice ?? m?.avgPrice ?? m?.price ?? m?.modal_price;
      const numericPrice = Number(String(displayPrice).replace(/,/g, ""));
      return {
        ...m,
        displayPrice: numericPrice,
      };
    })
    .filter((m) => m?.mandi && Number.isFinite(m.displayPrice) && m.displayPrice > 0)
    .sort((a, b) => {
      const dateA = new Date(a?.lastUpdated).getTime();
      const dateB = new Date(b?.lastUpdated).getTime();
      const hasValidDateA = Number.isFinite(dateA);
      const hasValidDateB = Number.isFinite(dateB);

      if (hasValidDateA && hasValidDateB && dateB !== dateA) return dateB - dateA;
      if (hasValidDateA && !hasValidDateB) return -1;
      if (!hasValidDateA && hasValidDateB) return 1;
      return b.displayPrice - a.displayPrice;
    });

  const bestMandi = allAvailableRows[0] || null;
  const bestLabel = t.comparisonBestLatestPrice || t.comparisonBestPriceToday;
  const lastUpdated = compareData?.lastUpdated || allAvailableRows[0]?.lastUpdated;

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

        <select
          value={selectedCrop}
          onChange={(e) => setSelectedCrop(e.target.value)}
          disabled={cropLoading}
          className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-base text-[#1e1c10] outline-none focus:border-[#004c22]"
          style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
        >
          <option value="">{cropLoading ? t.loadingAvailableCrops : t.selectCrop}</option>
          {cropList.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
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

        {!loading && !error && allAvailableRows.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-center">
            <p className="text-amber-700 font-semibold text-sm" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {t.noMandiDataLast3Days}
            </p>
            <p className="text-xs text-amber-500 mt-1">{t.todayDataUnavailable}</p>
          </div>
        )}

        {!loading && !error && allAvailableRows.length > 0 && (
          <>
            {bestMandi && (
              <div className="bg-[#004c22] rounded-xl p-3 mb-4 flex items-center justify-between">
                <span className="text-white text-sm" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                  {bestLabel}:
                </span>
                <span className="text-[#feb234] font-bold text-base" style={{ fontFamily: "Manrope, sans-serif" }}>
                  {bestMandi.mandi} — ₹{Number(bestMandi.displayPrice).toLocaleString("en-IN")}
                </span>
              </div>
            )}

            <div className="mb-2">
              <h2 className="text-base font-bold mb-2 text-[#004c22]" style={{ fontFamily: "Manrope, sans-serif" }}>
                {t.latestAvailableLast3Days}
              </h2>
              <div className="space-y-3">
                {allAvailableRows.map((item, idx) => (
                  <MandiCard
                    key={`${item.mandi}-${idx}`}
                    mandi={item.mandi}
                    price={Number(item.displayPrice)}
                    todayPrice={Number(item.displayPrice)}
                    avgPrice={Number(item.displayPrice)}
                    lastUpdated={item.lastUpdated}
                    stale={false}
                    freshnessDays={item.freshnessDays}
                    freshnessText={item.lastUpdated || ""}
                    isBest={idx === 0}
                    rank={idx + 1}
                    bestLabel={idx === 0 ? bestLabel : ""}
                  />
                ))}
              </div>
            </div>

            <p className="text-center text-xs text-gray-400 mt-4" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {t.mandiCountSummary.replace("{count}", allAvailableRows.length)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
