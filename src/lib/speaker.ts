import type { Speaker, SpeakerInference, VolumeSample, VolumeThresholds } from "../types";
import { averageVolumes } from "./volume";

export function sourceFromSpeaker(speaker: Speaker): SpeakerInference["source"] {
  if (speaker === "User") {
    return "mic";
  }
  if (speaker === "Screen") {
    return "screen";
  }
  if (speaker === "Mixed") {
    return "mixed";
  }
  return "unknown";
}

export function inferSpeaker(
  micAverage: number,
  screenAverage: number,
  thresholds: Pick<VolumeThresholds, "micThreshold" | "screenThreshold">,
): SpeakerInference {
  const micActive = micAverage >= thresholds.micThreshold;
  const screenActive = screenAverage >= thresholds.screenThreshold;

  if (micActive && !screenActive) {
    return { speaker: "User", source: "mic", micAverage, screenAverage };
  }
  if (!micActive && screenActive) {
    return { speaker: "Screen", source: "screen", micAverage, screenAverage };
  }
  if (micActive && screenActive) {
    return { speaker: "Mixed", source: "mixed", micAverage, screenAverage };
  }
  return { speaker: "Unknown", source: "unknown", micAverage, screenAverage };
}

export function inferSpeakerFromSamples(
  samples: VolumeSample[],
  startTime: number,
  endTime: number,
  thresholds: Pick<VolumeThresholds, "micThreshold" | "screenThreshold">,
): SpeakerInference {
  const { micAverage, screenAverage } = averageVolumes(samples, startTime, endTime);
  return inferSpeaker(micAverage, screenAverage, thresholds);
}
