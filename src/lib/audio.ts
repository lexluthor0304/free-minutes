export type MixedAudioGraph = {
  audioContext: AudioContext;
  mixedStream: MediaStream;
  cleanup: () => void;
};

export async function requestMicrophoneMedia(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser does not support getUserMedia for microphone capture.");
  }

  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    throw new Error(`Microphone permission was denied or failed: ${describeError(error)}`);
  }
}

export async function requestDisplayMedia(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("This browser does not support getDisplayMedia for tab/window/screen capture.");
  }

  try {
    /*
     * Ordinary web pages cannot use chrome.tabCapture, chrome.tabs.captureVisibleTab,
     * or silently choose a tab. Chrome must show its native chooser, and the user must
     * manually select a Chrome Tab, Window, or Screen. Tab audio is only present when
     * the user enables "Share tab audio" in that chooser.
     */
    return await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });
  } catch (error) {
    throw new Error(`Display sharing permission was denied or failed: ${describeError(error)}`);
  }
}

export function createMixedAudioStream(
  audioContext: AudioContext,
  micStream: MediaStream | null,
  displayStream: MediaStream | null,
): MixedAudioGraph {
  const destination = audioContext.createMediaStreamDestination();
  const nodes: AudioNode[] = [];

  if (micStream?.getAudioTracks().length) {
    const micSource = audioContext.createMediaStreamSource(micStream);
    micSource.connect(destination);
    nodes.push(micSource);
  }

  if (displayStream?.getAudioTracks().length) {
    const displaySource = audioContext.createMediaStreamSource(displayStream);
    displaySource.connect(destination);
    nodes.push(displaySource);
  }

  return {
    audioContext,
    mixedStream: destination.stream,
    cleanup: () => {
      for (const node of nodes) {
        try {
          node.disconnect();
        } catch {
          // The node may already be disconnected during teardown.
        }
      }
      try {
        destination.disconnect();
      } catch {
        // MediaStreamAudioDestinationNode may already be disconnected.
      }
    },
  };
}

export function stopMediaStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
