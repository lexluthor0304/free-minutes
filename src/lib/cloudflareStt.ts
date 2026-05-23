import type { LanguageOption } from "../types";

export type CloudflareSttResult = {
  text: string;
  raw: unknown;
  warnings: string[];
  durationMs: number;
  audioDurationSeconds: number;
  audioSampleRate: number;
  audioPeak: number;
  audioRms: number;
};

export async function transcribeWithCloudflareStt(options: {
  audioData: Float32Array;
  sampleRate: number;
  language: LanguageOption;
  signal?: AbortSignal;
}): Promise<CloudflareSttResult> {
  const startedAt = performance.now();
  const audioStats = getAudioStats(options.audioData);
  const audioDurationSeconds = options.audioData.length / options.sampleRate;
  const wavBlob = encodePcmToWavBlob(options.audioData, options.sampleRate);
  const url = new URL("/api/transcribe", window.location.href);
  const language = mapLanguageToCloudflare(options.language);
  if (language) {
    url.searchParams.set("language", language);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "audio/wav",
    },
    body: wavBlob,
    signal: options.signal,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Cloudflare STT failed: ${response.status} ${message}`);
  }

  const payload = (await response.json()) as { text?: string; raw?: unknown; warning?: string };
  return {
    text: (payload.text ?? "").trim(),
    raw: payload.raw ?? payload,
    warnings: payload.warning ? [payload.warning] : [],
    durationMs: performance.now() - startedAt,
    audioDurationSeconds,
    audioSampleRate: options.sampleRate,
    audioPeak: audioStats.peak,
    audioRms: audioStats.rms,
  };
}

export function encodePcmToWavBlob(audioData: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const channelCount = 1;
  const dataBytes = audioData.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (const sample of audioData) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += bytesPerSample;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function mapLanguageToCloudflare(language: LanguageOption): string | null {
  if (language === "Japanese") {
    return "ja";
  }
  if (language === "English") {
    return "en";
  }
  return null;
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
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
