import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { fetchAvailableCrops } from "../utils/mandiAvailability";
import { fetchCompare } from "../utils/api";
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

  const [mandiRows, setMandiRows] = useState([]);
  const [mandiLoading, setMandiLoading] = useState(false);
  const [mandiError, setMandiError] = useState("");

  const visibleMandis = useMemo(() => {
    return mandiRows;
  }, [mandiRows]);
  const hasVisibleMandis = visibleMandis.length > 0;
  const hasLowMandiAvailability = selectedCrop && !mandiLoading && !mandiError && mandiRows.length > 0 && mandiRows.length <= 2;

  const handleCropChange = (cropId) => {
    setSelectedCrop(cropId);
    setSelectedMandi("");
  };

  const handleMandiChange = (mandi) => {
    setSelectedMandi(mandi);
  };

  const jumpToCropSelector = () => {
    const cropField = document.getElementById("crop-selector");
    if (cropField) {
      cropField.scrollIntoView({ behavior: "smooth", block: "center" });
    }
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
          setCropError(t.liveMandiTemporarilyUnavailable);
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
        setMandiRows([]);
        setMandiError("");
        setMandiLoading(false);
        return;
      }

      setMandiLoading(true);
      setMandiError("");

      const result = await fetchCompare(selectedCrop, "Maharashtra", 5);

      if (cancelled) return;

      if (result?.source === "error") {
        setMandiRows([]);
        setMandiError(t.liveMandiTemporarilyUnavailable);
      } else {
        const validMandis = (Array.isArray(result?.mandis) ? result.mandis : []).filter((item) => {
          const mandiName = typeof item?.mandi === "string" ? item.mandi.trim() : "";
          const firstAvailablePrice = item?.todayPrice ?? item?.avgPrice ?? item?.price ?? item?.modal_price;
          const hasAnyPrice = firstAvailablePrice !== null && firstAvailablePrice !== undefined && String(firstAvailablePrice).trim() !== "";
          return Boolean(mandiName) && hasAnyPrice;
        });

        setMandiRows(validMandis);
        if (selectedMandi && !validMandis.some((item) => item.mandi === selectedMandi)) {
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
            {t.maharashtraLiveAgmarknetData}
          </span>
        </div>
      </div>

      <div className="px-4 space-y-3">
        <section className="bg-white border border-gray-200 rounded-xl p-4">
          <div>
            <h2
              className="text-base font-extrabold text-[#004c22]"
              style={{ fontFamily: "Manrope, sans-serif" }}
            >
              {t.mandiInsightsTitle}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {t.mandiInsightsDesc}
            </p>
          </div>
          <div className="mt-3 rounded-lg border border-dashed border-[#cde8d6] bg-[#f6fbf8] px-3 py-3">
            <button
              onClick={jumpToCropSelector}
              className="w-full rounded-lg border border-[#004c22] bg-white px-3 py-2 text-xs font-semibold text-[#004c22] active:scale-[0.98] transition-transform"
              style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
            >
              {t.selectCropToBegin}
            </button>
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
                {t.cropAvailabilityRefreshFailed} {cropError}
              </p>
            </div>
          )}
          {!cropLoading && !cropError && cropList.length === 0 && (
            <p className="text-xs text-amber-700 mt-1" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {t.noCropsUsableLast3Days}
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
            disabled={!selectedCrop || mandiLoading || !hasVisibleMandis}
            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3.5 text-base text-[#1e1c10] outline-none focus:border-[#004c22] disabled:opacity-50"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            <option value="">
              {selectedCrop
                ? (mandiLoading
                  ? t.loadingLiveMandis
                  : hasVisibleMandis
                    ? t.selectMandi
                    : t.noUsableMandiDataForCrop)
                : t.selectCropFirst}
            </option>
            {visibleMandis.map((item) => (
              <option key={item.mandi} value={item.mandi}>
                {item.mandi}
              </option>
            ))}
          </select>
          {selectedCrop && !mandiLoading && !mandiError && !hasVisibleMandis && (
            <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-1">
              <p className="text-xs text-amber-800 font-semibold" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                {t.noMandiDropdownDisabled}
              </p>
              <p className="text-xs text-amber-700" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                {t.noMandiGuidance}
              </p>
            </div>
          )}
          {selectedCrop && !mandiLoading && mandiError && (
            <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <p className="text-xs text-red-700" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
                {t.liveMandiListingsUpdateFailed} {mandiError}
              </p>
            </div>
          )}
          {selectedCrop && !mandiLoading && !mandiError && !hasVisibleMandis && (
            <p className="text-xs text-amber-700 mt-1" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {t.noMandiLast3Days}
            </p>
          )}
          {hasLowMandiAvailability && (
            <p className="text-xs text-amber-700 mt-1" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
              {t.lowCropAvailabilityWarning}
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
              {t.comparePricesAcrossMaharashtra}
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
              {t.priceHistoryChartFromAgmarknet}
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
          {t.maharashtraOnlyAgmarknet}
        </p>
      </div>
    </div>
  );
}
