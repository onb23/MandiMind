import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { getCropNames, mandis, priceData, CROPS } from "../data/mockPrices";
import logo from "../assets/logo.svg";

export default function Home() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [selectedCrop, setSelectedCrop] = useState("");
  const [selectedMandi, setSelectedMandi] = useState("");

  const cropList = getCropNames();

  const trendIcon = (trend) =>
    trend === "rising" ? "↑" : trend === "falling" ? "↓" : "→";

  const trendColor = (trend) =>
    trend === "rising"
      ? "text-green-300"
      : trend === "falling"
        ? "text-red-300"
        : "text-yellow-200";

  return (
    <div className="min-h-screen bg-[#fff9eb] pb-24">
      <div className="px-4 pt-8 pb-6 text-center">
        <img src={logo} alt="MandiMind" className="w-20 h-20 mx-auto mb-4" />
        <h1
          className="text-3xl font-extrabold text-[#004c22] mb-1"
          style={{ fontFamily: "Manrope, sans-serif" }}
        >
          {t.appName}
        </h1>
        <p
          className="text-sm text-[#1e1c10] opacity-60"
          style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
        >
          {t.tagline}
        </p>
      </div>

      <div className="px-4 space-y-4">
        <div>
          <label
            className="block text-sm font-semibold text-[#1e1c10] mb-2"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            {t.selectCrop}
          </label>
          <select
            value={selectedCrop}
            onChange={(e) => setSelectedCrop(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-4 text-base text-[#1e1c10] outline-none focus:border-[#004c22] focus:ring-2 focus:ring-[#004c22]/20"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            <option value="">{t.selectCrop}</option>
            {cropList.map((crop) => (
              <option key={crop.id} value={crop.id}>
                {crop.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            className="block text-sm font-semibold text-[#1e1c10] mb-2"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            {t.selectMandi}
          </label>
          <select
            value={selectedMandi}
            onChange={(e) => setSelectedMandi(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-4 text-base text-[#1e1c10] outline-none focus:border-[#004c22] focus:ring-2 focus:ring-[#004c22]/20"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            <option value="">{t.selectMandi}</option>
            {mandis.map((mandi) => (
              <option key={mandi} value={mandi}>
                {mandi}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => navigate(`/input?crop=${selectedCrop}&mandi=${selectedMandi}`)}
          disabled={!selectedCrop || !selectedMandi}
          className="w-full bg-[#feb234] text-[#1e1c10] font-bold text-lg py-4 rounded-xl shadow-md disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-transform"
          style={{ fontFamily: "Manrope, sans-serif", minHeight: "56px" }}
        >
          {t.checkPrice}
        </button>
      </div>

      <div className="px-4 mt-6">
        <div className="bg-[#166534] rounded-2xl p-4 text-white">
          <h3
            className="text-base font-bold mb-3 opacity-90"
            style={{ fontFamily: "Manrope, sans-serif" }}
          >
            {t.priceTrend}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {CROPS.slice(0, 6).map((crop) => {
              const prices = priceData[crop.id]?.["Pune"] || [];
              const today = prices.length > 0 ? prices[prices.length - 1].price : crop.base;
              return (
                <div key={crop.id} className="bg-white/10 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs opacity-70 truncate pr-1">
                      {crop.name.split(" / ")[0]}
                    </p>
                    <span className={`text-sm font-bold ${trendColor(crop.trend)}`}>
                      {trendIcon(crop.trend)}
                    </span>
                  </div>
                  <p className="text-base font-bold">
                    ₹{today.toLocaleString("en-IN")}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
