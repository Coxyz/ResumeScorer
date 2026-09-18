import type { ResumeSection, SectionType } from './types';

// maps common resume section headers to canonical types
// NOTE: French equivalents added (FR localization) so the parser is not
// biased against French-language CVs the way a purely English-tuned
// regex set would be. Real production ATS parsers deployed in France
// (Workday, Taleo, SuccessFactors...) do recognize French headers, so
// this keeps the simulation representative rather than artificially harsh.
const SECTION_PATTERNS: Record<SectionType, RegExp[]> = {
	contact: [
		/^(contact\s*(info(rmation)?)?|personal\s*(info(rmation)?|details))$/i,
		/^(coordonn[ée]es|contact)$/i
	],
	summary: [
		/^(summary|profile|about(\s*me)?|objective|professional\s*summary|career\s*summary|executive\s*summary|personal\s*statement)$/i,
		/^(profil|[àa]\s*propos|objectif|r[ée]sum[ée]|synth[èe]se(\s*professionnelle)?|pr[ée]sentation)$/i
	],
	experience: [
		/^(experience|work\s*experience|professional\s*experience|employment(\s*history)?|work\s*history|relevant\s*experience|career\s*history)$/i,
		/^(exp[ée]riences?(\s*professionnelles?)?|parcours\s*professionnel|historique\s*professionnel)$/i
	],
	education: [
		/^(education|academic(\s*background)?|educational\s*background|qualifications|academic\s*qualifications)$/i,
		/^(formations?|parcours\s*(acad[ée]mique|scolaire)|dipl[ôo]mes?|cursus)$/i
	],
	skills: [
		/^(skills|technical\s*skills|core\s*competencies|competencies|areas?\s*of\s*expertise|proficiencies|technologies|tools?\s*(&|and)\s*technologies)$/i,
		/^(comp[ée]tences?(\s*techniques?)?|savoir[\s-]faire|technologies|outils(\s*(&|et)\s*technologies)?)$/i
	],
	projects: [
		/^(projects|personal\s*projects|academic\s*projects|notable\s*projects|selected\s*projects|key\s*projects|side\s*projects)$/i,
		/^(projets?|projets?\s*(personnels?|acad[ée]miques?))$/i
	],
	certifications: [
		/^(certifications?|licenses?(\s*(&|and)\s*certifications?)?|professional\s*certifications?|accreditations?)$/i,
		/^(certifications?|habilitations?|accr[ée]ditations?)$/i
	],
	awards: [
		/^(awards?|honors?(\s*(&|and)\s*awards?)?|achievements?|recognition|scholarships?)$/i,
		/^(r[ée]compenses?|distinctions?|prix|bourses?)$/i
	],
	publications: [
		/^(publications?|research|papers?|presentations?)$/i,
		/^(publications?|recherche|articles?)$/i
	],
	volunteer: [
		/^(volunteer(ing)?(\s*experience)?|community\s*(service|involvement)|extracurricular(\s*activities)?)$/i,
		/^(b[ée]n[ée]volat|activit[ée]s?\s*(extra[\s-]scolaires?|associatives?)|engagement\s*associatif)$/i
	],
	languages: [
		/^(languages?|language\s*proficiency)$/i,
		/^(langues?|niveau\s*de\s*langues?)$/i
	],
	interests: [
		/^(interests?|hobbies(\s*(&|and)\s*interests?)?)$/i,
		/^(centres?\s*d.int[ée]r[êe]ts?|loisirs)$/i
	],
	unknown: []
};

