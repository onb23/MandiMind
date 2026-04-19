import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { fetchAvailableCrops, fetchAvailableMandis } from "../utils/mandiAvailability";
import logo from "../assets/logo.svg";

function FieldSkeleton() {
  return (
    <div className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3.5">
      <div className="h-4 w-2/5 rounded bg-gray-100 animate-pulse mb-2" />
      <div className="h-4 w-3/5 rounded bg-gray-100 animate-pulse" />
    </div>
  );
}

export default function Home() {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [selectedCrop,  setSelectedCrop]  = useState("");
  const [selectedMandi, setSelectedMandi] = useState("");

  const [cropList, setCropList] = useState([]);
  const [cropLoading, setCropLoading] = useState(true);
  const [cropError, setCropError] = useState("");

  const [mandiOptions, setMandiOptions] = useState([]);
  const [mandiLoading, setMandiLoading] = useState(false);
  const [mandiError, setMandiError] = useState("");

  const visibleMandis = useMemo(
    () => mandiOptions.filter((item) => item.isUsable),
    [mandiOptions]
  );

  const handleCropChange = (cropId) => {
    setSelectedCrop(cropId);
    setSelectedMandi("");
  };

  const handleMandiChange = (mandi) => {
    setSelectedMandi(mandi);
  };

  const safeErrorMessage =
    "Live mandi data is temporarily unavailable. Please try again in a few minutes.";

  const jumpToCropSelector = () => {
    const cropField = document.getElementById("crop-selector");
    if (cropField) {
      cropField.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const snapshotCrops = ["Onion", "Tomato", "Soybean"];
  const snapshotComparison = [
    { mandi: "Lasalgaon", crop: "Onion", modalPrice: "₹2,350/qtl", trend: "+4%" },
    { mandi: "Pune", crop: "Tomato", modalPrice: "₹1,780/qtl", trend: "-2%" },
  ];
  const snapshotRecommendation = {
    action: "HOLD",
    confidenceLabel: "High",
    confidencePercent: 82,
    guidance:
      "Hold your current lots and monitor daily arrivals. Market signals currently favor a better selling window rather than immediate disposal.",
    timeframe: "Recommended window: wait 2–3 days before re-evaluating sale timing.",
    reasons: [
      "Onion modal prices are trending upward across major mandis this week.",
      "Price spread between nearby mandis is stable, indicating low short-term downside risk.",
    ],
    risks: [
      "A sudden jump in mandi arrivals can flatten gains and reduce bargaining power.",
      "Transport disruptions may temporarily delay access to the best-paying mandi.",
    ],
    updatedAt: "19 Apr 2026, 09:30 AM",
    source: "Agmarknet",
  };
  const actionStyles = {
    SELL: "bg-green-100 text-green-700 border-green-200",
    HOLD: "bg-amber-100 text-amber-700 border-amber-200",
    WAIT: "bg-orange-100 text-orange-700 border-orange-200",
  };

  useEffect(() => {
    let cancelled = false;
    async function loadCrops() {
      setCropLoading(true);
      setCropError("");
      try {
        const crops = await fetchAvailableCrops("Maharashtra");
        if (!cancelled) {
          setCropList(crops);
          if (selectedCrop && !crops.some((crop) => crop.id === selectedCrop)) {
            setSelectedCrop("");
            setSelectedMandi("");
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.error("[MandiMind] loadCrops failed:", error);
          setCropList([]);
          setCropError(safeErrorMessage);
        }
      } finally {
        if (!cancelled) setCropLoading(false);
      }
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
        setMandiOptions([]);
        setMandiError("");
        setMandiLoading(false);
        return;
      }

      setMandiLoading(true);
      setMandiError("");

      const result = await fetchAvailableMandis(selectedCrop, "Maharashtra");

      if (cancelled) return;

      if (result?.source === "error") {
        setMandiOptions([]);
        setMandiError(safeErrorMessage);
      } else {
        setMandiOptions(result?.mandis || []);
        if (selectedMandi && !(result?.mandis || []).some((item) => item.mandi === selectedMandi)) {
          setSelectedMandi("");
        }
      }

      setMandiLoading(false);
    }

    loadMandis();

    return () => {
      cancelled = true;
    };
  }, [selectedCrop]);

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
        <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
          <div>
            <h2
              className="text-base font-extrabold text-[#004c22]"
              style={{ fontFamily: "Manrope, sans-serif" }}
            >
              Today&apos;s Mandi Snapshot
            </h2>
            <p className="text-xs text-gray-500 mt-0.5" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              Preview insights before selecting crop and mandi.
            </p>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1e1c10] mb-1.5" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              Example crops
            </p>
            <div className="flex flex-wrap gap-2">
              {snapshotCrops.map((crop) => (
                <span
                  key={crop}
                  className="inline-flex items-center rounded-full bg-[#fff9eb] border border-amber-200 px-3 py-1 text-xs text-[#1e1c10]"
                  style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
                >
                  {crop}
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1e1c10] mb-1.5" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              Sample mandi comparison
            </p>
            <div className="space-y-2">
              {snapshotComparison.map((row) => (
                <div
                  key={`${row.mandi}-${row.crop}`}
                  className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 bg-[#fcfcfc]"
                >
                  <div>
                    <p className="text-xs font-semibold text-[#1e1c10]" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                      {row.mandi} · {row.crop}
                    </p>
                    <p className="text-xs text-gray-500" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                      Modal price: {row.modalPrice}
                    </p>
                  </div>
                  <span className={`text-xs font-bold ${row.trend.startsWith("+") ? "text-green-600" : "text-red-600"}`}>
                    {row.trend}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-[#cde8d6] bg-[#f2fbf5] px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1e1c10]" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                  Recommendation snapshot
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                  Demo Snapshot
                </p>
              </div>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-extrabold tracking-wide ${actionStyles[snapshotRecommendation.action] || "bg-gray-100 text-gray-700 border-gray-200"}`}
                style={{ fontFamily: "Manrope, sans-serif" }}
              >
                {snapshotRecommendation.action}
              </span>
            </div>

            <div className="mt-2 rounded-md bg-white/70 border border-white px-2.5 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-[#1e1c10]" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                  Advisor guidance
                </p>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f5ec] border border-[#cde8d6] px-2 py-0.5 text-[10px] font-semibold text-[#004c22]">
                  Confidence: {snapshotRecommendation.confidenceLabel} ({snapshotRecommendation.confidencePercent}%)
                </span>
              </div>
              <p className="text-xs text-gray-700 mt-1.5" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                {snapshotRecommendation.guidance}
              </p>
              <p className="text-[11px] font-semibold text-[#1e1c10] mt-2" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                Why now
              </p>
              <ul className="list-disc pl-4 space-y-1">
                {snapshotRecommendation.reasons.map((reason) => (
                  <li
                    key={reason}
                    className="text-xs text-gray-600"
                    style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
                  >
                    {reason}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] font-semibold text-[#1e1c10] mt-2" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                Risk
              </p>
              <ul className="list-disc pl-4 space-y-1">
                {snapshotRecommendation.risks.map((risk) => (
                  <li
                    key={risk}
                    className="text-xs text-gray-600"
                    style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
                  >
                    {risk}
                  </li>
                ))}
              </ul>
              <p className="text-xs font-medium text-[#004c22] mt-2" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                {snapshotRecommendation.timeframe}
              </p>
            </div>

            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={jumpToCropSelector}
                className="w-full rounded-lg border border-[#004c22] bg-white px-3 py-2 text-xs font-semibold text-[#004c22] active:scale-[0.98] transition-transform"
                style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
              >
                Check your crop
              </button>
              <button
                onClick={jumpToCropSelector}
                className="w-full rounded-lg border border-[#004c22] bg-[#004c22] px-3 py-2 text-xs font-semibold text-white active:scale-[0.98] transition-transform"
                style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
              >
                Get personalized recommendation
              </button>
            </div>

            <div className="mt-2 flex items-center justify-between text-[10px] text-gray-500" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              <span>Last updated: {snapshotRecommendation.updatedAt}</span>
              <span className="font-semibold text-[#004c22]">Source: {snapshotRecommendation.source}</span>
            </div>
          </div>
        </section>

        <div id="crop-selector">
          <label
            className="block text-xs font-semibold text-[#1e1c10] uppercase tracking-wide mb-1.5"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            {t.selectCrop}
          </label>
          {cropLoading ? (
            <FieldSkeleton />
          ) : (
            <select
              value={selectedCrop}
              onChange={(e) => handleCropChange(e.target.value)}
              disabled={cropLoading}
              className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3.5 text-base text-[#1e1c10] outline-none focus:border-[#004c22]"
              style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
            >
              <option value="">{t.selectCrop}</option>
              {cropList.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          {!cropLoading && cropError && (
            <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <p className="text-xs text-red-700" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                We could not refresh crop availability right now. {safeErrorMessage}
              </p>
            </div>
          )}
          {!cropLoading && !cropError && cropList.length === 0 && (
            <p className="text-xs text-amber-700 mt-1" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              No crops with usable data in the last 3 days.
            </p>
          )}
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
            disabled={!selectedCrop || mandiLoading}
            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3.5 text-base text-[#1e1c10] outline-none focus:border-[#004c22] disabled:opacity-50"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            <option value="">{selectedCrop ? (mandiLoading ? "Loading live mandis…" : t.selectMandi) : "— Select crop first —"}</option>
            {visibleMandis.map((item) => (
              <option key={item.mandi} value={item.mandi}>
                {item.mandi}{item.bucket === "latest_available" ? ` (${item.freshnessDays}d old)` : ""}
              </option>
            ))}
          </select>
          {selectedCrop && !mandiLoading && mandiError && (
            <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <p className="text-xs text-red-700" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                Live mandi listings could not be updated. {mandiError}
              </p>
            </div>
          )}
          {selectedCrop && !mandiLoading && !mandiError && visibleMandis.length === 0 && (
            <p className="text-xs text-amber-700 mt-1" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              No usable mandi data available right now for this crop.
            </p>
          )}
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
          Maharashtra only · Agmarknet data (today + last 3 days)
        </p>
      </div>
    </div>
  );
}
