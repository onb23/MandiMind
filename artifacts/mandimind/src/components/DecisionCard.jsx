import { useLanguage } from "../context/LanguageContext";

function getConfidence(score, t) {
  if (score >= 70) return t.high.toUpperCase();
  if (score >= 45) return t.medium.toUpperCase();
  return t.low.toUpperCase();
}

export default function DecisionCard({ decision, score }) {
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
  };

  const c = config[decision] || config.HOLD;
  const confidence = getConfidence(score, t);

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
