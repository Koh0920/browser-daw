import type {
  AudioClip,
  AudioTrack,
  MidiClip,
  MidiNote,
  MidiTrack,
  Project,
  ProjectTrack,
} from "@/types";
import { analyzeAudioData } from "@/utils/audioAnalysis";
import { createId } from "@/utils/id";

type DawprojectArchive = Record<string, Uint8Array>;

const toArrayBuffer = (value: Uint8Array) => {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
};

const inferMimeType = (filePath: string) => {
  const extension = filePath.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "wav":
      return "audio/wav";
    case "mp3":
      return "audio/mpeg";
    case "flac":
      return "audio/flac";
    case "m4a":
      return "audio/mp4";
    case "ogg":
      return "audio/ogg";
    default:
      return undefined;
  }
};

const getArchiveEntry = (archive: DawprojectArchive, path?: string | null) => {
  if (!path) {
    return undefined;
  }

  return archive[path] ?? archive[path.replace(/^\.\//, "")];
};

const normalizeProject = (
  project: Project,
  archive: DawprojectArchive,
): Project => {
  const normalizedProjectId = createId();

  return {
    ...project,
    id: normalizedProjectId,
    createdAt: Date.now(),
    lastModified: Date.now(),
    tracks: project.tracks.map((track) => {
      if (track.type === "audio") {
        const clips: AudioClip[] = track.clips.map((clip) => {
          const clipId = createId();
          const archiveAssetPath = (clip as AudioClip & { archiveAssetPath?: string }).archiveAssetPath;
          const archivedAudioData = archiveAssetPath
            ? getArchiveEntry(archive, archiveAssetPath)
            : undefined;

          return {
            ...clip,
            clipType: "audio",
            id: clipId,
            audioAssetPath: undefined,
            audioData: archivedAudioData
              ? toArrayBuffer(archivedAudioData)
              : clip.audioData,
            audioMimeType:
              clip.audioMimeType ??
              (archiveAssetPath ? inferMimeType(archiveAssetPath) : undefined),
          };
        });

        return {
          ...track,
          id: createId(),
          clips,
        };
      }

      const clips: MidiClip[] = track.clips.map((clip) => ({
        ...clip,
        clipType: "midi",
        id: createId(),
        notes: clip.notes.map((note) => ({
          ...note,
          id: createId(),
        })),
      }));

      return {
        ...track,
        id: createId(),
        clips,
      };
    }),
  };
};

const hydrateImportedProjectWaveforms = async (project: Project) => {
  const tracks = await Promise.all(
    project.tracks.map(async (track) => {
      if (track.type !== "audio") {
        return track;
      }

      const clips = await Promise.all(
        track.clips.map(async (clip) => {
          if (!clip.audioData) {
            return clip;
          }

          const analysis = await analyzeAudioData(clip.audioData);
          return {
            ...clip,
            duration: clip.duration > 0 ? clip.duration : analysis.duration,
            sourceDuration: clip.sourceDuration ?? analysis.duration,
            waveformData: analysis.waveformData,
          };
        }),
      );

      return {
        ...track,
        clips,
      };
    }),
  );

  return {
    ...project,
    tracks,
    duration: Math.max(
      project.duration,
      ...tracks.flatMap((track) =>
        track.clips.map((clip) => clip.startTime + clip.duration),
      ),
      0,
    ),
  };
};

const parseMetadataProject = (
  metadataText: string,
  archive: DawprojectArchive,
) => {
  const parsed = JSON.parse(metadataText) as { project?: Project };
  if (!parsed.project) {
    throw new Error("metadata.json did not contain a project payload");
  }

  return normalizeProject(parsed.project, archive);
};

const getRequiredNumber = (
  element: Element,
  attributeName: string,
  fallback = 0,
) => {
  const value = element.getAttribute(attributeName);
  if (value === null) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getBoolean = (
  element: Element,
  attributeName: string,
  fallback = false,
) => {
  const value = element.getAttribute(attributeName);
  if (value === null) {
    return fallback;
  }

  return value === "true" || value === "1";
};

const parseNotes = (clipElement: Element) => {
  return Array.from(clipElement.querySelectorAll("note, Note")).map<MidiNote>(
    (noteElement) => ({
      id: createId(),
      pitch: getRequiredNumber(noteElement, "pitch", 60),
      startTime: getRequiredNumber(noteElement, "start", 0),
      duration: getRequiredNumber(noteElement, "duration", 0.25),
      velocity: getRequiredNumber(noteElement, "velocity", 96),
    }),
  );
};

const parseXmlProject = (
  xmlText: string,
  archive: DawprojectArchive,
): Project => {
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(xmlText, "application/xml");
  const parserError = documentNode.querySelector("parsererror");

  if (parserError) {
    throw new Error("project.xml could not be parsed");
  }

  const root = documentNode.querySelector("Project, browserDawProject");
  if (!root) {
    throw new Error("project.xml did not contain a supported root element");
  }

  const transportElement = documentNode.querySelector("Transport, transport");
  const tempoElement =
    documentNode.querySelector("Tempo") ??
    transportElement?.querySelector("Tempo");
  const durationElement =
    documentNode.querySelector("Duration") ??
    transportElement?.querySelector("Duration");
  const tracks = Array.from(documentNode.querySelectorAll("Track, track"));

  const project: Project = {
    id: createId(),
    name:
      root.getAttribute("name") ??
      root.querySelector("Title")?.textContent?.trim() ??
      "Imported Project",
    bpm: tempoElement
      ? getRequiredNumber(tempoElement, "value", 120)
      : getRequiredNumber(transportElement ?? root, "bpm", 120),
    duration: durationElement
      ? getRequiredNumber(durationElement, "value", 16)
      : getRequiredNumber(transportElement ?? root, "duration", 16),
    tracks: tracks.map<ProjectTrack>((trackElement, index) => {
      const trackType =
        trackElement.getAttribute("type") ??
        trackElement.getAttribute("contentType") ??
        "midi";
      const channelElement =
        trackElement.querySelector("Channel") ?? trackElement;
      const deviceElement =
        trackElement.querySelector("Device, instrument") ??
        trackElement.querySelector("instrument");

      const clips = Array.from(
        trackElement.querySelectorAll(
          "AudioClip, audioClip, MidiClip, midiClip",
        ),
      ).map((clipElement) => {
        const sourceElement = clipElement.querySelector("Source, source");
        const archiveAssetPath =
          sourceElement?.getAttribute("path") ?? undefined;
        const archivedAudioData = archiveAssetPath
          ? getArchiveEntry(archive, archiveAssetPath)
          : undefined;

        if (clipElement.tagName.toLowerCase().includes("audio")) {
          const clip: AudioClip = {
            id: createId(),
            clipType: "audio",
            name: clipElement.getAttribute("name") ?? `${trackType} clip`,
            startTime: getRequiredNumber(clipElement, "start", 0),
            duration: getRequiredNumber(clipElement, "duration", 1),
            audioOffset: getRequiredNumber(clipElement, "offset", 0),
            sourceDuration: getRequiredNumber(
              clipElement,
              "sourceDuration",
              getRequiredNumber(clipElement, "duration", 1),
            ),
            audioData: archivedAudioData
              ? toArrayBuffer(archivedAudioData)
              : undefined,
            audioFileName: archiveAssetPath?.split("/").pop(),
            audioMimeType: archiveAssetPath
              ? inferMimeType(archiveAssetPath)
              : undefined,
          };

          return clip;
        }

        const clip: MidiClip = {
          id: createId(),
          clipType: "midi",
          name: clipElement.getAttribute("name") ?? `${trackType} clip`,
          startTime: getRequiredNumber(clipElement, "start", 0),
          duration: getRequiredNumber(clipElement, "duration", 1),
          notes: parseNotes(clipElement),
        };

        return clip;
      });

      if (trackType === "audio") {
        const audioTrack: AudioTrack = {
          id: createId(),
          name:
            trackElement.getAttribute("name") ?? `Imported Track ${index + 1}`,
          type: "audio",
          clips: clips as AudioClip[],
          volume: getRequiredNumber(channelElement, "volume", 0.8),
          pan: getRequiredNumber(channelElement, "pan", 0),
          muted: getBoolean(channelElement, "muted", false),
          solo: getBoolean(channelElement, "solo", false),
          instrument: {
            type:
              (deviceElement?.getAttribute(
                "type",
              ) as ProjectTrack["instrument"]["type"]) ?? "sampler",
            patchId: deviceElement?.getAttribute("patchId") ?? undefined,
            parameters: {},
          },
        };

        return audioTrack;
      }

      const midiTrack: MidiTrack = {
        id: createId(),
        name:
          trackElement.getAttribute("name") ?? `Imported Track ${index + 1}`,
        type: "midi",
        clips: clips as MidiClip[],
        volume: getRequiredNumber(channelElement, "volume", 0.8),
        pan: getRequiredNumber(channelElement, "pan", 0),
        muted: getBoolean(channelElement, "muted", false),
        solo: getBoolean(channelElement, "solo", false),
        instrument: {
          type:
            (deviceElement?.getAttribute(
              "type",
            ) as ProjectTrack["instrument"]["type"]) ??
            "oscillator",
          patchId: deviceElement?.getAttribute("patchId") ?? undefined,
          parameters: {},
        },
      };

      return midiTrack;
    }),
    createdAt: Date.now(),
    lastModified: Date.now(),
  };

  return project;
};

export const importDawProjectArchive = async (file: File): Promise<Project> => {
  const { strFromU8, unzipSync } = await import("fflate");
  const arrayBuffer = await file.arrayBuffer();
  const archive = unzipSync(new Uint8Array(arrayBuffer));
  const metadataEntry = getArchiveEntry(archive, "metadata.json");
  const projectXmlEntry = getArchiveEntry(archive, "project.xml");

  if (metadataEntry) {
    try {
      const project = parseMetadataProject(strFromU8(metadataEntry), archive);
      return hydrateImportedProjectWaveforms(project);
    } catch (error) {
      console.warn(
        "Falling back to XML import after metadata parse failure",
        error,
      );
    }
  }

  if (!projectXmlEntry) {
    throw new Error("Archive did not contain metadata.json or project.xml");
  }

  const project = parseXmlProject(strFromU8(projectXmlEntry), archive);
  return hydrateImportedProjectWaveforms(project);
};
