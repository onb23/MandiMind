import { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import tradeCountryProfiles from "../data/tradeCountryProfiles";
import { fetchAvailableCrops, fetchAvailableMandis } from "../utils/mandiAvailability";
import { shareResult } from "../utils/shareResult";

const COUNTRIES = [
  { id: "UAE", name: "UAE" },
  { id: "Bangladesh", name: "Bangladesh" },
  { id: "Sri Lanka", name: "Sri Lanka" },
  { id: "Saudi Arabia", name: "Saudi Arabia" },
  { id: "Oman", name: "Oman" },
  { id: "Malaysia", name: "Malaysia" },
  { id: "Nepal", name: "Nepal" },
  { id: "Iraq", name: "Iraq" },
  { id: "UK", name: "UK" },
];

const DEFAULT_QUANTITY = 1000;

function parsePrice(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function classifyResult(netMarginPercent) {
  if (netMarginPercent >= 12) return "PROFITABLE";
  if (netMarginPercent >= 4) return "MARGINAL";
  return "NOT_PROFITABLE";
}

function getResultTone(classification) {
  if (classification === "PROFITABLE") {
    return {
      card: "bg-green-100 text-green-900",
      label: "text-green-700",
      badge: "bg-green-600 text-white",
    };
  }
  if (classification === "MARGINAL") {
    return {
      card: "bg-yellow-100 text-yellow-900",
      label: "text-yellow-700",
      badge: "bg-yellow-600 text-white",
    };
  }
  return {
    card: "bg-red-100 text-red-900",
    label: "text-red-700",
    badge: "bg-red-600 text-white",
  };
}

function calculateTradeMetrics({ canCalculate, sourcePurchasePrice, quantity, countryProfile }) {
  if (!canCalculate) {
    return {
      destinationSellingPrice: 0,
      adjustedSellingPrice: 0,
      effectiveRevenue: 0,
      totalCost: 0,
      netProfitPerKg: 0,
      totalNetProfit: 0,
      netMarginPercent: 0,
      classification: "NOT_PROFITABLE",
      defaultsUsed: true,
      components: {
        transportCost: 0,
        packagingCost: 0,
        handlingCost: 0,
        commissionOrFees: 0,
        storageOrColdChainCost: 0,
        wastagePercent: 0,
        qualityAdjustmentPercent: 0,
        riskBufferPercent: 0,
      },
      explanationFlags: {
        costBurdenHigh: false,
        wastageAndQualityHigh: false,
        lowSpread: true,
      },
    };
  }

  const destinationSellingPrice = sourcePurchasePrice * countryProfile.destinationPriceMultiplier;
  const transportCost = countryProfile.transportCostDefault;
  const packagingCost = countryProfile.packagingCostDefault;
  const handlingCost = countryProfile.handlingCostDefault;
  const commissionOrFees = countryProfile.commissionOrFeesDefault;
  const storageOrColdChainCost = countryProfile.storageOrColdChainCostDefault;
  const wastagePercent = countryProfile.wastagePercentDefault;
  const qualityAdjustmentPercent = countryProfile.qualityAdjustmentPercentDefault;
  const riskBufferPercent = countryProfile.riskBufferPercentDefault;

  const adjustedSellingPrice = destinationSellingPrice * (1 - qualityAdjustmentPercent / 100);
  const effectiveRevenue = adjustedSellingPrice * (1 - wastagePercent / 100);
  const baseTotalCost =
    sourcePurchasePrice +
    transportCost +
    packagingCost +
    handlingCost +
    commissionOrFees +
    storageOrColdChainCost;
  const riskBufferCost = baseTotalCost * (riskBufferPercent / 100);
  const totalCost = baseTotalCost + riskBufferCost;
  const netProfitPerKg = effectiveRevenue - totalCost;
  const totalNetProfit = netProfitPerKg * quantity;
  const netMarginPercent = totalCost > 0 ? (netProfitPerKg / totalCost) * 100 : 0;

  const extraCosts = transportCost + packagingCost + handlingCost + commissionOrFees + storageOrColdChainCost + riskBufferCost;
  const spread = destinationSellingPrice - sourcePurchasePrice;

  return {
    destinationSellingPrice,
    adjustedSellingPrice,
    effectiveRevenue,
    totalCost,
    netProfitPerKg,
    totalNetProfit,
    netMarginPercent,
    classification: classifyResult(netMarginPercent),
    defaultsUsed: true,
    components: {
      transportCost,
      packagingCost,
      handlingCost,
      commissionOrFees,
      storageOrColdChainCost,
      wastagePercent,
      qualityAdjustmentPercent,
      riskBufferPercent,
      riskBufferCost,
    },
    explanationFlags: {
      costBurdenHigh: totalCost > 0 ? extraCosts / totalCost >= 0.28 : false,
      wastageAndQualityHigh: wastagePercent + qualityAdjustmentPercent >= 10,
      lowSpread: spread <= sourcePurchasePrice * 0.2,
    },
  };
}

function getRecommendationDisplay(classification, t) {
  if (classification === "PROFITABLE") return `✅ ${t.tradeResultProfitable}`;
  if (classification === "MARGINAL") return `⚠️ ${t.tradeResultMarginal}`;
  return `⛔ ${t.tradeResultNotProfitable}`;
}

export default function Trade() {
  const { t } = useLanguage();

  const [cropList, setCropList] = useState([]);
  const [selectedCrop, setSelectedCrop] = useState("");
  const [cropLoading, setCropLoading] = useState(true);
  const [quantity, setQuantity] = useState(DEFAULT_QUANTITY);
  const [country, setCountry] = useState(COUNTRIES[0].id);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mandis, setMandis] = useState([]);
  const [shareMessage, setShareMessage] = useState("");
  const inputSectionRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCrops() {
      setCropLoading(true);
      const crops = await fetchAvailableCrops("Maharashtra");
      if (cancelled) return;
      setCropList(crops);
      setSelectedCrop((prev) => {
        if (prev && crops.some((cropItem) => cropItem.id === prev)) return prev;
        return crops[0]?.id || "";
      });
      setCropLoading(false);
    }

    loadCrops();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadMandis() {
      if (!selectedCrop) {
        setMandis([]);
        return;
      }

      setLoading(true);
      setError(null);

      const result = await fetchAvailableMandis(selectedCrop, "Maharashtra");
      if (cancelled) return;

      if (result?.source === "error" || !Array.isArray(result?.mandis)) {
        setMandis([]);
        setError(t.dataUnavailable);
        setLoading(false);
        return;
      }

      const sortedMandis = result.mandis
        .map((item) => ({
          ...item,
          todayPrice: parsePrice(item?.todayPrice),
        }))
        .filter((item) => item.todayPrice !== null)
        .sort((a, b) => b.todayPrice - a.todayPrice)
        .slice(0, 3);

      if (sortedMandis.length === 0) {
        setError(t.dataUnavailable);
      }

      setMandis(sortedMandis);
      setLoading(false);
    }

    loadMandis();
    return () => {
      cancelled = true;
    };
  }, [selectedCrop, t.dataUnavailable]);

  const selectedCountry = COUNTRIES.find((c) => c.id === country) || COUNTRIES[0];
  const countryProfile = tradeCountryProfiles[selectedCountry.id] || tradeCountryProfiles.UAE;
  const baseMandiPricePerQuintal = mandis[0]?.todayPrice ?? null;
  const sourcePurchasePrice = baseMandiPricePerQuintal !== null ? baseMandiPricePerQuintal / 100 : null;
  const safeQuantity = Number.isFinite(Number(quantity)) && Number(quantity) > 0 ? Number(quantity) : 0;
  const canCalculate = sourcePurchasePrice !== null && safeQuantity > 0 && !loading && !error;

  const calculations = useMemo(() => {
    return calculateTradeMetrics({
      canCalculate,
      sourcePurchasePrice: sourcePurchasePrice ?? 0,
      countryProfile,
      quantity: safeQuantity,
    });
  }, [canCalculate, sourcePurchasePrice, countryProfile, safeQuantity]);

  const priceSimulation = useMemo(() => {
    return [1, 2].map((increasePerKg) => {
      const simulatedSourcePrice = (sourcePurchasePrice ?? 0) + increasePerKg;
      const simulation = calculateTradeMetrics({
        canCalculate,
        sourcePurchasePrice: simulatedSourcePrice,
        countryProfile,
        quantity: safeQuantity,
      });

      return {
        increasePerKg,
        ...simulation,
      };
    });
  }, [sourcePurchasePrice, canCalculate, countryProfile, safeQuantity]);

  const resultTone = getResultTone(calculations.classification);
  const recommendationText = getRecommendationDisplay(calculations.classification, t);
  const selectedCropName = cropList.find((cropItem) => cropItem.id === selectedCrop)?.name || selectedCrop;

  const explanationText = useMemo(() => {
    if (!canCalculate) return t.tradeExplainMissingData;

    const parts = [];
    if (calculations.classification === "PROFITABLE") parts.push(t.tradeExplainProfitable);
    else if (calculations.classification === "MARGINAL") parts.push(t.tradeExplainMarginal);
    else parts.push(t.tradeExplainWeak);

    if (calculations.explanationFlags.costBurdenHigh) parts.push(t.tradeExplainCostBurden);
    if (calculations.explanationFlags.wastageAndQualityHigh) parts.push(t.tradeExplainWastageQuality);
    if (calculations.explanationFlags.lowSpread) parts.push(t.tradeExplainLowSpread);

    return parts.join(" ");
  }, [canCalculate, calculations, t]);

  async function handleShareTradeResult() {
    const shareText = `MandiMind Trade Intelligence\n\nCrop: ${selectedCropName}\nCountry: ${selectedCountry.name}\nNet Profit: ₹${Math.round(calculations.totalNetProfit).toLocaleString("en-IN")}\nNet Margin: ${calculations.netMarginPercent.toFixed(1)}%\nResult: ${recommendationText}\n\nCheck your trade:\nhttps://mandimind.pages.dev/trade`;

    const result = await shareResult({
      title: "MandiMind Trade Intelligence",
      text: shareText,
      url: "https://mandimind.pages.dev/trade",
      fallbackSuccessMessage: t.resultCopiedToClipboard,
    });

    setShareMessage(result.message);
    window.setTimeout(() => setShareMessage(""), 2500);
  }

  function handleCheckAnotherTrade() {
    setSelectedCrop(cropList[0]?.id || "");
    setQuantity(DEFAULT_QUANTITY);
    setCountry(COUNTRIES[0].id);
    setShareMessage("");

    inputSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <div className="min-h-screen bg-[#fff9eb] pb-24">
      <div ref={inputSectionRef} className="px-4 pt-6 pb-4">
        <div className="mb-4 space-y-2">
          <h1 className="text-[30px] leading-tight sm:text-4xl font-extrabold text-[#004c22] tracking-tight break-words" style={{ fontFamily: "Manrope, sans-serif" }}>
            <span className="block">{t.tradeHeroLine1}</span>
            <span className="block">{t.tradeHeroLine2}</span>
          </h1>
          <p className="text-sm sm:text-base text-[#1e1c10]">{t.tradeHeroDesc}</p>
          <p className="text-xs sm:text-sm text-gray-500">{t.tradeHeroSubDesc}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t.cropLabel}</label>
            <select
              value={selectedCrop}
              onChange={(e) => setSelectedCrop(e.target.value)}
              disabled={cropLoading}
              className="w-full bg-white border border-gray-300 rounded-xl px-3 py-3 text-sm text-[#1e1c10] outline-none focus:border-[#004c22]"
              style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
            >
              {cropLoading && <option value="">{t.loadingAvailableCrops}</option>}
              {cropList.map((cropItem) => (
                <option key={cropItem.id} value={cropItem.id}>
                  {cropItem.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">{t.tradeQuantityKg}</label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full bg-white border border-gray-300 rounded-xl px-3 py-3 text-sm text-[#1e1c10] outline-none focus:border-[#004c22]"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">{t.tradeDestinationCountry}</label>
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

          {error && <p className="text-sm text-red-600 font-semibold">{t.dataUnavailable}</p>}
        </div>
      </div>

      <div className="px-4 space-y-4">
        <section className="bg-[#004c22] rounded-xl p-4 text-white">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-green-100">{t.tradeNetProfitTotal}</p>
            <span className={`${resultTone.badge} text-[11px] px-2 py-1 rounded-full font-semibold`}>{recommendationText}</span>
          </div>
          <p className="text-3xl font-extrabold mt-1">₹{Math.round(calculations.totalNetProfit).toLocaleString("en-IN")}</p>
          <div className="grid grid-cols-3 gap-2 mt-4 text-center">
            <div className={`${resultTone.card} rounded-lg p-2`}>
              <p className={`text-[10px] ${resultTone.label}`}>{t.tradeNetProfitPerKg}</p>
              <p className="text-sm font-bold">₹{calculations.netProfitPerKg.toFixed(2)}</p>
            </div>
            <div className={`${resultTone.card} rounded-lg p-2`}>
              <p className={`text-[10px] ${resultTone.label}`}>{t.tradeNetMargin}</p>
              <p className="text-sm font-bold">{calculations.netMarginPercent.toFixed(1)}%</p>
            </div>
            <div className="bg-white/10 rounded-lg p-2">
              <p className="text-[10px] text-green-100">{t.tradeDestinationCurrency}</p>
              <p className="text-sm sm:text-base font-extrabold tracking-wide">{countryProfile.currency}</p>
            </div>
          </div>
          <p className="text-[11px] text-green-100 mt-3 leading-relaxed">{t.tradeFormulaNote}</p>
          <p className="text-[11px] text-green-100 mt-2">{explanationText}</p>
          {calculations.defaultsUsed && (
            <p className="text-[11px] text-green-100/90 mt-2">{t.tradeDefaultAssumptionNote}</p>
          )}
          {!canCalculate && <p className="text-xs text-green-100 mt-3">{t.tradeCalculationDisabled}</p>}
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="text-base font-bold text-[#1e1c10] mb-3">{t.topMandis}</h2>

          {loading ? (
            <p className="text-sm text-gray-500">{t.loadingMandiPrices}</p>
          ) : mandis.length === 0 ? (
            <p className="text-sm text-gray-500">{t.dataUnavailable}</p>
          ) : (
            <div className="space-y-2">
              {mandis.map((mandi, index) => (
                <div key={`${mandi.mandi}-${index}`} className="flex justify-between items-center bg-[#f8fafc] rounded-lg px-3 py-2 gap-2">
                  <p className="text-sm font-medium text-[#1e1c10]">{index + 1}. {mandi.mandi}</p>
                  <p className="text-sm font-bold text-[#004c22] text-right">₹{mandi.todayPrice.toLocaleString("en-IN")}/{t.perQuintal} (₹{(mandi.todayPrice / 100).toFixed(2)}/kg)</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="text-base font-bold text-[#1e1c10] mb-3">{t.tradeResultBreakdownTitle}</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-2"><span className="text-gray-500">{t.tradeSourcePrice}</span><span className="font-semibold text-right">₹{sourcePurchasePrice?.toFixed(2) ?? "0.00"}/kg</span></div>
            <div className="flex justify-between gap-2"><span className="text-gray-500">{t.tradeDestinationPrice}</span><span className="font-semibold text-right">₹{calculations.destinationSellingPrice.toFixed(2)}/kg</span></div>
            <div className="flex justify-between gap-2"><span className="text-gray-500">{t.tradeWastage}</span><span className="font-semibold text-right">{calculations.components.wastagePercent.toFixed(1)}%</span></div>
            <div className="flex justify-between gap-2"><span className="text-gray-500">{t.tradeQualityAdjustment}</span><span className="font-semibold text-right">{calculations.components.qualityAdjustmentPercent.toFixed(1)}%</span></div>
            <div className="flex justify-between gap-2"><span className="text-gray-500">{t.tradeTotalCost}</span><span className="font-semibold text-right">₹{calculations.totalCost.toFixed(2)}/kg</span></div>
            <div className="flex justify-between gap-2"><span className="text-gray-500">{t.tradeNetProfitPerKg}</span><span className="font-semibold text-right">₹{calculations.netProfitPerKg.toFixed(2)}/kg</span></div>
            <div className="flex justify-between pt-2 border-t border-gray-100 gap-2"><span className="text-gray-700 font-medium">{t.tradeNetMargin}</span><span className="font-bold text-[#004c22]">{calculations.netMarginPercent.toFixed(1)}%</span></div>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="text-base font-bold text-[#1e1c10] mb-3">{t.tradeCostInputsTitle}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">{t.tradeTransportCost}</span><span className="font-semibold">₹{calculations.components.transportCost.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">{t.tradePackagingCost}</span><span className="font-semibold">₹{calculations.components.packagingCost.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">{t.tradeHandlingCost}</span><span className="font-semibold">₹{calculations.components.handlingCost.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">{t.tradeCommissionFees}</span><span className="font-semibold">₹{calculations.components.commissionOrFees.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">{t.tradeStorageCost}</span><span className="font-semibold">₹{calculations.components.storageOrColdChainCost.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">{t.tradeRiskBuffer}</span><span className="font-semibold">{calculations.components.riskBufferPercent.toFixed(1)}% (₹{(calculations.components.riskBufferCost || 0).toFixed(2)})</span></div>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="text-base font-bold text-[#1e1c10] mb-3">{t.tradeSimulationTitle}</h2>
          <div className="space-y-3 text-sm">
            {priceSimulation.map((scenario) => (
              <div key={scenario.increasePerKg} className="bg-[#f8fafc] rounded-lg px-3 py-2">
                <p className="font-medium text-[#1e1c10]">{t.tradeSimulationIfPriceUp.replace("{value}", scenario.increasePerKg)}</p>
                <p className="text-gray-700 mt-1">→ {t.tradeNetProfitTotal}: ₹{Math.round(scenario.totalNetProfit).toLocaleString("en-IN")}</p>
                <p className="text-gray-700">→ {t.tradeNetMargin}: {scenario.netMarginPercent.toFixed(1)}%</p>
                <p className="text-gray-700">→ {t.recommendedAction}: {getRecommendationDisplay(scenario.classification, t)}</p>
              </div>
            ))}
          </div>
          {!canCalculate && <p className="text-xs text-gray-500 mt-3">{t.tradeSimulationDisabled}</p>}
        </section>

        <section className="space-y-2">
          <button
            onClick={handleShareTradeResult}
            className="w-full bg-white border border-[#004c22] text-[#004c22] font-bold py-3 rounded-xl active:scale-[0.98] transition-transform"
            style={{ fontFamily: "Manrope, sans-serif", minHeight: "52px" }}
          >
            {t.tradeShareResult}
          </button>
          {shareMessage && <p className="text-center text-xs text-gray-600">{shareMessage}</p>}
          <p className="text-center text-sm text-[#1e1c10]">{t.tradeCtaLine}</p>
          <button
            onClick={handleCheckAnotherTrade}
            className="w-full bg-[#004c22] text-white font-bold py-3 rounded-xl active:scale-[0.98] transition-transform"
            style={{ fontFamily: "Manrope, sans-serif", minHeight: "52px" }}
          >
            {t.tradeCheckAnother}
          </button>
        </section>
      </div>
    </div>
  );
}
