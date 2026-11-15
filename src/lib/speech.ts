/**
 * Small wrapper around the browser's Dutch speech synthesis. No external
 * service or key is needed; it is used for the 🔊 buttons next to words,
 * transcript lines and grammar examples.
 */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/^[■●▸•]\s*/, "")
    .replace(/^\s*\d+\.\s+/, "")
    .replace(/^([A-Z][A-Za-zÀ-ÿ.\-]{0,24}?):\s+/, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/…/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dutchVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((voice) => voice.lang.toLowerCase() === "nl-nl") ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("nl"))
  );
}

export function speakDutch(text: string, rate = 0.9): boolean {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    return false;
  }

  const spoken = cleanForSpeech(text);
  if (!spoken) return false;

  const utterance = new SpeechSynthesisUtterance(spoken);
  utterance.lang = "nl-NL";
  utterance.rate = rate;
  const voice = dutchVoice();
  if (voice) utterance.voice = voice;

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}
