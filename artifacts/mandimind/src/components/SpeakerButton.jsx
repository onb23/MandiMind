export default function SpeakerButton({
  onSpeak,
  onStop,
  isSpeaking = false,
  isSupported = true,
  ariaLabel = "Hear summary",
  className = "",
}) {
  const unavailable = !isSupported;

  return (
    <button
      type="button"
      onClick={isSpeaking ? onStop : onSpeak}
      disabled={unavailable}
      aria-label={ariaLabel}
      title={unavailable ? "Voice assist unavailable on this browser" : ariaLabel}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-all active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#004c22]/30 ${
        unavailable
          ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
          : isSpeaking
            ? "border-emerald-300 bg-emerald-50 text-emerald-700 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]"
            : "border-gray-200 bg-white text-[#004c22] shadow-sm hover:bg-[#f8f6ef]"
      } ${className}`}
    >
      <span className={`text-base leading-none ${isSpeaking ? "animate-pulse" : ""}`}>{unavailable ? "🔇" : "🔊"}</span>
    </button>
  );
}
