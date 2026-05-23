import type { Speaker, SpeakerInference, TranscriptSegment } from "../types";
import { sourceFromSpeaker } from "./speaker";

export function createSegment(startTime: number, endTime = startTime): TranscriptSegment {
  return {
    id: crypto.randomUUID(),
    startTime,
    endTime,
    text: "",
    speaker: "Unknown",
    source: "unknown",
  };
}

export function splitActiveSegment(
  segments: TranscriptSegment[],
  boundaryTime: number,
  inference: SpeakerInference,
): { segments: TranscriptSegment[]; activeSegmentId: string | null } {
  const safeBoundary = Math.max(0, boundaryTime);
  if (!segments.length) {
    const nextSegment = createSegment(safeBoundary);
    return { segments: [nextSegment], activeSegmentId: nextSegment.id };
  }

  const nextSegment = createSegment(safeBoundary);
  const updatedSegments = segments.map((segment, index) => {
    if (index !== segments.length - 1) {
      return segment;
    }
    return {
      ...segment,
      endTime: Math.max(segment.startTime, safeBoundary),
      speaker: inference.speaker,
      source: inference.source,
    };
  });

  return {
    segments: [...updatedSegments, nextSegment],
    activeSegmentId: nextSegment.id,
  };
}

export function updateActiveSegmentEnd(
  segments: TranscriptSegment[],
  activeSegmentId: string | null,
  endTime: number,
  inference: SpeakerInference,
): TranscriptSegment[] {
  return segments.map((segment, index) => {
    const isActive =
      (activeSegmentId && segment.id === activeSegmentId) ||
      (!activeSegmentId && index === segments.length - 1);
    if (!isActive) {
      return segment;
    }
    return {
      ...segment,
      endTime: Math.max(segment.endTime, endTime),
      speaker: inference.speaker,
      source: inference.source,
    };
  });
}

export function updateSegmentText(
  segments: TranscriptSegment[],
  segmentId: string,
  text: string,
): TranscriptSegment[] {
  return segments.map((segment) => (segment.id === segmentId ? { ...segment, text } : segment));
}

export function updateSegmentSpeaker(
  segments: TranscriptSegment[],
  segmentId: string,
  speaker: Speaker,
): TranscriptSegment[] {
  return segments.map((segment) =>
    segment.id === segmentId
      ? {
          ...segment,
          speaker,
          source: sourceFromSpeaker(speaker),
          diarizedSpeaker: undefined,
        }
      : segment,
  );
}
