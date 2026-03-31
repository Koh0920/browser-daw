import type {
  AafImportDebugHint,
  AafImportRateInfo,
  Project,
  ProjectTrack,
} from "@/types";
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

const isLikelyMetadataOnlyEntry = (entry: AafEntry) => {
  if (!entry.content) {
    return true;
  }

  if (entry.size < MIN_AUDIO_PROBE_BYTES) {
    return true;
  }

  const normalizedPath = normalizeName(entry.path);
  return [
    "properties",
    "property",
    "dictionary",
    "header",
    "preface",
    "contentstorage",
    "identification",
    "locator",
    "descriptor",
    "mobs",
    "mob",
    "slot",
    "index",
  ].some((token) => normalizedPath.includes(token));
};

const getFallbackAudioCandidates = (entries: AafEntry[]) => {
  return entries
    .filter(
      (entry) =>
        entry.content && !isProbablyAudioEssence(entry.name, entry.content),
    )
    .filter((entry) => !isLikelyMetadataOnlyEntry(entry))
    .sort((left, right) => {
      const leftEssenceBoost = Number(
        normalizeName(left.path).includes("essence"),
      );
      const rightEssenceBoost = Number(
        normalizeName(right.path).includes("essence"),
      );

      if (rightEssenceBoost !== leftEssenceBoost) {
        return rightEssenceBoost - leftEssenceBoost;
      }

      return right.size - left.size;
    });
};

const toArrayBuffer = (content: Uint8Array) => {
  return content.slice().buffer as ArrayBuffer;
};

const probeDecodableAudioEntries = async (entries: AafEntry[]) => {
  const decodedEntries: DecodedAafAudioEntry[] = [];
  const failedPaths: string[] = [];

  for (const entry of entries) {
    if (!entry.content) {
      continue;
    }

    try {
      const analysis = await analyzeAudioData(toArrayBuffer(entry.content));
      decodedEntries.push({ entry, analysis });
    } catch {
      failedPaths.push(entry.path);
    }
  }

  return {
    decodedEntries,
    failedPaths,
  };
};

const getPathFileName = (value: string) => {
  const segments = value.split(/[\\/]+/).filter(Boolean);
  return (segments[segments.length - 1] ?? value).toLowerCase();
};

const collectExternalMediaReferences = (entries: AafEntry[]) => {
  const references = new Set<string>();

  entries.forEach((entry) => {
    if (!entry.content || isProbablyAudioEssence(entry.name, entry.content)) {
      return;
    }

    const utf16Strings = extractStringRuns(decodeUtf16Le(entry.content));
    const latinStrings = extractStringRuns(decodeLatin1(entry.content));
    const strings = Array.from(new Set([...utf16Strings, ...latinStrings]));

    strings.forEach((value) => {
      const matches = value.matchAll(EXTERNAL_AUDIO_REFERENCE_PATTERN);
      for (const match of matches) {
        const candidate = match[1]?.trim();
        if (candidate) {
          references.add(candidate);
        }
      }
    });
  });

  return Array.from(references);
};

const isSupportedCompanionAudioFile = (file: File) => {
  return (
    file.type.startsWith("audio/") ||
    /\.(wav|aif|aiff|caf|flac|mp3|m4a|aac)$/i.test(file.name)
  );
};

const getCompanionFilePath = (file: File) => {
  const relativePath =
    "webkitRelativePath" in file ? file.webkitRelativePath : "";
  return relativePath || file.name;
};

const probeCompanionAudioFiles = async (files: File[]) => {
  const decodedEntries: DecodedCompanionAudioEntry[] = [];

  for (const file of files) {
    if (!isSupportedCompanionAudioFile(file)) {
      continue;
    }

    try {
      const audioData = await file.arrayBuffer();
      const analysis = await analyzeAudioData(audioData.slice(0));
      const path = getCompanionFilePath(file);

      decodedEntries.push({
        entry: {
          name: file.name,
          path,
          size: file.size,
          pathTokens: tokenizePath(path),
        },
        analysis,
        audioData,
        audioFileName: file.name,
        audioMimeType: file.type || inferAudioMimeType(file.name),
      });
    } catch {
      continue;
    }
  }

  return decodedEntries;
};

