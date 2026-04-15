import { useLanguage } from "../context/LanguageContext";

export default function MandiCard({ mandi, todayPrice, avgPrice, isBest, rank }) {
  const { t } = useLanguage();

  return (
    <div
      className={`bg-white rounded-xl p-4 shadow-sm border transition-all ${
        isBest ? "border-green-500 ring-2 ring-green-100" : "border-gray-200"
      }`}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              rank === 1 ? "bg-[#feb234] text-[#1e1c10]" :
              rank === 2 ? "bg-gray-200 text-gray-600" :
              rank === 3 ? "bg-orange-100 text-orange-700" :
              "bg-gray-100 text-gray-400"
            }`}
          >
            {rank}
          </span>
          <h3
            className="text-base font-bold text-[#1e1c10]"
            style={{ fontFamily: "Manrope, sans-serif" }}
          >
            {mandi}
          </h3>
        </div>
        {isBest && (
          <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">
            {t.bestMandi}
          </span>
        )}
      </div>
      <div className="flex justify-between items-end">
        <div>
          <p className="text-xs text-gray-400 mb-0.5" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>{t.todayPrice}</p>
          <p className="text-2xl font-extrabold text-[#004c22]" style={{ fontFamily: "Manrope, sans-serif" }}>
            ₹{todayPrice.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400 mb-0.5" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>{t.avgPrice}</p>
          <p className="text-base font-semibold text-gray-600" style={{ fontFamily: "Manrope, sans-serif" }}>
            ₹{avgPrice.toLocaleString("en-IN")}
          </p>
        </div>
      </div>
    </div>
  );
}
