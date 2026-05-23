import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  LanguageOption,
  ScreenshotItem,
  Speaker,
  SpeakerInference,
  TranscriptSegment,
  VolumeSample,
  VolumeThresholds,
} from "./types";
import {
  createMixedAudioStream,
  requestDisplayMedia,
  requestMicrophoneMedia,
  stopMediaStream,
  type MixedAudioGraph,
} from "./lib/audio";
import { downloadBlob, downloadText, generateMeetingMarkdown, generateTranscriptTxt } from "./lib/export";
import { exportMeetingZip } from "./lib/zip";
import { captureScreenshotFromDisplayStream } from "./lib/screenshot";
import { inferSpeaker, inferSpeakerFromSamples } from "./lib/speaker";
import { LocalAudioRecorder } from "./lib/recorder";
import { transcribeWithCloudflareStt } from "./lib/cloudflareStt";
import { createPcmCapture, type PcmCapture } from "./lib/pcm";
import { getAdsenseSlotConfig, initializeGoogleSlots, requestAdsenseRender } from "./lib/google";
import {
  createVolumeMeter,
  readRmsVolume,
  stopVolumeMeter,
  trimVolumeSamples,
  type VolumeMeter,
} from "./lib/volume";
import {
  createSegment,
  splitActiveSegment,
  updateActiveSegmentEnd,
  updateSegmentSpeaker,
  updateSegmentText,
} from "./lib/segments";
import { formatDateTime, formatScreenshotTime, formatSegmentTime } from "./lib/time";

const LANGUAGE_OPTIONS: LanguageOption[] = ["Auto", "Japanese", "English"];
const SEGMENT_INTERVALS = [
  { label: "30 seconds", value: 30 },
  { label: "1 minute", value: 60 },
  { label: "3 minutes", value: 180 },
  { label: "5 minutes", value: 300 },
];
const SPEAKER_OPTIONS: Speaker[] = ["User", "Screen", "Mixed", "Unknown"];
const VOLUME_SAMPLE_KEEP_SECONDS = 10 * 60;
const VOLUME_POLL_MS = 100;
const UI_REFRESH_MS = 400;
const LIVE_STT_INTERVAL_MS = 5_000;
const MIN_LIVE_STT_CHUNK_SECONDS = 2;
const LIVE_STT_TIMEOUT_MS = 20_000;
const REALTIME_STT_SEND_MS = 250;

type TrackStatus = {
  micAudio: boolean;
  displayAudio: boolean;
  displayVideo: boolean;
};

type VolumeMeters = {
  mic: VolumeMeter | null;
  screen: VolumeMeter | null;
  mixed: VolumeMeter | null;
};

type CaptureConfig = {
  segmentInterval: number;
  enableSilenceSegmentation: boolean;
  thresholds: VolumeThresholds;
};

type SttUiState = {
  isTranscribing: boolean;
  progress: number;
  message: string;
  interimText: string;
};

type LiveSttDebugState = {
  status: string;
  chunkCount: number;
  chunksWithText: number;
  skippedChunks: number;
  skippedSeconds: number;
  lastRange: string;
  lastDurationSeconds: number;
  lastSampleRate: number;
  lastProcessingSeconds: number;
  lastPeak: number;
  lastRms: number;
  lastSegments: number;
  lastError: string | null;
};

const initialTrackStatus: TrackStatus = {
  micAudio: false,
  displayAudio: false,
  displayVideo: false,
};

const initialThresholds: VolumeThresholds = {
  micThreshold: 0.025,
  screenThreshold: 0.025,
  silenceThreshold: 0.015,
  silenceDuration: 2.5,
};

const emptyMeters: VolumeMeters = {
  mic: null,
  screen: null,
  mixed: null,
};

const initialSttState: SttUiState = {
  isTranscribing: false,
  progress: 0,
  message: "Cloudflare realtime STT ready. Live audio is streamed to this Worker for transcription.",
  interimText: "",
};

const initialLiveSttDebug: LiveSttDebugState = {
  status: "Idle",
  chunkCount: 0,
  chunksWithText: 0,
  skippedChunks: 0,
  skippedSeconds: 0,
  lastRange: "None",
  lastDurationSeconds: 0,
  lastSampleRate: 0,
  lastProcessingSeconds: 0,
  lastPeak: 0,
  lastRms: 0,
  lastSegments: 0,
  lastError: null,
};

