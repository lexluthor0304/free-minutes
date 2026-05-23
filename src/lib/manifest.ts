import type { ExportManifest, LanguageOption, ScreenshotItem, TranscriptSegment } from "../types";
import { AUDIO_FILENAME, MARKDOWN_FILENAME, TRANSCRIPT_FILENAME } from "./export";

export function buildExportManifest(options: {
  exportedAt: Date;
  language: LanguageOption;
  audioBlob: Blob | null;
  screenshots: ScreenshotItem[];
  segments: TranscriptSegment[];
}): ExportManifest {
  return {
    appName: "Free Minutes",
    exportedAt: options.exportedAt.toISOString(),
    language: options.language,
    audioFilename: options.audioBlob ? AUDIO_FILENAME : null,
    markdownFilename: MARKDOWN_FILENAME,
    transcriptFilename: TRANSCRIPT_FILENAME,
    screenshots: options.screenshots.map((screenshot) => ({
      filename: screenshot.filename,
      createdAt: screenshot.createdAt,
      recordingTime: screenshot.recordingTime,
    })),
    segments: options.segments.map((segment) => ({
      id: segment.id,
      startTime: segment.startTime,
      endTime: segment.endTime,
      speaker: segment.speaker,
      source: segment.source,
    })),
  };
}
