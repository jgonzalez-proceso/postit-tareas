// Genera los PNG de la PWA y de la extensión a partir de public/icon.svg
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'public', 'icon.svg')
const ext = join(root, '..', 'extension', 'icons')
await mkdir(ext, { recursive: true })

const targets = [
  [join(root, 'public', 'icon-180.png'), 180],
  [join(root, 'public', 'icon-192.png'), 192],
  [join(root, 'public', 'icon-512.png'), 512],
  [join(ext, 'icon-16.png'), 16],
  [join(ext, 'icon-48.png'), 48],
  [join(ext, 'icon-128.png'), 128],
]

for (const [file, size] of targets) {
  await sharp(src, { density: 300 }).resize(size, size).png().toFile(file)
  console.log(file)
}
