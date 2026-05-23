export type PcmChunk = {
  audioData: Float32Array;
  sampleRate: number;
  duration: number;
};

export type PcmCapture = {
  consume: () => PcmChunk | null;
  stop: () => void;
};

export async function createPcmCapture(
  audioContext: AudioContext,
  stream: MediaStream,
): Promise<PcmCapture | null> {
  if (!stream.getAudioTracks().length) {
    return null;
  }

  if ("audioWorklet" in audioContext) {
    try {
      return await createAudioWorkletPcmCapture(audioContext, stream);
    } catch {
      // AudioWorklet is the modern Chrome path. Keep a fallback so recording still works
      // if a browser blocks dynamic worklet module registration.
    }
  }

  return createScriptProcessorPcmCapture(audioContext, stream);
}

async function createAudioWorkletPcmCapture(
  audioContext: AudioContext,
  stream: MediaStream,
): Promise<PcmCapture> {
  const workletUrl = URL.createObjectURL(
    new Blob(
      [
        `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (input && input.length) {
      const copy = new Float32Array(input.length);
      copy.set(input);
      this.port.postMessage(copy, [copy.buffer]);
    }
    return true;
  }
}

registerProcessor("pcm-capture-processor", PcmCaptureProcessor);
`,
      ],
      { type: "text/javascript" },
    ),
  );

  try {
    await audioContext.audioWorklet.addModule(workletUrl);
  } finally {
    URL.revokeObjectURL(workletUrl);
  }

  const source = audioContext.createMediaStreamSource(stream);
  const worklet = new AudioWorkletNode(audioContext, "pcm-capture-processor");
  const silentOutput = audioContext.createGain();
  silentOutput.gain.value = 0;

  let buffers: Float32Array[] = [];
  let sampleCount = 0;
  let stopped = false;

  worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
    if (stopped) {
      return;
    }

    const input = event.data;
    if (!input?.length) {
      return;
    }
    const copy = new Float32Array(input.length);
    copy.set(input);
    buffers.push(copy);
    sampleCount += copy.length;
  };

  source.connect(worklet);
  worklet.connect(silentOutput);
  silentOutput.connect(audioContext.destination);

  return {
    consume: () => consumeBuffers(buffers, sampleCount, audioContext.sampleRate, (nextBuffers, nextSampleCount) => {
      buffers = nextBuffers;
      sampleCount = nextSampleCount;
    }),
    stop: () => {
      stopped = true;
      buffers = [];
      sampleCount = 0;
      worklet.port.onmessage = null;
      worklet.port.close();
      disconnectNode(source);
      disconnectNode(worklet);
      disconnectNode(silentOutput);
    },
  };
}

function createScriptProcessorPcmCapture(
  audioContext: AudioContext,
  stream: MediaStream,
): PcmCapture {
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const silentOutput = audioContext.createGain();
  silentOutput.gain.value = 0;

  let buffers: Float32Array[] = [];
  let sampleCount = 0;
  let stopped = false;

  processor.onaudioprocess = (event) => {
    if (stopped) {
      return;
    }

    const input = event.inputBuffer.getChannelData(0);
    const copy = new Float32Array(input.length);
    copy.set(input);
    buffers.push(copy);
    sampleCount += copy.length;
  };

  source.connect(processor);
  processor.connect(silentOutput);
  silentOutput.connect(audioContext.destination);

  return {
    consume: () => {
      return consumeBuffers(buffers, sampleCount, audioContext.sampleRate, (nextBuffers, nextSampleCount) => {
        buffers = nextBuffers;
        sampleCount = nextSampleCount;
      });
    },
    stop: () => {
      stopped = true;
      buffers = [];
      sampleCount = 0;
      processor.onaudioprocess = null;

      disconnectNode(source);
      disconnectNode(processor);
      disconnectNode(silentOutput);
    },
  };
}

function consumeBuffers(
  buffers: Float32Array[],
  sampleCount: number,
  sampleRate: number,
  reset: (buffers: Float32Array[], sampleCount: number) => void,
): PcmChunk | null {
  if (sampleCount === 0) {
    return null;
  }

  const audioData = new Float32Array(sampleCount);
  let offset = 0;
  for (const buffer of buffers) {
    audioData.set(buffer, offset);
    offset += buffer.length;
  }

  reset([], 0);

  return {
    audioData,
    sampleRate,
    duration: audioData.length / sampleRate,
  };
}

function disconnectNode(node: AudioNode): void {
  try {
    node.disconnect();
  } catch {
    // Already disconnected.
  }
}
