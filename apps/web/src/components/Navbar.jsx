import { useLanguage } from "../context/LanguageContext";
import logo from "../assets/logo.svg";

export default function Navbar() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <nav className="sticky top-0 z-50 bg-[#004c22] text-white px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <img src={logo} alt="MandiMind" className="w-8 h-8" />
        <span
          className="text-lg font-bold"
          style={{ fontFamily: "Manrope, sans-serif" }}
        >
          {t.appName}
        </span>
      </div>
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        className="bg-[#166534] text-white text-sm px-2 py-1 rounded-lg border border-white/20 outline-none"
      >
        <option value="en">EN</option>
        <option value="hi">HI</option>
        <option value="mr">MR</option>
      </select>
    </nav>
  );
}
