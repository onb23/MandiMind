import { useEffect, useMemo, useState } from "react";
import { getCropNames } from "../data/mockPrices";
import { fetchCompare } from "../utils/api";
import { shareResult } from "../utils/shareResult";

const COUNTRIES = [
  { id: "UAE", name: "UAE", multiplier: 1.8, cost: 6 },
  { id: "Bangladesh", name: "Bangladesh", multiplier: 1.4, cost: 4 },
  { id: "Sri Lanka", name: "Sri Lanka", multiplier: 1.3, cost: 5 },
  { id: "Saudi Arabia", name: "Saudi Arabia", multiplier: 1.7, cost: 5.5 },
  { id: "Oman", name: "Oman", multiplier: 1.55, cost: 5.2 },
  { id: "Malaysia", name: "Malaysia", multiplier: 1.65, cost: 5.8 },
  { id: "Nepal", name: "Nepal", multiplier: 1.35, cost: 3.8 },
  { id: "Iraq", name: "Iraq", multiplier: 1.6, cost: 5.6 },
  { id: "UK", name: "UK", multiplier: 2, cost: 8 },
];

const DEFAULT_QUANTITY = 1000;

function parsePrice(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function getProfitTone(profitPerKg) {
  if (profitPerKg <= 0) {
    return {
      card: "bg-red-100 text-red-900",
      label: "text-red-700",
    };
  }

  if (profitPerKg <= 2) {
    return {
      card: "bg-yellow-100 text-yellow-900",
      label: "text-yellow-700",
    };
  }

  return {
    card: "bg-green-100 text-green-900",
    label: "text-green-700",
  };
}

function getRecommendationDisplay(recommendation) {
  if (recommendation === "EXPORT") return "🚀 EXPORT";
  if (recommendation === "SELL LOCAL") return "📦 SELL LOCAL";
  return "⚠️ WAIT";
}

function getConfidenceDescription(level) {
  if (level === "HIGH") return "Strong profit margin with favorable conditions";
  if (level === "MEDIUM") return "Moderate profit with stable conditions";
  return "Low margin or high cost uncertainty";
}

function calculateTradeMetrics({ canCalculate, mandiPricePerKg, selectedCountry, quantity }) {
  if (!canCalculate) {
    return {
      exportPrice: 0,
      profitPerKg: 0,
      totalProfit: 0,
      profitPercent: 0,
      recommendation: "WAIT",
      confidenceLevel: "LOW",
      reasonMessage: "Export not profitable due to high costs",
    };
  }

  const exportPrice = mandiPricePerKg * selectedCountry.multiplier;
  const profitPerKg = exportPrice - mandiPricePerKg - selectedCountry.cost;
  const totalProfit = profitPerKg * quantity;
  const profitPercent = mandiPricePerKg > 0 ? (profitPerKg / mandiPricePerKg) * 100 : 0;

  let recommendation = "WAIT";
  if (profitPerKg > 4) recommendation = "EXPORT";
  else if (profitPerKg > 1) recommendation = "SELL LOCAL";

  let confidenceLevel = "LOW";
  if (profitPerKg > 5) confidenceLevel = "HIGH";
  else if (profitPerKg > 2) confidenceLevel = "MEDIUM";

  let reasonMessage = "Export not profitable due to high costs";
  if (profitPerKg > 0 && profitPerKg <= 2) {
    reasonMessage = "Profit margin too low, better to wait";
  } else if (profitPerKg > 2 && profitPerKg <= 5) {
    reasonMessage = "Moderate profit opportunity, consider local sale";
  } else if (profitPerKg > 5) {
    reasonMessage = "Strong export opportunity";
  }

  return {
    exportPrice,
    profitPerKg,
    totalProfit,
    profitPercent,
    recommendation,
    confidenceLevel,
    reasonMessage,
  };
}

export default function Trade() {
  const cropList = getCropNames();
  const [selectedCrop, setSelectedCrop] = useState(cropList[0]?.id || "onion");
  const [quantity, setQuantity] = useState(DEFAULT_QUANTITY);
  const [country, setCountry] = useState(COUNTRIES[0].id);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mandis, setMandis] = useState([]);
  const [shareMessage, setShareMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadMandis() {
      if (!selectedCrop) {
        setMandis([]);
        return;
      }

      setLoading(true);
      setError(null);

      const result = await fetchCompare(selectedCrop, "Maharashtra", 7);
      if (cancelled) return;

      if (result?.source === "error" || !Array.isArray(result?.mandis)) {
        setMandis([]);
        setError("Data unavailable");
        setLoading(false);
        return;
      }

      const sortedMandis = result.mandis
        .map((item) => ({
          ...item,
          todayPrice: parsePrice(item?.todayPrice),
        }))
        .filter((item) => item.todayPrice !== null)
        .sort((a, b) => a.todayPrice - b.todayPrice)
        .slice(0, 3);

      if (sortedMandis.length === 0) {
        setError("Data unavailable");
      }

      setMandis(sortedMandis);
      setLoading(false);
    }

    loadMandis();
    return () => {
      cancelled = true;
    };
  }, [selectedCrop]);

  const selectedCountry = COUNTRIES.find((c) => c.id === country) || COUNTRIES[0];
  const baseMandiPricePerQuintal = mandis[0]?.todayPrice ?? null;
  const baseMandiPricePerKg = baseMandiPricePerQuintal !== null ? baseMandiPricePerQuintal / 100 : null;
  const safeQuantity = Number.isFinite(Number(quantity)) && Number(quantity) > 0 ? Number(quantity) : 0;
  const canCalculate = baseMandiPricePerKg !== null && safeQuantity > 0 && !loading && !error;

  const calculations = useMemo(() => {
    return calculateTradeMetrics({
      canCalculate,
      mandiPricePerKg: baseMandiPricePerKg ?? 0,
      selectedCountry,
      quantity: safeQuantity,
    });
  }, [canCalculate, baseMandiPricePerKg, selectedCountry, safeQuantity]);

  const priceSimulation = useMemo(() => {
    return [1, 2].map((increasePerKg) => {
      const mandiPricePerKg = (baseMandiPricePerKg ?? 0) + increasePerKg;
      const simulation = calculateTradeMetrics({
        canCalculate,
        mandiPricePerKg,
        selectedCountry,
        quantity: safeQuantity,
      });

      return {
        increasePerKg,
        ...simulation,
      };
    });
  }, [baseMandiPricePerKg, canCalculate, selectedCountry, safeQuantity]);

  const profitTone = getProfitTone(calculations.profitPerKg);
  const recommendationText = getRecommendationDisplay(calculations.recommendation);
  const confidenceDescription = getConfidenceDescription(calculations.confidenceLevel);
  const selectedCropName = cropList.find((crop) => crop.id === selectedCrop)?.name || selectedCrop;

  async function handleShareTradeResult() {
    const shareText = `MandiMind Trade Intelligence

Crop: ${selectedCropName}
Country: ${selectedCountry.name}
Profit: ₹${Math.round(calculations.totalProfit).toLocaleString("en-IN")}
Recommendation: ${calculations.recommendation}
Confidence: ${calculations.confidenceLevel}

Check your trade:
https://mandimind.pages.dev/trade`;

    const result = await shareResult({
      title: "MandiMind Trade Intelligence",
      text: shareText,
      url: "https://mandimind.pages.dev/trade",
      fallbackSuccessMessage: "Result copied to clipboard",
    });

    setShareMessage(result.message);
    window.setTimeout(() => setShareMessage(""), 2500);
  }

  return (
    <div className="min-h-screen bg-[#fff9eb] pb-24">
      <div className="px-4 pt-6 pb-4">
        <h1
          className="text-2xl font-extrabold text-[#004c22] mb-3"
          style={{ fontFamily: "Manrope, sans-serif" }}
        >
          Trade Intelligence
        </h1>

        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Crop</label>
            <select
              value={selectedCrop}
              onChange={(e) => setSelectedCrop(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-xl px-3 py-3 text-sm text-[#1e1c10] outline-none focus:border-[#004c22]"
              style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
            >
              {cropList.map((crop) => (
                <option key={crop.id} value={crop.id}>
                  {crop.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Quantity (kg)</label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full bg-white border border-gray-300 rounded-xl px-3 py-3 text-sm text-[#1e1c10] outline-none focus:border-[#004c22]"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Destination country</label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-xl px-3 py-3 text-sm text-[#1e1c10] outline-none focus:border-[#004c22]"
            >
              {COUNTRIES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-sm text-red-600 font-semibold">Data unavailable</p>
          )}
        </div>
      </div>

      <div className="px-4 space-y-4">
        <section className="bg-[#004c22] rounded-xl p-4 text-white">
          <p className="text-xs text-green-100">Total Profit</p>
          <p className="text-3xl font-extrabold mt-1">₹{Math.round(calculations.totalProfit).toLocaleString("en-IN")}</p>
          <div className="grid grid-cols-3 gap-2 mt-4 text-center">
            <div className={`${profitTone.card} rounded-lg p-2`}>
              <p className={`text-[10px] ${profitTone.label}`}>Profit/kg</p>
              <p className="text-sm font-bold">₹{calculations.profitPerKg.toFixed(2)}</p>
            </div>
            <div className={`${profitTone.card} rounded-lg p-2`}>
              <p className={`text-[10px] ${profitTone.label}`}>Profit %</p>
              <p className="text-sm font-bold">{calculations.profitPercent.toFixed(1)}%</p>
            </div>
            <div className="bg-white/10 rounded-lg p-2">
              <p className="text-[10px] text-green-100">Recommendation</p>
              <p className="text-lg sm:text-xl font-extrabold tracking-wide">{recommendationText}</p>
            </div>
          </div>
          <p className="text-[11px] text-green-100 mt-3 leading-relaxed">
            Estimates based on mandi prices and heuristic export models. Actual profits may vary.
          </p>
          <div className="mt-3 space-y-1">
            <p className="text-xs text-green-100">
              Confidence:{" "}
              <span className="font-semibold text-white">
                {calculations.confidenceLevel} ({confidenceDescription})
              </span>
            </p>
          </div>
          {!canCalculate && <p className="text-xs text-green-100 mt-3">Calculation disabled until mandi data is available.</p>}
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="text-base font-bold text-[#1e1c10] mb-3">Best Mandis (Top 3)</h2>

          {loading ? (
            <p className="text-sm text-gray-500">Fetching mandi prices…</p>
          ) : mandis.length === 0 ? (
            <p className="text-sm text-gray-500">Data unavailable</p>
          ) : (
            <div className="space-y-2">
              {mandis.map((mandi, index) => (
                <div key={`${mandi.mandi}-${index}`} className="flex justify-between items-center bg-[#f8fafc] rounded-lg px-3 py-2">
                  <p className="text-sm font-medium text-[#1e1c10]">{index + 1}. {mandi.mandi}</p>
                  <p className="text-sm font-bold text-[#004c22]">₹{mandi.todayPrice.toLocaleString("en-IN")}/quintal (₹{(mandi.todayPrice / 100).toFixed(2)}/kg)</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="text-base font-bold text-[#1e1c10] mb-3">Trade Breakdown</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Buy (Mandi Price)</span><span className="font-semibold">₹{baseMandiPricePerQuintal?.toFixed(2) ?? "0.00"}/quintal (₹{baseMandiPricePerKg?.toFixed(2) ?? "0.00"}/kg)</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Sell (Export Price)</span><span className="font-semibold">₹{calculations.exportPrice.toFixed(2)}/kg</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Cost</span><span className="font-semibold">₹{selectedCountry.cost.toFixed(2)}/kg</span></div>
            <div className="flex justify-between pt-2 border-t border-gray-100"><span className="text-gray-700 font-medium">Profit / kg</span><span className="font-bold text-[#004c22]">₹{calculations.profitPerKg.toFixed(2)}</span></div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-1 text-[11px] text-gray-500">
            <p>📡 Data Source: Agmarknet (Govt. of India)</p>
            <p>🕒 Last Updated: Today</p>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="text-base font-bold text-[#1e1c10] mb-3">📊 Price Change Simulation</h2>
          <div className="space-y-3 text-sm">
            {priceSimulation.map((scenario) => (
              <div key={scenario.increasePerKg} className="bg-[#f8fafc] rounded-lg px-3 py-2">
                <p className="font-medium text-[#1e1c10]">If mandi price increases by ₹{scenario.increasePerKg}/kg:</p>
                <p className="text-gray-700 mt-1">→ Profit: ₹{Math.round(scenario.totalProfit).toLocaleString("en-IN")}</p>
                <p className="text-gray-700">→ Recommendation: {getRecommendationDisplay(scenario.recommendation)}</p>
              </div>
            ))}
          </div>
          {!canCalculate && <p className="text-xs text-gray-500 mt-3">Simulation available once mandi data is loaded.</p>}
        </section>

        <section className="space-y-2">
          <button
            onClick={handleShareTradeResult}
            className="w-full bg-white border border-[#004c22] text-[#004c22] font-bold py-3 rounded-xl active:scale-[0.98] transition-transform"
            style={{ fontFamily: "Manrope, sans-serif", minHeight: "52px" }}
          >
            📤 Share Trade Result
          </button>
          {shareMessage && (
            <p className="text-center text-xs text-gray-600">{shareMessage}</p>
          )}
        </section>
      </div>
    </div>
  );
}
