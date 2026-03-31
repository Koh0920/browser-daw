import { getInstrumentDefinition } from "@/audio/instruments";
import type {
  AudioAssetSource,
  AudioBufferDecoder,
  InstrumentDefinition,
} from "@/audio/instruments/types";
import type { Project } from "@/types";

const sampleArrayBufferCache = new Map<string, Promise<ArrayBuffer | null>>();
const decodedSampleCache = new WeakMap<
  BaseAudioContext,
  Map<string, Promise<AudioBuffer | null>>
>();

export const createFetchAudioAssetSource = (): AudioAssetSource => ({
  getArrayBuffer: async (assetId: string) => {
    const cachedBuffer = sampleArrayBufferCache.get(assetId);
    if (cachedBuffer) {
      return cachedBuffer;
    }

    const loadPromise = fetch(assetId)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch sample ${assetId}: ${response.status}`);
        }

        return response.arrayBuffer();
      })
      .catch((error) => {
        sampleArrayBufferCache.delete(assetId);
        console.error(`Failed to load sample: ${assetId}`, error);
        return null;
      });

    sampleArrayBufferCache.set(assetId, loadPromise);
    return loadPromise;
  },
});

export const createAudioBufferDecoder = (): AudioBufferDecoder => ({
  decode: async (context: BaseAudioContext, audioData: ArrayBuffer) => {
    try {
      return await context.decodeAudioData(audioData.slice(0));
    } catch (error) {
      console.error("Failed to decode sample", error);
      return null;
    }
  },
});

const getContextSampleCache = (context: BaseAudioContext) => {
  const cached = decodedSampleCache.get(context);
  if (cached) {
    return cached;
  }

  const nextCache = new Map<string, Promise<AudioBuffer | null>>();
  decodedSampleCache.set(context, nextCache);
  return nextCache;
};

export const getDecodedAssetBuffer = (
  context: BaseAudioContext,
  assetId: string,
  assetSource: AudioAssetSource,
  decoder: AudioBufferDecoder,
) => {
  const contextCache = getContextSampleCache(context);
  const cachedBuffer = contextCache.get(assetId);
  if (cachedBuffer) {
    return cachedBuffer;
  }

  const decodePromise = assetSource
    .getArrayBuffer(assetId)
    .then((audioData) => {
      if (!audioData) {
        return null;
      }

      return decoder.decode(context, audioData);
    })
    .catch((error) => {
      contextCache.delete(assetId);
      console.error(`Failed to decode asset ${assetId}`, error);
      return null;
    });

  contextCache.set(assetId, decodePromise);
  return decodePromise;
};

export const preloadAudioAssets = async (
  assetIds: Iterable<string>,
  assetSource: AudioAssetSource,
) => {
  await Promise.all(Array.from(assetIds, (assetId) => assetSource.getArrayBuffer(assetId)));
};

export const collectInstrumentSampleUrls = (
  instrumentDefinition: InstrumentDefinition,
  includeLazy = false,
) => {
  if (instrumentDefinition.type !== "sampler" || !instrumentDefinition.zones?.length) {
    return [];
  }

  return instrumentDefinition.zones
    .filter((zone) => includeLazy || zone.preload !== false)
    .map((zone) => zone.url);
};

export const collectProjectInstrumentSampleUrls = (
  project: Project,
  includeLazy = false,
) => {
  const sampleUrls = new Set<string>();

  project.tracks.forEach((track) => {
    if (track.type !== "midi") {
      return;
    }

    const instrumentDefinition = getInstrumentDefinition(track.instrument.patchId);
    collectInstrumentSampleUrls(instrumentDefinition, includeLazy).forEach((url) => {
      sampleUrls.add(url);
    });
  });

  return sampleUrls;
};