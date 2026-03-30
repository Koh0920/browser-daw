import type { Project } from "@/types";

const AUDIO_ASSET_ROOT = "audio-assets";

type StorageManagerWithDirectory = StorageManager & {
  getDirectory?: () => Promise<FileSystemDirectoryHandle>;
};

const getStorageManager = () => {
  if (typeof navigator === "undefined") {
    return null;
  }

  return navigator.storage as StorageManagerWithDirectory;
};

export const isOpfsAvailable = () => {
  const storageManager = getStorageManager();
  return typeof storageManager?.getDirectory === "function";
};

const getRootDirectory = async () => {
  const storageManager = getStorageManager();
  if (!storageManager?.getDirectory) {
    return null;
  }

  return storageManager.getDirectory();
};

const sanitizeFileName = (fileName: string) => {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, "-");
};

const getDirectoryHandle = async (segments: string[], create: boolean) => {
  const root = await getRootDirectory();
  if (!root) {
    return null;
  }

  let currentDirectory = await root.getDirectoryHandle(AUDIO_ASSET_ROOT, {
    create,
  });
  for (const segment of segments) {
    currentDirectory = await currentDirectory.getDirectoryHandle(segment, {
      create,
    });
  }

  return currentDirectory;
};

export const writeAudioAsset = async (
  projectId: string,
  clipId: string,
  fileName: string,
  audioData: ArrayBuffer,
) => {
  const projectDirectory = await getDirectoryHandle([projectId], true);
  if (!projectDirectory) {
    return null;
  }

  const assetFileName = `${clipId}-${sanitizeFileName(fileName || "clip.bin")}`;
  const fileHandle = await projectDirectory.getFileHandle(assetFileName, {
    create: true,
  });
  const writable = await fileHandle.createWritable();

  await writable.write(audioData);
  await writable.close();

  return `${projectId}/${assetFileName}`;
};

export const readAudioAsset = async (assetPath: string) => {
  const root = await getRootDirectory();
  if (!root) {
    return null;
  }

  const [projectId, fileName] = assetPath.split("/");
  if (!projectId || !fileName) {
    return null;
  }

  try {
    const projectDirectory = await root.getDirectoryHandle(AUDIO_ASSET_ROOT);
    const projectHandle = await projectDirectory.getDirectoryHandle(projectId);
    const fileHandle = await projectHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return file.arrayBuffer();
  } catch (error) {
    console.error("Error reading audio asset from OPFS:", error);
    return null;
  }
};

export const deleteProjectAudioAssets = async (projectId: string) => {
  const root = await getRootDirectory();
  if (!root) {
    return;
  }

  try {
    const projectDirectory = await root.getDirectoryHandle(AUDIO_ASSET_ROOT);
    await projectDirectory.removeEntry(projectId, { recursive: true });
  } catch (error) {
    console.error("Error deleting OPFS audio assets:", error);
  }
};

export const prepareProjectForStorage = async (
  project: Project,
): Promise<Project> => {
  if (!isOpfsAvailable()) {
    return {
      ...project,
      lastModified: Date.now(),
    };
  }

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

          const assetPath =
            clip.audioAssetPath ??
            (await writeAudioAsset(
              project.id,
              clip.id,
              clip.audioFileName ?? clip.name,
              clip.audioData,
            ));

          return {
            ...clip,
            audioAssetPath: assetPath ?? clip.audioAssetPath,
            audioData: undefined,
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
    lastModified: Date.now(),
  };
};

export const hydrateProjectAudioAssets = async (
  project: Project,
): Promise<Project> => {
  if (!isOpfsAvailable()) {
    return project;
  }

  const tracks = await Promise.all(
    project.tracks.map(async (track) => {
      if (track.type !== "audio") {
        return track;
      }

      const clips = await Promise.all(
        track.clips.map(async (clip) => {
          if (clip.audioData || !clip.audioAssetPath) {
            return clip;
          }

          const audioData = await readAudioAsset(clip.audioAssetPath);
          return {
            ...clip,
            audioData: audioData ?? undefined,
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
  };
};
