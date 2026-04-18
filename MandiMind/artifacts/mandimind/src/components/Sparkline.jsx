export default function Sparkline({ prices, trend, height = 56 }) {
  if (!prices || prices.length === 0) return null;

  const vals  = prices.map((p) => (typeof p === "object" ? p.modal_price ?? p.price : p)).filter(Boolean);
  if (vals.length < 2) return null;

  const max   = Math.max(...vals);
  const min   = Math.min(...vals);
  const range = max - min || 1;
  const H     = 60;
  const norm  = (v) => H - 8 - ((v - min) / range) * (H - 16);
  const step  = 100 / (vals.length - 1);
  const path  = vals.map((v, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${norm(v).toFixed(1)}`).join(" ");

  const color =
    trend === "rising"  ? "#22c55e" :
    trend === "falling" ? "#ef4444" : "#f59e0b";

  return (
    <svg viewBox={`0 0 100 ${H}`} style={{ width: "100%", height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L 100 ${H} L 0 ${H} Z`} fill="url(#sg)" />
      <path d={path} stroke={color} strokeWidth="2.5" fill="none"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
