// Deterministic text normalisation for Arabic / French / English food queries.

const ARABIC_RE = /[؀-ۿ]/;
export const STOPWORDS = new Set(['de', 'du', 'des', 'd', 'of', 'le', 'la', 'les', 'l', 'من', 'a', 'an']);

const FRACTION_CHARS = { '½': ' 0.5 ', '¼': ' 0.25 ', '¾': ' 0.75 ', '⅓': ' 0.333 ', '⅔': ' 0.667 ' };

export function normalize(input) {
  let s = String(input ?? '').toLowerCase();
  s = s.replace(/[½¼¾⅓⅔]/g, (c) => FRACTION_CHARS[c]);
  s = s.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  s = s.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  s = s.replace(/[ً-ٰٟـ]/g, ''); // tashkeel + tatweel
  s = s
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/[ىیئ]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/[کگ]/g, 'ك');
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae');
  s = s.replace(/[،؛]/g, ',').replace(/٫/g, '.').replace(/٬/g, '');
  s = s.replace(/[’'`´-]/g, ' ');
  s = s.replace(/[^\p{L}\p{N}.,/+&\s]/gu, ' ');
  // decimal comma between digits: 1,5 -> 1.5
  s = s.replace(/(\d),(\d)/g, '$1.$2');
  // separate digits from letters: 200g -> 200 g, و100 -> و 100
  s = s.replace(/(\d)([^\d\s.,/+&])/g, '$1 $2').replace(/([^\d\s.,/+&])(\d)/g, '$1 $2');
  return s.replace(/\s+/g, ' ').trim();
}

// Light stemmer, applied identically to indexed terms and queries.
export function stem(t) {
  if (ARABIC_RE.test(t)) {
    if (t === 'طحينه') return t; // tahini must not collapse into طحين (flour)
    if (t.startsWith('ال') && t.length > 4) t = t.slice(2);
    if (t.length > 4 && t.endsWith('ات')) return t.slice(0, -2);
    if (t.length > 3 && t.endsWith('ه')) return t.slice(0, -1);
    return t;
  }
  if (t.length > 3 && /[sx]$/.test(t)) return t.slice(0, -1);
  return t;
}

export function tokenize(str) {
  return normalize(str).split(' ').filter(Boolean);
}

/** Comparable key for a food term: normalised, stopwords removed, stemmed. */
export function termKey(str) {
  const all = tokenize(str);
  const kept = all.filter((t) => !STOPWORDS.has(t));
  return (kept.length ? kept : all).map(stem).join(' ');
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export const isArabic = (s) => ARABIC_RE.test(s);
