import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { priceData } from "../data/mockPrices";
import { getDecision } from "../utils/decisionEngine";
import DecisionCard from "../components/DecisionCard";
import TrendChart from "../components/TrendChart";

export default function Decision() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const crop = searchParams.get("crop") || "Onion";
  const mandi = searchParams.get("mandi") || "Pune";
  const quality = searchParams.get("quality") || "MEDIUM";
  const harvest = searchParams.get("harvest") || "READY";
  const storage = searchParams.get("storage") || "YES";
  const urgency = searchParams.get("urgency") || "FLEXIBLE";

  const result = useMemo(() => {
    const prices = priceData[crop]?.[mandi] || [];
    return getDecision(prices, { quality, harvest, storage, urgency });
  }, [crop, mandi, quality, harvest, storage, urgency]);

  const prices = priceData[crop]?.[mandi] || [];

  return (
    <div className="min-h-screen bg-[#fff9eb] pb-24">
      <div className="px-4 pt-6 pb-4">
        <h1
          className="text-2xl font-extrabold text-[#004c22] mb-1"
          style={{ fontFamily: "Manrope, sans-serif" }}
        >
          {t.decision}
        </h1>
        <p
          className="text-sm text-gray-600"
          style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
        >
          {crop} - {mandi}
        </p>
      </div>

      <div className="px-4 space-y-4">
        <DecisionCard decision={result.decision} score={result.score} />

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-3">
            <span
              className="text-sm text-gray-500"
              style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
            >
              {t.trend}
            </span>
            <span
              className={`text-sm font-bold px-3 py-1 rounded-full ${
                result.trend === "RISING"
                  ? "bg-green-100 text-green-700"
                  : result.trend === "FALLING"
                    ? "bg-red-100 text-red-700"
                    : "bg-gray-100 text-gray-700"
              }`}
            >
              {result.trend === "RISING"
                ? t.rising
                : result.trend === "FALLING"
                  ? t.falling
                  : t.stable}
            </span>
          </div>
          <div className="flex justify-between items-center mb-3">
            <span
              className="text-sm text-gray-500"
              style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
            >
              {t.todayPrice}
            </span>
            <span
              className="text-lg font-bold text-[#004c22]"
              style={{ fontFamily: "Manrope, sans-serif" }}
            >
              {"\u20B9"}{result.currentPrice} {t.perQuintal}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span
              className="text-sm text-gray-500"
              style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
            >
              {t.priceRange}
            </span>
            <span
              className="text-sm font-semibold text-gray-700"
              style={{ fontFamily: "Manrope, sans-serif" }}
            >
              {"\u20B9"}{result.priceRange.min} - {"\u20B9"}{result.priceRange.max}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <h3
            className="text-base font-bold text-[#1e1c10] mb-3"
            style={{ fontFamily: "Manrope, sans-serif" }}
          >
            {t.explanation}
          </h3>
          <div className="space-y-2">
            {[
              {
                label: t.trendExplanation,
                value: result.explanation.trend,
              },
              {
                label: t.qualityExplanation,
                value: result.explanation.quality,
              },
              {
                label: t.urgencyExplanation,
                value: result.explanation.urgency,
              },
              {
                label: t.storageExplanation,
                value: result.explanation.storage,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-start gap-2 py-1"
              >
                <span className="text-sm font-semibold text-[#004c22] min-w-[80px]">
                  {item.label}:
                </span>
                <span
                  className="text-sm text-gray-600"
                  style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
                >
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <h3
            className="text-base font-bold text-[#1e1c10] mb-3"
            style={{ fontFamily: "Manrope, sans-serif" }}
          >
            {t.priceTrend} - {t.last30Days}
          </h3>
          <TrendChart data={prices} />
        </div>

        <button
          onClick={() => navigate(`/compare?crop=${crop}`)}
          className="w-full bg-[#004c22] text-white font-bold text-lg py-4 rounded-xl shadow-md active:scale-[0.98] transition-transform"
          style={{
            fontFamily: "Manrope, sans-serif",
            minHeight: "56px",
          }}
        >
          {t.compareMandis}
        </button>
      </div>
    </div>
  );
}
