import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LiveInputMode, LiveMidiMessage } from "@/types";

type MidiInputDevice = {
  id: string;
  name: string;
  inputMode: LiveInputMode;
};

type MidiAccessLike = {
  inputs: Map<string, MidiInputLike>;
  onstatechange: ((event: Event) => void) | null;
};

type MidiInputLike = {
  id: string;
  name?: string;
  manufacturer?: string;
  onmidimessage: ((event: MidiMessageEventLike) => void) | null;
};

type MidiMessageEventLike = {
  data?: Uint8Array;
  timeStamp: number;
};

type NavigatorWithMidi = Navigator & {
  requestMIDIAccess?: () => Promise<MidiAccessLike>;
};

interface UseMidiInputOptions {
  onMessage: (message: LiveMidiMessage) => void;
}

const QWERTY_INPUT_ID = "qwerty";
const QWERTY_INPUT_NAME = "Computer Keyboard";
const QWERTY_CHANNEL = 1;
const QWERTY_VELOCITY = 112;
const QWERTY_NOTE_MAP: Record<string, number> = {
  z: 48,
  s: 49,
  x: 50,
  d: 51,
  c: 52,
  v: 53,
  g: 54,
  b: 55,
  h: 56,
  n: 57,
  j: 58,
  m: 59,
  ",": 60,
  l: 61,
  ".": 62,
  ";": 63,
  "/": 64,
  q: 60,
  "2": 61,
  w: 62,
  "3": 63,
  e: 64,
  r: 65,
  "5": 66,
  t: 67,
  "6": 68,
  y: 69,
  "7": 70,
  u: 71,
  i: 72,
  "9": 73,
  o: 74,
  "0": 75,
  p: 76,
};

const isEditableElement = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
};

const getTimestamp = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

const createQwertyDevice = (): MidiInputDevice => ({
  id: QWERTY_INPUT_ID,
  name: QWERTY_INPUT_NAME,
  inputMode: "qwerty",
});

const normalizeMidiMessage = (
  inputId: string,
  data: Uint8Array,
  timeStamp: number,
): LiveMidiMessage | null => {
  const [status = 0, data1 = 0, data2 = 0] = data;
  const command = status >> 4;
  const channel = (status & 0x0f) + 1;

  if (command !== 0x8 && command !== 0x9) {
    return null;
  }

  const isNoteOn = command === 0x9 && data2 > 0;

  return {
    type: isNoteOn ? "noteon" : "noteoff",
    pitch: data1,
    velocity: data2,
    channel,
    sourceId: inputId,
    timestamp: timeStamp,
    inputMode: "web-midi",
  };
};

