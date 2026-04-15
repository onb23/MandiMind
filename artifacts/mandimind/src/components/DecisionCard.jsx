import { useLanguage } from "../context/LanguageContext";

export default function DecisionCard({ decision, score }) {
  const { t } = useLanguage();

  const config = {
    SELL: {
      bg: "bg-green-600",
      border: "border-green-700",
      text: t.sell,
      advice: t.sellNow,
      emoji: "",
    },
    HOLD: {
      bg: "bg-yellow-500",
      border: "border-yellow-600",
      text: t.hold,
      advice: t.holdAdvice,
      emoji: "",
    },
    WAIT: {
      bg: "bg-orange-500",
      border: "border-orange-600",
      text: t.wait,
      advice: t.waitAdvice,
      emoji: "",
    },
  };

  const c = config[decision] || config.HOLD;

  return (
    <div
      className={`${c.bg} rounded-2xl p-6 text-white text-center shadow-lg border ${c.border}`}
    >
      <div
        className="text-4xl font-extrabold mb-2"
        style={{ fontFamily: "Manrope, sans-serif" }}
      >
        {c.text}
      </div>
      <div
        className="text-lg opacity-90 mb-3"
        style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
      >
        {c.advice}
      </div>
      <div className="bg-white/20 rounded-xl py-2 px-4 inline-block">
        <span className="text-sm opacity-80">{t.score}: </span>
        <span className="text-xl font-bold">{score}/100</span>
      </div>
    </div>
  );
}
