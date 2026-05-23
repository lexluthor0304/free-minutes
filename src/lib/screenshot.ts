import type { ScreenshotItem } from "../types";
import { formatTimestampForFile } from "./time";

export async function captureScreenshotFromDisplayStream(
  displayStream: MediaStream,
  recordingTime: number,
): Promise<ScreenshotItem> {
  const videoTrack = displayStream.getVideoTracks()[0];
  if (!videoTrack) {
    throw new Error("No shared video track is available. Screenshot capture is disabled.");
  }

  /*
   * A normal web page cannot silently screenshot arbitrary pages or tabs. The
   * frame drawn here comes only from the MediaStream that the user explicitly
   * selected through getDisplayMedia in Chrome's native picker.
   */
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = displayStream;

  try {
    await waitForVideoMetadata(video);
    await video.play();
    await waitForNextFrame(video);

    const settings = videoTrack.getSettings();
    const width = video.videoWidth || settings.width || 1280;
    const height = video.videoHeight || settings.height || 720;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D context could not be created.");
    }

    context.drawImage(video, 0, 0, width, height);
    const blob = await canvasToPngBlob(canvas);
    const createdAt = new Date();
    const filename = `screenshot-${formatTimestampForFile(createdAt)}.png`;

    return {
      id: crypto.randomUUID(),
      createdAt: createdAt.toISOString(),
      recordingTime,
      filename,
      blob,
      blobUrl: URL.createObjectURL(blob),
    };
  } finally {
    video.pause();
    video.srcObject = null;
  }
}

function waitForVideoMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Shared video metadata could not be loaded."));
  });
}

function waitForNextFrame(video: HTMLVideoElement): Promise<void> {
  if ("requestVideoFrameCallback" in video) {
    return new Promise((resolve) => {
      video.requestVideoFrameCallback(() => resolve());
    });
  }

  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Screenshot PNG blob could not be created."));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}