export const useMidiInput = ({ onMessage }: UseMidiInputOptions) => {
  const onMessageRef = useRef(onMessage);
  const [midiAccess, setMidiAccess] = useState<MidiAccessLike | null>(null);
  const [midiDevices, setMidiDevices] = useState<MidiInputDevice[]>([]);
  const [activeInputId, setActiveInputId] = useState<string>(QWERTY_INPUT_ID);
  const [pressedQwertyKeys, setPressedQwertyKeys] = useState<string[]>([]);
  const [supportMessage, setSupportMessage] = useState<string | null>(null);
  const [isWebMidiSupported, setIsWebMidiSupported] = useState(false);
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const activeInputIdRef = useRef(activeInputId);

  onMessageRef.current = onMessage;
  activeInputIdRef.current = activeInputId;

  const emitQwertyMessage = useCallback(
    (key: string, type: LiveMidiMessage["type"]) => {
      const normalizedKey = key.toLowerCase();
      const pitch = QWERTY_NOTE_MAP[normalizedKey];
      if (pitch === undefined) {
        return false;
      }

      onMessageRef.current({
        type,
        pitch,
        velocity: type === "noteon" ? QWERTY_VELOCITY : 0,
        channel: QWERTY_CHANNEL,
        sourceId: QWERTY_INPUT_ID,
        timestamp: getTimestamp(),
        inputMode: "qwerty",
      });
      return true;
    },
    [],
  );

  const syncPressedQwertyKeys = useCallback(() => {
    const nextKeys = Array.from(pressedKeysRef.current);
    setPressedQwertyKeys((current) => {
      if (
        current.length === nextKeys.length &&
        current.every((key, index) => key === nextKeys[index])
      ) {
        return current;
      }

      return nextKeys;
    });
  }, []);

  const pressQwertyKey = useCallback(
    (key: string) => {
      const normalizedKey = key.toLowerCase();
      if (QWERTY_NOTE_MAP[normalizedKey] === undefined) {
        return false;
      }

      if (activeInputIdRef.current !== QWERTY_INPUT_ID) {
        setActiveInputId(QWERTY_INPUT_ID);
      }

      if (pressedKeysRef.current.has(normalizedKey)) {
        return true;
      }

      pressedKeysRef.current.add(normalizedKey);
      syncPressedQwertyKeys();
      return emitQwertyMessage(normalizedKey, "noteon");
    },
    [emitQwertyMessage, syncPressedQwertyKeys],
  );

  const releaseQwertyKey = useCallback(
    (key: string) => {
      const normalizedKey = key.toLowerCase();
      if (!pressedKeysRef.current.has(normalizedKey)) {
        return false;
      }

      pressedKeysRef.current.delete(normalizedKey);
      syncPressedQwertyKeys();
      return emitQwertyMessage(normalizedKey, "noteoff");
    },
    [emitQwertyMessage, syncPressedQwertyKeys],
  );

  const releaseAllQwertyKeys = useCallback(() => {
    if (pressedKeysRef.current.size === 0) {
      syncPressedQwertyKeys();
      return;
    }

    pressedKeysRef.current.forEach((key) => {
      emitQwertyMessage(key, "noteoff");
    });

    pressedKeysRef.current.clear();
    syncPressedQwertyKeys();
  }, [emitQwertyMessage, syncPressedQwertyKeys]);

  useEffect(() => {
    let isDisposed = false;
    const nav = navigator as NavigatorWithMidi;

    const syncDevices = (access: MidiAccessLike) => {
      const nextDevices = [
        ...Array.from(access.inputs.values()).map((input) => ({
          id: input.id,
          name: input.name || input.manufacturer || "MIDI Input",
          inputMode: "web-midi" as const,
        })),
        createQwertyDevice(),
      ];

      setMidiDevices(nextDevices);
      setActiveInputId((current) => {
        if (nextDevices.some((device) => device.id === current)) {
          return current;
        }

        return nextDevices[0]?.id ?? QWERTY_INPUT_ID;
      });
    };

    if (!nav.requestMIDIAccess) {
      setMidiDevices([createQwertyDevice()]);
      setActiveInputId(QWERTY_INPUT_ID);
      setSupportMessage(
        "Web MIDI is unavailable in this browser. QWERTY fallback is active.",
      );
      setIsWebMidiSupported(false);
      return;
    }

    setIsWebMidiSupported(true);

    void nav
      .requestMIDIAccess()
      .then((access) => {
        if (isDisposed) {
          return;
        }

        setMidiAccess(access);
        syncDevices(access);
        setSupportMessage(
          access.inputs.size > 0
            ? null
            : "No MIDI device detected. Use QWERTY fallback or connect a controller.",
        );

        access.onstatechange = () => {
          syncDevices(access);
          setSupportMessage(
            access.inputs.size > 0
              ? null
              : "No MIDI device detected. Use QWERTY fallback or connect a controller.",
          );
        };
      })
      .catch((error) => {
        console.error("Failed to access Web MIDI", error);
        if (isDisposed) {
          return;
        }

        setMidiDevices([createQwertyDevice()]);
        setActiveInputId(QWERTY_INPUT_ID);
        setSupportMessage(
          "MIDI permission was not granted. QWERTY fallback is active.",
        );
      });

    return () => {
      isDisposed = true;
      if (midiAccess) {
        midiAccess.onstatechange = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!midiAccess || activeInputId === QWERTY_INPUT_ID) {
      return;
    }

    const input = midiAccess.inputs.get(activeInputId);
    if (!input) {
      return;
    }

    input.onmidimessage = (event) => {
      if (!event.data) {
        return;
      }

      const normalized = normalizeMidiMessage(
        input.id,
        event.data,
        event.timeStamp,
      );
      if (!normalized) {
        return;
      }

      onMessageRef.current(normalized);
    };

    return () => {
      input.onmidimessage = null;
    };
  }, [activeInputId, midiAccess]);

  useEffect(() => {
    if (activeInputId !== QWERTY_INPUT_ID) {
      releaseAllQwertyKeys();
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isEditableElement(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const pitch = QWERTY_NOTE_MAP[key];
      if (pitch === undefined) {
        return;
      }

      event.preventDefault();
      pressQwertyKey(key);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const pitch = QWERTY_NOTE_MAP[key];
      if (pitch === undefined) {
        return;
      }

      releaseQwertyKey(key);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", releaseAllQwertyKeys);

    return () => {
      releaseAllQwertyKeys();
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", releaseAllQwertyKeys);
    };
  }, [activeInputId]);

  const inputs = useMemo(() => {
    if (midiDevices.length > 0) {
      return midiDevices;
    }

    return [createQwertyDevice()];
  }, [midiDevices]);

  const activeInput =
    inputs.find((device) => device.id === activeInputId) ??
    inputs[0] ??
    createQwertyDevice();

  return {
    activeInput,
    activeInputId,
    inputMode: activeInput.inputMode,
    inputs,
    isWebMidiSupported,
    pressedQwertyKeys,
    pressQwertyKey,
    releaseAllQwertyKeys,
    releaseQwertyKey,
    setActiveInputId,
    supportMessage,
  };
};
