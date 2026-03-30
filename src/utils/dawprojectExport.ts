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
              `        <AudioClip id="${escapeXml(clip.id)}" name="${escapeXml(clip.name)}" start="${clip.startTime}" duration="${clip.duration}" offset="${clip.audioOffset ?? 0}" sourceDuration="${clip.sourceDuration ?? clip.duration}">`,
              assetPath
                ? `          <Source path="${escapeXml(assetPath)}" />`
                : "",
              "        </AudioClip>",
            ]
              .filter(Boolean)
              .join("\n");
          }

          const notesXml = clip.notes
            .map((note) => {
              return `          <Note id="${escapeXml(note.id)}" pitch="${note.pitch}" start="${note.startTime}" duration="${note.duration}" velocity="${note.velocity}" />`;
            })
            .join("\n");

          return [
            `        <MidiClip id="${escapeXml(clip.id)}" name="${escapeXml(clip.name)}" start="${clip.startTime}" duration="${clip.duration}">`,
            notesXml,
            "        </MidiClip>",
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n");

      return [
        `    <Track id="${escapeXml(track.id)}" name="${escapeXml(track.name)}" contentType="${track.type}">`,
        `      <Channel volume="${track.volume}" pan="${track.pan}" muted="${track.muted}" solo="${track.solo}" />`,
        `      <Device type="${escapeXml(track.instrument.type)}" patchId="${escapeXml(track.instrument.patchId ?? "")}" />`,
        "      <Clips>",
        clipsXml,
        "      </Clips>",
        "    </Track>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<Project version="1.0" application="BrowserDAW" name="${escapeXml(project.name)}">`,
    "  <MetaData>",
    `    <Title>${escapeXml(project.name)}</Title>`,
    "    <Artist>Browser DAW</Artist>",
    "  </MetaData>",
    "  <Transport>",
    `    <Tempo value="${project.bpm}" />`,
    `    <Duration value="${project.duration}" />`,
    "  </Transport>",
    "  <Structure>",
    tracksXml,
    "  </Structure>",
    `  <BrowserDawMeta createdAt="${project.createdAt}" lastModified="${project.lastModified}" />`,
    "</Project>",
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
