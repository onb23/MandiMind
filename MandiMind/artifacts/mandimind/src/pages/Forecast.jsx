import { useState, useEffect } from "react";
import { useLanguage } from "../context/LanguageContext";
import { CROPS, getMandisByCrop } from "../data/mockPrices";
import { fetchPrices, fetchTrend } from "../utils/api";
import TrendChart from "../components/TrendChart";

export default function Forecast() {
  const { t } = useLanguage();
  const [selectedCrop,  setSelectedCrop]  = useState(CROPS[0].id);
  const [selectedMandi, setSelectedMandi] = useState(getMandisByCrop(CROPS[0].id)[0] || "");

  const [prices,     setPrices]     = useState([]);
  const [trendData,  setTrendData]  = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);

  const mandiList = getMandisByCrop(selectedCrop);

  const handleCropChange = (cropId) => {
    setSelectedCrop(cropId);
    const newMandis = getMandisByCrop(cropId);
    const firstMandi = newMandis[0] || "";
    setSelectedMandi(firstMandi);
  };

  useEffect(() => {
    if (!selectedCrop || !selectedMandi) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setPrices([]);
      setTrendData(null);

      const [priceRes, trendRes] = await Promise.all([
        fetchPrices(selectedCrop, selectedMandi, "Maharashtra", 30),
        fetchTrend(selectedCrop, selectedMandi, "Maharashtra"),
      ]);

      if (cancelled) return;

      if (priceRes.source === "error" && !priceRes.data?.length) {
        setError("Data unavailable — try again");
      } else {
        setPrices(priceRes.data || []);
      }
      setTrendData(trendRes);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [selectedCrop, selectedMandi]);

  const hasEnoughData = prices.length >= 7;

  // Use real prices for current/prev calculation
  const currentPrice = prices.length > 0 ? prices[prices.length - 1].modal_price : null;
  const prevPrice    = prices.length > 1 ? prices[prices.length - 2].modal_price : currentPrice;
  const change       = currentPrice != null && prevPrice != null ? currentPrice - prevPrice : null;
  const changePct    = change != null && prevPrice ? ((change / prevPrice) * 100).toFixed(1) : null;

  // Trend direction must match actual price movement
  const trendFromData = trendData?.trend || (
    changePct != null
      ? (Number(changePct) > 0.1 ? "rising" : Number(changePct) < -0.1 ? "falling" : "stable")
      : "stable"
  );

  const trendBg =
    trendFromData === "rising"  ? "bg-green-100 text-green-700" :
    trendFromData === "falling" ? "bg-red-100 text-red-700"     :
    "bg-gray-100 text-gray-600";

  const trendLabel =
    trendFromData === "rising"  ? t.rising :
    trendFromData === "falling" ? t.falling :
    t.stable;

  const trendArrow =
    trendFromData === "rising"  ? "↑" :
    trendFromData === "falling" ? "↓" : "→";

  // MA values — show '—' if null (insufficient data)
  const ma5Display  = trendData?.ma5  ? `₹${Number(trendData.ma5).toFixed(0)}`  : "—";
  const ma10Display = trendData?.ma10 ? `₹${Number(trendData.ma10).toFixed(0)}` : "—";

  const lastUpdated = trendData?.lastUpdated || (prices.length > 0 ? prices[prices.length - 1].date : null);
  const isStale     = trendData?.stale ?? false;

  return (
    <div className="min-h-screen bg-[#fff9eb] pb-24">
      <div className="px-4 pt-6 pb-4">
        <h1
          className="text-2xl font-extrabold text-[#004c22] mb-1"
          style={{ fontFamily: "Manrope, sans-serif" }}
        >
          {t.forecast}
        </h1>
        {lastUpdated && (
          <p className="text-xs text-gray-400 mb-2" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
            {isStale
              ? `⚠️ Data may be outdated · Last: ${lastUpdated}`
              : `Updated: ${lastUpdated}`}
          </p>
        )}
      </div>

      <div className="px-4 space-y-4">
        <div className="flex gap-2">
          <select
            value={selectedCrop}
            onChange={(e) => handleCropChange(e.target.value)}
            className="flex-1 bg-white border border-gray-300 rounded-xl px-3 py-3 text-sm text-[#1e1c10] outline-none focus:border-[#004c22]"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            {CROPS.map((c) => (
              <option key={c.id} value={c.id}>{c.name.split(" / ")[0]}</option>
            ))}
          </select>
          <select
            value={selectedMandi}
            onChange={(e) => setSelectedMandi(e.target.value)}
            className="flex-1 bg-white border border-gray-300 rounded-xl px-3 py-3 text-sm text-[#1e1c10] outline-none focus:border-[#004c22]"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            {mandiList.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

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
            <p className="text-red-600 font-semibold text-sm">{error}</p>
            <p className="text-xs text-red-400 mt-1">माहिती उपलब्ध नाही — पुन्हा प्रयत्न करा</p>
          </div>
        )}

        {!loading && !error && currentPrice !== null && (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-gray-500" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                {t.todayPrice}
              </span>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${trendBg}`}>
                  {trendArrow} {trendLabel}
                </span>
                {changePct !== null && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${Number(changePct) >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                    {Number(changePct) >= 0 ? "+" : ""}{changePct}%
                  </span>
                )}
              </div>
            </div>
            <p className="text-3xl font-extrabold text-[#004c22]" style={{ fontFamily: "Manrope, sans-serif" }}>
              ₹{currentPrice.toLocaleString("en-IN")}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{t.perQuintal}</p>

            <div className="grid grid-cols-2 gap-2 mt-3">
              {[
                { label: "MA5",  value: ma5Display  },
                { label: "MA10", value: ma10Display },
              ].map((item) => (
                <div key={item.label} className="bg-[#f8fafc] rounded-lg px-3 py-2 text-center">
                  <p className="text-[10px] text-gray-400">{item.label}</p>
                  <p className="text-sm font-bold text-[#1e293b]">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && !error && (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <h3 className="text-base font-bold text-[#1e1c10] mb-3" style={{ fontFamily: "Manrope, sans-serif" }}>
              {t.last30Days}
            </h3>
            {hasEnoughData ? (
              <TrendChart data={prices} height={220} />
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <span className="text-3xl mb-2">📉</span>
                <p className="text-sm text-gray-500 font-medium">Insufficient data</p>
                <p className="text-xs text-gray-400 mt-1">
                  {prices.length > 0
                    ? `Only ${prices.length} data point${prices.length === 1 ? "" : "s"} available (need 7+)`
                    : "No historical data available for this mandi"}
                </p>
                <p className="text-xs text-gray-300 mt-1">पुरेसा डेटा उपलब्ध नाही</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
