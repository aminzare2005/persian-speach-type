import { useCallback, useEffect, useRef, useState } from "react";
import {
  openMicrophoneStream,
  readPreferredMicrophoneId,
} from "@/lib/speech/microphone";
import { resamplePcm, SHENAVA_SAMPLE_RATE } from "@/lib/speech/shenava";

const MAX_RECORDING_MS = 120_000;
const FEEDBACK_MS = 2300;

type RecordingSession = {
  context: AudioContext;
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  output: GainNode;
  chunks: Float32Array[];
  sampleRate: number;
  timer: number;
};

function releaseSession(session: RecordingSession) {
  window.clearTimeout(session.timer);
  session.processor.onaudioprocess = null;
  session.processor.disconnect();
  session.source.disconnect();
  session.output.disconnect();
  for (const track of session.stream.getTracks()) track.stop();
  void session.context.close().catch(() => undefined);
}

function mergeChunks(chunks: Float32Array[]) {
  let length = 0;
  for (const chunk of chunks) length += chunk.length;
  const merged = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

export type DictationPhase =
  | "idle"
  | "recording"
  | "transcribing"
  | "polishing"
  | "feedback"
  | "result"
  | "needs-model";

export function useDictation() {
  const [phase, setPhase] = useState<DictationPhase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [resultText, setResultText] = useState("");
  const [feedback, setFeedback] = useState<{
    type: string;
    message: string;
  } | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const sessionRef = useRef<RecordingSession | null>(null);
  const secondsTimerRef = useRef<number | null>(null);
  const startingRef = useRef(false);
  const feedbackTimerRef = useRef<number | null>(null);

  const clearFeedbackTimer = useCallback(() => {
    if (feedbackTimerRef.current) {
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
  }, []);

  const showHudFeedback = useCallback(
    (type: string, message: string) => {
      clearFeedbackTimer();
      setFeedback({ type, message });
      setPhase("feedback");
      void window.pst.window.setPanel("hud", { focusable: false });
      feedbackTimerRef.current = window.setTimeout(() => {
        feedbackTimerRef.current = null;
        setFeedback(null);
        setPhase("idle");
      }, FEEDBACK_MS);
    },
    [clearFeedbackTimer]
  );

  const ensureModel = useCallback(async () => {
    const status = await window.pst.speech.shenava.getStatus();
    const active = status.models[status.activeModelKey];
    const ready = Boolean(active?.installed);
    setModelReady(ready);
    return ready;
  }, []);

  const stopAndTranscribe = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = null;
    if (secondsTimerRef.current) {
      window.clearInterval(secondsTimerRef.current);
      secondsTimerRef.current = null;
    }
    setSeconds(0);
    releaseSession(session);
    window.pst.dictation.notifyStopped();

    const captured = mergeChunks(session.chunks);
    if (captured.length < session.sampleRate / 5) {
      void window.pst.dictation.notifyFailed("صدای کافی ضبط نشد.");
      return;
    }

    setPhase("transcribing");
    window.pst.dictation.notifyTranscribing();
    void window.pst.window.setPanel("hud", { focusable: false });

    try {
      const samples = resamplePcm(
        captured,
        session.sampleRate,
        SHENAVA_SAMPLE_RATE
      );
      const result = await window.pst.speech.shenava.transcribe(
        samples.slice().buffer as ArrayBuffer
      );
      await window.pst.dictation.submitTranscript(result.text ?? "");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "تبدیل صدا ناموفق بود.";
      await window.pst.dictation.notifyFailed(message);
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (startingRef.current || sessionRef.current) return;
    startingRef.current = true;
    clearFeedbackTimer();
    setFeedback(null);
    try {
      const ready = await ensureModel();
      if (!ready) {
        setPhase("needs-model");
        void window.pst.dictation.notifyNeedsModel();
        return;
      }

      const stream = await openMicrophoneStream(readPreferredMicrophoneId());
      const context = new AudioContext();
      await context.resume();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const output = context.createGain();
      output.gain.value = 0;
      const chunks: Float32Array[] = [];

      processor.onaudioprocess = (event) => {
        chunks.push(event.inputBuffer.getChannelData(0).slice());
      };
      source.connect(processor);
      processor.connect(output);
      output.connect(context.destination);

      const timer = window.setTimeout(() => {
        void stopAndTranscribe();
      }, MAX_RECORDING_MS);

      sessionRef.current = {
        context,
        stream,
        source,
        processor,
        output,
        chunks,
        sampleRate: context.sampleRate,
        timer,
      };

      setPhase("recording");
      setSeconds(0);
      secondsTimerRef.current = window.setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
      window.pst.dictation.notifyStarted();
      void window.pst.window.setPanel("hud", { focusable: false });
    } catch {
      await window.pst.dictation.notifyFailed("دسترسی به میکروفن ممکن نیست.");
    } finally {
      startingRef.current = false;
    }
  }, [clearFeedbackTimer, ensureModel, stopAndTranscribe]);

  const toggleFromUi = useCallback(() => {
    if (phase === "transcribing" || phase === "polishing" || phase === "feedback") {
      return;
    }
    if (phase === "recording") {
      void stopAndTranscribe();
      return;
    }
    if (phase === "idle" || phase === "result" || phase === "needs-model") {
      void startRecording();
    }
  }, [phase, startRecording, stopAndTranscribe]);

  useEffect(() => {
    void ensureModel();
    const offStatus = window.pst.speech.shenava.onStatus((status) => {
      const active = status.models[status.activeModelKey];
      setModelReady(Boolean(active?.installed));
    });
    const offStart = window.pst.dictation.onStart(() => {
      void startRecording();
    });
    const offStop = window.pst.dictation.onStop(() => {
      void stopAndTranscribe();
    });
    const offIdle = window.pst.dictation.onIdle(() => {
      clearFeedbackTimer();
      setFeedback(null);
      setPhase("idle");
      void window.pst.window.hide();
    });
    const offPolishing = window.pst.dictation.onPolishing(() => {
      clearFeedbackTimer();
      setFeedback(null);
      setPhase("polishing");
    });
    const offFeedback = window.pst.dictation.onFeedback((payload) => {
      showHudFeedback(payload.type, payload.message);
    });

    void window.pst.window.hide();

    return () => {
      offStatus();
      offStart();
      offStop();
      offIdle();
      offPolishing();
      offFeedback();
      clearFeedbackTimer();
      if (sessionRef.current) releaseSession(sessionRef.current);
      if (secondsTimerRef.current) window.clearInterval(secondsTimerRef.current);
    };
  }, [
    clearFeedbackTimer,
    ensureModel,
    showHudFeedback,
    startRecording,
    stopAndTranscribe,
  ]);

  const dismissResult = useCallback(() => {
    setResultText("");
    setPhase("idle");
    void window.pst.window.hide();
    void window.pst.window.hidePanel();
  }, []);

  return {
    phase,
    seconds,
    resultText,
    feedback,
    modelReady,
    setPhase,
    toggleFromUi,
    startRecording,
    stopAndTranscribe,
    dismissResult,
    ensureModel,
  };
}
