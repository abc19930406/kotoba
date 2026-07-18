// kuroshiro and kuroshiro-analyzer-kuromoji ship no types. These describe
// only the surface this pipeline actually uses, and deliberately match the
// runtime shape observed under this project's tsx/esbuild CJS interop —
// confirmed empirically, and asymmetric between the two packages:
// - 'kuroshiro' sets `exports.default` + `__esModule`, so the default
//   import is the whole CJS exports object, with the real class at `.default`.
// - 'kuroshiro-analyzer-kuromoji' does a plain `module.exports = Analyzer`,
//   so its default import IS the class directly, no unwrap needed.

declare module 'kuroshiro' {
  export interface KuroshiroAnalyzer {
    init(): Promise<void>
    parse(text: string): Promise<unknown>
  }

  export interface KuroshiroConvertOptions {
    mode?: 'normal' | 'spaced' | 'okurigana' | 'furigana'
    to?: 'hiragana' | 'katakana' | 'romaji'
  }

  export class KuroshiroInstance {
    init(analyzer: KuroshiroAnalyzer): Promise<void>
    convert(str: string, options?: KuroshiroConvertOptions): Promise<string>
  }

  interface KuroshiroCjsExports {
    default: typeof KuroshiroInstance
  }

  const kuroshiroCjsExports: KuroshiroCjsExports
  export default kuroshiroCjsExports
}

declare module 'kuroshiro-analyzer-kuromoji' {
  import type { KuroshiroAnalyzer } from 'kuroshiro'

  // Unlike 'kuroshiro', this package's CJS export is `module.exports = Analyzer`
  // directly (no __esModule marker) — confirmed empirically — so the default
  // import IS the class itself, no `.default` unwrap needed.
  export default class KuromojiAnalyzerInstance implements KuroshiroAnalyzer {
    constructor(options?: { dictPath?: string })
    init(): Promise<void>
    parse(text: string): Promise<unknown>
  }
}
