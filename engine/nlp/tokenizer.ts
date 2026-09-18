// stop words to exclude from keyword analysis (common english words with no semantic weight)
const STOP_WORDS = new Set([
	'a',
	'an',
	'the',
	'and',
	'or',
	'but',
	'in',
	'on',
	'at',
	'to',
	'for',
	'of',
	'with',
	'by',
	'from',
	'as',
	'is',
	'was',
	'are',
	'were',
	'be',
	'been',
	'being',
	'have',
	'has',
	'had',
	'do',
	'does',
	'did',
	'will',
	'would',
	'could',
	'should',
	'may',
	'might',
	'shall',
	'can',
	'need',
	'not',
	'no',
	'nor',
	'so',
	'if',
	'then',
	'than',
	'too',
	'very',
	'just',
	'about',
	'above',
	'after',
	'again',
	'all',
	'also',
	'am',
	'any',
	'because',
	'before',
	'between',
	'both',
	'each',
	'few',
	'further',
	'get',
	'got',
	'here',
	'how',
	'i',
	'into',
	'it',
	'its',
	'me',
	'more',
	'most',
	'my',
	'myself',
	'now',
	'only',
	'other',
	'our',
	'out',
	'over',
	'own',
	'same',
	'she',
	'he',
	'her',
	'him',
	'his',
	'some',
	'such',
	'that',
	'their',
	'them',
	'there',
	'these',
	'they',
	'this',
	'those',
	'through',
	'under',
	'until',
	'up',
	'us',
	'we',
	'what',
	'when',
	'where',
	'which',
	'while',
	'who',
	'whom',
	'why',
	'you',
	'your',
	'etc',
	'ie',
	'eg',
	'per',
	'via',
	// FR localization: French stop words, so bigram/trigram phrase extraction
	// on a French resume/JD isn't full of "de la", "et le", "dans un" noise.
	'le',
	'la',
	'les',
	'un',
	'une',
	'des',
	'du',
	'de',
	'et',
	'ou',
	'mais',
	'donc',
	'car',
	'ni',
	'que',
	'qui',
	'quoi',
	'dont',
	'où',
	'ce',
	'cet',
	'cette',
	'ces',
	'son',
	'sa',
	'ses',
	'leur',
	'leurs',
	'notre',
	'nos',
	'votre',
	'vos',
	'mon',
	'ma',
	'mes',
	'ton',
	'ta',
	'tes',
	'je',
	'tu',
	'il',
	'elle',
	'nous',
	'vous',
	'ils',
	'elles',
	'on',
	'à',
	'au',
	'aux',
	'dans',
	'sur',
	'sous',
	'entre',
	'vers',
	'chez',
	'avec',
	'sans',
	'pour',
	'par',
	'en',
	'est',
	'sont',
	'être',
	'avoir',
	'ai',
	'as',
	'a',
	'avons',
	'avez',
	'ont',
	'plus',
	'moins',
	'très',
	'trop',
	'peu',
	'bien',
	'aussi',
	'alors',
	'ainsi',
	'donc',
	'ne',
	'pas',
	'non',
	'oui'
]);

export interface Token {
	raw: string;
	normalized: string;
	position: number;
}

// FR localization: folds accented letters to their plain ASCII equivalent
// (é/è/ê -> e, à -> a, ç -> c, ...) so keyword matching isn't defeated by
// accent presence/absence alone (e.g. a resume that strips accents for
// ATS-safety shouldn't be marked as "missing" a keyword purely because the
// job description spells it with an accent it doesn't).
const COMBINING_MARKS = new RegExp('[̀-ͯ]', 'g');
function foldAccents(s: string): string {
	return s.normalize('NFD').replace(COMBINING_MARKS, '');
}

// letters kept at token edges before accent-folding: plain ascii plus the
// accented range (so "équipe" / "embarqué" aren't treated as having a
// leading/trailing punctuation char and mangled into "quipe" / "embarqu").
const EDGE_KEEP = 'a-zA-Z0-9#+À-ÿ';
const EDGE_STRIP_RE = new RegExp(`^[^${EDGE_KEEP}]+|[^${EDGE_KEEP}]+$`, 'g');
const EDGE_STRIP_RE_NOPLUS = new RegExp(`^[^a-zA-Z0-9À-ÿ]+|[^a-zA-Z0-9À-ÿ]+$`, 'g');

// tokenizes text into terms: lowercase, strip punctuation, filter stop words
export function tokenize(text: string): Token[] {
	const words = text.split(/[\s,;|]+|(?<=[a-zA-Zàâäéèêëïîôöùûüç])['’](?=[a-zA-Zàâäéèêëïîôöùûüç])/);
	const tokens: Token[] = [];

	for (let i = 0; i < words.length; i++) {
		const raw = words[i];
		// strip leading/trailing punctuation but preserve internal hyphens and dots
		const cleaned = raw.replace(EDGE_STRIP_RE, '');
		if (cleaned.length === 0) continue;

		const normalized = foldAccents(cleaned.toLowerCase());
		if (STOP_WORDS.has(normalized)) continue;
		if (normalized.length < 2) continue;

		tokens.push({ raw: cleaned, normalized, position: i });
	}

	return tokens;
}

// extracts n-grams (multi-word phrases) for matching compound skills
export function extractNgrams(text: string, n: number): string[] {
	const words = text
		.toLowerCase()
		.split(/[\s,;|]+/)
		.map((w) => foldAccents(w.replace(EDGE_STRIP_RE_NOPLUS, '')))
		.filter((w) => w.length > 0);

	if (words.length < n) return [];

	const ngrams: string[] = [];
	for (let i = 0; i <= words.length - n; i++) {
		const gram = words.slice(i, i + n).join(' ');
		// skip n-grams that are entirely stop words
		const hasContent = words.slice(i, i + n).some((w) => !STOP_WORDS.has(w));
		if (hasContent) ngrams.push(gram);
	}

	return ngrams;
}

// extracts unique terms combining unigrams, bigrams, and trigrams
export function extractTerms(text: string): string[] {
	const tokens = tokenize(text);
	const unigrams = tokens.map((t) => t.normalized);
	const bigrams = extractNgrams(text, 2);
	const trigrams = extractNgrams(text, 3);

	const all = [...unigrams, ...bigrams, ...trigrams];
	return [...new Set(all)];
}

// normalizes text for comparison: lowercase, trim, collapse whitespace
export function normalizeText(text: string): string {
	return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

export { STOP_WORDS };
