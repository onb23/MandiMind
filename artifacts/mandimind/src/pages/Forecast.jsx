import { useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { priceData, CROPS, mandis, getCropById } from "../data/mockPrices";
import TrendChart from "../components/TrendChart";

export default function Forecast() {
  const { t } = useLanguage();
  const [selectedCrop, setSelectedCrop] = useState(CROPS[0].id);
  const [selectedMandi, setSelectedMandi] = useState(mandis[0]);

  const prices = priceData[selectedCrop]?.[selectedMandi] || [];
  const cropInfo = getCropById(selectedCrop);

  const currentPrice = prices.length > 0 ? prices[prices.length - 1].price : 0;
  const prevPrice    = prices.length > 1 ? prices[prices.length - 2].price : currentPrice;
  const change       = currentPrice - prevPrice;
  const changePct    = prevPrice > 0 ? ((change / prevPrice) * 100).toFixed(1) : 0;

  const trendIcon =
    cropInfo.trend === "rising"  ? "↑ " + t.rising :
    cropInfo.trend === "falling" ? "↓ " + t.falling :
    "→ " + t.stable;

  const trendBg =
    cropInfo.trend === "rising"  ? "bg-green-100 text-green-700" :
    cropInfo.trend === "falling" ? "bg-red-100 text-red-700" :
    "bg-gray-100 text-gray-600";

  return (
    <div className="min-h-screen bg-[#fff9eb] pb-24">
      <div className="px-4 pt-6 pb-4">
        <h1
          className="text-2xl font-extrabold text-[#004c22] mb-1"
          style={{ fontFamily: "Manrope, sans-serif" }}
        >
          {t.forecast}
        </h1>
        <p className="text-sm text-gray-500" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
          {t.priceTrend}
        </p>
      </div>

      <div className="px-4 space-y-4">
        <div className="flex gap-2">
          <select
            value={selectedCrop}
            onChange={(e) => setSelectedCrop(e.target.value)}
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
            {mandis.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm text-gray-500" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>{t.todayPrice}</span>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${trendBg}`}>
                {trendIcon}
              </span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${change >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                {change >= 0 ? "+" : ""}{changePct}%
              </span>
            </div>
          </div>
          <p className="text-3xl font-extrabold text-[#004c22]" style={{ fontFamily: "Manrope, sans-serif" }}>
            ₹{currentPrice.toLocaleString("en-IN")}
          </p>
          <p className="text-xs text-gray-400 mt-0.5" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
            {t.perQuintal}
          </p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <h3 className="text-base font-bold text-[#1e1c10] mb-3" style={{ fontFamily: "Manrope, sans-serif" }}>
            {t.last30Days}
          </h3>
          <TrendChart data={prices} height={220} />
        </div>

        <div className="bg-[#166534] rounded-2xl p-4 text-white">
          <h3 className="text-sm font-bold mb-3 opacity-90" style={{ fontFamily: "Manrope, sans-serif" }}>
            {t.comparison} — {cropInfo.name.split(" / ")[0]}
          </h3>
          <div className="space-y-2">
            {mandis.map((mandi) => {
              const mp    = priceData[selectedCrop]?.[mandi] || [];
              const price = mp.length > 0 ? mp[mp.length - 1].price : 0;
              const isTop = price === Math.max(...mandis.map((m) => priceData[selectedCrop]?.[m]?.slice(-1)[0]?.price || 0));
              return (
                <div
                  key={mandi}
                  className={`flex justify-between items-center rounded-lg px-3 py-2 ${isTop ? "bg-[#feb234]/20 border border-[#feb234]/40" : "bg-white/10"}`}
                >
                  <span className="text-sm">{mandi}</span>
                  <span className={`text-sm font-bold ${isTop ? "text-[#feb234]" : ""}`}>
                    ₹{price.toLocaleString("en-IN")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
