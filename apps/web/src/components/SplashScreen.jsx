import { useEffect, useState } from "react";
import logo from "../assets/logo.svg";

export default function SplashScreen({ onDone }) {
  const [visible, setVisible] = useState(true);
  const [fading,  setFading]  = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), 1400);
    const doneTimer = setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, 1800);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#004c22",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        opacity: fading ? 0 : 1,
        transition: "opacity 0.4s ease",
        pointerEvents: "none",
      }}
    >
      <img
        src={logo}
        alt="MandiMind"
        style={{
          width: 96,
          height: 96,
          borderRadius: 24,
          transform: fading ? "scale(0.9)" : "scale(1)",
          transition: "transform 0.4s ease",
        }}
      />
      <div style={{ textAlign: "center" }}>
        <p
          style={{
            color: "#ffffff",
            fontSize: 32,
            fontWeight: 800,
            letterSpacing: -0.5,
            fontFamily: "Manrope, sans-serif",
            lineHeight: 1,
            marginBottom: 10,
          }}
        >
          MandiMind
        </p>
        <p
          style={{
            color: "#86efac",
            fontSize: 16,
            fontWeight: 500,
            fontFamily: "Be Vietnam Pro, sans-serif",
            opacity: 0.9,
          }}
        >
          बेचें या रुकें? हम बताएंगे।
        </p>
      </div>
      <div
        style={{
          width: 36,
          height: 4,
          borderRadius: 2,
          background: "rgba(255,255,255,0.2)",
          overflow: "hidden",
          marginTop: 8,
        }}
      >
        <div
          style={{
            height: "100%",
            background: "#feb234",
            borderRadius: 2,
            animation: "splashBar 1.4s ease forwards",
          }}
        />
      </div>
      <style>{`
        @keyframes splashBar {
          from { width: 0% }
          to   { width: 100% }
        }
      `}</style>
    </div>
  );
}
