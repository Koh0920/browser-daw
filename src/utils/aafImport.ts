import type { Project, ProjectTrack } from "@/types";
import { analyzeAudioData } from "@/utils/audioAnalysis";

const createId = () => crypto.randomUUID();

const getFileNameWithoutExtension = (fileName: string) => {
  return fileName.replace(/\.[^.]+$/, "") || "Imported AAF";
};

const inferAudioMimeType = (name: string, content?: Uint8Array) => {
  const lower = name.toLowerCase();
  if (
    lower.endsWith(".wav") ||
    (content &&
      content[0] === 0x52 &&
      content[1] === 0x49 &&
      content[2] === 0x46 &&
      content[3] === 0x46)
  ) {
    return "audio/wav";
  }

  if (
    lower.endsWith(".aif") ||
    lower.endsWith(".aiff") ||
    (content &&
      content[0] === 0x46 &&
      content[1] === 0x4f &&
      content[2] === 0x52 &&
      content[3] === 0x4d)
  ) {
    return "audio/aiff";
  }

  if (
    lower.endsWith(".flac") ||
    (content &&
      content[0] === 0x66 &&
      content[1] === 0x4c &&
      content[2] === 0x61 &&
      content[3] === 0x43)
  ) {
    return "audio/flac";
  }

  if (lower.endsWith(".mp3")) {
    return "audio/mpeg";
  }

  return undefined;
};

const isProbablyAudioEssence = (name: string, content?: Uint8Array) => {
  const lower = name.toLowerCase();
  if (
    lower.endsWith(".wav") ||
    lower.endsWith(".aif") ||
    lower.endsWith(".aiff") ||
    lower.endsWith(".flac") ||
    lower.endsWith(".mp3")
  ) {
    return true;
  }

  if (!content || content.length < 4) {
    return false;
  }

  const signature = String.fromCharCode(
    content[0],
    content[1],
    content[2],
    content[3],
  );
  return signature === "RIFF" || signature === "FORM" || signature === "fLaC";
};

type CfbEntry = {
  name?: string;
  content?: Uint8Array | number[];
  size?: number;
};

interface AafMetadataHint {
  entryName: string;
  trackName?: string;
  startTime?: number;
  duration?: number;
  slotId?: number;
}

const toUint8Array = (content?: Uint8Array | number[]) => {
  if (!content) {
    return undefined;
  }

  return content instanceof Uint8Array ? content : new Uint8Array(content);
};

const normalizeName = (value: string) => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
};

const decodeUtf16Le = (content: Uint8Array) => {
  if (content.length < 4) {
    return "";
  }

  const evenLength = content.length - (content.length % 2);
  try {
    return new TextDecoder("utf-16le", { fatal: false }).decode(
      content.subarray(0, evenLength),
    );
  } catch {
    return "";
  }
};

const decodeLatin1 = (content: Uint8Array) => {
  try {
    return new TextDecoder("latin1", { fatal: false }).decode(content);
  } catch {
    return "";
  }
};

const extractStringRuns = (value: string) => {
  return value.match(/[A-Za-z0-9 _./:-]{4,}/g) ?? [];
};

const inferSeconds = (rawValue?: string) => {
  if (!rawValue) {
    return undefined;
  }

  const numericValue = Number(rawValue);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return undefined;
  }

  if (numericValue <= 60 * 60 * 12) {
    return numericValue;
  }

  return undefined;
};

const parseHintFromText = (
  entryName: string,
  strings: string[],
): AafMetadataHint | null => {
  const combined = strings.join(" | ");
  const trackNameMatch = combined.match(
    /(?:track\s*name|slot\s*name|mob\s*name|name)[:=\s]+([A-Za-z0-9 _.-]{3,})/i,
  );
  const slotIdMatch = combined.match(
    /(?:slot\s*id|slotid|track\s*id)[:=\s]+(\d+)/i,
  );
  const startMatch = combined.match(
    /(?:start\s*time|start|origin|position|timecode)[:=\s]+(\d+(?:\.\d+)?)/i,
  );
  const durationMatch = combined.match(
    /(?:duration|length)[:=\s]+(\d+(?:\.\d+)?)/i,
  );

  const normalizedEntryName = normalizeName(entryName);
  const fallbackTrackName =
    normalizedEntryName && normalizedEntryName !== "root entry"
      ? entryName
          .replace(/[_-]+/g, " ")
          .replace(/\.[^.]+$/, "")
          .trim()
      : undefined;

  const trackName = trackNameMatch?.[1]?.trim() || fallbackTrackName;
  const startTime = inferSeconds(startMatch?.[1]);
  const duration = inferSeconds(durationMatch?.[1]);
  const slotId = slotIdMatch ? Number(slotIdMatch[1]) : undefined;

  if (
    !trackName &&
    startTime === undefined &&
    duration === undefined &&
    slotId === undefined
  ) {
    return null;
  }

  return {
    entryName,
    trackName,
    startTime,
    duration,
    slotId,
  };
};