// checks if a line is a section header using pattern matching and heuristics
function isSectionHeader(line: string, prevLine: string | null, nextLine: string | null): boolean {
	const trimmed = line.trim();

	if (trimmed.length === 0 || trimmed.length > 80) return false;

	// check against known patterns
	const cleaned = trimmed.replace(/[:\-_|]/g, '').trim();
	for (const patterns of Object.values(SECTION_PATTERNS)) {
		if (patterns.some((p) => p.test(cleaned))) return true;
	}

	// heuristic: all caps, short, and looks like a header
	const isAllCaps = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
	const isShort = trimmed.split(/\s+/).length <= 5;
	const hasNoNumbers = !/\d{3,}/.test(trimmed); // avoid matching phone numbers, dates
	const prevIsBlank = prevLine === null || prevLine.trim().length === 0;

	// FR-localization fix: an all-caps 2-3 word line that is the literal first
	// line of the document is almost always the candidate's NAME (a very
	// common single-column CV convention), not a section header. Without this
	// guard the name swallows the "everything before the first header is
	// contact info" heuristic in detectSections() below, so contact info
	// never gets classified and every profile shows "contact" as missing
	// for a reason that has nothing to do with real ATS parsing.
	const wordCount0 = trimmed.split(/\s+/).length;
	const isFirstLineOfDoc = prevLine === null;
	const looksLikeNameLine = isFirstLineOfDoc && wordCount0 >= 1 && wordCount0 <= 3;

	if (isAllCaps && isShort && hasNoNumbers && prevIsBlank && !looksLikeNameLine) return true;

	// heuristic: title case, ends with colon
	if (trimmed.endsWith(':') && isShort) return true;

	// heuristic: line is visually separated and looks like a category label
	// must be preceded by blank line AND have content after it
	const isAlphaOnly = /^[a-zA-Z\s&,/]+$/.test(cleaned);
	const wordCount = cleaned.split(/\s+/).length;
	const nextIsContent = nextLine !== null && nextLine.trim().length > 0;
	// avoid matching personal names (typically 2-3 title-case words at document start)
	const isLikelyName = wordCount >= 2 && wordCount <= 3 && /^[A-Z][a-z]+ [A-Z]/.test(cleaned);

	if (isAlphaOnly && isShort && prevIsBlank && nextIsContent && !isLikelyName && cleaned.length > 2)
		return true;

	return false;
}

// classifies a section header string into a canonical SectionType
function classifySection(header: string): SectionType {
	const cleaned = header.replace(/[:\-_|]/g, '').trim();

	for (const [type, patterns] of Object.entries(SECTION_PATTERNS)) {
		if (patterns.some((p: RegExp) => p.test(cleaned))) {
			return type as SectionType;
		}
	}

	return 'unknown';
}

// detects and extracts sections from resume lines with type, header, content, and line ranges
export function detectSections(lines: string[]): ResumeSection[] {
	const sections: ResumeSection[] = [];
	const headerIndices: { index: number; header: string; type: SectionType }[] = [];

	// first pass: identify all section headers
	for (let i = 0; i < lines.length; i++) {
		const prevLine = i > 0 ? lines[i - 1] : null;
		const nextLine = i < lines.length - 1 ? lines[i + 1] : null;

		if (isSectionHeader(lines[i], prevLine, nextLine)) {
			const type = classifySection(lines[i]);
			headerIndices.push({ index: i, header: lines[i].trim(), type });
		}
	}

	// if no headers detected, treat the entire text as a single unknown section
	if (headerIndices.length === 0) {
		return [
			{
				type: 'unknown',
				header: '',
				content: lines.join('\n'),
				startLine: 0,
				endLine: lines.length - 1
			}
		];
	}

	// extract content between headers
	// content before first header is often contact info
	if (headerIndices[0].index > 0) {
		const contactContent = lines.slice(0, headerIndices[0].index).join('\n').trim();
		if (contactContent.length > 0) {
			sections.push({
				type: 'contact',
				header: '',
				content: contactContent,
				startLine: 0,
				endLine: headerIndices[0].index - 1
			});
		}
	}

	for (let i = 0; i < headerIndices.length; i++) {
		const current = headerIndices[i];
		const nextIndex = i < headerIndices.length - 1 ? headerIndices[i + 1].index : lines.length;

		const contentLines = lines.slice(current.index + 1, nextIndex);
		const content = contentLines.join('\n').trim();

		sections.push({
			type: current.type,
			header: current.header,
			content,
			startLine: current.index,
			endLine: nextIndex - 1
		});
	}

	return sections;
}