const matchCompanionEntriesToReferences = (
  entries: DecodedCompanionAudioEntry[],
  references: string[],
) => {
  if (references.length === 0) {
    return entries;
  }

  const referenceNames = new Set(
    references.map((reference) => getPathFileName(reference)),
  );
  const matchedEntries = entries.filter((entry) => {
    const fileName = getPathFileName(entry.audioFileName);
    const entryPathName = getPathFileName(entry.entry.path);
    return referenceNames.has(fileName) || referenceNames.has(entryPathName);
  });

  return matchedEntries.length > 0 ? matchedEntries : entries;
};

type CfbEntry = {
  name?: string;
  content?: Uint8Array | number[];
  size?: number;
  storage?: string;
};

type RateKind = "edit-rate" | "sample-rate";

interface AafEntry {
  name: string;
  path: string;
  content?: Uint8Array;
  size: number;
  storage?: string;
  pathTokens: string[];
}

interface AafRateCandidate {
  entryPath: string;
  kind: RateKind;
  value: number;
  label: string;
  pathTokens: string[];
}

interface AafMetadataHint {
  entryName: string;
  entryPath: string;
  trackName?: string;
  startRawValue?: number;
  startLabel?: string;
  durationRawValue?: number;
  durationLabel?: string;
  slotId?: number;
  pathTokens: string[];
  rate?: number;
  rateKind?: RateKind;
}

interface DecodedAafAudioEntry {
  entry: AafEntry;
  analysis: Awaited<ReturnType<typeof analyzeAudioData>>;
}

interface DecodedCompanionAudioEntry {
  entry: AafEntry;
  analysis: Awaited<ReturnType<typeof analyzeAudioData>>;
  audioData: ArrayBuffer;
  audioFileName: string;
  audioMimeType?: string;
}

const MIN_AUDIO_PROBE_BYTES = 4096;
const EXTERNAL_AUDIO_REFERENCE_PATTERN =
  /([A-Za-z0-9 _./\\:-]+\.(?:wav|aif|aiff|caf|flac|mp3|m4a|aac))/gi;

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

const tokenizePath = (value: string) => {
  return Array.from(
    new Set(
      value
        .split(/[\\/]+/)
        .flatMap((segment) => normalizeName(segment).split(" "))
        .filter(Boolean),
    ),
  );
};

const getParentPath = (value: string) => {
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/, "");
  const boundary = normalized.lastIndexOf("/");
  return boundary >= 0 ? normalized.slice(0, boundary) : "";
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

const parseNumericValue = (rawValue?: string) => {
  if (!rawValue) {
    return undefined;
  }

  const numericValue = Number(rawValue);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return undefined;
  }

  return numericValue;
};

const parseRateValue = (rawValue?: string) => {
  if (!rawValue) {
    return undefined;
  }

  const normalized = rawValue.replace(/\s+/g, "");
  if (normalized.includes("/")) {
    const [numeratorRaw, denominatorRaw] = normalized.split("/");
    const numerator = Number(numeratorRaw);
    const denominator = Number(denominatorRaw);
    if (
      !Number.isFinite(numerator) ||
      !Number.isFinite(denominator) ||
      denominator === 0
    ) {
      return undefined;
    }

    return numerator / denominator;
  }

  return parseNumericValue(normalized);
};

const inferRateKind = (label: string, value: number): RateKind => {
  const normalizedLabel = label.toLowerCase();
  if (
    normalizedLabel.includes("sample") ||
    normalizedLabel.includes("sampling") ||
    normalizedLabel.includes("audio")
  ) {
    return "sample-rate";
  }

  if (
    normalizedLabel.includes("edit") ||
    normalizedLabel.includes("frame") ||
    normalizedLabel.includes("timecode")
  ) {
    return "edit-rate";
  }

  return value > 1000 ? "sample-rate" : "edit-rate";
};

const collectRateCandidates = (entry: AafEntry, strings: string[]) => {
  const combined = strings.join(" | ");
  const matches = Array.from(
    combined.matchAll(
      /((?:edit\s*rate|editrate|sample\s*rate|sampling\s*rate|audio\s*rate|frame\s*rate|timecode\s*rate|rate))[:=\s]+(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?)/gi,
    ),
  );

  return matches
    .map((match) => {
      const label = match[1]?.trim() ?? "rate";
      const value = parseRateValue(match[2]);
      if (!value || value <= 0) {
        return null;
      }

      return {
        entryPath: entry.path,
        kind: inferRateKind(label, value),
        value,
        label,
        pathTokens: entry.pathTokens,
      } satisfies AafRateCandidate;
    })
    .filter((candidate): candidate is AafRateCandidate => candidate !== null);
};

