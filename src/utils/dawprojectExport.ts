import type { Project } from "@/types";

const textEncoder = new TextEncoder();

const sanitizeFileName = (value: string) => {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-") || "project";
};

const escapeXml = (value: string) => {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

const inferAudioExtension = (fileName?: string, mimeType?: string) => {
  const explicitExtension = fileName?.match(/\.([a-zA-Z0-9]+)$/)?.[1];
  if (explicitExtension) {
    return explicitExtension.toLowerCase();
  }

  if (mimeType === "audio/wav" || mimeType === "audio/x-wav") {
    return "wav";
  }

  if (mimeType === "audio/mpeg") {
    return "mp3";
  }

  if (mimeType === "audio/flac") {
    return "flac";
  }

  if (mimeType === "audio/mp4") {
    return "m4a";
  }

  return "bin";
};

const buildProjectXml = (
  project: Project,
  audioAssetLookup: Map<string, string>,
) => {
  const tracksXml = project.tracks
    .map((track) => {
      const clipsXml = track.clips
        .map((clip) => {
          if (track.type === "audio") {
            const assetPath = audioAssetLookup.get(clip.id) ?? "";

            return [
              `      <audioClip id="${escapeXml(clip.id)}" name="${escapeXml(clip.name)}" start="${clip.startTime}" duration="${clip.duration}" offset="${clip.audioOffset ?? 0}" sourceDuration="${clip.sourceDuration ?? clip.duration}">`,
              assetPath
                ? `        <source path="${escapeXml(assetPath)}" />`
                : "",
              "      </audioClip>",
            ]
              .filter(Boolean)
              .join("\n");
          }

          const notesXml = clip.notes
            .map((note) => {
              return `        <note id="${escapeXml(note.id)}" pitch="${note.pitch}" start="${note.startTime}" duration="${note.duration}" velocity="${note.velocity}" />`;
            })
            .join("\n");

          return [
            `      <midiClip id="${escapeXml(clip.id)}" name="${escapeXml(clip.name)}" start="${clip.startTime}" duration="${clip.duration}">`,
            notesXml,
            "      </midiClip>",
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n");

      return [
        `    <track id="${escapeXml(track.id)}" name="${escapeXml(track.name)}" type="${track.type}" volume="${track.volume}" pan="${track.pan}" muted="${track.muted}" solo="${track.solo}">`,
        `      <instrument type="${escapeXml(track.instrument.type)}" patchId="${escapeXml(track.instrument.patchId ?? "")}" />`,
        clipsXml,
        "    </track>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<browserDawProject name="${escapeXml(project.name)}" format="dawproject-prototype" version="1">`,
    `  <transport bpm="${project.bpm}" duration="${project.duration}" createdAt="${project.createdAt}" lastModified="${project.lastModified}" />`,
    "  <tracks>",
    tracksXml,
    "  </tracks>",
    "</browserDawProject>",
  ].join("\n");
};

const buildProjectManifest = (
  project: Project,
  audioAssetLookup: Map<string, string>,
) => {
  return {
    format: "browser-daw-dawproject-prototype",
    version: 1,
    project: {
      ...project,
      tracks: project.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => ({
          ...clip,
          audioData: undefined,
          waveformData: undefined,
          archiveAssetPath: audioAssetLookup.get(clip.id),
        })),
      })),
    },
  };
};

export const createDawProjectArchive = (project: Project) => {
  const archiveEntries: Record<string, Uint8Array> = {};
  const audioAssetLookup = new Map<string, string>();

  project.tracks.forEach((track) => {
    if (track.type !== "audio") {
      return;
    }

    track.clips.forEach((clip) => {
      if (!clip.audioData) {
        return;
      }

      const trackDirectory = sanitizeFileName(track.name);
      const clipFileName = sanitizeFileName(clip.audioFileName ?? clip.name);
      const extension = inferAudioExtension(
        clip.audioFileName,
        clip.audioMimeType,
      );
      const assetPath = `audio/${trackDirectory}/${clip.id}-${clipFileName}.${extension}`;

      archiveEntries[assetPath] = new Uint8Array(clip.audioData);
      audioAssetLookup.set(clip.id, assetPath);
    });
  });

  const projectXml = buildProjectXml(project, audioAssetLookup);
  const projectManifest = buildProjectManifest(project, audioAssetLookup);

  archiveEntries["project.xml"] = textEncoder.encode(projectXml);
  archiveEntries["metadata.json"] = textEncoder.encode(
    JSON.stringify(projectManifest, null, 2),
  );

  return {
    archiveEntries,
    fileName: `${sanitizeFileName(project.name)}.dawproject`,
  };
};
