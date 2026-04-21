import { useLanguage } from "../context/LanguageContext";
import logo from "../assets/logo.svg";

export default function Navbar() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <nav className="sticky top-0 z-50 bg-[#004c22]/95 backdrop-blur text-white px-4 py-3.5 flex items-center justify-between border-b border-white/10 shadow-[0_4px_16px_rgba(4,34,19,0.22)]">
      <div className="flex items-center gap-2.5">
        <img src={logo} alt="MandiMind" className="w-8 h-8" />
        <div>
          <span className="text-lg font-bold tracking-tight block leading-tight" style={{ fontFamily: "Manrope, sans-serif" }}>
            {t.appName}
          </span>
          <span className="text-[10px] text-emerald-100/90 uppercase tracking-[0.12em]">Agmarknet Insights</span>
        </div>
      </div>
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        className="bg-[#166534] text-white text-sm px-3 py-1.5 rounded-lg border border-white/25 outline-none"
      >
        <option value="en">EN</option>
        <option value="hi">HI</option>
        <option value="mr">MR</option>
      </select>
    </nav>
  );
}
