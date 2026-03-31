import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFactoryInstrumentPreset,
  listInstrumentPresets,
  saveInstrumentPreset,
} from "@/audio/instrumentPresets";

class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>();

  get length() {
    return this.store.size;
  }

  clear() {
    this.store.clear();
  }

  getItem(key: string) {
    return this.store.get(key) ?? null;
  }

  key(index: number) {
    return [...this.store.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
}

const installWindowStorage = () => {
  const previousWindow = (globalThis as typeof globalThis & { window?: Window }).window;
  const mockWindow = {
    localStorage: new MemoryStorage(),
  } as unknown as Window;

  Object.defineProperty(globalThis, "window", {
    value: mockWindow,
    configurable: true,
    writable: true,
  });

  return () => {
    Object.defineProperty(globalThis, "window", {
      value: previousWindow,
      configurable: true,
      writable: true,
    });
  };
};

test("buildFactoryInstrumentPreset uses instrument defaults", () => {
  const preset = buildFactoryInstrumentPreset("drum-kit");

  assert.equal(preset.name, "Factory Default");
  assert.equal(preset.parameters.releaseSeconds, 0.18);
  assert.equal(preset.parameters.gain, 1);
});

test("saveInstrumentPreset stores and updates presets by patch and name", () => {
  const restoreWindow = installWindowStorage();

  try {
    const createdPreset = saveInstrumentPreset("basic-synth", "Bright Lead", {
      gain: 1.2,
      oscType: "sawtooth",
    });

    assert.ok(createdPreset);
    assert.equal(listInstrumentPresets("basic-synth").length, 1);
    assert.equal(listInstrumentPresets("piano").length, 0);

    const updatedPreset = saveInstrumentPreset("basic-synth", "Bright Lead", {
      gain: 0.9,
      oscType: "square",
    });

    assert.ok(updatedPreset);
    assert.equal(listInstrumentPresets("basic-synth").length, 1);
    assert.equal(listInstrumentPresets("basic-synth")[0]?.parameters.oscType, "square");
  } finally {
    restoreWindow();
  }
});