// Neon Harbor — main.ts
// The entrypoint the bounty runs. It hands the game in: it copies game/ and
// screenshots/ from this repository into the output directory and writes
// /output/dossier.json with buildDossier from vendor/makefun-game.ts.
//
// Run it outside the grader with MAKEFUN_OUTPUT_DIR standing in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Node 22, standard library only, no build step, no network. The output is
// deterministic: the same repository writes the same bytes every run, because
// nothing here stamps a time, a random value, or a machine-specific path
// into what it copies or writes.

import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// ------------------------------------------------------------------ caps
// These are the bounty's own caps, from its gate: the dossier text cap, the
// screenshot count and byte caps, and the game tree caps. Passing them here
// makes this program fail exactly where the scorer would fail it.

const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
} as const;

const SCREENSHOT_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);
const MAX_SCREENSHOT_BYTES = 262144;

// ------------------------------------------------------------------ paths

// The repository root is the directory holding this file, wherever the
// repository was cloned to. Nothing here assumes a fixed location.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)));

function outputDir(): string {
  const fromEnv = process.env.MAKEFUN_OUTPUT_DIR;
  if (fromEnv !== undefined && fromEnv !== '') return resolve(fromEnv);
  return '/output';
}

// ------------------------------------------------------------------ helpers

const sha256Hex = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

// The screenshots this entry hands in: image files in screenshots/, in
// name order, the first by name being the cover. Anything else in that
// directory (notes, manifests) is refused here, before buildDossier sees it,
// so a stray file fails loudly instead of silently changing the dossier.
function listScreenshots(repoRoot: string): string[] {
  const dir = join(repoRoot, 'screenshots');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error('screenshots/: no such directory: the entry hands in 3 or 4 screenshots');
  }
  const names = readdirSync(dir)
    .filter((name) => !name.startsWith('.'))
    .sort();
  const images = names.filter((name) => {
    const dot = name.lastIndexOf('.');
    const ext = dot < 0 ? '' : name.slice(dot).toLowerCase();
    return SCREENSHOT_EXTENSIONS.has(ext);
  });
  if (images.length < 3 || images.length > 4) {
    throw new Error(
      `screenshots/: holds ${images.length} images, the bounty wants 3 or 4`,
    );
  }
  for (const name of images) {
    const bytes = statSync(join(dir, name)).size;
    if (bytes > MAX_SCREENSHOT_BYTES) {
      throw new Error(
        `screenshots/${name}: ${bytes} bytes, over the ${MAX_SCREENSHOT_BYTES} allowed`,
      );
    }
  }
  return images;
}

// Count the files and bytes under a directory, recursively, for the summary.
function countTree(dir: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  const walk = (at: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) {
        files += 1;
        bytes += statSync(path).size;
      }
    }
  };
  walk(dir);
  return { files, bytes };
}

// ------------------------------------------------------------------ hand-in

function handIn(repoRoot: string, outDir: string): void {
  // Start from an empty output directory, so a stale file from an earlier
  // run can never ride along into the dossier.
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const shots = listScreenshots(repoRoot);
  cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
  mkdirSync(join(outDir, 'screenshots'), { recursive: true });
  for (const name of shots) {
    cpSync(join(repoRoot, 'screenshots', name), join(outDir, 'screenshots', name));
  }

  // The dossier is built from the output directory itself, not from the
  // repository, so what the scorer reads is exactly what was handed in.
  const dossier = buildDossier(outDir, DOSSIER_CAPS);
  const dossierPath = join(outDir, 'dossier.json');
  writeFileSync(dossierPath, dossier);

  const game = countTree(join(outDir, 'game'));
  const lines = [
    `Neon Harbor handed in to ${outDir}`,
    `  game/: ${game.files} files, ${game.bytes} bytes`,
    `  screenshots/: ${shots.join(', ')}`,
    `  dossier.json: ${dossier.length} bytes, sha256 ${sha256Hex(dossier)}`,
  ];
  for (const line of lines) console.log(line);
}

// ------------------------------------------------------------------ main

try {
  const outDir = outputDir();
  handIn(REPO_ROOT, outDir);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`main.ts: ${message}`);
  process.exit(1);
}
