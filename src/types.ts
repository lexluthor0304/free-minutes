export type Speaker = "User" | "Screen" | "Mixed" | "Unknown";

export type AudioSource = "mic" | "screen" | "mixed" | "unknown";

export type TranscriptSegment = {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  speaker: Speaker;
  source: AudioSource;
};

export type ScreenshotItem = {
  id: string;
  createdAt: string;
  recordingTime: number;
  filename: string;
  blob: Blob;
  blobUrl: string;
};

export type ExportManifest = {
  appName: string;
  exportedAt: string;
  language: string;
  audioFilename: string | null;
  markdownFilename: string;
  transcriptFilename: string;
  screenshots: Array<{
    filename: string;
    createdAt: string;
    recordingTime: number;
  }>;
  segments: Array<{
    id: string;
    startTime: number;
    endTime: number;
    speaker: Speaker;
    source: AudioSource;
  }>;
};

export type LanguageOption = "Auto" | "Japanese" | "English";

export type VolumeSample = {
  time: number;
  micVolume: number;
  screenVolume: number;
  mixedVolume: number;
};

export type VolumeThresholds = {
  micThreshold: number;
  screenThreshold: number;
  silenceThreshold: number;
  silenceDuration: number;
};

export type SpeakerInference = {
  speaker: Speaker;
  source: AudioSource;
  micAverage: number;
  screenAverage: number;
};
