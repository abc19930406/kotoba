/**
 * Display labels for the JMdict part-of-speech codes actually present in
 * our vocab data (see pipeline/jmdict.ts — codes are stored raw, unprettified,
 * by design; this is the UI-layer lookup that was deferred to this phase).
 * Codes not in this map fall back to showing the raw code itself.
 */
export const POS_LABELS: Record<string, string> = {
  n: '名詞',
  'n-suf': '接尾名詞',
  'n-pref': '接頭名詞',
  vt: '他動詞',
  vi: '自動詞',
  vs: 'サ變動詞',
  'vs-s': 'サ變動詞(特殊)',
  'vs-i': 'サ變動詞(不規則)',
  v1: '一段動詞',
  v5r: '五段動詞(ら)',
  'v5r-i': '五段動詞(ら/特殊)',
  v5s: '五段動詞(す)',
  v5k: '五段動詞(く)',
  v5m: '五段動詞(む)',
  v5u: '五段動詞(う)',
  'v5u-s': '五段動詞(う/特殊)',
  v5g: '五段動詞(ぐ)',
  v5t: '五段動詞(つ)',
  v5b: '五段動詞(ぶ)',
  v5n: '五段動詞(ぬ)',
  vz: '一段動詞(ずる)',
  vk: 'カ變動詞',
  'v2a-s': '二段動詞(古語)',
  aux: '助動詞',
  'aux-v': '助動詞(動詞型)',
  'aux-adj': '助動詞(形容詞型)',
  'adj-i': '形容詞',
  'adj-na': '形容動詞',
  'adj-no': '連體詞(の)',
  'adj-t': '形容詞(タリ)',
  'adj-f': '連體詞',
  'adj-pn': '連體詞',
  'adj-ku': '形容詞(古語ク)',
  adv: '副詞',
  'adv-to': '副詞(と)',
  suf: '接尾詞',
  pref: '接頭詞',
  ctr: '助數詞',
  conj: '接續詞',
  prt: '助詞',
  int: '感嘆詞',
  exp: '慣用語',
  pn: '代名詞',
  num: '數詞',
}

export function posLabel(code: string): string {
  return POS_LABELS[code] ?? code
}
