export async function shareResult({
  title = "",
  text = "",
  url = "",
  fallbackSuccessMessage = "Result copied to clipboard",
}) {
  const shareText = [text, url].filter(Boolean).join("\n\n");

  try {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      await navigator.share({ title, text, url });
      return {
        ok: true,
        method: "native-share",
        message: "Result shared successfully",
      };
    }

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareText);
      return {
        ok: true,
        method: "clipboard",
        message: fallbackSuccessMessage,
      };
    }

    return {
      ok: false,
      method: "unsupported",
      message: "Sharing is not supported on this device",
    };
  } catch (error) {
    return {
      ok: false,
      method: "error",
      message: "Unable to share right now. Please try again.",
      error,
    };
  }
}
