import { strFromU8, unzipSync } from "fflate";
import type { MidiClip, MidiNote, Project, ProjectTrack } from "@/types";

type DawprojectArchive = Record<string, Uint8Array>;

const createId = () => crypto.randomUUID();

const toArrayBuffer = (value: Uint8Array) => {
  return value.buffer.slice(
    value.byteOffset,
    value.byteOffset + value.byteLength,
  );
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
    tracks: project.tracks.map((track) => ({
      ...track,
      id: createId(),
      clips: track.clips.map((clip) => {
        const clipId = createId();
        const archiveAssetPath = (
          clip as MidiClip & { archiveAssetPath?: string }
        ).archiveAssetPath;
        const archivedAudioData = archiveAssetPath
          ? getArchiveEntry(archive, archiveAssetPath)
          : undefined;

        return {
          ...clip,
          id: clipId,
          audioAssetPath: undefined,
          audioData: archivedAudioData
            ? toArrayBuffer(archivedAudioData)
            : clip.audioData,
          audioMimeType:
            clip.audioMimeType ??
            (archiveAssetPath ? inferMimeType(archiveAssetPath) : undefined),
          notes: clip.notes.map((note) => ({
            ...note,
            id: createId(),
          })),
        };
      }),
    })),
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
      ).map<MidiClip>((clipElement) => {
        const sourceElement = clipElement.querySelector("Source, source");
        const archiveAssetPath =
          sourceElement?.getAttribute("path") ?? undefined;
        const archivedAudioData = archiveAssetPath
          ? getArchiveEntry(archive, archiveAssetPath)
          : undefined;

        return {
          id: createId(),
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
          notes: clipElement.tagName.toLowerCase().includes("audio")
            ? []
            : parseNotes(clipElement),
        };
      });

      return {
        id: createId(),
        name:
          trackElement.getAttribute("name") ?? `Imported Track ${index + 1}`,
        type: trackType === "audio" ? "audio" : "midi",
        clips,
        volume: getRequiredNumber(channelElement, "volume", 0.8),
        pan: getRequiredNumber(channelElement, "pan", 0),
        muted: getBoolean(channelElement, "muted", false),
        solo: getBoolean(channelElement, "solo", false),
        instrument: {
          type:
            (deviceElement?.getAttribute(
              "type",
            ) as ProjectTrack["instrument"]["type"]) ??
            (trackType === "audio" ? "sampler" : "oscillator"),
          patchId: deviceElement?.getAttribute("patchId") ?? undefined,
          parameters: {},
        },
      };
    }),
    createdAt: Date.now(),
    lastModified: Date.now(),
  };

  return project;
};

export const importDawProjectArchive = async (file: File): Promise<Project> => {
  const arrayBuffer = await file.arrayBuffer();
  const archive = unzipSync(new Uint8Array(arrayBuffer));
  const metadataEntry = getArchiveEntry(archive, "metadata.json");
  const projectXmlEntry = getArchiveEntry(archive, "project.xml");

  if (metadataEntry) {
    try {
      return parseMetadataProject(strFromU8(metadataEntry), archive);
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

  return parseXmlProject(strFromU8(projectXmlEntry), archive);
};
