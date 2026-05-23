import JSZip from "jszip";
import type { LanguageOption, ScreenshotItem, TranscriptSegment } from "../types";
import {
  AUDIO_FILENAME,
  MARKDOWN_FILENAME,
  TRANSCRIPT_FILENAME,
  generateMeetingMarkdown,
  generateTranscriptTxt,
} from "./export";
import { buildExportManifest } from "./manifest";
import { formatTimestampForFile } from "./time";

export async function exportMeetingZip(options: {
  language: LanguageOption;
  audioBlob: Blob | null;
  screenshots: ScreenshotItem[];
  segments: TranscriptSegment[];
  meetingNotes?: string;
}): Promise<{ blob: Blob; filename: string }> {
  /*
   * JSZip runs entirely in the browser here. No audio, screenshots, transcript,
   * manifest, or ZIP bytes are uploaded or sent to any service.
   */
  const exportedAt = new Date();
  const zip = new JSZip();

  zip.file(
    MARKDOWN_FILENAME,
    generateMeetingMarkdown({
      language: options.language,
      createdAt: exportedAt,
      screenshots: options.screenshots,
      segments: options.segments,
      meetingNotes: options.meetingNotes,
    }),
  );
  zip.file(
    TRANSCRIPT_FILENAME,
    generateTranscriptTxt({
      language: options.language,
      createdAt: exportedAt,
      screenshots: options.screenshots,
      segments: options.segments,
    }),
  );
  zip.file(
    "manifest.json",
    JSON.stringify(
      buildExportManifest({
        exportedAt,
        language: options.language,
        audioBlob: options.audioBlob,
        screenshots: options.screenshots,
        segments: options.segments,
      }),
      null,
      2,
    ),
  );

  if (options.audioBlob) {
    zip.file(AUDIO_FILENAME, options.audioBlob);
  }

  if (options.screenshots.length) {
    const folder = zip.folder("screenshots");
    for (const screenshot of options.screenshots) {
      folder?.file(screenshot.filename, screenshot.blob);
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  return {
    blob,
    filename: `meeting-export-${formatTimestampForFile(exportedAt)}.zip`,
  };
}
