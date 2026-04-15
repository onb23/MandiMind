import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";

export default function FarmerInput() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const crop = searchParams.get("crop") || "";
  const mandi = searchParams.get("mandi") || "";

  const [quality, setQuality] = useState("");
  const [harvest, setHarvest] = useState("");
  const [storage, setStorage] = useState("");
  const [urgency, setUrgency] = useState("");
  const [quantity, setQuantity] = useState("");

  const handleSubmit = () => {
    if (quality && harvest && storage && urgency) {
      const params = new URLSearchParams({
        crop,
        mandi,
        quality,
        harvest,
        storage,
        urgency,
        quantity: quantity || "0",
      });
      navigate(`/decision?${params.toString()}`);
    }
  };

  const isFormValid = quality && harvest && storage && urgency;

  const RadioGroup = ({ label, options, value, onChange }) => (
    <div className="mb-5">
      <label
        className="block text-sm font-semibold text-[#1e1c10] mb-3"
        style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
      >
        {label}
      </label>
      <div className="flex gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex-1 py-3 px-3 rounded-xl text-sm font-medium border transition-all ${
              value === opt.value
                ? "bg-[#004c22] text-white border-[#004c22]"
                : "bg-white text-[#1e1c10] border-gray-300"
            }`}
            style={{
              fontFamily: "Be Vietnam Pro, sans-serif",
              minHeight: "48px",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#fff9eb] pb-24">
      <div className="px-4 pt-6 pb-4">
        <h1
          className="text-2xl font-extrabold text-[#004c22] mb-1"
          style={{ fontFamily: "Manrope, sans-serif" }}
        >
          {t.farmerInput}
        </h1>
        <p
          className="text-sm text-gray-600"
          style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
        >
          {crop} - {mandi}
        </p>
      </div>

      <div className="px-4">
        <RadioGroup
          label={t.cropQuality}
          value={quality}
          onChange={setQuality}
          options={[
            { value: "HIGH", label: t.high },
            { value: "MEDIUM", label: t.medium },
            { value: "LOW", label: t.low },
          ]}
        />

        <RadioGroup
          label={t.harvestStatus}
          value={harvest}
          onChange={setHarvest}
          options={[
            { value: "READY", label: t.ready },
            { value: "5-7 DAYS", label: t.fiveToSevenDays },
            { value: "NOT READY", label: t.notReady },
          ]}
        />

        <RadioGroup
          label={t.storageAvailable}
          value={storage}
          onChange={setStorage}
          options={[
            { value: "YES", label: t.yes },
            { value: "NO", label: t.no },
          ]}
        />

        <RadioGroup
          label={t.urgency}
          value={urgency}
          onChange={setUrgency}
          options={[
            { value: "NEED MONEY", label: t.needMoney },
            { value: "FLEXIBLE", label: t.flexible },
            { value: "CAN WAIT", label: t.canWait },
          ]}
        />

        <div className="mb-6">
          <label
            className="block text-sm font-semibold text-[#1e1c10] mb-2"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            {t.quantityLabel}
          </label>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="10"
            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-4 text-base text-[#1e1c10] outline-none focus:border-[#004c22] focus:ring-2 focus:ring-[#004c22]/20"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={!isFormValid}
          className="w-full bg-[#feb234] text-[#1e1c10] font-bold text-lg py-4 rounded-xl shadow-md disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-transform"
          style={{
            fontFamily: "Manrope, sans-serif",
            minHeight: "56px",
          }}
        >
          {t.seeDecision}
        </button>
      </div>
    </div>
  );
}
