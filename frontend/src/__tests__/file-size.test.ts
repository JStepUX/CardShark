/**
 * Monolith detector — flags source files exceeding 1000 lines.
 *
 * Large files are harder to maintain, test, and review. This test
 * passes for grandfathered files in the allowlist but fails if any
 * NEW file crosses the threshold or an allowlisted file grows further.
 *
 * When you split an allowlisted file below the limit, remove it from
 * the allowlist — the test will remind you if you forget.
 */

import fs from 'fs'
import path from 'path'

const MAX_LINES = 1000

/** Scan all source subdirectories */
const SCAN_DIRS = [
  'src/components',
  'src/hooks',
  'src/views',
  'src/contexts',
  'src/utils',
  'src/services',
  'src/types',
  'src/api',
  'src/handlers',
]

/** Also scan root-level src/*.ts(x) files */
const SCAN_ROOT_FILES = true

const IGNORE_PATTERNS = [
  /\.test\./,
  /\.spec\./,
  /setupTests/,
  /test-utils/,
  /mockFactory/,
  /\.d\.ts$/,
  /__tests__\//,
]

/**
 * Grandfathered files that already exceed the limit.
 * Each entry records the known line count at the time of allowlisting.
 * The test will FAIL if an allowlisted file grows beyond its recorded size,
 * preventing monoliths from silently getting worse.
 */
const ALLOWLIST: Record<string, number> = {
  'services/combat/gridCombatEngine.ts': 1283,
  'components/world/pixi/local/LocalMapView.tsx': 1160,
  'components/world/pixi/local/LocalMapStage.ts': 1094,
  'components/character/CharacterGallery.tsx': 1075,
  'services/chatStorage.ts': 1012,
}

/** Tolerance — allowlisted files can grow by this many lines before failing */
const ALLOWLIST_HEADROOM = 20

function getSrcRoot(): string {
  const fromCwd = path.join(process.cwd(), 'src')
  if (fs.existsSync(fromCwd)) return fromCwd
  return path.resolve(__dirname, '..')
}

function collectFiles(dir: string, result: string[]): void {
  if (!fs.existsSync(dir)) return
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      collectFiles(full, result)
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      result.push(full)
    }
  }
}

function getSourceFiles(): string[] {
  const srcRoot = getSrcRoot()
  const files: string[] = []

  for (const dir of SCAN_DIRS) {
    const stripped = dir.startsWith('src/') ? dir.slice(4) : dir
    collectFiles(path.join(srcRoot, stripped), files)
  }

  if (SCAN_ROOT_FILES) {
    const rootEntries = fs.readdirSync(srcRoot, { withFileTypes: true })
    for (const entry of rootEntries) {
      if (!entry.isDirectory() && /\.(ts|tsx)$/.test(entry.name)) {
        files.push(path.join(srcRoot, entry.name))
      }
    }
  }

  return files.filter((f) => {
    const rel = path.relative(srcRoot, f).replace(/\\/g, '/')
    return !IGNORE_PATTERNS.some((p) => p.test(rel))
  })
}

function countLines(filePath: string): number {
  const content = fs.readFileSync(filePath, 'utf-8')
  return content.split('\n').length
}

function normalizeRel(rel: string): string {
  return rel.replace(/\\/g, '/')
}

describe('file size limits', () => {
  it(`no source file exceeds ${MAX_LINES} lines (excluding allowlisted)`, () => {
    const files = getSourceFiles()
    expect(files.length).toBeGreaterThan(0)

    const srcRoot = getSrcRoot()
    const violations: string[] = []

    for (const file of files) {
      const lines = countLines(file)
      const rel = normalizeRel(path.relative(srcRoot, file))

      if (rel in ALLOWLIST) {
        const ceiling = ALLOWLIST[rel] + ALLOWLIST_HEADROOM
        if (lines > ceiling) {
          violations.push(
            `  ${rel} — ${lines} lines (allowlisted at ${ALLOWLIST[rel]}, ceiling ${ceiling})  ← GREW`,
          )
        }
        continue
      }

      if (lines > MAX_LINES) {
        violations.push(`  ${rel} — ${lines} lines`)
      }
    }

    violations.sort()

    if (violations.length > 0) {
      fail(
        `${violations.length} file(s) exceed ${MAX_LINES} lines:\n${violations.join('\n')}\n\nIf this is a pre-existing file, add it to the ALLOWLIST in file-size.test.ts.`,
      )
    }
  })

  it('allowlisted files still exist (clean up the list when files are split)', () => {
    const srcRoot = getSrcRoot()
    const stale: string[] = []

    for (const rel of Object.keys(ALLOWLIST)) {
      const full = path.join(srcRoot, rel)
      if (!fs.existsSync(full)) {
        stale.push(rel)
      }
    }

    if (stale.length > 0) {
      fail(
        `These allowlisted files no longer exist — remove them from ALLOWLIST:\n${stale.join('\n')}`,
      )
    }
  })

  it('allowlisted files that dropped below the limit should be removed from the list', () => {
    const srcRoot = getSrcRoot()
    const graduated: string[] = []

    for (const [rel] of Object.entries(ALLOWLIST)) {
      const full = path.join(srcRoot, rel)
      if (!fs.existsSync(full)) continue
      const lines = countLines(full)
      if (lines <= MAX_LINES) {
        graduated.push(`  ${rel} — now ${lines} lines (limit is ${MAX_LINES})`)
      }
    }

    if (graduated.length > 0) {
      fail(
        `These files are now under the limit — remove them from ALLOWLIST:\n${graduated.join('\n')}`,
      )
    }
  })
})
