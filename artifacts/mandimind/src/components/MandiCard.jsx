import { useLanguage } from "../context/LanguageContext";

export default function MandiCard({
  mandi,
  todayPrice,
  avgPrice,
  lastUpdated,
  stale,
  freshnessDays,
  isBest,
  rank,
  freshnessText,
  bestLabel,
}) {
  const { t } = useLanguage();

  const displayPrice = todayPrice > 0 ? `₹${todayPrice.toLocaleString("en-IN")}` : "—";
  const displayAvg = avgPrice > 0 ? `₹${avgPrice.toLocaleString("en-IN")}` : "—";
  const isFreshToday = Number.isFinite(freshnessDays) && freshnessDays === 0;
  const isRecent = Number.isFinite(freshnessDays) && freshnessDays >= 1 && freshnessDays <= 2;
  const isDelayed = Number.isFinite(freshnessDays) && freshnessDays > 2;
  const trustBadge = freshnessText
    || (isFreshToday
      ? "Updated today"
      : isRecent
        ? `${freshnessDays} day old`
        : isDelayed
          ? `${freshnessDays} days old`
          : "Latest available");
  const trustBadgeClass = isFreshToday
    ? "bg-green-100 text-green-700"
    : isRecent
      ? "bg-amber-50 text-amber-700"
      : "bg-red-50 text-red-600";

  const trendDelta = Number.isFinite(todayPrice) && Number.isFinite(avgPrice) ? todayPrice - avgPrice : null;
  const trendDirection =
    trendDelta === null
      ? null
      : trendDelta > 0
        ? "up"
        : trendDelta < 0
          ? "down"
          : "flat";
  const trendLabel =
    trendDirection === "up"
      ? t.comparisonTrendUpVsAvg
      : trendDirection === "down"
        ? t.comparisonTrendDownVsAvg
        : trendDirection === "flat"
          ? t.comparisonTrendFlatVsAvg
          : null;

  return (
    <div
      className={`rounded-xl p-4 shadow-sm border transition-all ${
        stale ? "bg-amber-50/60 border-amber-200" : "bg-white border-gray-200"
      } ${
        isBest ? "border-green-500 ring-2 ring-green-100" : ""
      }`}
    >
      <div className="flex justify-between items-start mb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
              rank === 1 ? "bg-[#feb234] text-[#1e1c10]" :
              rank === 2 ? "bg-gray-200 text-gray-600" :
              rank === 3 ? "bg-orange-100 text-orange-700" :
              "bg-gray-100 text-gray-400"
            }`}
          >
            {rank}
          </span>
          <h3
            className="text-base font-bold text-[#1e1c10] truncate"
            style={{ fontFamily: "Manrope, sans-serif" }}
          >
            {mandi}
          </h3>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {isBest && (
            <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">
              {bestLabel || t.bestMandi}
            </span>
          )}
          <span className={`${trustBadgeClass} text-[10px] px-2 py-0.5 rounded-full font-semibold`}>
            {trustBadge}
          </span>
        </div>
      </div>

      <div className="flex justify-between items-end gap-3">
        <div>
          <p className="text-xs text-gray-500 mb-0.5" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
            Latest available price
          </p>
          <p className="text-2xl font-extrabold text-[#004c22]" style={{ fontFamily: "Manrope, sans-serif" }}>
            {displayPrice}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 mb-0.5" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
            Recent average
          </p>
          <p className="text-base font-semibold text-gray-600" style={{ fontFamily: "Manrope, sans-serif" }}>
            {displayAvg}
          </p>
        </div>
      </div>

      {lastUpdated && (
        <p className="text-[11px] text-gray-500 mt-2 font-medium" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
          Updated: {lastUpdated} · Source: Agmarknet
        </p>
      )}

      {trendLabel && (
        <p
          className={`text-[11px] mt-1 font-medium ${
            trendDirection === "up"
              ? "text-green-600"
              : trendDirection === "down"
                ? "text-red-500"
                : "text-gray-500"
          }`}
          style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
        >
          {trendLabel}
        </p>
      )}
    </div>
  );
}
