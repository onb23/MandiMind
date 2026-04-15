import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { getCropById, getVarietiesByCrop } from "../data/mockPrices";

export default function FarmerInput() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const cropId    = searchParams.get("crop")  || "";
  const mandi     = searchParams.get("mandi") || "";
  const stateVal  = searchParams.get("state") || "Maharashtra";

  const cropInfo  = getCropById(cropId);
  const varieties = getVarietiesByCrop(cropId);

  const [variety,  setVariety]  = useState(varieties[0] || "");
  const [quality,  setQuality]  = useState("");
  const [harvest,  setHarvest]  = useState("");
  const [storage,  setStorage]  = useState("");
  const [urgency,  setUrgency]  = useState("");
  const [quantity, setQuantity] = useState("");

  const handleSubmit = () => {
    if (quality && harvest && storage && urgency) {
      const params = new URLSearchParams({
        crop: cropId, mandi, state: stateVal, variety,
        quality, harvest, storage, urgency,
        quantity: quantity || "0",
      });
      navigate(`/decision?${params.toString()}`);
    }
  };

  const isFormValid = quality && harvest && storage && urgency;

  const RadioGroup = ({ options, value, onChange }) => (
    <div className="flex gap-2 flex-wrap">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 py-3 px-2 rounded-xl text-sm font-semibold border transition-all flex flex-col items-center gap-0.5 ${
            value === opt.value
              ? "bg-[#004c22] text-white border-[#004c22]"
              : "bg-white text-[#1e1c10] border-gray-300 active:bg-gray-50"
          }`}
          style={{ fontFamily: "Be Vietnam Pro, sans-serif", minHeight: "52px" }}
        >
          {opt.icon && <span className="text-base leading-none">{opt.icon}</span>}
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  );

  const Section = ({ label, children }) => (
    <div className="mb-5">
      <label className="block text-xs font-semibold text-[#1e1c10] uppercase tracking-wide mb-2"
        style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
        {label}
      </label>
      {children}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#fff9eb] pb-24">
      <div className="px-4 pt-6 pb-4">
        <button onClick={() => navigate(-1)}
          className="text-sm text-[#004c22] font-medium mb-3 flex items-center gap-1"
          style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
          {t.back}
        </button>
        <h1 className="text-2xl font-extrabold text-[#004c22] mb-0.5"
          style={{ fontFamily: "Manrope, sans-serif" }}>
          {t.farmerInput}
        </h1>
        <p className="text-sm text-gray-400" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
          {cropInfo.name.split(" / ")[0]} — {mandi} · {stateVal}
        </p>
      </div>

      <div className="px-4">
        {varieties.length > 0 && (
          <Section label={t.variety || "Variety / जात / वाण"}>
            <div className="flex gap-2 flex-wrap">
              {varieties.map((v) => (
                <button key={v} onClick={() => setVariety(v)}
                  className={`py-2.5 px-3 rounded-xl text-sm font-medium border transition-all ${
                    variety === v ? "bg-[#004c22] text-white border-[#004c22]" : "bg-white text-[#1e1c10] border-gray-300"
                  }`}
                  style={{ fontFamily: "Be Vietnam Pro, sans-serif", minHeight: "44px" }}>
                  {v}
                </button>
              ))}
            </div>
            {variety && (
              <p className="text-xs text-gray-400 mt-1.5 pl-1">
                Selected: <span className="font-semibold text-[#004c22]">{variety}</span>
              </p>
            )}
          </Section>
        )}

        <Section label={t.cropQuality}>
          <RadioGroup value={quality} onChange={setQuality} options={[
            { value: "high",   icon: "⭐", label: t.high },
            { value: "medium", icon: "✅", label: t.medium },
            { value: "low",    icon: "⚠️", label: t.low },
          ]} />
        </Section>

        <Section label={t.harvestStatus}>
          <RadioGroup value={harvest} onChange={setHarvest} options={[
            { value: "ready",     icon: "🌾", label: t.ready },
            { value: "soon",      icon: "🌿", label: t.soon || "5–7 Days" },
            { value: "not_ready", icon: "🌱", label: t.notReady },
          ]} />
        </Section>

        <Section label={t.storageAvailable}>
          <RadioGroup value={storage} onChange={setStorage} options={[
            { value: "yes", icon: "🏚️", label: t.yes },
            { value: "no",  icon: "❌", label: t.no },
          ]} />
        </Section>

        <Section label={t.urgency}>
          <RadioGroup value={urgency} onChange={setUrgency} options={[
            { value: "need_money", icon: "💰", label: t.needNow || t.needMoney },
            { value: "flexible",   icon: "🕐", label: t.flexible },
            { value: "can_wait",   icon: "🧘", label: t.canWait },
          ]} />
        </Section>

        <div className="mb-6">
          <label className="block text-xs font-semibold text-[#1e1c10] uppercase tracking-wide mb-2"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
            {t.quantityLabel}
          </label>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="e.g. 10"
            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-4 text-base text-[#1e1c10] outline-none focus:border-[#004c22] focus:ring-2 focus:ring-[#004c22]/20"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={!isFormValid}
          className="w-full bg-[#feb234] text-[#1e1c10] font-bold text-lg py-4 rounded-xl shadow-md disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-transform"
          style={{ fontFamily: "Manrope, sans-serif", minHeight: "56px" }}
        >
          {t.submit}
        </button>
      </div>
    </div>
  );
}