const parseHintFromText = (
  entry: AafEntry,
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
    /(start\s*time|start|origin|position|timecode)[:=\s]+(\d+(?:\.\d+)?)/i,
  );
  const durationMatch = combined.match(
    /(duration|length)[:=\s]+(\d+(?:\.\d+)?)/i,
  );

  const normalizedEntryName = normalizeName(entry.name);
  const fallbackTrackName =
    normalizedEntryName && normalizedEntryName !== "root entry"
      ? entry.name
          .replace(/[_-]+/g, " ")
          .replace(/\.[^.]+$/, "")
          .trim()
      : undefined;

  const trackName = trackNameMatch?.[1]?.trim() || fallbackTrackName;
  const startRawValue = parseNumericValue(startMatch?.[2]);
  const durationRawValue = parseNumericValue(durationMatch?.[2]);
  const slotId = slotIdMatch ? Number(slotIdMatch[1]) : undefined;

  if (
    !trackName &&
    startRawValue === undefined &&
    durationRawValue === undefined &&
    slotId === undefined
  ) {
    return null;
  }

  return {
    entryName: entry.name,
    entryPath: entry.path,
    trackName,
    startRawValue,
    startLabel: startMatch?.[1]?.toLowerCase(),
    durationRawValue,
    durationLabel: durationMatch?.[1]?.toLowerCase(),
    slotId,
    pathTokens: entry.pathTokens,
  };
};

