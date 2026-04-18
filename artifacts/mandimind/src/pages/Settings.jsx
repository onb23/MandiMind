import { useLanguage } from "../context/LanguageContext";

const APP_VERSION = "v1.0.4-debug";
const CREDIT_TEXT = "made by omkar borade";

export default function Settings() {
  const { language, setLanguage, t } = useLanguage();

  const languages = [
    { code: "en", name: "English" },
    { code: "hi", name: "हिंदी (Hindi)" },
    { code: "mr", name: "मराठी (Marathi)" },
  ];

  return (
    <div className="min-h-screen bg-[#fff9eb] pb-24">
      <div className="px-4 pt-6 pb-4">
        <h1
          className="text-2xl font-extrabold text-[#004c22] mb-1"
          style={{ fontFamily: "Manrope, sans-serif" }}
        >
          {t.settings}
        </h1>
      </div>

      <div className="px-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <h3
            className="text-base font-bold text-[#1e1c10] mb-4"
            style={{ fontFamily: "Manrope, sans-serif" }}
          >
            {t.language}
          </h3>
          <div className="space-y-2">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => setLanguage(lang.code)}
                className={`w-full text-left px-4 py-4 rounded-xl text-base font-medium border transition-all ${
                  language === lang.code
                    ? "bg-[#004c22] text-white border-[#004c22]"
                    : "bg-white text-[#1e1c10] border-gray-300"
                }`}
                style={{
                  fontFamily: "Be Vietnam Pro, sans-serif",
                  minHeight: "56px",
                }}
              >
                {lang.name}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 mt-4">
          <h3
            className="text-base font-bold text-[#1e1c10] mb-2"
            style={{ fontFamily: "Manrope, sans-serif" }}
          >
            {t.appName}
          </h3>
          <p
            className="text-sm text-gray-600"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            {t.tagline}
          </p>
        </div>

        <div className="mt-8 px-2">
          <p
            className="text-[11px] text-[#1e1c10] opacity-45"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            {APP_VERSION}
          </p>
          <p
            className="text-[11px] text-[#1e1c10] opacity-55 tracking-[0.08em] mt-1"
            style={{ fontFamily: '"Courier New", Courier, monospace' }}
          >
            {CREDIT_TEXT}
          </p>
        </div>
      </div>
    </div>
  );
}
