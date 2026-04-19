import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { getCropById } from "../data/mockPrices";
import { getDecision } from "../utils/decisionEngine";
import { fetchPrices, fetchCompare } from "../utils/api";
import { shareResult } from "../utils/shareResult";
import DecisionCard from "../components/DecisionCard";
import TrendChart from "../components/TrendChart";

export default function Decision() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [shareMessage, setShareMessage] = useState("");

  const cropId   = searchParams.get("crop")     || "onion";
  const mandi    = searchParams.get("mandi")    || "";
  const stateVal = searchParams.get("state")    || "Maharashtra";
  const variety  = searchParams.get("variety")  || "";
  const quality  = searchParams.get("quality")  || "medium";
  const harvest  = searchParams.get("harvest")  || "ready";
  const storage  = searchParams.get("storage")  || "yes";
  const urgency  = searchParams.get("urgency")  || "flexible";
  const quantity = searchParams.get("quantity") || "0";

  const cropInfo = getCropById(cropId);

  // ── Live price data from Cloudflare Worker (/api/prices) ─────────────────
  const [livePrices,      setLivePrices]      = useState(null);
  const [liveCurrent,     setLiveCurrent]     = useState(null);
  const [liveRange,       setLiveRange]       = useState(null);
  const [liveLastUpdated, setLiveLastUpdated] = useState(null);
  const [priceSource,     setPriceSource]     = useState("loading");

  useEffect(() => {
    if (!cropId || !mandi) return;
    fetchPrices(cropId, mandi, stateVal, 30).then((res) => {
      if (res?.data?.length) {
        setLivePrices(res.data.map(r => ({ price: r.modal_price ?? r.price })));
        setLiveCurrent(res.currentPrice);
        setLiveRange(res.priceRange);
        setLiveLastUpdated(res.lastUpdated);
        setPriceSource(res.source || "live");
      } else {
        setPriceSource(res?.source || "error");
        if (res?.error) console.error("[MandiMind] Decision prices:", res.error);
      }
    });
  }, [cropId, mandi, stateVal]);

  // Prices used for decision engine: prefer live, fallback to empty
  const prices = livePrices ?? [];

  const localResult = useMemo(
    () => getDecision(prices, { quality, harvest, storage, urgency, variety, cropId }),
    [prices, quality, harvest, storage, urgency, variety, cropId]
  );

  // ── Mandi comparison from Cloudflare Worker (/api/compare) ───────────────
  const [mandiCompare, setMandiCompare] = useState([]);
  const [compareLoading, setCompareLoading] = useState(true);
  const [compareError,   setCompareError]   = useState(false);

  useEffect(() => {
    setCompareLoading(true);
    setCompareError(false);

    fetchCompare(cropId, stateVal, 7)
      .then((res) => {
        if (res.source === "error") {
          console.error("[MandiMind] fetchCompare error:", res.error);
          setCompareError(true);
        } else if (res.mandis?.length) {
          setMandiCompare(res.mandis.slice(0, 5));
        }
      })
      .catch((err) => {
        console.error("[MandiMind] fetchCompare caught:", err);
        setCompareError(true);
      })
      .finally(() => setCompareLoading(false));
  }, [cropId, stateVal]);

  const currentPrice   = liveCurrent  ?? localResult.currentPrice;
  const priceRangeLow  = liveRange?.low  ?? localResult.priceRange.min;
  const priceRangeHigh = liveRange?.high ?? localResult.priceRange.max;
  const isLiveData = priceSource === "live";

  const formatPrice = (value) => (
    Number.isFinite(value) ? `₹${value.toLocaleString("en-IN")}` : "Data not available"
  );

  const formatRoundedPrice = (value) => (
    Number.isFinite(value) ? `₹${Math.round(value).toLocaleString("en-IN")}` : "Data not available"
  );

  const trendText =
    localResult.trend === "RISING"  ? t.rising  :
    localResult.trend === "FALLING" ? t.falling : t.stable;

  const trendClass =
    localResult.trend === "RISING"  ? "bg-green-100 text-green-700" :
    localResult.trend === "FALLING" ? "bg-red-100 text-red-700"     :
    "bg-gray-100 text-gray-700";

  const totalValue = Number(quantity) > 0 && Number.isFinite(currentPrice)
    ? `₹${(currentPrice * Number(quantity)).toLocaleString("en-IN")}`
    : null;

  async function handleShareDecision() {
    const shareText = `MandiMind Mandi Decision

Crop: ${cropInfo.name.split(" / ")[0]}
Mandi: ${mandi}
Current Price: ${Number.isFinite(currentPrice) ? `₹${currentPrice.toLocaleString("en-IN")}` : "Data not available"}
Decision: ${localResult.decision}
Reason: ${localResult.explanation?.trend || "N/A"}

Check on MandiMind:
https://mandimind.pages.dev/`;

    const result = await shareResult({
      title: "MandiMind Mandi Decision",
      text: shareText,
      url: "https://mandimind.pages.dev/",
      fallbackSuccessMessage: "Result copied to clipboard",
    });

    setShareMessage(result.message);
    window.setTimeout(() => setShareMessage(""), 2500);
  }

  return (
    <div className="min-h-screen bg-[#fff9eb] pb-24">
      <div className="px-4 pt-6 pb-4">
        <button onClick={() => navigate(-1)}
          className="text-sm text-[#004c22] font-medium mb-3"
          style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
          {t.back}
        </button>
        <h1 className="text-2xl font-extrabold text-[#004c22] mb-0.5"
          style={{ fontFamily: "Manrope, sans-serif" }}>
          {t.decision}
        </h1>
        <p className="text-sm text-gray-400" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
          {cropInfo.name.split(" / ")[0]}{variety ? ` · ${variety}` : ""} — {mandi} · {stateVal}
        </p>
      </div>

      <div className="px-4 space-y-4">
        <DecisionCard decision={localResult.decision} score={localResult.score} />

        {/* Live data status badge */}
        {isLiveData ? (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
            <span className="text-green-500">✓</span>
            <p className="text-xs text-green-700" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              LIVE data (Agmarknet)
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
            <span className="text-amber-500">⚠</span>
            <p className="text-xs text-amber-700" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              Estimated data (not live)
            </p>
          </div>
        )}

        {/* Price summary card */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">{t.trendLabel}</span>
            <span className={`text-sm font-bold px-3 py-1 rounded-full ${trendClass}`}>{trendText}</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: t.currentPriceLabel, value: formatPrice(currentPrice), accent: false },
              { label: t.sevenDayLow,       value: formatRoundedPrice(priceRangeLow),  accent: "green" },
              { label: t.fifteenDayHigh,    value: formatRoundedPrice(priceRangeHigh), accent: "yellow" },
            ].map((item) => (
              <div key={item.label}
                className={`rounded-xl p-3 text-center ${
                  item.accent === "green"  ? "bg-green-50"  :
                  item.accent === "yellow" ? "bg-yellow-50" : "bg-gray-50"
                }`}>
                <p className="text-[10px] text-gray-400 mb-0.5">{item.label}</p>
                <p className={`text-base font-extrabold ${
                  item.accent === "green"  ? "text-green-700"  :
                  item.accent === "yellow" ? "text-yellow-700" : "text-[#004c22]"
                }`} style={{ fontFamily: "Manrope, sans-serif" }}>
                  {item.value}
                </p>
                <p className="text-[10px] text-gray-400">{t.per}</p>
              </div>
            ))}
          </div>

          {/* Data source badge */}
          <div className="flex items-center justify-between border-t border-gray-50 pt-2">
            <span className="text-[10px] text-gray-400">
              {isLiveData && liveLastUpdated ? `Updated: ${liveLastUpdated}` : "Estimated data (not live)"}
            </span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              isLiveData
                ? "text-green-600 bg-green-50"
                : "text-amber-600 bg-amber-50"
            }`}>
              {isLiveData ? "● LIVE data (Agmarknet)" : "● Estimated data (not live)"}
            </span>
          </div>

          {localResult.variantOffset !== 0 && variety && (
            <div className="flex justify-between items-center pt-1 border-t border-gray-100">
              <span className="text-sm text-gray-500">{variety} premium</span>
              <span className={`text-sm font-semibold ${localResult.variantOffset > 0 ? "text-green-600" : "text-red-600"}`}>
                {localResult.variantOffset > 0 ? "+" : ""}₹{localResult.variantOffset.toLocaleString("en-IN")}
              </span>
            </div>
          )}

          {totalValue && (
            <div className="flex justify-between items-center border-t border-gray-100 pt-3">
              <span className="text-sm text-gray-500">{quantity} quintal total</span>
              <span className="text-base font-bold text-[#004c22]" style={{ fontFamily: "Manrope, sans-serif" }}>
                {totalValue}
              </span>
            </div>
          )}
        </div>

        {/* Decision explanation */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <h3 className="text-base font-bold text-[#1e1c10] mb-3" style={{ fontFamily: "Manrope, sans-serif" }}>
            {t.explanation}
          </h3>
          <div className="space-y-2">
            {[
              { label: t.trendLabel,   value: localResult.explanation.trend },
              { label: t.qualityLabel, value: localResult.explanation.quality },
              { label: t.urgencyLabel, value: localResult.explanation.urgency },
              { label: t.storageLabel, value: localResult.explanation.storage },
              ...(localResult.explanation.variety
                ? [{ label: variety, value: localResult.explanation.variety }]
                : []),
            ].map((item) => (
              <div key={item.label} className="flex items-start gap-2 py-1 border-b border-gray-50 last:border-0">
                <span className="text-xs font-bold text-[#004c22] min-w-[80px] shrink-0 pt-0.5 uppercase">
                  {item.label}
                </span>
                <span className="text-sm text-gray-600" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top mandis for this crop (live from Worker /api/compare) */}
        {compareLoading ? (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 flex items-center gap-3">
            <div className="w-5 h-5 rounded-full border-2 border-[#004c22]/20 border-t-[#004c22] animate-spin" />
            <p className="text-xs text-gray-400" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              Loading mandi prices…
            </p>
          </div>
        ) : compareError ? (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-xs text-red-700" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              Unable to fetch live mandi data — check your connection
            </p>
          </div>
        ) : mandiCompare.length > 0 ? (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <h3 className="text-base font-bold text-[#1e1c10] mb-3" style={{ fontFamily: "Manrope, sans-serif" }}>
              {t.topMandis}
            </h3>
            <div className="space-y-2">
              {mandiCompare.map((m, idx) => (
                <div key={m.mandi || idx}
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${
                    idx === 0 ? "bg-[#004c22] text-white" : "bg-gray-50"
                  }`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center ${
                      idx === 0 ? "bg-[#feb234] text-[#004c22]" : "bg-gray-200 text-gray-600"
                    }`}>{idx + 1}</span>
                    <span className={`text-sm font-medium ${idx === 0 ? "text-white" : "text-gray-700"}`}>
                      {m.mandi}
                    </span>
                  </div>
                  <span className={`text-sm font-bold ${idx === 0 ? "text-[#feb234]" : "text-[#004c22]"}`}>
                    {formatPrice(m.todayPrice)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Price trend chart */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <h3 className="text-base font-bold text-[#1e1c10] mb-3" style={{ fontFamily: "Manrope, sans-serif" }}>
            {t.priceTrend} — {t.last30Days}
          </h3>
          <TrendChart data={prices} />
        </div>

        <section className="space-y-2">
          <button
            onClick={handleShareDecision}
            className="w-full bg-white border border-[#004c22] text-[#004c22] font-bold py-3 rounded-xl active:scale-[0.98] transition-transform"
            style={{ fontFamily: "Manrope, sans-serif", minHeight: "52px" }}
          >
            📤 Share Mandi Decision
          </button>
          {shareMessage && (
            <p className="text-center text-xs text-gray-600">{shareMessage}</p>
          )}
        </section>

        <button
          onClick={() => navigate(`/compare?crop=${cropId}`)}
          className="w-full bg-[#004c22] text-white font-bold text-lg py-4 rounded-xl shadow-md active:scale-[0.98] transition-transform"
          style={{ fontFamily: "Manrope, sans-serif", minHeight: "56px" }}
        >
          {t.compareMandis}
        </button>
      </div>
    </div>
  );
}
