import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { crops, mandis } from "../data/mockPrices";
import logo from "../assets/logo.svg";

export default function Home() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [selectedCrop, setSelectedCrop] = useState("");
  const [selectedMandi, setSelectedMandi] = useState("");

  const handleCheckPrice = () => {
    if (selectedCrop && selectedMandi) {
      navigate(`/input?crop=${selectedCrop}&mandi=${selectedMandi}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#fff9eb] pb-24">
      <div className="px-4 pt-8 pb-6 text-center">
        <img src={logo} alt="MandiMind" className="w-20 h-20 mx-auto mb-4" />
        <h1
          className="text-3xl font-extrabold text-[#004c22] mb-2"
          style={{ fontFamily: "Manrope, sans-serif" }}
        >
          {t.appName}
        </h1>
        <p
          className="text-base text-[#1e1c10] opacity-70"
          style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
        >
          {t.tagline}
        </p>
      </div>

      <div className="px-4 space-y-4">
        <div>
          <label
            className="block text-sm font-semibold text-[#1e1c10] mb-2"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            {t.selectCrop}
          </label>
          <select
            value={selectedCrop}
            onChange={(e) => setSelectedCrop(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-4 text-base text-[#1e1c10] outline-none focus:border-[#004c22] focus:ring-2 focus:ring-[#004c22]/20"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            <option value="">{t.selectCrop}</option>
            {crops.map((crop) => (
              <option key={crop} value={crop}>
                {crop}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            className="block text-sm font-semibold text-[#1e1c10] mb-2"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            {t.selectMandi}
          </label>
          <select
            value={selectedMandi}
            onChange={(e) => setSelectedMandi(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-4 text-base text-[#1e1c10] outline-none focus:border-[#004c22] focus:ring-2 focus:ring-[#004c22]/20"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            <option value="">{t.selectMandi}</option>
            {mandis.map((mandi) => (
              <option key={mandi} value={mandi}>
                {mandi}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleCheckPrice}
          disabled={!selectedCrop || !selectedMandi}
          className="w-full bg-[#feb234] text-[#1e1c10] font-bold text-lg py-4 rounded-xl shadow-md disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-transform"
          style={{
            fontFamily: "Manrope, sans-serif",
            minHeight: "56px",
          }}
        >
          {t.checkPrice}
        </button>
      </div>

      <div className="px-4 mt-8">
        <div className="bg-[#166534] rounded-2xl p-5 text-white">
          <h3
            className="text-lg font-bold mb-3"
            style={{ fontFamily: "Manrope, sans-serif" }}
          >
            {t.priceTrend}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {crops.slice(0, 4).map((crop) => (
              <div key={crop} className="bg-white/10 rounded-xl p-3">
                <p className="text-sm opacity-80">{crop}</p>
                <p className="text-lg font-bold">
                  {"\u20B9"}
                  {Math.floor(Math.random() * 1000 + 1200)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
