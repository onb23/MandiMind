import { useLanguage } from "../context/LanguageContext";

const profileLinks = {
  portfolio: "",
  linkedIn: "",
};

export default function Settings() {
  const { language, setLanguage, t } = useLanguage();
  const FEEDBACK_FORM_URL = "https://tally.so/r/LZMN1z";

  const languages = [
    { code: "en", name: "English" },
    { code: "hi", name: "हिंदी (Hindi)" },
    { code: "mr", name: "मराठी (Marathi)" },
  ];

  const feedbackActions = [
    {
      label: "Report a problem",
      subtitle: "Something not working? Tell us",
      type: "bug",
    },
    {
      label: "Suggest a feature",
      subtitle: "What should we build next?",
      type: "feature",
    },
    {
      label: "Business / partnership inquiry",
      subtitle: "For traders, exporters, companies",
      type: "business",
    },
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
            className="text-base font-bold text-[#1e1c10] mb-4"
            style={{ fontFamily: "Manrope, sans-serif" }}
          >
            Feedback & Support
          </h3>
          <div className="space-y-2">
            {feedbackActions.map((action) => (
              <button
                key={action.type}
                type="button"
                onClick={() => window.open(FEEDBACK_FORM_URL, "_blank", "noopener,noreferrer")}
                className="block w-full rounded-xl border border-gray-300 px-4 py-4 text-left text-base font-medium text-[#1e1c10] transition-colors hover:bg-[#fff6df] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#004c22]"
                style={{
                  fontFamily: "Be Vietnam Pro, sans-serif",
                  minHeight: "56px",
                }}
              >
                <span className="block">{action.label}</span>
                <span className="mt-1 block text-sm font-normal text-gray-600">
                  {action.subtitle}
                </span>
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
          <p
            className="text-xs text-gray-400 mt-2"
            style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
          >
            Version 1.0 — VERSION TEST 031
          </p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 mt-4">
          <h3
            className="text-base font-bold text-[#1e1c10] mb-3"
            style={{ fontFamily: "Manrope, sans-serif" }}
          >
            About MandiMind
          </h3>
          <div className="space-y-1.5 text-sm text-gray-700" style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}>
            <p>Built by Omkar Borade</p>
            <p>Mission: Helping farmers and agri-traders make better market decisions</p>
            <p>Focus: Maharashtra-first, expanding further</p>
          </div>

          {(profileLinks.portfolio || profileLinks.linkedIn) && (
            <div className="mt-3 flex flex-wrap gap-3">
              {profileLinks.portfolio && (
                <a
                  href={profileLinks.portfolio}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-[#004c22] underline underline-offset-2"
                  style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
                >
                  Portfolio
                </a>
              )}
              {profileLinks.linkedIn && (
                <a
                  href={profileLinks.linkedIn}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-[#004c22] underline underline-offset-2"
                  style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
                >
                  LinkedIn
                </a>
              )}
            </div>
          )}
        </div>

        <p
          className="text-center text-xs text-gray-500 mt-8"
          style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic" }}
        >
          Made by Omkar Borade
        </p>
      </div>
    </div>
  );
}
