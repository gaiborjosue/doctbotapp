const TARGET_SAMPLE_RATE = 16_000
const CHUNK_SAMPLE_COUNT = TARGET_SAMPLE_RATE

class DocBotPcmRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.chunk = new Int16Array(CHUNK_SAMPLE_COUNT)
    this.chunkOffset = 0
    this.inputCount = 0
    this.inputSum = 0
    this.phase = 0
    this.recording = true

    this.port.onmessage = ({ data }) => {
      if (data?.type === "pause") {
        this.recording = false
      } else if (data?.type === "resume") {
        this.recording = true
      } else if (data?.type === "flush") {
        this.flushPendingSample()
        this.emitChunk()
        this.port.postMessage({ type: "flushed" })
      }
    }
  }

  writeSample(sample) {
    const clamped = Math.max(-1, Math.min(1, sample))
    this.chunk[this.chunkOffset] =
      clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff)
    this.chunkOffset += 1

    if (this.chunkOffset === this.chunk.length) this.emitChunk()
  }

  flushPendingSample() {
    if (this.inputCount === 0) return
    this.writeSample(this.inputSum / this.inputCount)
    this.inputCount = 0
    this.inputSum = 0
  }

  emitChunk() {
    if (this.chunkOffset === 0) return

    const samples = this.chunk.slice(0, this.chunkOffset)
    this.port.postMessage(
      { buffer: samples.buffer, sampleCount: samples.length, type: "chunk" },
      [samples.buffer]
    )
    this.chunkOffset = 0
  }

  process(inputs) {
    if (!this.recording) return true

    const input = inputs[0]?.[0]
    if (!input) return true

    for (const sample of input) {
      this.inputSum += sample
      this.inputCount += 1
      this.phase += TARGET_SAMPLE_RATE

      if (this.phase >= sampleRate) {
        this.writeSample(this.inputSum / this.inputCount)
        this.phase -= sampleRate
        this.inputCount = 0
        this.inputSum = 0
      }
    }

    return true
  }
}

registerProcessor("docbot-pcm-recorder", DocBotPcmRecorderProcessor)
