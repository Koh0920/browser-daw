import {
} from "@/audio/instruments";
import type { RefObject } from "react";
import {
  ensureAudioContextRunning,
  midiNoteToFrequency,
} from "@/audio/engine/shared";
import { planInstrumentVoice } from "@/audio/engine/voicePlanning";
import type { MidiTrack, Project } from "@/types";
import { subscribeLiveMidiCommands } from "@/utils/liveMidiController";
import type { LiveNoteInstance, TrackNodeChain } from "./runtimeTypes";

interface LiveMidiSubscriptionParams {
  audioContextRef: RefObject<AudioContext | null>;
  currentProjectRef: RefObject<Project | null>;
  trackNodesRef: RefObject<Map<string, TrackNodeChain>>;
  liveDesiredNotesRef: RefObject<Set<string>>;
  liveNoteInstancesRef: RefObject<Map<string, LiveNoteInstance>>;
  activeNodesRef: RefObject<Set<AudioScheduledSourceNode>>;
  loadInstrumentSample: (
    context: AudioContext,
    url: string,
  ) => Promise<AudioBuffer | null>;
  stopAllLiveNotes: (trackId?: string) => void;
  stopLiveNote: (liveNoteId: string, when?: number) => void;
}

export const createLiveMidiSubscription = ({
  activeNodesRef,
  audioContextRef,
  currentProjectRef,
  liveDesiredNotesRef,
  liveNoteInstancesRef,
  loadInstrumentSample,
  stopAllLiveNotes,
  stopLiveNote,
  trackNodesRef,
}: LiveMidiSubscriptionParams) => {
  return subscribeLiveMidiCommands((command) => {
    const context = audioContextRef.current;
    const project = currentProjectRef.current;
    if (!context || !project) {
      return;
    }

    if (command.type === "all-notes-off") {
      stopAllLiveNotes(command.trackId);
      return;
    }

    const liveNoteId = `${command.trackId}:${command.noteKey}`;

    if (command.type === "noteoff") {
      stopLiveNote(liveNoteId, context.currentTime);
      return;
    }

    const track = project.tracks.find(
      (candidate) =>
        candidate.id === command.trackId && candidate.type === "midi",
    ) as MidiTrack | undefined;
    const trackChain = trackNodesRef.current.get(command.trackId);
    if (!track || !trackChain) {
      return;
    }

    liveDesiredNotesRef.current.add(liveNoteId);
    stopLiveNote(liveNoteId, context.currentTime);
    liveDesiredNotesRef.current.add(liveNoteId);

    const startLiveNote = async () => {
      const didResume = await ensureAudioContextRunning(context);
      if (!didResume || !liveDesiredNotesRef.current.has(liveNoteId)) {
        return;
      }

      const voicePlan = planInstrumentVoice({
        instrument: track.instrument,
        note: {
          pitch: command.pitch,
          velocity: command.velocity,
          duration: 0,
        },
        mode: "live",
      });
      const startAt = context.currentTime;

      if (voicePlan.zone) {
        const samplerBuffer = await loadInstrumentSample(
          context,
          voicePlan.zone.url,
        );

        if (!samplerBuffer || !liveDesiredNotesRef.current.has(liveNoteId)) {
          return;
        }

        const source = context.createBufferSource();
        const noteGain = context.createGain();
        const attackSeconds = voicePlan.attackSeconds ?? 0.004;
        const decaySeconds = voicePlan.decaySeconds ?? 0.08;
        const releaseSeconds = voicePlan.releaseSeconds ?? 0.32;
        const sustainLevel = voicePlan.sustainLevel ?? 0.72;
        const sustainGain = Math.max(0.001, voicePlan.gain * sustainLevel);
        let isStopped = false;

        source.buffer = samplerBuffer;
        source.playbackRate.value = voicePlan.playbackRate;

        noteGain.gain.setValueAtTime(0.0001, startAt);
        noteGain.gain.linearRampToValueAtTime(voicePlan.gain, startAt + attackSeconds);
        noteGain.gain.linearRampToValueAtTime(
          sustainGain,
          startAt + attackSeconds + decaySeconds,
        );

        source.connect(noteGain);
        noteGain.connect(trackChain.gain);
        source.start(startAt, 0);

        const stop = (when = context.currentTime) => {
          if (isStopped) {
            return;
          }

          isStopped = true;
          const releaseAt = Math.max(when, context.currentTime);
          const finalStopAt = releaseAt + releaseSeconds;
          noteGain.gain.cancelScheduledValues(releaseAt);
          noteGain.gain.setValueAtTime(
            Math.max(noteGain.gain.value, 0.0001),
            releaseAt,
          );
          noteGain.gain.exponentialRampToValueAtTime(0.0001, finalStopAt);
          source.stop(finalStopAt + 0.02);
        };

        const liveInstance: LiveNoteInstance = {
          trackId: track.id,
          source,
          gain: noteGain,
          stop,
        };

        source.onended = () => {
          activeNodesRef.current.delete(source);
          if (liveNoteInstancesRef.current.get(liveNoteId) === liveInstance) {
            liveNoteInstancesRef.current.delete(liveNoteId);
          }
          source.disconnect();
          noteGain.disconnect();
        };

        activeNodesRef.current.add(source);
        liveNoteInstancesRef.current.set(liveNoteId, liveInstance);

        if (voicePlan.oneShot) {
          source.stop(startAt + Math.min(samplerBuffer.duration, 2));
        }
        return;
      }

      const osc = context.createOscillator();
      const noteGain = context.createGain();
      const attackSeconds = voicePlan.attackSeconds ?? 0.01;
      const decaySeconds = voicePlan.decaySeconds ?? 0.04;
      const releaseSeconds = voicePlan.releaseSeconds ?? 0.08;
      const sustainLevel = voicePlan.sustainLevel ?? 0.8;
      const sustainGain = Math.max(0.001, voicePlan.gain * sustainLevel);
      let isStopped = false;

      osc.type = voicePlan.oscillatorType;
      osc.frequency.value = midiNoteToFrequency(command.pitch);

      noteGain.gain.setValueAtTime(0.0001, startAt);
      noteGain.gain.linearRampToValueAtTime(voicePlan.gain, startAt + attackSeconds);
      noteGain.gain.linearRampToValueAtTime(
        sustainGain,
        startAt + attackSeconds + decaySeconds,
      );

      osc.connect(noteGain);
      noteGain.connect(trackChain.gain);
      osc.start(startAt);

      const stop = (when = context.currentTime) => {
        if (isStopped) {
          return;
        }

        isStopped = true;
        const releaseAt = Math.max(when, context.currentTime);
        const finalStopAt = releaseAt + releaseSeconds;
        noteGain.gain.cancelScheduledValues(releaseAt);
        noteGain.gain.setValueAtTime(
          Math.max(noteGain.gain.value, 0.0001),
          releaseAt,
        );
        noteGain.gain.exponentialRampToValueAtTime(0.0001, finalStopAt);
        osc.stop(finalStopAt + 0.02);
      };

      const liveInstance: LiveNoteInstance = {
        trackId: track.id,
        source: osc,
        gain: noteGain,
        stop,
      };

      osc.onended = () => {
        activeNodesRef.current.delete(osc);
        if (liveNoteInstancesRef.current.get(liveNoteId) === liveInstance) {
          liveNoteInstancesRef.current.delete(liveNoteId);
        }
        osc.disconnect();
        noteGain.disconnect();
      };

      activeNodesRef.current.add(osc);
      liveNoteInstancesRef.current.set(liveNoteId, liveInstance);
    };

    void startLiveNote();
  });
};