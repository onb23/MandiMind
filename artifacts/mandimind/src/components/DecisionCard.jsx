import { useLanguage } from "../context/LanguageContext";

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
    return "Low confidence because recent mandi records are unavailable.";
  }

  if (hasFallbackData) {
    return "Medium confidence because latest available data is used instead of same-day live data.";
  }

  if (confidenceLevel === 2) {
    return `High confidence because score is ${score}/100 with aligned trend and farmer inputs.`;
  }

  if (confidenceLevel === 1) {
    return `Medium confidence because score is ${score}/100 and some market signals are mixed.`;
  }

  return `Low confidence because score is ${score}/100 and conditions favor immediate action.`;
}

export default function DecisionCard({
  decision,
  score,
  confidencePenalty = 0,
  disallowHighConfidence = false,
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
      text: "NOT ENOUGH DATA",
      desc: "No recent mandi data available for this crop/mandi",
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

  return (
    <div className={`${c.bg} rounded-2xl p-6 text-white shadow-xl ${c.glow}`}>
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.12em] opacity-80">
          {t.recommendedAction || "Recommended action"}
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

      <div className="mt-5 bg-white/15 rounded-xl py-2 px-3 text-center">
        <span className="text-xs tracking-wide opacity-80">
          {(t.confidence || "CONFIDENCE").toUpperCase()}: {" "}
        </span>
        <span className="text-sm font-bold tracking-wide">{confidence.label}</span>
      </div>
      <p className="text-xs mt-2 opacity-90" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
        {confidenceReason}
      </p>
    </div>
  );
}
