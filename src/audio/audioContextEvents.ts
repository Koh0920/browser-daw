export const AUDIO_CONTEXT_UNLOCK_EVENT = "browser-daw:unlock-audio";

export const requestAudioContextUnlock = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(AUDIO_CONTEXT_UNLOCK_EVENT));
};
