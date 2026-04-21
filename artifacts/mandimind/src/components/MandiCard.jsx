import { useLanguage } from "../context/LanguageContext";

const getFreshnessBadge = (freshnessDays) => {
  if (!Number.isFinite(freshnessDays) || freshnessDays >= 3) {
    return {
      label: "STALE",
      className: "bg-rose-50 text-rose-700 border border-rose-100",
    };
  }

  if (freshnessDays <= 0) {
    return {
      label: "LIVE",
      className: "bg-emerald-50 text-emerald-700 border border-emerald-100",
    };
  }

  return {
    label: "RECENT",
    className: "bg-amber-50 text-amber-700 border border-amber-100",
  };
};

const getUpdatedLabel = (freshnessDays, t) => {
  if (!Number.isFinite(freshnessDays)) return null;
  if (freshnessDays <= 0) return `${t.lastUpdatedPrefix}: ${t.today.toLowerCase()}`;
  if (freshnessDays === 1) return `${t.lastUpdatedPrefix}: ${t.oneDayAgo}`;
  if (freshnessDays === 2) return `${t.lastUpdatedPrefix}: ${t.twoDaysAgo}`;
  return `${t.lastUpdatedPrefix}: ${t.daysAgoGeneric.replace("{days}", freshnessDays)}`;
};

export default function MandiCard({
  mandi,
  todayPrice,
  avgPrice,
  stale,
  freshnessDays,
  isBest,
  rank,
  bestLabel,
}) {
  const { t } = useLanguage();

  const displayPrice = todayPrice > 0 ? `₹${todayPrice.toLocaleString("en-IN")}` : "—";
  const displayAvg = avgPrice > 0 ? `₹${avgPrice.toLocaleString("en-IN")}` : "—";
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

  const freshnessBadge = getFreshnessBadge(freshnessDays);
  const relativeUpdated = getUpdatedLabel(freshnessDays, t);

  return (
    <div
      className={`rounded-2xl p-5 shadow-[0_12px_30px_rgba(15,23,42,0.09)] border transition-all duration-300 hover:shadow-[0_16px_36px_rgba(15,23,42,0.13)] hover:-translate-y-0.5 active:scale-[0.995] ${
        stale ? "bg-amber-50/45 border-amber-200/80" : "bg-white border-gray-200/95"
      } ${isBest ? "border-emerald-500 ring-2 ring-emerald-200" : ""}`}
    >
      <div className="flex justify-between items-start gap-2 mb-3">
        <div className="flex items-start gap-2 min-w-0">
          <span
            className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
              rank === 1
                ? "bg-[#feb234] text-[#1e1c10]"
                : rank === 2
                  ? "bg-gray-200 text-gray-600"
                  : rank === 3
                    ? "bg-orange-100 text-orange-700"
                    : "bg-gray-100 text-gray-400"
            }`}
          >
            {rank}
          </span>
          <div className="min-w-0">
            <h3
              className="text-base font-bold text-[#1e1c10] leading-tight truncate"
              style={{ fontFamily: "Manrope, sans-serif" }}
            >
              {mandi}
            </h3>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold tracking-wide ${freshnessBadge.className}`}>
            {freshnessBadge.label}
            {freshnessBadge.label === "LIVE" && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
          </span>
          {isBest && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
              {bestLabel || t.bestMandi}
            </span>
          )}
        </div>
      </div>

      <div className="flex justify-between items-end gap-3">
        <div>
          <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-1" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
            {stale ? t.latestPrice : t.todayPrice}
          </p>
          <p className={`text-3xl font-extrabold leading-none ${trendDirection === "down" ? "text-rose-700" : isBest || trendDirection === "up" ? "text-emerald-800" : "text-[#004c22]"}`} style={{ fontFamily: "Manrope, sans-serif" }}>
            {displayPrice}
          </p>
        </div>

        <div className="text-right">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-1" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
            {t.avgPrice7d}
          </p>
          <p className="text-base font-semibold text-gray-700" style={{ fontFamily: "Manrope, sans-serif" }}>
            {displayAvg}
          </p>
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-gray-100/90 space-y-1">
        {relativeUpdated && (
          <p className="text-[11px] text-gray-500" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
            {relativeUpdated}
          </p>
        )}
        {trendLabel && (
          <p
            className={`text-[11px] font-semibold ${
              trendDirection === "up" ? "text-emerald-800" : trendDirection === "down" ? "text-rose-700" : "text-gray-500"
            }`}
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            {trendLabel}
          </p>
        )}
      </div>
    </div>
  );
}
