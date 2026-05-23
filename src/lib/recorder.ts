export class LocalAudioRecorder {
  private readonly recorder: MediaRecorder;
  private readonly chunks: BlobPart[] = [];
  private stopPromise: Promise<Blob> | null = null;

  constructor(stream: MediaStream, onError: (message: string) => void) {
    if (!("MediaRecorder" in window)) {
      throw new Error("This browser does not support MediaRecorder.");
    }

    const mimeType = getPreferredAudioMimeType();
    this.recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };
    this.recorder.onerror = (event) => {
      onError(`MediaRecorder error: ${event.error?.message ?? "Unknown recorder error"}`);
    };
  }

  start(): void {
    if (this.recorder.state === "inactive") {
      this.recorder.start(1000);
    }
  }

  stop(): Promise<Blob> {
    if (this.stopPromise) {
      return this.stopPromise;
    }

    this.stopPromise = new Promise<Blob>((resolve) => {
      this.recorder.onstop = () => {
        const type = this.recorder.mimeType || "audio/webm";
        resolve(new Blob(this.chunks, { type }));
      };

      if (this.recorder.state === "inactive") {
        this.recorder.onstop?.(new Event("stop"));
      } else {
        this.recorder.stop();
      }
    });

    return this.stopPromise;
  }
}

function getPreferredAudioMimeType(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}
