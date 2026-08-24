import { copyFile, mkdir } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const outputDirectory = join(projectRoot, "public", "vad")
const vadRoot = dirname(dirname(require.resolve("@ricky0123/vad-web")))
const ortRoot = dirname(dirname(require.resolve("onnxruntime-web")))

const assets = [
  [join(vadRoot, "dist", "silero_vad_v5.onnx"), "silero_vad_v5.onnx"],
  [
    join(vadRoot, "dist", "vad.worklet.bundle.min.js"),
    "vad.worklet.bundle.min.js",
  ],
  [
    join(ortRoot, "dist", "ort-wasm-simd-threaded.mjs"),
    "ort-wasm-simd-threaded.mjs",
  ],
  [
    join(ortRoot, "dist", "ort-wasm-simd-threaded.wasm"),
    "ort-wasm-simd-threaded.wasm",
  ],
]

await mkdir(outputDirectory, { recursive: true })
await Promise.all(
  assets.map(([source, filename]) =>
    copyFile(source, join(outputDirectory, filename))
  )
)
