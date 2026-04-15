import { useLanguage } from "../context/LanguageContext";

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

  const arc = (score / 100) * 251;

  return (
    <div className={`${c.bg} rounded-2xl p-6 text-white shadow-xl ${c.glow}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div
            className="text-4xl font-extrabold leading-none"
            style={{ fontFamily: "Manrope, sans-serif" }}
          >
            {c.text}
          </div>
          <p
            className="text-sm opacity-85 mt-1 max-w-[200px]"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            {c.desc}
          </p>
        </div>
        <div className="relative w-16 h-16 shrink-0">
          <svg className="w-16 h-16 -rotate-90" viewBox="0 0 90 90">
            <circle cx="45" cy="45" r="40" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="8" />
            <circle
              cx="45"
              cy="45"
              r="40"
              fill="none"
              stroke="white"
              strokeWidth="8"
              strokeDasharray={`${arc} 251`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold">{score}</span>
          </div>
        </div>
      </div>
      <div className="bg-white/15 rounded-xl py-1.5 px-3 text-center">
        <span className="text-xs opacity-75">{t.score}: </span>
        <span className="text-sm font-bold">{score}/100</span>
      </div>
    </div>
  );
}
