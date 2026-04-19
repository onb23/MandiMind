import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { getCropNames, getMandisByCrop } from "../data/mockPrices";
import logo from "../assets/logo.svg";

export default function Home() {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [selectedCrop,  setSelectedCrop]  = useState("");
  const [selectedMandi, setSelectedMandi] = useState("");

  const cropList  = getCropNames();
  const mandiList = selectedCrop ? getMandisByCrop(selectedCrop) : [];

  const handleCropChange = (cropId) => {
    setSelectedCrop(cropId);
    setSelectedMandi("");
  };

  const handleMandiChange = (mandi) => {
    setSelectedMandi(mandi);
  };

  return (
    <div className="min-h-screen bg-[#fff9eb] pb-24">
      <div className="px-4 pt-8 pb-6 text-center">
        <img src={logo} alt="MandiMind" className="w-20 h-20 mx-auto mb-3" />
        <h1
          className="text-3xl font-extrabold text-[#004c22] mb-1"
          style={{ fontFamily: "Manrope, sans-serif" }}
        >
          {t.appName}
        </h1>
        <p className="text-sm text-[#1e1c10] opacity-55" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
          {t.tagline}
        </p>
        <div className="mt-2 inline-flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-full px-3 py-1">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
          <span className="text-xs text-green-700 font-medium" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
            Maharashtra · Live Agmarknet Data
          </span>
        </div>
      </div>

      <div className="px-4 space-y-3">
        <div>
          <label
            className="block text-xs font-semibold text-[#1e1c10] uppercase tracking-wide mb-1.5"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            {t.selectCrop}
          </label>
          <select
            value={selectedCrop}
            onChange={(e) => handleCropChange(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3.5 text-base text-[#1e1c10] outline-none focus:border-[#004c22]"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            <option value="">{t.selectCrop}</option>
            {cropList.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label
            className="block text-xs font-semibold text-[#1e1c10] uppercase tracking-wide mb-1.5"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            {t.selectMandi}
          </label>
          <select
            value={selectedMandi}
            onChange={(e) => handleMandiChange(e.target.value)}
            disabled={!selectedCrop}
            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3.5 text-base text-[#1e1c10] outline-none focus:border-[#004c22] disabled:opacity-50"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            <option value="">{selectedCrop ? t.selectMandi : "— Select crop first —"}</option>
            {mandiList.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <button
          onClick={() =>
            navigate(
              `/input?crop=${selectedCrop}&mandi=${encodeURIComponent(selectedMandi)}&state=Maharashtra`
            )
          }
          disabled={!selectedCrop || !selectedMandi}
          className="w-full bg-[#feb234] text-[#1e1c10] font-bold text-lg py-4 rounded-xl shadow-md disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-transform"
          style={{ fontFamily: "Manrope, sans-serif", minHeight: "56px" }}
        >
          {t.checkPrice}
        </button>
      </div>

      <div className="px-4 mt-6 space-y-3">
        <div
          className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-3"
        >
          <span className="text-2xl">📊</span>
          <div>
            <p className="text-sm font-bold text-[#004c22]" style={{ fontFamily: "Manrope, sans-serif" }}>
              {t.comparison}
            </p>
            <p className="text-xs text-gray-500 mt-0.5" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              Compare prices across all Maharashtra mandis with live data.
            </p>
          </div>
          <button
            onClick={() => navigate("/compare")}
            className="ml-auto flex-shrink-0 bg-[#004c22] text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            {t.compare}
          </button>
        </div>

        <div
          className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-3"
        >
          <span className="text-2xl">📈</span>
          <div>
            <p className="text-sm font-bold text-[#004c22]" style={{ fontFamily: "Manrope, sans-serif" }}>
              {t.forecast}
            </p>
            <p className="text-xs text-gray-500 mt-0.5" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              30-day price history chart from Agmarknet.
            </p>
          </div>
          <button
            onClick={() => navigate("/trade")}
            className="ml-auto flex-shrink-0 bg-[#004c22] text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            {t.forecast}
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-2" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
          Maharashtra only · 5 crops · Agmarknet data
        </p>
      </div>
    </div>
  );
}
