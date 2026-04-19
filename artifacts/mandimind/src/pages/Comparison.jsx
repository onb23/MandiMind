import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { getCropNames } from "../data/mockPrices";
import {
  fetchAvailableCrops,
  fetchClassifiedMandis,
  splitMandisByFreshness,
} from "../utils/mandiAvailability";
import MandiCard from "../components/MandiCard";

export default function Comparison() {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const initCrop = searchParams.get("crop") || "onion";
  const [selectedCrop, setSelectedCrop] = useState(initCrop);

  const [cropOptions, setCropOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [compareData, setCompareData] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCrops() {
      const crops = await fetchAvailableCrops(getCropNames(), "Maharashtra");
      if (cancelled) return;
      setCropOptions(crops);
      if (!crops.some((crop) => crop.id === selectedCrop) && crops.length > 0) {
        setSelectedCrop(crops[0].id);
      }
    }

    loadCrops();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!selectedCrop) return;

      setLoading(true);
      setError(null);
      const result = await fetchClassifiedMandis(selectedCrop, "Maharashtra");
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
    return () => {
      cancelled = true;
    };
  }, [selectedCrop]);

  const mandis = compareData?.mandis || [];
  const lastUpdated = compareData?.lastUpdated || null;
  const { live: liveMandis, recent: recentMandis } = splitMandisByFreshness(mandis);
  const bestLive = liveMandis[0] || null;

  return (
    <div className="min-h-screen bg-[#fff9eb] pb-24">
      <div className="px-4 pt-6 pb-4">
        <h1
          className="text-2xl font-extrabold text-[#004c22] mb-1"
          style={{ fontFamily: "Manrope, sans-serif" }}
        >
          {t.comparison}
        </h1>
        {lastUpdated && (
          <p className="text-xs text-gray-400 mb-3" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
            Last sync: {lastUpdated}
          </p>
        )}
        <select
          value={selectedCrop}
          onChange={(e) => setSelectedCrop(e.target.value)}
          className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-base text-[#1e1c10] outline-none focus:border-[#004c22]"
          style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
        >
          {cropOptions.map((c) => (
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

        {!loading && !error && liveMandis.length === 0 && recentMandis.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-center">
            <p className="text-amber-700 font-semibold text-sm" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              No live or recent mandi data available for this crop.
            </p>
            <p className="text-xs text-amber-500 mt-1">आज/अलीकडील डेटा उपलब्ध नाही</p>
          </div>
        )}

        {!loading && !error && (liveMandis.length > 0 || recentMandis.length > 0) && (
          <>
            {bestLive && (
              <div className="bg-[#004c22] rounded-xl p-3 mb-4 flex items-center justify-between">
                <span className="text-white text-sm" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                  {t.bestMandi}:
                </span>
                <span className="text-[#feb234] font-bold text-base" style={{ fontFamily: "Manrope, sans-serif" }}>
                  {bestLive.mandi} — ₹{bestLive.todayPrice.toLocaleString("en-IN")}
                </span>
              </div>
            )}

            {liveMandis.length > 0 && (
              <section className="mb-5">
                <h2 className="text-sm font-bold text-[#004c22] mb-2">A. Live Today</h2>
                <div className="space-y-3">
                  {liveMandis.map((item, idx) => (
                    <MandiCard
                      key={`live-${item.mandi}`}
                      mandi={item.mandi}
                      todayPrice={item.todayPrice}
                      avgPrice={item.avgPrice}
                      lastUpdated={item.lastUpdated}
                      stale={false}
                      isBest={idx === 0}
                      rank={idx + 1}
                    />
                  ))}
                </div>
              </section>
            )}

            {recentMandis.length > 0 && (
              <section>
                <h2 className="text-sm font-bold text-amber-700 mb-2">B. Latest Available (Last 3 Days)</h2>
                <div className="space-y-3">
                  {recentMandis.map((item, idx) => (
                    <MandiCard
                      key={`recent-${item.mandi}`}
                      mandi={item.mandi}
                      todayPrice={item.todayPrice}
                      avgPrice={item.avgPrice}
                      lastUpdated={item.lastUpdated}
                      stale={false}
                      isBest={false}
                      rank={idx + 1}
                      freshnessText={
                        Number.isFinite(item.freshnessDays)
                          ? `${item.freshnessDays} day${item.freshnessDays === 1 ? "" : "s"} old`
                          : "Recent"
                      }
                    />
                  ))}
                </div>
              </section>
            )}

            <p className="text-center text-xs text-gray-400 mt-4" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {liveMandis.length + recentMandis.length} mandis · Maharashtra · Source: Agmarknet
            </p>
          </>
        )}
      </div>
    </div>
  );
}
