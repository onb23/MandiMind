import { useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { priceData, crops, mandis } from "../data/mockPrices";
import TrendChart from "../components/TrendChart";

export default function Forecast() {
  const { t } = useLanguage();
  const [selectedCrop, setSelectedCrop] = useState(crops[0]);
  const [selectedMandi, setSelectedMandi] = useState(mandis[0]);

  const prices = priceData[selectedCrop]?.[selectedMandi] || [];
  const currentPrice = prices.length > 0 ? prices[prices.length - 1].price : 0;
  const prevPrice = prices.length > 1 ? prices[prices.length - 2].price : 0;
  const change = currentPrice - prevPrice;
  const changePercent =
    prevPrice > 0 ? ((change / prevPrice) * 100).toFixed(1) : 0;

  return (
    <div className="min-h-screen bg-[#fff9eb] pb-24">
      <div className="px-4 pt-6 pb-4">
        <h1
          className="text-2xl font-extrabold text-[#004c22] mb-1"
          style={{ fontFamily: "Manrope, sans-serif" }}
        >
          {t.forecast}
        </h1>
        <p
          className="text-sm text-gray-600"
          style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
        >
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
            {crops.map((crop) => (
              <option key={crop} value={crop}>
                {crop}
              </option>
            ))}
          </select>
          <select
            value={selectedMandi}
            onChange={(e) => setSelectedMandi(e.target.value)}
            className="flex-1 bg-white border border-gray-300 rounded-xl px-3 py-3 text-sm text-[#1e1c10] outline-none focus:border-[#004c22]"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            {mandis.map((mandi) => (
              <option key={mandi} value={mandi}>
                {mandi}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-1">
            <span
              className="text-sm text-gray-500"
              style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
            >
              {t.todayPrice}
            </span>
            <span
              className={`text-sm font-bold px-2 py-0.5 rounded-full ${
                change >= 0
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {change >= 0 ? "+" : ""}
              {changePercent}%
            </span>
          </div>
          <p
            className="text-3xl font-extrabold text-[#004c22]"
            style={{ fontFamily: "Manrope, sans-serif" }}
          >
            {"\u20B9"}{currentPrice}
          </p>
          <p
            className="text-sm text-gray-500"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            {t.perQuintal}
          </p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <h3
            className="text-base font-bold text-[#1e1c10] mb-3"
            style={{ fontFamily: "Manrope, sans-serif" }}
          >
            {t.last30Days}
          </h3>
          <TrendChart data={prices} height={250} />
        </div>

        <div className="bg-[#166534] rounded-2xl p-4 text-white">
          <h3
            className="text-base font-bold mb-3"
            style={{ fontFamily: "Manrope, sans-serif" }}
          >
            {t.comparison} - {selectedCrop}
          </h3>
          <div className="space-y-2">
            {mandis.map((mandi) => {
              const mp = priceData[selectedCrop]?.[mandi] || [];
              const price = mp.length > 0 ? mp[mp.length - 1].price : 0;
              return (
                <div
                  key={mandi}
                  className="flex justify-between items-center bg-white/10 rounded-lg px-3 py-2"
                >
                  <span className="text-sm">{mandi}</span>
                  <span className="text-sm font-bold">{"\u20B9"}{price}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