const collectMetadataHints = (
  entries: Array<{ name: string; content?: Uint8Array }>,
) => {
  const hints: AafMetadataHint[] = [];

  entries.forEach((entry) => {
    if (!entry.content || isProbablyAudioEssence(entry.name, entry.content)) {
      return;
    }

    const utf16Strings = extractStringRuns(decodeUtf16Le(entry.content));
    const latinStrings = extractStringRuns(decodeLatin1(entry.content));
    const strings = Array.from(new Set([...utf16Strings, ...latinStrings]));
    const hint = parseHintFromText(entry.name, strings);

    if (hint) {
      hints.push(hint);
    }
  });

  return hints;
};

const getSimilarityScore = (left: string, right: string) => {
  if (!left || !right) {
    return 0;
  }

  const leftTokens = new Set(normalizeName(left).split(" ").filter(Boolean));
  const rightTokens = new Set(normalizeName(right).split(" ").filter(Boolean));
  let score = 0;

  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) {
      score += 1;
    }
  });

  return score;
};

const findBestHint = (
  audioName: string,
  hints: AafMetadataHint[],
  index: number,
) => {
  const rankedHints = hints
    .map((hint, hintIndex) => ({
      hint,
      hintIndex,
      score: Math.max(
        getSimilarityScore(audioName, hint.trackName ?? ""),
        getSimilarityScore(audioName, hint.entryName),
      ),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return (
        Math.abs(left.hintIndex - index) - Math.abs(right.hintIndex - index)
      );
    });

  return rankedHints[0]?.score > 0 ? rankedHints[0].hint : hints[index];
};

export const importAafFile = async (file: File): Promise<Project> => {
  const cfbModule = await import("cfb");
  const arrayBuffer = await file.arrayBuffer();
  const container = (
    cfbModule.read as unknown as (
      data: Uint8Array,
      opts: { type: string },
    ) => { FileIndex?: CfbEntry[] }
  )(new Uint8Array(arrayBuffer), { type: "buffer" });
  const fileIndex = container.FileIndex ?? [];

  const allEntries = fileIndex.map((entry) => ({
    name: entry.name ?? "essence",
    content: toUint8Array(entry.content),
    size: entry.size ?? 0,
  }));

  const audioEntries = allEntries.filter((entry) =>
    isProbablyAudioEssence(entry.name, entry.content),
  );

  const metadataHints = collectMetadataHints(allEntries);

  if (audioEntries.length === 0) {
    throw new Error(
      "AAF import currently supports audio-essence extraction only, and no supported essence was found.",
    );
  }

  const tracks: ProjectTrack[] = await Promise.all(
    audioEntries.map(async (entry, index) => {
      const audioData = entry.content!;
      const arrayBufferView = audioData.buffer.slice(
        audioData.byteOffset,
        audioData.byteOffset + audioData.byteLength,
      );
      const analysis = await analyzeAudioData(arrayBufferView);
      const hint = findBestHint(entry.name, metadataHints, index);
      const startTime = hint?.startTime ?? 0;
      const clipDuration = hint?.duration
        ? Math.min(hint.duration, analysis.duration)
        : analysis.duration;
      const trackName =
        hint?.trackName || entry.name || `AAF Track ${index + 1}`;

      return {
        id: createId(),
        name: trackName,
        type: "audio",
        clips: [
          {
            id: createId(),
            name: trackName || `Clip ${index + 1}`,
            startTime,
            duration: clipDuration,
            notes: [],
            audioData: arrayBufferView,
            audioFileName: entry.name,
            audioMimeType: inferAudioMimeType(entry.name, audioData),
            audioOffset: 0,
            sourceDuration: analysis.duration,
            waveformData: analysis.waveformData,
          },
        ],
        volume: 0.8,
        pan: 0,
        muted: false,
        solo: false,
        instrument: {
          type: "sampler",
          parameters: {},
        },
      };
    }),
  );

  const duration = tracks.reduce((maxDuration, track) => {
    return Math.max(
      maxDuration,
      ...track.clips.map((clip) => clip.startTime + clip.duration),
      0,
    );
  }, 0);

  return {
    id: createId(),
    name: getFileNameWithoutExtension(file.name),
    bpm: 120,
    duration: Math.max(16, duration),
    tracks,
    createdAt: Date.now(),
    lastModified: Date.now(),
  };
};
