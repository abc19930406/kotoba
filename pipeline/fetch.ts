import { execFile } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const RAW_DIR = path.resolve(import.meta.dirname, 'raw')
const VOCAB_DIR = path.join(RAW_DIR, 'vocab')
const TATOEBA_DIR = path.join(RAW_DIR, 'tatoeba')
const JMDICT_DIR = path.join(RAW_DIR, 'jmdict')
const GRAMMAR_DIR = path.join(RAW_DIR, 'grammar')

const LEVELS = ['n1', 'n2', 'n3', 'n4', 'n5'] as const

export const RAW_PATHS = {
  vocabCsv: (level: (typeof LEVELS)[number]) => path.join(VOCAB_DIR, `${level}.csv`),
  tatoebaJson: path.join(TATOEBA_DIR, 'jpn-eng-examples.json'),
  jmdictJson: path.join(JMDICT_DIR, 'jmdict-eng.json'),
  grammarJson: (level: (typeof LEVELS)[number]) => path.join(GRAMMAR_DIR, `${level}.json`),
  sourceVersions: path.join(RAW_DIR, 'source-versions.json'),
}

async function downloadText(url: string, destPath: string, force: boolean): Promise<void> {
  if (!force && existsSync(destPath)) {
    console.log(`  skip (exists): ${path.relative(RAW_DIR, destPath)}`)
    return
  }
  console.log(`  fetching ${url}`)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`)
  }
  await mkdir(path.dirname(destPath), { recursive: true })
  await writeFile(destPath, await res.text(), 'utf-8')
}

interface GithubReleaseAsset {
  name: string
  browser_download_url: string
}
interface GithubRelease {
  tag_name: string
  assets: GithubReleaseAsset[]
}

async function fetchLatestRelease(repo: string): Promise<GithubRelease> {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`)
  if (!res.ok) {
    throw new Error(`Failed to fetch latest release for ${repo}: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as GithubRelease
}

async function fetchVocab(force: boolean): Promise<void> {
  console.log('fetch: JLPT vocab CSVs (jamsinclair/open-anki-jlpt-decks)')
  for (const level of LEVELS) {
    const url = `https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/main/src/${level}.csv`
    await downloadText(url, RAW_PATHS.vocabCsv(level), force)
  }
}

async function fetchTatoeba(force: boolean): Promise<string> {
  console.log('fetch: Japanese-English example sentences (mwhirls/tatoeba-json)')
  if (!force && existsSync(RAW_PATHS.tatoebaJson)) {
    console.log(`  skip (exists): ${path.relative(RAW_DIR, RAW_PATHS.tatoebaJson)}`)
    return await readCachedVersion('tatoebaRelease')
  }
  const release = await fetchLatestRelease('mwhirls/tatoeba-json')
  const asset = release.assets.find((a) => a.name.endsWith('.zip'))
  if (!asset) {
    throw new Error('tatoeba-json latest release has no .zip asset')
  }
  await mkdir(TATOEBA_DIR, { recursive: true })
  await downloadAndUnzipInto(asset.browser_download_url, TATOEBA_DIR)
  return release.tag_name
}

async function fetchJmdict(force: boolean): Promise<string> {
  console.log('fetch: dictionary supplement (scriptin/jmdict-simplified)')
  if (!force && existsSync(RAW_PATHS.jmdictJson)) {
    console.log(`  skip (exists): ${path.relative(RAW_DIR, RAW_PATHS.jmdictJson)}`)
    return await readCachedVersion('jmdictVersion')
  }
  const release = await fetchLatestRelease('scriptin/jmdict-simplified')
  const asset = release.assets.find(
    (a) => /^jmdict-eng-.*\.json\.zip$/.test(a.name) && !a.name.includes('common'),
  )
  if (!asset) {
    throw new Error('jmdict-simplified latest release has no matching jmdict-eng-*.json.zip asset')
  }
  await mkdir(JMDICT_DIR, { recursive: true })
  await downloadAndUnzipInto(asset.browser_download_url, JMDICT_DIR, RAW_PATHS.jmdictJson)
  return release.tag_name
}

async function downloadAndUnzipInto(
  url: string,
  destDir: string,
  renameExtractedTo?: string,
): Promise<void> {
  console.log(`  fetching ${url}`)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`)
  }
  await mkdir(destDir, { recursive: true })
  const zipPath = path.join(destDir, '_download.zip.tmp')
  await writeFile(zipPath, Buffer.from(await res.arrayBuffer()))
  try {
    const listing = await execFileAsync('unzip', ['-Z1', zipPath])
    const entries = listing.stdout.trim().split('\n').filter(Boolean)
    await execFileAsync('unzip', ['-o', zipPath, '-d', destDir])
    if (renameExtractedTo && entries.length === 1) {
      const extractedPath = path.join(destDir, entries[0])
      if (extractedPath !== renameExtractedTo) {
        const { rename } = await import('node:fs/promises')
        await rename(extractedPath, renameExtractedTo)
      }
    }
  } finally {
    await rm(zipPath, { force: true })
  }
}

async function fetchGrammar(force: boolean): Promise<void> {
  console.log('fetch: grammar content (tristcoil/hanabira.org-japanese-content)')
  for (const level of LEVELS) {
    const upper = level.toUpperCase()
    const url = `https://raw.githubusercontent.com/tristcoil/hanabira.org-japanese-content/main/grammar_json/grammar_ja_${upper}_full_alphabetical_0001.json`
    await downloadText(url, RAW_PATHS.grammarJson(level), force)
  }
}

async function readCachedVersion(key: 'tatoebaRelease' | 'jmdictVersion'): Promise<string> {
  if (!existsSync(RAW_PATHS.sourceVersions)) return 'unknown'
  const { readFile } = await import('node:fs/promises')
  const raw = JSON.parse(await readFile(RAW_PATHS.sourceVersions, 'utf-8')) as Record<string, string>
  return raw[key] ?? 'unknown'
}

export async function fetchAll(force: boolean): Promise<{ tatoebaRelease: string; jmdictVersion: string }> {
  await mkdir(RAW_DIR, { recursive: true })
  await fetchVocab(force)
  const tatoebaRelease = await fetchTatoeba(force)
  const jmdictVersion = await fetchJmdict(force)
  await fetchGrammar(force)

  const versions = { tatoebaRelease, jmdictVersion }
  await writeFile(RAW_PATHS.sourceVersions, JSON.stringify(versions, null, 2), 'utf-8')
  return versions
}

async function main() {
  const force = process.argv.includes('--force')
  console.log(force ? 'Fetching raw data (--force: re-downloading everything)...' : 'Fetching raw data...')
  const versions = await fetchAll(force)
  console.log('Done.')
  console.log(`  tatoeba-json release: ${versions.tatoebaRelease}`)
  console.log(`  jmdict-simplified version: ${versions.jmdictVersion}`)
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
