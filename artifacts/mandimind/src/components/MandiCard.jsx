import { useLanguage } from "../context/LanguageContext";

export default function MandiCard({ mandi, todayPrice, avgPrice, isBest }) {
  const { t } = useLanguage();

  return (
    <div
      className={`bg-white rounded-xl p-4 shadow-sm border ${isBest ? "border-green-500 ring-2 ring-green-200" : "border-gray-200"}`}
    >
      <div className="flex justify-between items-start mb-2">
        <h3
          className="text-lg font-bold text-[#1e1c10]"
          style={{ fontFamily: "Manrope, sans-serif" }}
        >
          {mandi}
        </h3>
        {isBest && (
          <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full font-medium">
            {t.bestMandi}
          </span>
        )}
      </div>
      <div className="flex justify-between items-center">
        <div>
          <p
            className="text-sm text-gray-500"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            {t.todayPrice}
          </p>
          <p
            className="text-xl font-bold text-[#004c22]"
            style={{ fontFamily: "Manrope, sans-serif" }}
          >
            {"\u20B9"}{todayPrice}
          </p>
        </div>
        <div className="text-right">
          <p
            className="text-sm text-gray-500"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            {t.avgPrice}
          </p>
          <p
            className="text-lg font-semibold text-gray-700"
            style={{ fontFamily: "Manrope, sans-serif" }}
          >
            {"\u20B9"}{avgPrice}
          </p>
        </div>
      </div>
    </div>
  );
}
