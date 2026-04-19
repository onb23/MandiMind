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

  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [compareData, setCompareData] = useState(null);

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
      setError(null);
      const result = await fetchAvailableMandis(selectedCrop, "Maharashtra");
      if (!cancelled) {
        if (result.source === "error") {
          setError("Data unavailable — try again");
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

  const mandis = compareData?.mandis || [];
  const scorePrice = (value) => (typeof value === "number" && value > 0 ? value : Number.NEGATIVE_INFINITY);
  const sortedMandis = [...mandis].sort((a, b) => {
    const byPrice = scorePrice(b.todayPrice) - scorePrice(a.todayPrice);
    if (byPrice !== 0) return byPrice;
    const freshnessRank = (bucket) => (bucket === "live_today" ? 0 : 1);
    const byFreshness = freshnessRank(a.bucket) - freshnessRank(b.bucket);
    if (byFreshness !== 0) return byFreshness;
    return a.mandi.localeCompare(b.mandi);
  });
  const bestMandi = sortedMandis[0] || null;
  const bestLabel = bestMandi
    ? bestMandi.bucket === "live_today"
      ? "Best price today"
      : "Best latest price"
    : "";
  const lastUpdated = compareData?.lastUpdated || bestMandi?.lastUpdated;

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
            Updated through: {lastUpdated}
          </p>
        )}
        <select
          value={selectedCrop}
          onChange={(e) => setSelectedCrop(e.target.value)}
          disabled={cropLoading}
          className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-base text-[#1e1c10] outline-none focus:border-[#004c22]"
          style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
        >
          <option value="">{cropLoading ? "Loading available crops…" : "Select crop"}</option>
          {cropList.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
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
              {error}
            </p>
            <p className="text-xs text-red-400 mt-1">माहिती उपलब्ध नाही — पुन्हा प्रयत्न करा</p>
          </div>
        )}

        {!loading && !error && mandis.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-center">
            <p className="text-amber-700 font-semibold text-sm" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              No mandi data available in the last 3 days for this crop.
            </p>
            <p className="text-xs text-amber-500 mt-1">आजचा डेटा उपलब्ध नाही</p>
          </div>
        )}

        {!loading && !error && mandis.length > 0 && (
          <>
            {bestMandi && (
              <div className="bg-[#004c22] rounded-xl p-3 mb-4 flex items-center justify-between">
                <span className="text-white text-sm" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                  {bestLabel}:
                </span>
                <span className="text-[#feb234] font-bold text-base" style={{ fontFamily: "Manrope, sans-serif" }}>
                  {bestMandi.mandi} — {bestMandi.todayPrice > 0 ? `₹${bestMandi.todayPrice.toLocaleString("en-IN")}` : "—"}
                </span>
              </div>
            )}

            <div className="mb-2">
              <h2 className="text-base font-bold text-[#004c22] mb-2" style={{ fontFamily: "Manrope, sans-serif" }}>
                Best Price First
              </h2>
              <div className="space-y-3">
                {sortedMandis.map((item, idx) => (
                  <MandiCard
                    key={`${item.bucket}-${item.mandi}`}
                    mandi={item.mandi}
                    todayPrice={item.todayPrice}
                    avgPrice={item.avgPrice}
                    lastUpdated={item.lastUpdated}
                    stale={item.bucket !== "live_today"}
                    freshnessDays={item.freshnessDays}
                    isBest={idx === 0}
                    rank={idx + 1}
                    bestLabel={idx === 0 ? bestLabel : ""}
                  />
                ))}
              </div>
            </div>

            <p className="text-center text-xs text-gray-400 mt-4" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {sortedMandis.length} mandis · Maharashtra · Source: Agmarknet
            </p>
          </>
        )}
      </div>
    </div>
  );
}