const collectMetadataHints = (entries: AafEntry[]) => {
  const hints: AafMetadataHint[] = [];
  const rateCandidates: AafRateCandidate[] = [];

  entries.forEach((entry) => {
    if (!entry.content || isProbablyAudioEssence(entry.name, entry.content)) {
      return;
    }

    const utf16Strings = extractStringRuns(decodeUtf16Le(entry.content));
    const latinStrings = extractStringRuns(decodeLatin1(entry.content));
    const strings = Array.from(new Set([...utf16Strings, ...latinStrings]));

    rateCandidates.push(...collectRateCandidates(entry, strings));

    const hint = parseHintFromText(entry, strings);
    if (hint) {
      hints.push(hint);
    }
  });

  return {
    hints,
    rateCandidates,
  };
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

const getPathOverlapScore = (left: string[], right: string[]) => {
  const rightSet = new Set(right);
  return left.reduce(
    (score, token) => score + (rightSet.has(token) ? 1 : 0),
    0,
  );
};

const findNearestRateCandidate = (
  hint: AafMetadataHint,
  rateCandidates: AafRateCandidate[],
) => {
  return rateCandidates
    .map((candidate) => {
      const sameParent =
        getParentPath(candidate.entryPath) === getParentPath(hint.entryPath);
      const pathScore = getPathOverlapScore(
        candidate.pathTokens,
        hint.pathTokens,
      );
      return {
        candidate,
        score: pathScore + (sameParent ? 4 : 0),
      };
    })
    .sort((left, right) => right.score - left.score)[0]?.candidate;
};

const enrichHintsWithRates = (
  hints: AafMetadataHint[],
  rateCandidates: AafRateCandidate[],
) => {
  return hints.map((hint) => {
    const nearestRate = findNearestRateCandidate(hint, rateCandidates);
    if (!nearestRate) {
      return hint;
    }

    return {
      ...hint,
      rate: nearestRate.value,
      rateKind: nearestRate.kind,
    };
  });
};

const findBestHint = (
  audioEntry: AafEntry,
  hints: AafMetadataHint[],
  index: number,
) => {
  const rankedHints = hints
    .map((hint, hintIndex) => {
      const nameScore = Math.max(
        getSimilarityScore(audioEntry.name, hint.trackName ?? ""),
        getSimilarityScore(audioEntry.name, hint.entryName),
      );
      const pathScore = getPathOverlapScore(
        audioEntry.pathTokens,
        hint.pathTokens,
      );
      const sameParent =
        getParentPath(audioEntry.path) === getParentPath(hint.entryPath);

      return {
        hint,
        hintIndex,
        sameParent,
        score: nameScore * 4 + pathScore + (sameParent ? 4 : 0),
        matchedBy: [
          sameParent ? "shared-parent" : null,
          pathScore > 0 ? "path" : null,
          nameScore > 0 ? "name" : null,
        ]
          .filter(Boolean)
          .join(" + "),
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (right.sameParent !== left.sameParent) {
        return Number(right.sameParent) - Number(left.sameParent);
      }

      return (
        Math.abs(left.hintIndex - index) - Math.abs(right.hintIndex - index)
      );
    });

  const bestMatch = rankedHints[0];
  if (!bestMatch) {
    return {
      hint: undefined,
      matchedBy: "none",
    };
  }

  if (bestMatch.score > 0) {
    return {
      hint: bestMatch.hint,
      matchedBy:
        bestMatch.matchedBy ||
        (bestMatch.sameParent ? "shared-parent" : "name"),
    };
  }

  return {
    hint: hints[index],
    matchedBy: "sequential-fallback",
  };
};

const resolveTimingValue = (
  rawValue: number | undefined,
  label: string | undefined,
  rate: number | undefined,
  analysisDuration: number,
  isDuration: boolean,
) => {
  if (rawValue === undefined) {
    return undefined;
  }

  const normalizedLabel = label?.toLowerCase() ?? "";
  const prefersUnits =
    normalizedLabel.includes("origin") ||
    normalizedLabel.includes("position") ||
    normalizedLabel.includes("timecode") ||
    normalizedLabel.includes("frame") ||
    normalizedLabel.includes("sample") ||
    normalizedLabel.includes("edit");

  if (rate && rate > 0) {
    const rateConverted = rawValue / rate;
    const durationThreshold = Math.max(analysisDuration * 1.25, 16);
    if (
      prefersUnits ||
      rawValue > 60 * 60 * 12 ||
      (isDuration && rawValue > durationThreshold)
    ) {
      return rateConverted;
    }
  }

  if (rawValue <= 60 * 60 * 12) {
    return rawValue;
  }

  if (rate && rate > 0) {
    return rawValue / rate;
  }

  return undefined;
};

const toDebugRateInfo = (
  rateCandidates: AafRateCandidate[],
): AafImportRateInfo[] => {
  const uniqueCandidates = new Map<string, AafRateCandidate>();

  rateCandidates.forEach((candidate) => {
    uniqueCandidates.set(
      `${candidate.entryPath}:${candidate.kind}:${candidate.value}`,
      candidate,
    );
  });

  return Array.from(uniqueCandidates.values()).map((candidate) => ({
    entryPath: candidate.entryPath,
    kind: candidate.kind,
    value: candidate.value,
    label: candidate.label,
  }));
};

const toDebugHintInfo = (
  hint: AafMetadataHint,
  matchedAudioEntryName: string,
  matchedBy: string,
  startTime: number,
  duration: number,
): AafImportDebugHint => {
  return {
    entryPath: hint.entryPath,
    trackName: hint.trackName,
    slotId: hint.slotId,
    matchedAudioEntryName,
    matchedBy,
    startRawValue: hint.startRawValue,
    startUnit: hint.startLabel,
    startTime,
    durationRawValue: hint.durationRawValue,
    durationUnit: hint.durationLabel,
    duration,
    rate: hint.rate,
    rateKind: hint.rateKind,
  };
};

export const importAafFile = async (
  file: File,
  companionFiles: File[] = [],
): Promise<Project> => {
  const cfbModule = await import("cfb");
  const arrayBuffer = await file.arrayBuffer();
  const container = (
    cfbModule.read as unknown as (
      data: Uint8Array,
      opts: { type: string },
    ) => { FileIndex?: CfbEntry[]; FullPaths?: string[] }
  )(new Uint8Array(arrayBuffer), { type: "buffer" });
  const fileIndex = container.FileIndex ?? [];
  const fullPaths = container.FullPaths ?? [];

  const allEntries = fileIndex.map((entry, index) => {
    const path = fullPaths[index] ?? entry.name ?? "essence";

    return {
      name: entry.name ?? "essence",
      path,
      content: toUint8Array(entry.content),
      size: entry.size ?? 0,
      storage: entry.storage,
      pathTokens: tokenizePath(path),
    } satisfies AafEntry;
  });

  const detectedAudioEntries = allEntries.filter((entry) =>
    isProbablyAudioEssence(entry.name, entry.content),
  );

  const { hints: rawMetadataHints, rateCandidates } =
    collectMetadataHints(allEntries);
  const metadataHints = enrichHintsWithRates(rawMetadataHints, rateCandidates);
  const externalMediaReferences = collectExternalMediaReferences(allEntries);

  const fallbackCandidates =
    detectedAudioEntries.length === 0
      ? getFallbackAudioCandidates(allEntries)
      : [];

  const { decodedEntries, failedPaths } = await probeDecodableAudioEntries(
    detectedAudioEntries.length > 0 ? detectedAudioEntries : fallbackCandidates,
  );

  const companionDecodedEntries =
    decodedEntries.length === 0 && companionFiles.length > 0
      ? matchCompanionEntriesToReferences(
          await probeCompanionAudioFiles(companionFiles),
          externalMediaReferences,
        )
      : [];

  if (decodedEntries.length === 0 && companionDecodedEntries.length === 0) {
    const attemptedCount =
      detectedAudioEntries.length > 0
        ? detectedAudioEntries.length
        : fallbackCandidates.length;
    const samplePaths = failedPaths.slice(0, 3).join(", ");

    throw new Error(
      companionFiles.length > 0
        ? "AAF import found no embedded essence and could not match any companion audio files. Select the exported AAF together with its audio files or the whole export folder."
        : attemptedCount > 0
          ? `AAF import could not decode any embedded audio essence. Attempted ${attemptedCount} stream${attemptedCount === 1 ? "" : "s"}${samplePaths ? ` (${samplePaths})` : ""}.`
          : "AAF import found no embedded essence. Logic Pro often exports external media, so import the AAF together with its audio files or select the entire export folder.",
    );
  }

  const debugHints: AafImportDebugHint[] = [];

  const resolvedAudioEntries =
    decodedEntries.length > 0
      ? decodedEntries.map(({ entry, analysis }) => ({
          entry,
          analysis,
          audioData: toArrayBuffer(entry.content!),
          audioFileName: entry.name,
          audioMimeType: inferAudioMimeType(entry.name, entry.content),
        }))
      : companionDecodedEntries;

  const tracks: ProjectTrack[] = await Promise.all(
    resolvedAudioEntries.map(
      async (
        { entry, analysis, audioData, audioFileName, audioMimeType },
        index,
      ) => {
        const arrayBufferView = audioData;
        const { hint, matchedBy } = findBestHint(entry, metadataHints, index);
        const startTime = Math.max(
          0,
          resolveTimingValue(
            hint?.startRawValue,
            hint?.startLabel,
            hint?.rate,
            analysis.duration,
            false,
          ) ?? 0,
        );
        const resolvedDuration =
          resolveTimingValue(
            hint?.durationRawValue,
            hint?.durationLabel,
            hint?.rate,
            analysis.duration,
            true,
          ) ?? analysis.duration;
        const clipDuration = Math.max(
          0.01,
          Math.min(resolvedDuration, analysis.duration),
        );
        const trackName =
          hint?.trackName || entry.name || `AAF Track ${index + 1}`;

        if (hint) {
          debugHints.push(
            toDebugHintInfo(
              hint,
              entry.name,
              matchedBy,
              startTime,
              clipDuration,
            ),
          );
        }

        return {
          id: createId(),
          name: trackName,
          type: "audio",
          clips: [
            {
              id: createId(),
              clipType: "audio",
              name: trackName || `Clip ${index + 1}`,
              startTime,
              duration: clipDuration,
              audioData: arrayBufferView,
              audioFileName,
              audioMimeType,
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
      },
    ),
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
    importMetadata: {
      sourceFormat: "aaf",
      importedAt: Date.now(),
      summary: `${tracks.length} audio track${tracks.length === 1 ? "" : "s"} imported from AAF${decodedEntries.length === 0 && companionDecodedEntries.length > 0 ? " with external media" : detectedAudioEntries.length === 0 ? " via fallback probing" : ""}`,
      aafRates: toDebugRateInfo(rateCandidates),
      aafHints: debugHints,
    },
  };
};
