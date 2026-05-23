import type { LanguageOption, ScreenshotItem, TranscriptSegment } from "../types";
import { formatDateTime, formatScreenshotTime, formatSegmentTime } from "./time";

export const AUDIO_FILENAME = "mixed-audio.webm";
export const MARKDOWN_FILENAME = "meeting-notes.md";
export const TRANSCRIPT_FILENAME = "transcript.txt";

type ExportTextOptions = {
  language: LanguageOption;
  createdAt: Date;
  screenshots: ScreenshotItem[];
  segments: TranscriptSegment[];
};

export function generateTranscriptTxt(options: ExportTextOptions): string {
  const lines = [
    "Transcript",
    `Created: ${formatDateTime(options.createdAt)}`,
    `Language: ${options.language}`,
    "",
    "Screenshots:",
  ];

  if (options.screenshots.length) {
    for (const screenshot of options.screenshots) {
      lines.push(
        `[${formatScreenshotTime(screenshot.recordingTime)}] screenshots/${screenshot.filename}`,
      );
    }
  } else {
    lines.push("None");
  }

  lines.push("", "Transcript:");
  if (options.segments.length) {
    for (const segment of options.segments) {
      lines.push(
        `[${formatSegmentTime(segment.startTime)} - ${formatSegmentTime(segment.endTime)}] ${segment.speaker} / ${segment.source}`,
        segment.text || "(empty)",
        "",
      );
    }
  } else {
    lines.push("(empty)");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function generateMeetingMarkdown(options: ExportTextOptions): string {
  const lines = [
    "# Meeting Notes",
    "",
    `Language: ${options.language}`,
    `Created: ${formatDateTime(options.createdAt)}`,
    "",
    "## Summary",
    "",
    "_To be filled manually._",
    "",
    "## Action Items",
    "",
    "- [ ] _To be filled manually._",
    "",
    "## Screenshots",
    "",
    "| Time | File |",
    "|---|---|",
  ];

  if (options.screenshots.length) {
    for (const screenshot of options.screenshots) {
      lines.push(
        `| ${formatScreenshotTime(screenshot.recordingTime)} | screenshots/${screenshot.filename} |`,
      );
    }
  } else {
    lines.push("| - | None |");
  }

  lines.push("", "## Transcript", "");

  if (options.segments.length) {
    for (const segment of options.segments) {
      lines.push(
        `### ${formatSegmentTime(segment.startTime)} - ${formatSegmentTime(segment.endTime)} | ${segment.speaker} / ${segment.source}`,
        "",
        segment.text || "_Empty segment._",
        "",
      );
    }
  } else {
    lines.push("_No transcript segments yet._", "");
  }

  return lines.join("\n");
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(text: string, filename: string, type: string): void {
  downloadBlob(new Blob([text], { type }), filename);
}
