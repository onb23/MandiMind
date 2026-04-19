import { useLanguage } from "../context/LanguageContext";

function getConfidence(score, t, penalty = 0, disallowHigh = false) {
  const bands = [t.low.toUpperCase(), t.medium.toUpperCase(), t.high.toUpperCase()];

  let index = 0;
  if (score >= 70) index = 2;
  else if (score >= 45) index = 1;

  if (disallowHigh && index === 2) index = 1;
  index = Math.max(0, index - Math.max(0, penalty));
  return bands[index];
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

  return (
    <div className={`${c.bg} rounded-2xl p-6 text-white shadow-xl ${c.glow}`}>
      <div className="space-y-2">
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
          {(t.confidence || "CONFIDENCE").toUpperCase()}:{" "}
        </span>
        <span className="text-sm font-bold tracking-wide">{confidence}</span>
      </div>
    </div>
  );
}
