import type { VolumeSample } from "../types";

export type VolumeMeter = {
  analyser: AnalyserNode;
  source: MediaStreamAudioSourceNode;
  buffer: Uint8Array<ArrayBuffer>;
};

export function createVolumeMeter(audioContext: AudioContext, stream: MediaStream | null): VolumeMeter | null {
  if (!stream?.getAudioTracks().length) {
    return null;
  }

  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);

  return {
    analyser,
    source,
    buffer: new Uint8Array(new ArrayBuffer(analyser.fftSize)),
  };
}

export function readRmsVolume(meter: VolumeMeter | null): number {
  if (!meter) {
    return 0;
  }

  meter.analyser.getByteTimeDomainData(meter.buffer);
  let sumSquares = 0;
  for (const value of meter.buffer) {
    const centered = (value - 128) / 128;
    sumSquares += centered * centered;
  }
  return Math.sqrt(sumSquares / meter.buffer.length);
}

export function averageVolumes(
  samples: VolumeSample[],
  startTime: number,
  endTime: number,
): { micAverage: number; screenAverage: number; mixedAverage: number } {
  const safeStart = Math.max(0, startTime);
  const safeEnd = Math.max(safeStart, endTime);
  let micTotal = 0;
  let screenTotal = 0;
  let mixedTotal = 0;
  let count = 0;

  for (const sample of samples) {
    if (sample.time >= safeStart && sample.time <= safeEnd) {
      micTotal += sample.micVolume;
      screenTotal += sample.screenVolume;
      mixedTotal += sample.mixedVolume;
      count += 1;
    }
  }

  if (count === 0) {
    return { micAverage: 0, screenAverage: 0, mixedAverage: 0 };
  }

  return {
    micAverage: micTotal / count,
    screenAverage: screenTotal / count,
    mixedAverage: mixedTotal / count,
  };
}

export function trimVolumeSamples(samples: VolumeSample[], keepSeconds: number, nowSeconds: number): VolumeSample[] {
  const cutoff = Math.max(0, nowSeconds - keepSeconds);
  const firstKeptIndex = samples.findIndex((sample) => sample.time >= cutoff);
  if (firstKeptIndex <= 0) {
    return samples;
  }
  return samples.slice(firstKeptIndex);
}

export function stopVolumeMeter(meter: VolumeMeter | null): void {
  if (!meter) {
    return;
  }

  try {
    meter.source.disconnect();
  } catch {
    // Already disconnected.
  }
  try {
    meter.analyser.disconnect();
  } catch {
    // Already disconnected.
  }
}
