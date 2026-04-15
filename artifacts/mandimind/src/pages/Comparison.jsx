import { useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { priceData, mandis, getCropById, getCropNames } from "../data/mockPrices";
import MandiCard from "../components/MandiCard";

export default function Comparison() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initCrop = searchParams.get("crop") || "onion";
  const [selectedCrop, setSelectedCrop] = useState(initCrop);

  const cropInfo = getCropById(selectedCrop);
  const cropList = getCropNames();

  const mandiComparison = useMemo(() => {
    return mandis.map((mandi) => {
      const prices = priceData[selectedCrop]?.[mandi] || [];
      const todayPrice = prices.length > 0 ? prices[prices.length - 1].price : 0;
      const avgPrice = prices.length > 0
        ? Math.round(prices.reduce((s, p) => s + p.price, 0) / prices.length)
        : 0;
      return { mandi, todayPrice, avgPrice };
    });
  }, [selectedCrop]);

  const bestMandi = mandiComparison.reduce(
    (best, curr) => (curr.todayPrice > best.todayPrice ? curr : best),
    mandiComparison[0]
  );

  return (
    <div className="min-h-screen bg-[#fff9eb] pb-24">
      <div className="px-4 pt-6 pb-4">
        <h1
          className="text-2xl font-extrabold text-[#004c22] mb-3"
          style={{ fontFamily: "Manrope, sans-serif" }}
        >
          {t.comparison}
        </h1>
        <select
          value={selectedCrop}
          onChange={(e) => setSelectedCrop(e.target.value)}
          className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-base text-[#1e1c10] outline-none focus:border-[#004c22]"
          style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
        >
          {cropList.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="px-4">
        <div className="bg-[#004c22] rounded-xl p-3 mb-4 flex items-center justify-between">
          <span className="text-white text-sm" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
            {t.bestMandi}:
          </span>
          <span className="text-[#feb234] font-bold text-base" style={{ fontFamily: "Manrope, sans-serif" }}>
            {bestMandi.mandi} — ₹{bestMandi.todayPrice.toLocaleString("en-IN")}
          </span>
        </div>

        <div className="space-y-3">
          {mandiComparison
            .slice()
            .sort((a, b) => b.todayPrice - a.todayPrice)
            .map((item, idx) => (
              <MandiCard
                key={item.mandi}
                mandi={item.mandi}
                todayPrice={item.todayPrice}
                avgPrice={item.avgPrice}
                isBest={item.mandi === bestMandi.mandi}
                rank={idx + 1}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
