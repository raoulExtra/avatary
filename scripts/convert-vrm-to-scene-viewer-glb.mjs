import { Buffer } from 'node:buffer'
import { log } from 'node:console'
import { readFile, writeFile } from 'node:fs/promises'
import { argv } from 'node:process'

const source = argv[2] ?? 'public/avatar.vrm'
const destination = argv[3] ?? 'public/avatar.glb'
const input = await readFile(source)

if (input.toString('ascii', 0, 4) !== 'glTF') {
  throw new Error(`${source} is not a GLB file`)
}

const jsonLength = input.readUInt32LE(12)
const jsonStart = 20
const json = JSON.parse(input.subarray(jsonStart, jsonStart + jsonLength).toString('utf8'))

function removeVrmExtensions(value) {
  if (Array.isArray(value)) {
    value.forEach(removeVrmExtensions)
    return
  }
  if (!value || typeof value !== 'object') return

  if (value.extensions && typeof value.extensions === 'object') {
    for (const key of Object.keys(value.extensions)) {
      if (key.startsWith('VRM')) delete value.extensions[key]
    }
    if (Object.keys(value.extensions).length === 0) delete value.extensions
  }

  for (const key of ['extensionsUsed', 'extensionsRequired']) {
    if (Array.isArray(value[key])) {
      value[key] = value[key].filter((extension) => !extension.startsWith('VRM'))
      if (value[key].length === 0) delete value[key]
    }
  }

  Object.values(value).forEach(removeVrmExtensions)
}

removeVrmExtensions(json)

const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8')
const paddedJsonLength = (jsonBytes.length + 3) & ~3
const paddedJson = Buffer.concat([jsonBytes, Buffer.alloc(paddedJsonLength - jsonBytes.length, 0x20)])
const binaryChunk = input.subarray(jsonStart + jsonLength + 8)
const totalLength = 12 + 8 + paddedJson.length + 8 + binaryChunk.length

const output = Buffer.alloc(totalLength)
output.write('glTF', 0, 4, 'ascii')
output.writeUInt32LE(2, 4)
output.writeUInt32LE(totalLength, 8)
output.writeUInt32LE(paddedJson.length, 12)
output.writeUInt32LE(0x4e4f534a, 16)
paddedJson.copy(output, 20)
const binaryHeader = 20 + paddedJson.length
output.writeUInt32LE(binaryChunk.length, binaryHeader)
output.writeUInt32LE(0x004e4942, binaryHeader + 4)
binaryChunk.copy(output, binaryHeader + 8)

await writeFile(destination, output)
log(`Wrote ${destination} (${output.length} bytes)`)
