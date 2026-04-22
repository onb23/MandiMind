import { useMemo, useState } from "react";

export function useSpeechAssistant() {
  const isSupported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [speaking, setSpeaking] = useState(false);
  const selectedVoiceLang = "mr-IN";

  const controls = useMemo(() => {
    const speakText = (text: string) => {
      if (!isSupported || !text) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = selectedVoiceLang;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    };

    const stopSpeaking = () => {
      if (!isSupported) return;
      window.speechSynthesis.cancel();
      setSpeaking(false);
    };

    return { speakText, stopSpeaking };
  }, [isSupported]);

  return {
    ...controls,
    speaking,
    isSupported,
    selectedVoiceLang,
  };
}
