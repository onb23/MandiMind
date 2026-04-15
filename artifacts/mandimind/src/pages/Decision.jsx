import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { priceData, getCropById } from "../data/mockPrices";
import { getDecision } from "../utils/decisionEngine";
import DecisionCard from "../components/DecisionCard";
import TrendChart from "../components/TrendChart";

export default function Decision() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const cropId   = searchParams.get("crop")     || "onion";
  const mandi    = searchParams.get("mandi")    || "";
  const variety  = searchParams.get("variety")  || "";
  const quality  = searchParams.get("quality")  || "MEDIUM";
  const harvest  = searchParams.get("harvest")  || "READY";
  const storage  = searchParams.get("storage")  || "YES";
  const urgency  = searchParams.get("urgency")  || "FLEXIBLE";
  const quantity = searchParams.get("quantity") || "0";

  const cropInfo = getCropById(cropId);

  const result = useMemo(() => {
    const prices = priceData[cropId]?.[mandi] || [];
    return getDecision(prices, { quality, harvest, storage, urgency, variety, cropId });
  }, [cropId, mandi, variety, quality, harvest, storage, urgency]);

  const prices = priceData[cropId]?.[mandi] || [];

  const trendText  =
    result.trend === "RISING"  ? t.rising :
    result.trend === "FALLING" ? t.falling : t.stable;

  const trendClass =
    result.trend === "RISING"  ? "bg-green-100 text-green-700" :
    result.trend === "FALLING" ? "bg-red-100 text-red-700"     :
    "bg-gray-100 text-gray-700";

  const totalValue = Number(quantity) > 0
    ? `₹${(result.currentPrice * Number(quantity)).toLocaleString("en-IN")}`
    : null;

  return (
    <div className="min-h-screen bg-[#fff9eb] pb-24">
      <div className="px-4 pt-6 pb-4">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-[#004c22] font-medium mb-3"
          style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
        >
          {t.back}
        </button>
        <h1
          className="text-2xl font-extrabold text-[#004c22] mb-0.5"
          style={{ fontFamily: "Manrope, sans-serif" }}
        >
          {t.decision}
        </h1>
        <p className="text-sm text-gray-400" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
          {cropInfo.name.split(" / ")[0]}
          {variety ? ` · ${variety}` : ""} — {mandi}
        </p>
      </div>

      <div className="px-4 space-y-4">
        <DecisionCard decision={result.decision} score={result.score} />

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>{t.trendLabel}</span>
            <span className={`text-sm font-bold px-3 py-1 rounded-full ${trendClass}`}>{trendText}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>{t.todayPrice}</span>
            <div className="text-right">
              <span className="text-xl font-bold text-[#004c22]" style={{ fontFamily: "Manrope, sans-serif" }}>
                ₹{result.currentPrice.toLocaleString("en-IN")}
              </span>
              <span className="text-xs text-gray-400 ml-1">{t.per}</span>
            </div>
          </div>
          {result.variantOffset !== 0 && variety && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>{variety} premium</span>
              <span className={`text-sm font-semibold ${result.variantOffset > 0 ? "text-green-600" : "text-red-600"}`}>
                {result.variantOffset > 0 ? "+" : ""}₹{result.variantOffset.toLocaleString("en-IN")}
              </span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>{t.priceRange}</span>
            <span className="text-sm font-semibold text-gray-700" style={{ fontFamily: "Manrope, sans-serif" }}>
              ₹{result.priceRange.min.toLocaleString("en-IN")} – ₹{result.priceRange.max.toLocaleString("en-IN")}
            </span>
          </div>
          {totalValue && (
            <div className="flex justify-between items-center border-t border-gray-100 pt-3">
              <span className="text-sm text-gray-500" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                {quantity} quintal total
              </span>
              <span className="text-base font-bold text-[#004c22]" style={{ fontFamily: "Manrope, sans-serif" }}>
                {totalValue}
              </span>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <h3 className="text-base font-bold text-[#1e1c10] mb-3" style={{ fontFamily: "Manrope, sans-serif" }}>
            {t.explanation}
          </h3>
          <div className="space-y-2">
            {[
              { label: t.trendLabel,   value: result.explanation.trend },
              { label: t.qualityLabel, value: result.explanation.quality },
              { label: t.urgencyLabel, value: result.explanation.urgency },
              { label: t.storageLabel, value: result.explanation.storage },
              ...(result.explanation.variety
                ? [{ label: variety, value: result.explanation.variety }]
                : []),
            ].map((item) => (
              <div key={item.label} className="flex items-start gap-2 py-1 border-b border-gray-50 last:border-0">
                <span className="text-xs font-bold text-[#004c22] min-w-[80px] shrink-0 pt-0.5 uppercase">
                  {item.label}
                </span>
                <span className="text-sm text-gray-600" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <h3 className="text-base font-bold text-[#1e1c10] mb-3" style={{ fontFamily: "Manrope, sans-serif" }}>
            {t.priceTrend} — {t.last30Days}
          </h3>
          <TrendChart data={prices} />
        </div>

        <button
          onClick={() => navigate(`/compare?crop=${cropId}`)}
          className="w-full bg-[#004c22] text-white font-bold text-lg py-4 rounded-xl shadow-md active:scale-[0.98] transition-transform"
          style={{ fontFamily: "Manrope, sans-serif", minHeight: "56px" }}
        >
          {t.compareMandis}
        </button>
      </div>
    </div>
  );
}
