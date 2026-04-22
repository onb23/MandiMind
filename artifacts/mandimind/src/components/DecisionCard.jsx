import { useLanguage } from "../context/LanguageContext";
import SpeakerButton from "./SpeakerButton";

function getConfidence(score, t, penalty = 0, disallowHigh = false) {
  const bands = [t.low.toUpperCase(), t.medium.toUpperCase(), t.high.toUpperCase()];

  let index = 0;
  if (score >= 70) index = 2;
  else if (score >= 45) index = 1;

  if (disallowHigh && index === 2) index = 1;
  index = Math.max(0, index - Math.max(0, penalty));
  return { label: bands[index], level: index };
}

function getConfidenceReason({ score, confidenceLevel, hasFallbackData, decision }) {
  if (decision === "NOT ENOUGH DATA") {
    return "notEnoughData";
  }

  if (hasFallbackData) {
    return "fallbackData";
  }

  if (confidenceLevel === 2) {
    return "high";
  }

  if (confidenceLevel === 1) {
    return "medium";
  }

  return "low";
}

export default function DecisionCard({
  decision,
  score,
  confidenceScore = null,
  classification = "",
  keyReasons = [],
  riskExplanation = "",
  confidencePenalty = 0,
  disallowHighConfidence = false,
  onSpeak,
  onStopSpeak,
  isSpeaking = false,
  isSpeechSupported = true,
}) {
  const { t } = useLanguage();

  const config = {
    SELL: {
      bg: "bg-green-600",
      glow: "shadow-green-200",
      text: t.sell,
      desc: t.sellDesc,
    },
    HOLD: {
      bg: "bg-yellow-500",
      glow: "shadow-yellow-200",
      text: t.hold,
      desc: t.holdDesc,
    },
    WAIT: {
      bg: "bg-orange-500",
      glow: "shadow-orange-200",
      text: t.wait,
      desc: t.waitDesc,
    },
    "NOT ENOUGH DATA": {
      bg: "bg-gray-600",
      glow: "shadow-gray-200",
      text: t.notEnoughData,
      desc: t.noRecentMandiDataForCropMandi,
    },
  };

  const c = config[decision] || config.HOLD;
  const confidence = getConfidence(score, t, confidencePenalty, disallowHighConfidence);
  const confidenceReason = getConfidenceReason({
    score,
    confidenceLevel: confidence.level,
    hasFallbackData: confidencePenalty > 0,
    decision,
  });
  const confidenceReasonText =
    confidenceReason === "notEnoughData"
      ? t.confidenceReasonNotEnoughData
      : confidenceReason === "fallbackData"
        ? t.confidenceReasonFallbackData
        : confidenceReason === "high"
          ? t.confidenceReasonHigh.replace("{score}", score)
          : confidenceReason === "medium"
            ? t.confidenceReasonMedium.replace("{score}", score)
            : t.confidenceReasonLow.replace("{score}", score);
  const confidencePercent = Number.isFinite(confidenceScore) ? confidenceScore : score;

  return (
    <div className={`${c.bg} rounded-2xl p-6 text-white shadow-xl ${c.glow}`}>
      <div className="flex items-start justify-between gap-3">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.12em] opacity-80">
          {t.recommendedAction}
        </p>
        <div
          className="text-4xl font-extrabold leading-none"
          style={{ fontFamily: "Manrope, sans-serif" }}
        >
          {c.text}
        </div>
        <p
          className="text-base opacity-95"
          style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
        >
          {c.desc}
        </p>
      </div>
      {typeof onSpeak === "function" && (
        <SpeakerButton
          onSpeak={onSpeak}
          onStop={onStopSpeak}
          isSpeaking={isSpeaking}
          isSupported={isSpeechSupported}
          ariaLabel="Hear recommendation"
          className="border-white/25 bg-white/10 text-white hover:bg-white/20"
        />
      )}
      </div>

      <div className="mt-5 bg-white/15 rounded-xl py-2 px-3 text-center">
        <span className="text-xs tracking-wide opacity-80">
          {t.confidence.toUpperCase()}: {" "}
        </span>
        <span className="text-sm font-bold tracking-wide">{confidence.label} ({confidencePercent}%)</span>
      </div>
      {classification ? (
        <p className="text-xs mt-2 font-semibold" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
          {classification}
        </p>
      ) : null}
      <p className="text-xs mt-2 opacity-90" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
        {confidenceReasonText}
      </p>
      {Array.isArray(keyReasons) && keyReasons.length > 0 ? (
        <ul className="text-xs mt-2 space-y-1 list-disc pl-4 opacity-95" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
          {keyReasons.slice(0, 3).map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      {riskExplanation ? (
        <p className="text-xs mt-2 opacity-90" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
          {riskExplanation}
        </p>
      ) : null}
    </div>
  );
}
