import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { priceData, mandis } from "../data/mockPrices";
import MandiCard from "../components/MandiCard";

export default function Comparison() {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const crop = searchParams.get("crop") || "Onion";

  const mandiComparison = useMemo(() => {
    return mandis.map((mandi) => {
      const prices = priceData[crop]?.[mandi] || [];
      const todayPrice = prices.length > 0 ? prices[prices.length - 1].price : 0;
      const avgPrice =
        prices.length > 0
          ? Math.round(prices.reduce((s, p) => s + p.price, 0) / prices.length)
          : 0;
      return { mandi, todayPrice, avgPrice };
    });
  }, [crop]);

  const bestMandi = mandiComparison.reduce(
    (best, curr) => (curr.todayPrice > best.todayPrice ? curr : best),
    mandiComparison[0]
  );

  return (
    <div className="min-h-screen bg-[#fff9eb] pb-24">
      <div className="px-4 pt-6 pb-4">
        <h1
          className="text-2xl font-extrabold text-[#004c22] mb-1"
          style={{ fontFamily: "Manrope, sans-serif" }}
        >
          {t.comparison}
        </h1>
        <p
          className="text-sm text-gray-600"
          style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
        >
          {crop}
        </p>
      </div>

      <div className="px-4 space-y-3">
        {mandiComparison.map((item) => (
          <MandiCard
            key={item.mandi}
            mandi={item.mandi}
            todayPrice={item.todayPrice}
            avgPrice={item.avgPrice}
            isBest={item.mandi === bestMandi.mandi}
          />
        ))}
      </div>
    </div>
  );
}
