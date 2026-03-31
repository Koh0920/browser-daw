export type LiveMidiCommand =
  | {
      type: "noteon";
      trackId: string;
      noteKey: string;
      pitch: number;
      velocity: number;
    }
  | {
      type: "noteoff";
      trackId: string;
      noteKey: string;
    }
  | {
      type: "all-notes-off";
      trackId?: string;
    };

const LIVE_MIDI_EVENT_NAME = "browser-daw:live-midi-command";
const liveMidiTarget = new EventTarget();

export const dispatchLiveMidiCommand = (command: LiveMidiCommand) => {
  liveMidiTarget.dispatchEvent(
    new CustomEvent<LiveMidiCommand>(LIVE_MIDI_EVENT_NAME, {
      detail: command,
    }),
  );
};

export const subscribeLiveMidiCommands = (
  listener: (command: LiveMidiCommand) => void,
) => {
  const handleEvent = (event: Event) => {
    listener((event as CustomEvent<LiveMidiCommand>).detail);
  };

  liveMidiTarget.addEventListener(LIVE_MIDI_EVENT_NAME, handleEvent);
  return () => {
    liveMidiTarget.removeEventListener(LIVE_MIDI_EVENT_NAME, handleEvent);
  };
};
