interface PlaybackDiagnosticsSnapshot {
  transportFps: number;
  transportJitterMs: number;
  workerTickMs: number;
  workerJitterMs: number;
  longTaskCount: number;
  longTaskMs: number;
}

type PlaybackDiagnosticsListener = (
  snapshot: PlaybackDiagnosticsSnapshot,
) => void;

const MAX_SAMPLES = 90;
const LONG_TASK_WINDOW_MS = 8000;
const DIAGNOSTICS_EMIT_INTERVAL_MS = 200;
const transportDeltas: number[] = [];
const workerDeltas: number[] = [];
const longTasks: Array<{ time: number; duration: number }> = [];
const listeners = new Set<PlaybackDiagnosticsListener>();

let lastTransportFrameAt: number | null = null;
let lastWorkerTickAt: number | null = null;
let lastSnapshot: PlaybackDiagnosticsSnapshot = {
  transportFps: 0,
  transportJitterMs: 0,
  workerTickMs: 0,
  workerJitterMs: 0,
  longTaskCount: 0,
  longTaskMs: 0,
};
let longTaskObserverInstalled = false;
let lastEmitAt = 0;

const getNow = () =>
  typeof performance === "undefined" ? Date.now() : performance.now();

const trimSamples = (samples: number[]) => {
  if (samples.length > MAX_SAMPLES) {
    samples.splice(0, samples.length - MAX_SAMPLES);
  }
};

const average = (samples: number[]) => {
  if (samples.length === 0) {
    return 0;
  }

  return samples.reduce((sum, value) => sum + value, 0) / samples.length;
};

const stddev = (samples: number[]) => {
  if (samples.length < 2) {
    return 0;
  }

  const mean = average(samples);
  const variance =
    samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    samples.length;
  return Math.sqrt(variance);
};

const updateSnapshot = () => {
  const now = getNow();

  while (longTasks.length > 0 && now - longTasks[0].time > LONG_TASK_WINDOW_MS) {
    longTasks.shift();
  }

  const meanTransportDelta = average(transportDeltas);
  const meanWorkerDelta = average(workerDeltas);

  lastSnapshot = {
    transportFps:
      meanTransportDelta > 0 ? Math.round(1000 / meanTransportDelta) : 0,
    transportJitterMs: Number(stddev(transportDeltas).toFixed(2)),
    workerTickMs: Number(meanWorkerDelta.toFixed(2)),
    workerJitterMs: Number(stddev(workerDeltas).toFixed(2)),
    longTaskCount: longTasks.length,
    longTaskMs: Number(
      longTasks.reduce((sum, task) => sum + task.duration, 0).toFixed(1),
    ),
  };

  if (now - lastEmitAt < DIAGNOSTICS_EMIT_INTERVAL_MS) {
    return;
  }

  lastEmitAt = now;
  listeners.forEach((listener) => listener(lastSnapshot));
};

const installLongTaskObserver = () => {
  if (
    longTaskObserverInstalled ||
    typeof window === "undefined" ||
    typeof PerformanceObserver === "undefined"
  ) {
    return;
  }

  try {
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        longTasks.push({
          time: entry.startTime,
          duration: entry.duration,
        });
      });

      updateSnapshot();
    });

    observer.observe({ type: "longtask", buffered: true });
    longTaskObserverInstalled = true;
  } catch {
    longTaskObserverInstalled = true;
  }
};

export const getPlaybackDiagnosticsSnapshot = () => {
  installLongTaskObserver();
  return lastSnapshot;
};

export const subscribePlaybackDiagnostics = (
  listener: PlaybackDiagnosticsListener,
) => {
  installLongTaskObserver();
  listeners.add(listener);
  listener(lastSnapshot);

  return () => {
    listeners.delete(listener);
  };
};

export const recordTransportFrame = () => {
  installLongTaskObserver();
  const now = getNow();

  if (lastTransportFrameAt !== null) {
    transportDeltas.push(now - lastTransportFrameAt);
    trimSamples(transportDeltas);
  }

  lastTransportFrameAt = now;
  updateSnapshot();
};

export const recordAudioWorkerTick = () => {
  installLongTaskObserver();
  const now = getNow();

  if (lastWorkerTickAt !== null) {
    workerDeltas.push(now - lastWorkerTickAt);
    trimSamples(workerDeltas);
  }

  lastWorkerTickAt = now;
  updateSnapshot();
};