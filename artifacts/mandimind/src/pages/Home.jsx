import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { getCropNames, getMandisByCrop, CROPS, priceData } from "../data/mockPrices";
import Sparkline from "../components/Sparkline";
import logo from "../assets/logo.svg";

const WORKER_URL = "https://mandimind.omkarborade-11.workers.dev";

const STATES = [
  "Maharashtra", "Madhya Pradesh", "Uttar Pradesh",
  "Punjab", "Haryana", "Rajasthan", "Karnataka", "Gujarat",
];

export default function Home() {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [selectedCrop,  setSelectedCrop]  = useState("");
  const [selectedMandi, setSelectedMandi] = useState("");
  const [selectedState, setSelectedState] = useState("Maharashtra");

  const [trendData,    setTrendData]    = useState(null);
  const [priceHistory, setPriceHistory] = useState([]);
  const [dataSource,   setDataSource]   = useState("mock");
  const [fetching,     setFetching]     = useState(false);

  const cropList  = getCropNames();
  const mandiList = selectedCrop ? getMandisByCrop(selectedCrop) : [];

  const fetchLiveData = useCallback(async (cropId, state) => {
    if (!cropId) return;
    setFetching(true);
    try {
      const [trendRes, pricesRes] = await Promise.all([
        fetch(`${WORKER_URL}/api/trend?crop=${cropId}&state=${encodeURIComponent(state)}`),
        fetch(`${WORKER_URL}/api/prices?crop=${cropId}&state=${encodeURIComponent(state)}&days=10`),
      ]);
      const trendJson  = await trendRes.json();
      const pricesJson = await pricesRes.json();
      setTrendData(trendJson);
      setPriceHistory(pricesJson.data || []);
      setDataSource(pricesJson.source === "live" ? "live" : "mock");
    } catch {
      const fallback = priceData[cropId]?.[mandiList[0]] || [];
      setPriceHistory(fallback);
      setDataSource("mock");
    } finally {
      setFetching(false);
    }
  }, []);

  const handleCropChange = (cropId) => {
    setSelectedCrop(cropId);
    setSelectedMandi("");
    if (cropId) fetchLiveData(cropId, selectedState);
  };

  const handleStateChange = (state) => {
    setSelectedState(state);
    if (selectedCrop) fetchLiveData(selectedCrop, state);
  };

  const trend      = trendData?.trend || "stable";
  const trendIcon  = trend === "rising" ? "📈" : trend === "falling" ? "📉" : "➡️";
  const trendWord  = trend === "rising" ? t.rising : trend === "falling" ? t.falling : t.stable;
  const trendColor = trend === "rising" ? "#16a34a" : trend === "falling" ? "#ef4444" : "#d97706";

  return (
    <div className="min-h-screen bg-[#fff9eb] pb-24">
      <div className="px-4 pt-8 pb-5 text-center">
        <img src={logo} alt="MandiMind" className="w-20 h-20 mx-auto mb-3" />
        <div className="flex items-center justify-center gap-2 mb-1">
          <h1
            className="text-3xl font-extrabold text-[#004c22]"
            style={{ fontFamily: "Manrope, sans-serif" }}
          >
            {t.appName}
          </h1>
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
            style={{ background: dataSource === "live" ? "#22c55e" : "#f59e0b", fontSize: 10 }}
          >
            {dataSource === "live" ? t.liveBadge : t.mockBadge}
          </span>
        </div>
        <p className="text-sm text-[#1e1c10] opacity-55" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
          {t.tagline}
        </p>
      </div>

      <div className="px-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#1e1c10] uppercase tracking-wide mb-1.5"
              style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {t.selectCrop}
            </label>
            <select
              value={selectedCrop}
              onChange={(e) => handleCropChange(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-xl px-3 py-3.5 text-sm text-[#1e1c10] outline-none focus:border-[#004c22]"
              style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
            >
              <option value="">{t.selectCrop}</option>
              {cropList.map((c) => (
                <option key={c.id} value={c.id}>{c.name.split(" / ")[0]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1e1c10] uppercase tracking-wide mb-1.5"
              style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {t.selectState}
            </label>
            <select
              value={selectedState}
              onChange={(e) => handleStateChange(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-xl px-3 py-3.5 text-sm text-[#1e1c10] outline-none focus:border-[#004c22]"
              style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
            >
              {STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#1e1c10] uppercase tracking-wide mb-1.5"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
            {t.selectMandi}
          </label>
          <select
            value={selectedMandi}
            onChange={(e) => setSelectedMandi(e.target.value)}
            disabled={!selectedCrop}
            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3.5 text-base text-[#1e1c10] outline-none focus:border-[#004c22] disabled:opacity-50"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            <option value="">{selectedCrop ? t.selectMandi : "— Select crop first —"}</option>
            {mandiList.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {selectedCrop && (
          <div className="bg-white rounded-xl p-3 border border-gray-200">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2"
              style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {t.sevenDayTrend}
            </p>
            {fetching ? (
              <div className="flex items-center justify-center gap-2 py-4 text-gray-400 text-sm">
                <div className="w-4 h-4 rounded-full border-2 border-gray-200 border-t-gray-400 animate-spin" />
                {t.fetchingLive}
              </div>
            ) : (
              <>
                <Sparkline prices={priceHistory} trend={trend} height={56} />
                <div className="flex justify-between items-center mt-1.5">
                  <span className="text-xs text-gray-400">{t.daysAgo}</span>
                  <span className="text-sm font-bold" style={{ color: trendColor }}>
                    {trendIcon} {trendWord}
                    {trendData?.priceDiff && (
                      <span className="text-xs font-normal text-gray-400 ml-1">({trendData.priceDiff})</span>
                    )}
                  </span>
                  <span className="text-xs text-gray-400">{t.today}</span>
                </div>
                {trendData && (
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {[
                      { label: "MA5",   value: `₹${parseFloat(trendData.ma5).toFixed(0)}` },
                      { label: "MA10",  value: `₹${parseFloat(trendData.ma10).toFixed(0)}` },
                      { label: t.today, value: `₹${trendData.currentPrice || "—"}` },
                    ].map((item) => (
                      <div key={item.label} className="bg-[#f8fafc] rounded-lg px-2 py-1.5 text-center">
                        <p className="text-[10px] text-gray-400">{item.label}</p>
                        <p className="text-sm font-bold text-[#1e293b]">{item.value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <button
          onClick={() => navigate(`/input?crop=${selectedCrop}&mandi=${selectedMandi}&state=${encodeURIComponent(selectedState)}`)}
          disabled={!selectedCrop || !selectedMandi}
          className="w-full bg-[#feb234] text-[#1e1c10] font-bold text-lg py-4 rounded-xl shadow-md disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-transform"
          style={{ fontFamily: "Manrope, sans-serif", minHeight: "56px" }}
        >
          {t.checkPrice}
        </button>
      </div>

      <div className="px-4 mt-5">
        <div className="bg-[#166534] rounded-2xl p-4 text-white">
          <h3 className="text-sm font-bold mb-3 opacity-80 uppercase tracking-wide"
            style={{ fontFamily: "Manrope, sans-serif" }}>
            {t.priceTrend}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {CROPS.slice(0, 6).map((crop) => {
              const mandis   = Object.keys(priceData[crop.id] || {});
              const prices   = priceData[crop.id]?.[mandis[0]] || [];
              const todayPx  = prices.length > 0 ? prices[prices.length - 1].price : crop.base;
              const ti       = crop.trend === "rising" ? "↑" : crop.trend === "falling" ? "↓" : "→";
              const tc       = crop.trend === "rising" ? "text-green-300" : crop.trend === "falling" ? "text-red-300" : "text-yellow-200";
              return (
                <button
                  key={crop.id}
                  onClick={() => handleCropChange(crop.id)}
                  className={`bg-white/10 rounded-xl p-3 text-left active:bg-white/20 transition-colors ${selectedCrop === crop.id ? "ring-2 ring-[#feb234]" : ""}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs opacity-70 truncate pr-1">{crop.name.split(" / ")[0]}</p>
                    <span className={`text-sm font-bold ${tc}`}>{ti}</span>
                  </div>
                  <p className="text-base font-bold">₹{todayPx.toLocaleString("en-IN")}</p>
                  <p className="text-xs opacity-50">{mandis[0]}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
