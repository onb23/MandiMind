import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const LANGUAGE_PRIORITY = ["mr-IN", "mr", "hi-IN", "hi", "en-IN", "en-US", "en"];
const LANGUAGE_BASE_PRIORITY = ["mr", "hi", "en"];

const normalize = (value = "") => value.toLowerCase();

function pickVoice(voices = []) {
  if (!voices.length) return null;

  const normalized = voices.map((voice) => ({
    voice,
    lang: normalize(voice.lang),
    name: normalize(voice.name),
  }));

  for (const target of LANGUAGE_PRIORITY) {
    const exact = normalized.find((entry) => entry.lang === normalize(target));
    if (exact) return exact.voice;
  }

  for (const baseLang of LANGUAGE_BASE_PRIORITY) {
    const contains = normalized.find((entry) => entry.lang.startsWith(baseLang));
    if (contains) return contains.voice;
  }

  const indianEnglish = normalized.find((entry) => entry.lang.includes("en-in") || entry.name.includes("india"));
  if (indianEnglish) return indianEnglish.voice;

  return voices[0];
}

function trimSpeechText(text = "", maxLength = 140) {
  if (!text) return "";
  const singleLine = text.replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxLength) return singleLine;
  return `${singleLine.slice(0, maxLength - 1).trim()}…`;
}

export function useSpeechAssistant() {
  const synthesisRef = useRef(null);
  const utteranceRef = useRef(null);
  const [voices, setVoices] = useState([]);
  const [speaking, setSpeaking] = useState(false);

  const isSupported = typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance !== "undefined";

  useEffect(() => {
    if (!isSupported) return;

    const synth = window.speechSynthesis;
    synthesisRef.current = synth;

    const loadVoices = () => {
      const loaded = synth.getVoices();
      if (loaded?.length) {
        setVoices(loaded);
      }
    };

    loadVoices();
    synth.addEventListener("voiceschanged", loadVoices);

    return () => {
      synth.removeEventListener("voiceschanged", loadVoices);
      synth.cancel();
    };
  }, [isSupported]);

  const selectedVoice = useMemo(() => pickVoice(voices), [voices]);

  const stopSpeaking = useCallback(() => {
    if (!isSupported || !synthesisRef.current) return;
    synthesisRef.current.cancel();
    utteranceRef.current = null;
    setSpeaking(false);
  }, [isSupported]);

  const speakText = useCallback(
    (text) => {
      if (!isSupported || !synthesisRef.current) return { ok: false, reason: "unavailable" };
      const cleanText = trimSpeechText(text);
      if (!cleanText) return { ok: false, reason: "empty" };

      const synth = synthesisRef.current;
      synth.cancel();

      const utterance = new window.SpeechSynthesisUtterance(cleanText);
      const voice = selectedVoice;
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      } else {
        utterance.lang = "mr-IN";
      }

      utterance.rate = 0.9;
      utterance.volume = 1;
      utterance.pitch = 1;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);

      utteranceRef.current = utterance;
      synth.speak(utterance);
      return { ok: true, lang: utterance.lang };
    },
    [isSupported, selectedVoice]
  );

  const isSpeaking = useCallback(() => speaking, [speaking]);

  return {
    speakText,
    stopSpeaking,
    isSpeaking,
    speaking,
    isSupported,
    selectedVoiceLang: selectedVoice?.lang || null,
  };
}