function App() {
  const [language, setLanguage] = useState<LanguageOption>("Auto");
  const [segmentInterval, setSegmentInterval] = useState(30);
  const [enableSilenceSegmentation, setEnableSilenceSegmentation] = useState(false);
  const [thresholds, setThresholds] = useState<VolumeThresholds>(initialThresholds);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [trackStatus, setTrackStatus] = useState<TrackStatus>(initialTrackStatus);
  const [micVolume, setMicVolume] = useState(0);
  const [screenVolume, setScreenVolume] = useState(0);
  const [mixedVolume, setMixedVolume] = useState(0);
  const [currentInference, setCurrentInference] = useState<SpeakerInference>(
    inferSpeaker(0, 0, initialThresholds),
  );
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([]);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [sttState, setSttState] = useState<SttUiState>(initialSttState);
  const [liveSttDebug, setLiveSttDebug] =
    useState<LiveSttDebugState>(initialLiveSttDebug);

  const micStreamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const mixedGraphRef = useRef<MixedAudioGraph | null>(null);
  const recorderRef = useRef<LocalAudioRecorder | null>(null);
  const livePcmCaptureRef = useRef<PcmCapture | null>(null);
  const liveSttTimerRef = useRef<number | null>(null);
  const realtimeSttSocketRef = useRef<WebSocket | null>(null);
  const realtimeSttSendTimerRef = useRef<number | null>(null);
  const realtimeSttFinalBoundaryRef = useRef(0);
  const liveSttRunningRef = useRef(false);
  const liveSttOffsetRef = useRef(0);
  const metersRef = useRef<VolumeMeters>(emptyMeters);
  const volumeSamplesRef = useRef<VolumeSample[]>([]);
  const volumeTimerRef = useRef<number | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const activeSegmentIdRef = useRef<string | null>(null);
  const lastSegmentBoundaryRef = useRef(0);
  const lastUiRefreshRef = useRef(0);
  const silenceStartedAtRef = useRef<number | null>(null);
  const silenceSplitArmedRef = useRef(true);
  const configRef = useRef<CaptureConfig>({
    segmentInterval,
    enableSilenceSegmentation,
    thresholds,
  });
  const segmentsRef = useRef<TranscriptSegment[]>(segments);
  const screenshotsRef = useRef<ScreenshotItem[]>(screenshots);
  const sttInterimTextRef = useRef("");

  useEffect(() => {
    initializeGoogleSlots();
  }, []);

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    screenshotsRef.current = screenshots;
  }, [screenshots]);

  useEffect(() => {
    sttInterimTextRef.current = sttState.interimText;
  }, [sttState.interimText]);

  useEffect(() => {
    configRef.current = {
      segmentInterval,
      enableSilenceSegmentation,
      thresholds,
    };
  }, [enableSilenceSegmentation, segmentInterval, thresholds]);

  const addWarning = useCallback((message: string) => {
    setWarnings((current) => appendUnique(current, message));
  }, []);

  const addError = useCallback((message: string) => {
    setErrors((current) => appendUnique(current, message));
  }, []);

  const appendTranscriptText = useCallback(
    (text: string, startTime: number, endTime: number) => {
      const cleanText = text.trim();
      if (!cleanText) {
        return;
      }

      const safeStart = Math.max(0, startTime);
      const safeEnd = Math.max(safeStart + 0.1, endTime);
      const inference = inferSpeakerFromSamples(
        volumeSamplesRef.current,
        safeStart,
        safeEnd,
        configRef.current.thresholds,
      );

      setSegments((current) =>
        mergeTranscriptSegments(current, [
          {
            id: crypto.randomUUID(),
            startTime: safeStart,
            endTime: safeEnd,
            text: cleanText,
            speaker: inference.speaker,
            source: inference.source,
          },
        ]),
      );
    },
    [],
  );

  const stopLiveSttLoop = useCallback(() => {
    if (liveSttTimerRef.current !== null) {
      window.clearInterval(liveSttTimerRef.current);
      liveSttTimerRef.current = null;
    }

    if (realtimeSttSendTimerRef.current !== null) {
      window.clearInterval(realtimeSttSendTimerRef.current);
      realtimeSttSendTimerRef.current = null;
    }

    const socket = realtimeSttSocketRef.current;
    realtimeSttSocketRef.current = null;
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      socket.close();
    }

    livePcmCaptureRef.current?.stop();
    livePcmCaptureRef.current = null;
    liveSttRunningRef.current = false;
  }, []);

  const runLiveSttChunk = useCallback(async () => {
    const capture = livePcmCaptureRef.current;
    if (!capture) {
      return;
    }

    if (liveSttRunningRef.current) {
      const skippedChunk = capture.consume();
      if (skippedChunk) {
        liveSttOffsetRef.current += skippedChunk.duration;
        setLiveSttDebug((current) => ({
          ...current,
          status: "STT request busy, skipped live preview chunk",
          skippedChunks: current.skippedChunks + 1,
          skippedSeconds: current.skippedSeconds + skippedChunk.duration,
          lastDurationSeconds: skippedChunk.duration,
          lastSampleRate: skippedChunk.sampleRate,
        }));
      }
      return;
    }

    const chunk = capture.consume();
    if (!chunk || chunk.duration < MIN_LIVE_STT_CHUNK_SECONDS) {
      return;
    }

    const offset = liveSttOffsetRef.current;
    liveSttOffsetRef.current += chunk.duration;
    const range = `${formatSegmentTime(offset)} - ${formatSegmentTime(offset + chunk.duration)}`;

    liveSttRunningRef.current = true;
    setSttState((current) => ({
      ...current,
      isTranscribing: true,
      progress: 0,
      message: `Sending ${range} to Cloudflare STT.`,
    }));
    setLiveSttDebug((current) => ({
      ...current,
      status: "Transcribing",
      lastRange: range,
      lastDurationSeconds: chunk.duration,
      lastError: null,
    }));

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), LIVE_STT_TIMEOUT_MS);
    try {
      const result = await transcribeWithCloudflareStt({
        audioData: chunk.audioData,
        sampleRate: chunk.sampleRate,
        language,
        signal: controller.signal,
      });

      if (result.text) {
        appendTranscriptText(result.text, offset, offset + result.audioDurationSeconds);
      }

      setLiveSttDebug((current) => ({
        status: result.text ? "Text added" : "No text returned",
        chunkCount: current.chunkCount + 1,
        chunksWithText: current.chunksWithText + (result.text ? 1 : 0),
        skippedChunks: current.skippedChunks,
        skippedSeconds: current.skippedSeconds,
        lastRange: range,
        lastDurationSeconds: result.audioDurationSeconds,
        lastSampleRate: result.audioSampleRate,
        lastProcessingSeconds: result.durationMs / 1000,
        lastPeak: result.audioPeak,
        lastRms: result.audioRms,
        lastSegments: result.text ? 1 : 0,
        lastError: null,
      }));

      for (const warning of result.warnings) {
        addWarning(`Cloudflare STT warning: ${warning}`);
      }

      setSttState((current) => ({
        ...current,
        isTranscribing: false,
        progress: 100,
        message: result.text
          ? "Cloudflare STT added a live transcript segment."
          : "Cloudflare STT returned no text for the latest chunk.",
      }));
    } catch (error) {
      addWarning(`Cloudflare STT chunk failed: ${describeError(error)}`);
      setLiveSttDebug((current) => ({
        ...current,
        status: "Error",
        chunkCount: current.chunkCount + 1,
        skippedChunks: current.skippedChunks,
        skippedSeconds: current.skippedSeconds,
        lastError: describeError(error),
      }));
      setSttState((current) => ({
        ...current,
        isTranscribing: false,
        message: "Cloudflare STT chunk failed; recording continues.",
      }));
    } finally {
      window.clearTimeout(timeoutId);
      liveSttRunningRef.current = false;
    }
  }, [addWarning, appendTranscriptText, language]);

  const startChunkedSttLoop = useCallback(() => {
    if (liveSttTimerRef.current !== null) {
      window.clearInterval(liveSttTimerRef.current);
    }
    liveSttTimerRef.current = window.setInterval(() => {
      void runLiveSttChunk();
    }, LIVE_STT_INTERVAL_MS);
    setLiveSttDebug((current) => ({
      ...current,
      status: "Chunk fallback listening",
    }));
  }, [runLiveSttChunk]);

  const getRecordingTime = useCallback(() => {
    const startedAt = recordingStartedAtRef.current;
    if (!startedAt) {
      return elapsedTime;
    }
    return (performance.now() - startedAt) / 1000;
  }, [elapsedTime]);

  const startRealtimeSttStream = useCallback(
    (sampleRate: number) => {
      if (!livePcmCaptureRef.current) {
        startChunkedSttLoop();
        return;
      }

      const url = new URL("/api/realtime-transcribe", window.location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.searchParams.set("sampleRate", String(Math.round(sampleRate)));
      url.searchParams.set("language", language);

      const socket = new WebSocket(url);
      socket.binaryType = "arraybuffer";
      realtimeSttSocketRef.current = socket;
      realtimeSttFinalBoundaryRef.current = 0;
      const connectTimeout = window.setTimeout(() => {
        fallBackToChunkedStt("Realtime STT WebSocket did not connect");
      }, 5_000);

      const fallBackToChunkedStt = (reason: string) => {
        if (realtimeSttSocketRef.current !== socket || !livePcmCaptureRef.current) {
          return;
        }
        window.clearTimeout(connectTimeout);
        realtimeSttSocketRef.current = null;
        if (realtimeSttSendTimerRef.current !== null) {
          window.clearInterval(realtimeSttSendTimerRef.current);
          realtimeSttSendTimerRef.current = null;
        }
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
        addWarning("Live captions switched to a slower backup mode.");
        setLiveSttDebug((current) => ({
          ...current,
          status: "Realtime unavailable",
          lastError: reason,
        }));
        startChunkedSttLoop();
      };

      socket.onopen = () => {
        if (realtimeSttSocketRef.current !== socket) {
          return;
        }
        window.clearTimeout(connectTimeout);

        setSttState((current) => ({
          ...current,
          isTranscribing: true,
          progress: 100,
          message: "Realtime STT connected. Streaming audio frames.",
          interimText: "",
        }));
        setLiveSttDebug((current) => ({
          ...current,
          status: "Realtime streaming",
          lastSampleRate: sampleRate,
          lastError: null,
        }));

        realtimeSttSendTimerRef.current = window.setInterval(() => {
          const capture = livePcmCaptureRef.current;
          if (!capture || socket.readyState !== WebSocket.OPEN) {
            return;
          }
          const chunk = capture.consume();
          if (!chunk) {
            return;
          }
          liveSttOffsetRef.current += chunk.duration;
          socket.send(encodeLinear16Pcm(chunk.audioData));
          const stats = getAudioStats(chunk.audioData);
          setLiveSttDebug((current) => ({
            ...current,
            status: "Realtime streaming",
            lastRange: `${formatSegmentTime(Math.max(0, liveSttOffsetRef.current - chunk.duration))} - ${formatSegmentTime(
              liveSttOffsetRef.current,
            )}`,
            lastDurationSeconds: chunk.duration,
            lastSampleRate: chunk.sampleRate,
            lastPeak: stats.peak,
            lastRms: stats.rms,
          }));
        }, REALTIME_STT_SEND_MS);
      };

      socket.onmessage = (event) => {
        const parsed = parseRealtimeSttMessage(event.data);
        if (!parsed?.text) {
          return;
        }

        if (parsed.isFinal) {
          const endTime = Math.max(
            parsed.endTime ?? getRecordingTime(),
            realtimeSttFinalBoundaryRef.current + 0.1,
          );
          const startTime = Math.max(
            realtimeSttFinalBoundaryRef.current,
            Math.min(parsed.startTime ?? realtimeSttFinalBoundaryRef.current, endTime - 0.1),
          );
          realtimeSttFinalBoundaryRef.current = endTime;
          appendTranscriptText(parsed.text, startTime, endTime);
          setSttState((current) => ({
            ...current,
            isTranscribing: true,
            progress: 100,
            message: "Realtime STT added final transcript text.",
            interimText: "",
          }));
          setLiveSttDebug((current) => ({
            ...current,
            status: "Realtime final text",
            chunkCount: current.chunkCount + 1,
            chunksWithText: current.chunksWithText + 1,
            lastRange: `${formatSegmentTime(startTime)} - ${formatSegmentTime(endTime)}`,
            lastSegments: 1,
            lastError: null,
          }));
        } else {
          setSttState((current) => ({
            ...current,
            isTranscribing: true,
            progress: 100,
            message: "Realtime STT interim transcript received.",
            interimText: parsed.text,
          }));
          setLiveSttDebug((current) => ({
            ...current,
            status: "Realtime interim text",
            chunkCount: current.chunkCount + 1,
            chunksWithText: current.chunksWithText,
            lastSegments: 0,
            lastError: null,
          }));
        }
      };

      socket.onerror = () => {
        fallBackToChunkedStt("Realtime STT WebSocket failed");
      };

      socket.onclose = () => {
        if (realtimeSttSocketRef.current === socket && recordingStartedAtRef.current) {
          fallBackToChunkedStt("Realtime STT WebSocket closed");
        }
      };
    },
    [addWarning, appendTranscriptText, getRecordingTime, language, startChunkedSttLoop],
  );

  const cleanupCapture = useCallback(async () => {
    stopLiveSttLoop();

    if (volumeTimerRef.current !== null) {
      window.clearInterval(volumeTimerRef.current);
      volumeTimerRef.current = null;
    }

    let finalAudioBlob: Blob | null = null;
    if (recorderRef.current) {
      try {
        finalAudioBlob = await recorderRef.current.stop();
      } catch (error) {
        addError(`Audio recording could not stop cleanly: ${describeError(error)}`);
      }
      recorderRef.current = null;
    }

    const endTime = getRecordingTime();
    const latestInterimText = sttInterimTextRef.current.trim();
    if (latestInterimText) {
      appendTranscriptText(latestInterimText, realtimeSttFinalBoundaryRef.current, endTime);
      sttInterimTextRef.current = "";
    }
    const finalInference = inferSpeakerFromSamples(
      volumeSamplesRef.current,
      Math.max(0, lastSegmentBoundaryRef.current),
      endTime,
      configRef.current.thresholds,
    );
    setSegments((current) => updateActiveSegmentEnd(current, activeSegmentIdRef.current, endTime, finalInference));

    stopVolumeMeter(metersRef.current.mic);
    stopVolumeMeter(metersRef.current.screen);
    stopVolumeMeter(metersRef.current.mixed);
    metersRef.current = emptyMeters;

    mixedGraphRef.current?.cleanup();
    const audioContext = mixedGraphRef.current?.audioContext;
    mixedGraphRef.current?.mixedStream.getTracks().forEach((track) => track.stop());
    mixedGraphRef.current = null;

    stopMediaStream(micStreamRef.current);
    stopMediaStream(displayStreamRef.current);
    micStreamRef.current = null;
    displayStreamRef.current = null;

    if (audioContext && audioContext.state !== "closed") {
      try {
        await audioContext.close();
      } catch (error) {
        addWarning(`AudioContext could not close cleanly: ${describeError(error)}`);
      }
    }

    if (finalAudioBlob) {
      if (audioBlobUrl) {
        URL.revokeObjectURL(audioBlobUrl);
      }
      setAudioBlob(finalAudioBlob);
      setAudioBlobUrl(URL.createObjectURL(finalAudioBlob));
    }

    setTrackStatus(initialTrackStatus);
    setIsCapturing(false);
    setSttState((current) => ({
      ...current,
      isTranscribing: false,
      interimText: "",
    }));
    activeSegmentIdRef.current = null;
    recordingStartedAtRef.current = null;
    silenceStartedAtRef.current = null;
    silenceSplitArmedRef.current = true;
  }, [addError, addWarning, appendTranscriptText, audioBlobUrl, getRecordingTime, stopLiveSttLoop]);

  useEffect(() => {
    return () => {
      if (volumeTimerRef.current !== null) {
        window.clearInterval(volumeTimerRef.current);
      }
      stopLiveSttLoop();
      recorderRef.current?.stop().catch(() => undefined);
      stopVolumeMeter(metersRef.current.mic);
      stopVolumeMeter(metersRef.current.screen);
      stopVolumeMeter(metersRef.current.mixed);
      mixedGraphRef.current?.cleanup();
      mixedGraphRef.current?.mixedStream.getTracks().forEach((track) => track.stop());
      stopMediaStream(micStreamRef.current);
      stopMediaStream(displayStreamRef.current);
      if (audioBlobUrl) {
        URL.revokeObjectURL(audioBlobUrl);
      }
      for (const screenshot of screenshotsRef.current) {
        URL.revokeObjectURL(screenshot.blobUrl);
      }
    };
  }, [audioBlobUrl, stopLiveSttLoop]);

  const splitSegmentAt = useCallback((boundaryTime: number, inference: SpeakerInference) => {
    setSegments((current) => {
      const result = splitActiveSegment(current, boundaryTime, inference);
      activeSegmentIdRef.current = result.activeSegmentId;
      return result.segments;
    });
    lastSegmentBoundaryRef.current = boundaryTime;
  }, []);

  const handleVolumeTick = useCallback(() => {
    const startedAt = recordingStartedAtRef.current;
    if (!startedAt) {
      return;
    }

    const now = (performance.now() - startedAt) / 1000;
    const mic = readRmsVolume(metersRef.current.mic);
    const screen = readRmsVolume(metersRef.current.screen);
    const mixed = readRmsVolume(metersRef.current.mixed);
    const sample: VolumeSample = {
      time: now,
      micVolume: mic,
      screenVolume: screen,
      mixedVolume: mixed,
    };
    volumeSamplesRef.current = trimVolumeSamples(
      [...volumeSamplesRef.current, sample],
      VOLUME_SAMPLE_KEEP_SECONDS,
      now,
    );

    const config = configRef.current;
    const currentInferenceWindowStart = Math.max(0, now - 2);
    const inference = inferSpeakerFromSamples(
      volumeSamplesRef.current,
      currentInferenceWindowStart,
      now,
      config.thresholds,
    );

    if (now - lastSegmentBoundaryRef.current >= config.segmentInterval) {
      splitSegmentAt(now, inference);
    } else if (config.enableSilenceSegmentation) {
      if (mixed < config.thresholds.silenceThreshold) {
        if (silenceStartedAtRef.current === null) {
          silenceStartedAtRef.current = now;
        }
        const silenceSeconds = now - silenceStartedAtRef.current;
        if (
          silenceSplitArmedRef.current &&
          silenceSeconds >= config.thresholds.silenceDuration &&
          now - lastSegmentBoundaryRef.current >= 5
        ) {
          splitSegmentAt(now, inference);
          silenceSplitArmedRef.current = false;
        }
      } else {
        silenceStartedAtRef.current = null;
        silenceSplitArmedRef.current = true;
      }
    }

    if (now - lastUiRefreshRef.current >= UI_REFRESH_MS / 1000) {
      lastUiRefreshRef.current = now;
      setElapsedTime(now);
      setMicVolume(mic);
      setScreenVolume(screen);
      setMixedVolume(mixed);
      setCurrentInference(inference);
      setSegments((current) =>
        updateActiveSegmentEnd(current, activeSegmentIdRef.current, now, inference),
      );
    }
  }, [splitSegmentAt]);

  const startVolumeLoop = useCallback(() => {
    if (volumeTimerRef.current !== null) {
      window.clearInterval(volumeTimerRef.current);
    }
    volumeTimerRef.current = window.setInterval(handleVolumeTick, VOLUME_POLL_MS);
  }, [handleVolumeTick]);

  const handleStartCapture = useCallback(async () => {
    if (isCapturing) {
      return;
    }

    setErrors([]);
    setWarnings([
      "When Chrome asks, choose the tab you want to hear and turn on Share tab audio.",
    ]);
    setAudioBlob(null);
    if (audioBlobUrl) {
      URL.revokeObjectURL(audioBlobUrl);
      setAudioBlobUrl(null);
    }
    setLiveSttDebug(initialLiveSttDebug);

    try {
      if (!("MediaRecorder" in window)) {
        throw new Error("This browser does not support MediaRecorder.");
      }

      const displayStream = await requestDisplayMedia();
      displayStreamRef.current = displayStream;

      const micStream = await requestMicrophoneMedia();
      micStreamRef.current = micStream;
      const status: TrackStatus = {
        micAudio: micStream.getAudioTracks().length > 0,
        displayAudio: displayStream.getAudioTracks().length > 0,
        displayVideo: displayStream.getVideoTracks().length > 0,
      };

      if (!status.micAudio) {
        addWarning("Microphone was not available.");
      }
      if (!status.displayAudio) {
        addWarning("I could not hear the shared tab. Start again and turn on Share tab audio.");
      }

      const audioContext = createCaptureAudioContext();
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
      const mixedGraph = createMixedAudioStream(audioContext, micStream, displayStream);
      const recorder = new LocalAudioRecorder(mixedGraph.mixedStream, addError);
      const firstSegment = createSegment(0);

      mixedGraphRef.current = mixedGraph;
      recorderRef.current = recorder;
      livePcmCaptureRef.current = await createPcmCapture(audioContext, mixedGraph.mixedStream);
      liveSttOffsetRef.current = 0;
      metersRef.current = {
        mic: createVolumeMeter(audioContext, micStream),
        screen: createVolumeMeter(audioContext, displayStream),
        mixed: createVolumeMeter(audioContext, mixedGraph.mixedStream),
      };
      volumeSamplesRef.current = [];
      recordingStartedAtRef.current = performance.now();
      activeSegmentIdRef.current = firstSegment.id;
      lastSegmentBoundaryRef.current = 0;
      lastUiRefreshRef.current = 0;
      silenceStartedAtRef.current = null;
      silenceSplitArmedRef.current = true;

      setSegments([firstSegment]);
      setTrackStatus(status);
      setElapsedTime(0);
      setMicVolume(0);
      setScreenVolume(0);
      setMixedVolume(0);
      setCurrentInference(inferSpeaker(0, 0, thresholds));
      setIsCapturing(true);

      recorder.start();
      startVolumeLoop();
      startRealtimeSttStream(audioContext.sampleRate);
    } catch (error) {
      addError(describeError(error));
      await cleanupCapture();
    }
  }, [
    addError,
    addWarning,
    audioBlobUrl,
    cleanupCapture,
    isCapturing,
    startRealtimeSttStream,
    startVolumeLoop,
    thresholds,
  ]);

  const handleStopCapture = useCallback(async () => {
    await cleanupCapture();
  }, [cleanupCapture]);

  const handleTakeScreenshot = useCallback(async () => {
    const displayStream = displayStreamRef.current;
    if (!displayStream?.getVideoTracks().length) {
      addError("No shared video track is available for screenshots.");
      return;
    }

    try {
      const screenshot = await captureScreenshotFromDisplayStream(displayStream, getRecordingTime());
      setScreenshots((current) => [...current, screenshot]);
    } catch (error) {
      addError(`Screenshot failed: ${describeError(error)}`);
    }
  }, [addError, getRecordingTime]);

  const handleDeleteScreenshot = useCallback((id: string) => {
    setScreenshots((current) => {
      const target = current.find((screenshot) => screenshot.id === id);
      if (target) {
        URL.revokeObjectURL(target.blobUrl);
      }
      return current.filter((screenshot) => screenshot.id !== id);
    });
  }, []);

  const handleDownloadTxt = useCallback(() => {
    downloadText(
      generateTranscriptTxt({
        language,
        createdAt: new Date(),
        screenshots,
        segments,
      }),
      "transcript.txt",
      "text/plain;charset=utf-8",
    );
  }, [language, screenshots, segments]);

  const handleDownloadMarkdown = useCallback(() => {
    downloadText(
      generateMeetingMarkdown({
        language,
        createdAt: new Date(),
        screenshots,
        segments,
      }),
      "meeting-notes.md",
      "text/markdown;charset=utf-8",
    );
  }, [language, screenshots, segments]);

  const handleDownloadZip = useCallback(async () => {
    setIsExporting(true);
    try {
      const result = await exportMeetingZip({
        language,
        audioBlob,
        screenshots,
        segments,
      });
      downloadBlob(result.blob, result.filename);
    } catch (error) {
      addError(`ZIP export failed: ${describeError(error)}`);
    } finally {
      setIsExporting(false);
    }
  }, [addError, audioBlob, language, screenshots, segments]);

  const handleClearSession = useCallback(() => {
    setSegments([]);
    setAudioBlob(null);
    if (audioBlobUrl) {
      URL.revokeObjectURL(audioBlobUrl);
      setAudioBlobUrl(null);
    }
    setScreenshots((current) => {
      for (const screenshot of current) {
        URL.revokeObjectURL(screenshot.blobUrl);
      }
      return [];
    });
    setElapsedTime(0);
    setErrors([]);
    setWarnings([]);
  }, [audioBlobUrl]);

  const transcriptSegments = useMemo(
    () => segments.filter((segment) => segment.text.trim()),
    [segments],
  );
  const liveText =
    sttState.interimText.trim() ||
    transcriptSegments[transcriptSegments.length - 1]?.text.trim() ||
    (isCapturing ? "Listening..." : "Start listening when you are ready.");

  return (
    <main className={`focus-shell ${isCapturing ? "is-listening" : ""}`}>
      <section className="focus-stage" aria-label="Speech to text">
        <header className="focus-header">
          <div>
            <span className="focus-state">
              <span />
              {isCapturing ? "Listening" : "Ready"}
            </span>
            <h1>Free Minutes</h1>
          </div>
          <label className="focus-language">
            <span>Language</span>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as LanguageOption)}
              disabled={isCapturing}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </header>

        <div className="focus-layout">
          <section className="focus-left">
            <section className="focus-live" aria-live="polite">
              <p>{liveText}</p>
            </section>

            <div className="focus-actions">
              {isCapturing ? (
                <button type="button" className="focus-stop" onClick={handleStopCapture}>
                  Stop
                </button>
              ) : (
                <button type="button" className="focus-start" onClick={handleStartCapture}>
                  Start Listening
                </button>
              )}
              <button type="button" className="focus-quiet" onClick={handleClearSession} disabled={isCapturing}>
                Clear
              </button>
            </div>

            <p className="focus-hint">
              When Chrome asks, choose the tab you want to hear and turn on Share tab audio.
            </p>

            <FocusMessages errors={errors} warnings={warnings} />
            <GoogleAdSlot />
          </section>

          <section className="focus-transcript" aria-label="Transcript">
            <div className="focus-transcript-head">
              <h2>Transcript</h2>
              <div>
                <button type="button" onClick={handleDownloadTxt} disabled={!transcriptSegments.length}>
                  TXT
                </button>
                <button type="button" onClick={handleDownloadMarkdown} disabled={!transcriptSegments.length}>
                  Markdown
                </button>
                <button type="button" onClick={() => audioBlob && downloadBlob(audioBlob, "mixed-audio.webm")} disabled={!audioBlob}>
                  Audio
                </button>
                <button type="button" onClick={handleDownloadZip} disabled={isExporting || (!transcriptSegments.length && !audioBlob)}>
                  {isExporting ? "Saving..." : "ZIP"}
                </button>
              </div>
            </div>

            {transcriptSegments.length ? (
              <div className="focus-transcript-list">
                {transcriptSegments.map((segment) => (
                  <article className="focus-transcript-item" key={segment.id}>
                    <div className="focus-segment-meta">
                      <span>{getSpeakerLabel(segment.speaker)}</span>
                      <small>
                        {formatSegmentTime(segment.startTime)} - {formatSegmentTime(segment.endTime)}
                      </small>
                    </div>
                    <textarea
                      value={segment.text}
                      onChange={(event) =>
                        setSegments((current) => updateSegmentText(current, segment.id, event.target.value))
                      }
                      rows={getCompactTranscriptRows(segment.text)}
                      aria-label={`Edit transcript from ${getSpeakerLabel(segment.speaker)}`}
                    />
                  </article>
                ))}
              </div>
            ) : (
              <p className="focus-empty">Your transcript will appear here.</p>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function GoogleAdSlot() {
  const config = getAdsenseSlotConfig();

  useEffect(() => {
    if (!config.enabled) {
      return;
    }
    window.requestAnimationFrame(requestAdsenseRender);
  }, [config.enabled]);

  return (
    <aside className="focus-ad" aria-label="Sponsored">
      {config.enabled ? (
        <ins
          className="adsbygoogle"
          style={{ display: "block" }}
          data-ad-client={config.client}
          data-ad-slot={config.slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      ) : (
        <span>Sponsored</span>
      )}
    </aside>
  );
}

function FocusMessages(props: { errors: string[]; warnings: string[] }) {
  if (!props.errors.length && !props.warnings.length) {
    return null;
  }

  return (
    <div className="focus-messages" aria-live="polite">
      {props.errors.map((error) => (
        <p className="focus-message is-error" key={error}>
          {error}
        </p>
      ))}
      {props.warnings.slice(-2).map((warning) => (
        <p className="focus-message" key={warning}>
          {warning}
        </p>
      ))}
    </div>
  );
}

function StatusDashboard(props: {
  elapsedTime: number;
  sttStatus: string;
  trackStatus: TrackStatus;
  micVolume: number;
  screenVolume: number;
  mixedVolume: number;
  currentInference: SpeakerInference;
  isCapturing: boolean;
  isExporting: boolean;
}) {
  return (
    <section className="panel status-dashboard">
      <PanelTitle title="Status" detail={props.isCapturing ? "Capture active" : "Idle"} />
      <div className="status-grid">
        <Metric label="Elapsed" value={formatScreenshotTime(props.elapsedTime)} />
        <Metric label="Current speaker" value={`${props.currentInference.speaker} / ${props.currentInference.source}`} />
        <Metric label="STT" value={props.sttStatus} />
        <Metric label="ZIP exporting" value={props.isExporting ? "Yes" : "No"} />
      </div>
      <div className="track-grid">
        <TrackCard label="Microphone audio" active={props.trackStatus.micAudio} />
        <TrackCard label="Shared audio" active={props.trackStatus.displayAudio} />
        <TrackCard label="Shared video" active={props.trackStatus.displayVideo} />
      </div>
      <div className="meter-grid">
        <VolumeMeterView label="Mic volume" value={props.micVolume} />
        <VolumeMeterView label="Screen volume" value={props.screenVolume} />
        <VolumeMeterView label="Mixed volume" value={props.mixedVolume} />
      </div>
    </section>
  );
}

function CloudflareSttPanel(props: {
  state: SttUiState;
  liveDebug: LiveSttDebugState;
  isCapturing: boolean;
}) {
  return (
    <section className="panel stt-panel">
      <PanelTitle title="Cloudflare STT" detail={props.isCapturing ? "Realtime stream" : "Ready"} />
      <p className="stt-copy">
        While recording, the app streams raw mixed-audio PCM frames to this Worker and uses
        Cloudflare Workers AI Deepgram Nova-3 realtime speech-to-text. If the realtime WebSocket is
        unavailable, it falls back to short Whisper chunks.
      </p>
      <div className="stt-progress" aria-label="Cloudflare STT progress">
        <div>
          <span>{props.state.message}</span>
          <strong>{props.state.progress}%</strong>
        </div>
        <div className="meter-bar" aria-hidden="true">
          <span style={{ width: `${props.state.progress}%` }} />
        </div>
      </div>
      <div className="stt-interim" aria-live="polite">
        <span>Live transcript</span>
        <p>{props.state.interimText || "Waiting for speech..."}</p>
      </div>
      <div className="live-stt-debug" aria-label="Live STT diagnostics">
        <Metric label="Live status" value={props.liveDebug.status} />
        <Metric label="Last audio" value={props.liveDebug.lastRange} />
        <Metric
          label="Chunk audio"
          value={`${props.liveDebug.lastDurationSeconds.toFixed(1)}s @ ${formatSampleRate(props.liveDebug.lastSampleRate)}`}
        />
        <Metric label="Process time" value={`${props.liveDebug.lastProcessingSeconds.toFixed(1)}s`} />
        <Metric label="Peak / RMS" value={`${props.liveDebug.lastPeak.toFixed(3)} / ${props.liveDebug.lastRms.toFixed(3)}`} />
        <Metric label="Text events" value={`${props.liveDebug.chunksWithText}/${props.liveDebug.chunkCount}`} />
        <Metric
          label="Skipped live preview"
          value={`${props.liveDebug.skippedChunks} / ${props.liveDebug.skippedSeconds.toFixed(1)}s`}
        />
        <Metric label="Segments added" value={String(props.liveDebug.lastSegments)} />
        <Metric label="Last error" value={props.liveDebug.lastError ?? "None"} />
      </div>
      <p className="stt-note">
        Transcription is no longer local-only: live audio frames are uploaded to Cloudflare Workers
        AI. Chinese realtime STT is intentionally not supported in this build. Audio recording,
        screenshots, TXT, Markdown, manifest, and ZIP export are still generated in the browser.
      </p>
    </section>
  );
}

function TranscriptEditor(props: {
  segments: TranscriptSegment[];
  onTextChange: (id: string, text: string) => void;
  onSpeakerChange: (id: string, speaker: Speaker) => void;
}) {
  return (
    <section className="panel">
      <PanelTitle title="Transcript segments" detail={`${props.segments.length} segments`} />
      <div className="segments-list">
        {props.segments.length ? (
          props.segments.map((segment) => (
            <article className="segment" key={segment.id}>
              <div className="segment-header">
                <div>
                  <strong>
                    {formatSegmentTime(segment.startTime)} - {formatSegmentTime(segment.endTime)}
                  </strong>
                  <span>{segment.source}</span>
                </div>
                <select
                  value={segment.speaker}
                  onChange={(event) => props.onSpeakerChange(segment.id, event.target.value as Speaker)}
                  aria-label="Segment speaker"
                >
                  {SPEAKER_OPTIONS.map((speaker) => (
                    <option value={speaker} key={speaker}>
                      {speaker}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                value={segment.text}
                onChange={(event) => props.onTextChange(segment.id, event.target.value)}
                placeholder="Edit transcript text locally..."
                rows={4}
              />
            </article>
          ))
        ) : (
          <p className="empty-state">Start capture to create time-based transcript segments.</p>
        )}
      </div>
    </section>
  );
}

function ScreenshotsPanel(props: {
  screenshots: ScreenshotItem[];
  onDownload: (screenshot: ScreenshotItem) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="panel">
      <PanelTitle title="Screenshots" detail={`${props.screenshots.length} images`} />
      <div className="screenshots-grid">
        {props.screenshots.length ? (
          props.screenshots.map((screenshot) => (
            <article className="screenshot-card" key={screenshot.id}>
              <img src={screenshot.blobUrl} alt={screenshot.filename} />
              <div className="screenshot-meta">
                <strong>{formatScreenshotTime(screenshot.recordingTime)}</strong>
                <span>{screenshot.filename}</span>
              </div>
              <div className="button-row">
                <button type="button" onClick={() => props.onDownload(screenshot)}>
                  Download
                </button>
                <button type="button" className="secondary-danger" onClick={() => props.onDelete(screenshot.id)}>
                  Delete
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className="empty-state">No screenshots yet.</p>
        )}
      </div>
    </section>
  );
}

function Messages(props: { errors: string[]; warnings: string[] }) {
  if (!props.errors.length && !props.warnings.length) {
    return null;
  }

  return (
    <section className="message-stack" aria-live="polite">
      {props.errors.map((error) => (
        <div className="message error" key={error}>
          {error}
        </div>
      ))}
      {props.warnings.map((warning) => (
        <div className="message warning" key={warning}>
          {warning}
        </div>
      ))}
    </section>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      {props.children}
    </label>
  );
}

function SliderField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="slider-field">
      <span>
        {props.label}
        <strong>
          {props.value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}
          {props.suffix ?? ""}
        </strong>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </label>
  );
}

function PanelTitle(props: { title: string; detail?: string }) {
  return (
    <div className="panel-title">
      <h2>{props.title}</h2>
      {props.detail ? <span>{props.detail}</span> : null}
    </div>
  );
}

function StatusPill(props: { label: string; active: boolean; tone?: "green" | "amber" }) {
  return (
    <span className={`status-pill ${props.active ? "is-active" : ""} ${props.tone === "amber" ? "is-amber" : ""}`}>
      <span />
      {props.label}: {props.active ? "On" : "Off"}
    </span>
  );
}

function TrackCard(props: { label: string; active: boolean }) {
  return (
    <div className={`track-card ${props.active ? "detected" : ""}`}>
      <span>{props.active ? "Detected" : "Not detected"}</span>
      <strong>{props.label}</strong>
    </div>
  );
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function VolumeMeterView(props: { label: string; value: number }) {
  const percent = Math.min(100, Math.round(props.value * 500));
  return (
    <div className="volume-meter">
      <div>
        <span>{props.label}</span>
        <strong>{props.value.toFixed(3)}</strong>
      </div>
      <div className="meter-bar" aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function appendUnique(items: string[], next: string): string[] {
  if (items.includes(next)) {
    return items;
  }
  return [...items, next];
}

function mergeTranscriptSegments(
  currentSegments: TranscriptSegment[],
  incomingSegments: TranscriptSegment[],
): TranscriptSegment[] {
  const merged = new Map<string, TranscriptSegment>();

  for (const segment of currentSegments) {
    if (segment.text.trim()) {
      merged.set(segmentKey(segment), segment);
    }
  }

  for (const segment of incomingSegments) {
    if (segment.text.trim()) {
      merged.set(segmentKey(segment), segment);
    }
  }

  return [...merged.values()].sort((left, right) => left.startTime - right.startTime);
}

function segmentKey(segment: TranscriptSegment): string {
  return [
    segment.startTime.toFixed(1),
    segment.endTime.toFixed(1),
    segment.text.trim(),
  ].join("|");
}

function getSpeakerLabel(speaker: Speaker): string {
  if (speaker === "User") {
    return "You";
  }
  if (speaker === "Screen") {
    return "Shared audio";
  }
  if (speaker === "Mixed") {
    return "Mixed";
  }
  return "Unclear";
}

function getCompactTranscriptRows(text: string): number {
  const explicitLines = text.split("\n").length;
  const estimatedLines = Math.ceil(text.length / 120);
  return Math.max(1, Math.min(5, explicitLines + estimatedLines - 1));
}

function createCaptureAudioContext(): AudioContext {
  try {
    // Realtime STT accepts raw PCM. A 16 kHz capture graph keeps the stream
    // small when Chrome honors the requested sample rate.
    return new AudioContext({ sampleRate: 16000 });
  } catch {
    return new AudioContext();
  }
}

function encodeLinear16Pcm(audioData: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(audioData.length * 2);
  const view = new DataView(buffer);
  let offset = 0;
  for (const sample of audioData) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

function getAudioStats(audioData: Float32Array): { peak: number; rms: number } {
  let peak = 0;
  let sumSquares = 0;
  for (const sample of audioData) {
    const absolute = Math.abs(sample);
    if (absolute > peak) {
      peak = absolute;
    }
    sumSquares += sample * sample;
  }
  return {
    peak,
    rms: audioData.length ? Math.sqrt(sumSquares / audioData.length) : 0,
  };
}

function parseRealtimeSttMessage(data: unknown): {
  text: string;
  isFinal: boolean;
  startTime?: number;
  endTime?: number;
} | null {
  const rawText = decodeSocketMessage(data);
  if (!rawText) {
    return null;
  }

  try {
    const payload = JSON.parse(rawText) as {
      channel?: { alternatives?: Array<{ transcript?: unknown }> };
      transcript?: unknown;
      is_final?: unknown;
      speech_final?: unknown;
      event?: unknown;
      start?: unknown;
      duration?: unknown;
      audio_window_start?: unknown;
      audio_window_end?: unknown;
    };
    const transcript =
      typeof payload.channel?.alternatives?.[0]?.transcript === "string"
        ? payload.channel.alternatives[0].transcript
        : typeof payload.transcript === "string"
          ? payload.transcript
          : "";
    const text = transcript.trim();
    if (!text) {
      return null;
    }

    const startTime = numberFromUnknown(payload.start) ?? numberFromUnknown(payload.audio_window_start);
    const duration = numberFromUnknown(payload.duration);
    const endTime =
      numberFromUnknown(payload.audio_window_end) ??
      (startTime !== undefined && duration !== undefined ? startTime + duration : undefined);
    const eventName = typeof payload.event === "string" ? payload.event : "";
    const isFinal =
      payload.is_final === true ||
      payload.speech_final === true ||
      eventName === "EndOfTurn" ||
      eventName === "EagerEndOfTurn";

    return {
      text,
      isFinal,
      startTime,
      endTime,
    };
  } catch {
    return null;
  }
}

function decodeSocketMessage(data: unknown): string | null {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }
  return null;
}

function numberFromUnknown(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function formatSampleRate(sampleRate: number): string {
  return sampleRate ? `${Math.round(sampleRate / 1000)}k` : "n/a";
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export default App;
