// ATS scanner CLI - reutilise le moteur deterministe (regles, sans LLM) de
// sunnypatell/ats-screener (MIT), localise pour le francais, et adapte en
// script autonome (pas de serveur, pas de compte, pas de cle API).
//
// Usage:
//   npx tsx main.ts <resume.txt> [--jd fichier_jd.txt] [--page-count N] [--label "nom"]

import { readFileSync, writeFileSync } from 'node:fs';
import { parseResumeText } from './engine/parser/index';
import { scoreResume } from './engine/scorer/engine';
import type { ScoringInput, ScoreResult } from './engine/scorer/types';

function arg(name: string): string | null {
	const i = process.argv.indexOf(name);
	return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const resumePath = process.argv[2];
if (!resumePath) {
	console.error('usage: tsx main.ts <resume.txt> [--jd file.txt] [--page-count N] [--label "nom"]');
	process.exit(1);
}

const jdPath = arg('--jd');
const pageCountArg = arg('--page-count');
const label = arg('--label') || resumePath;

const rawText = readFileSync(resumePath, 'utf-8');
const jobDescription = jdPath ? readFileSync(jdPath, 'utf-8') : '';

const parseResult = parseResumeText(rawText);
if (!parseResult.success || !parseResult.resume) {
	console.error('echec du parsing:', parseResult.errors.join(', '));
	process.exit(1);
}
const resume = parseResult.resume;

// bullets d'"experience professionnelle" au sens strict : c'est la section
// que Workday/Taleo/etc. ponderent le plus lourd pour D4. Les bullets de
// "Projets" NE sont PAS fusionnes ici, meme si ce sont objectivement les
// bullets les plus riches du CV : un ATS reel traite "Experience" et
// "Projects" comme deux sections distinctes et ne recompense pas la
// deuxieme comme si c'etait de l'experience professionnelle. C'est un choix
// de fidelite au fonctionnement reel, pas un oubli.
const experienceBullets = resume.experience.flatMap((e) => e.bullets);
const projectBullets = resume.projects.flatMap((p) => p.bullets);

const educationSection = resume.sections.find((s) => s.type === 'education');
const educationText = educationSection ? educationSection.content : '';

const pageCount = pageCountArg ? parseInt(pageCountArg, 10) : resume.metadata.pageCount;

const input: ScoringInput = {
	resumeText: resume.rawText,
	resumeSkills: resume.skills,
	resumeSections: resume.sections.map((s) => s.type),
	experienceBullets,
	educationText,
	hasMultipleColumns: false, // CSS mono-colonne verifiee visuellement (build.py / master html)
	hasTables: false, // aucune balise <table> dans les templates CV
	hasImages: false, // format ATS : pas de photo, pas d'icone
	pageCount,
	wordCount: resume.metadata.wordCount,
	jobDescription
};

const results: ScoreResult[] = scoreResume(input);

// -- rapport --
const bar = '='.repeat(72);
console.log(bar);
console.log(`RAPPORT ATS - ${label}`);
console.log(bar);
console.log(
	`Mots: ${resume.metadata.wordCount} | Pages: ${pageCount} | Sections detectees: ${[...new Set(resume.sections.map((s) => s.type))].join(', ')}`
);
console.log(
	`Bullets "Experience professionnelle" analyses (D4): ${experienceBullets.length} | Bullets "Projets" (hors D4, info seule): ${projectBullets.length}`
);
if (!jobDescription) {
	console.log(
		'Mode: SANS offre precise -> keyword match calcule contre un referentiel de competences firmware/embarque generique (pas une offre reelle).'
	);
} else {
	console.log(`Mode: avec JD fournie (${jdPath})`);
}
console.log('');

let totalWeighted = 0;
for (const r of results) {
	totalWeighted += r.overallScore;
	console.log('-'.repeat(72));
	console.log(`${r.system} (${r.vendor})  ->  ${r.overallScore}/100  [${r.passesFilter ? 'PASSE le seuil' : 'EN DESSOUS du seuil'}]`);
	console.log(
		`  Formatage:${r.breakdown.formatting.score}  Mots-cles:${r.breakdown.keywordMatch.score}  Sections:${r.breakdown.sections.score}  Experience:${r.breakdown.experience.score}  Formation:${r.breakdown.education.score}`
	);
	if (r.breakdown.formatting.issues.length) {
		console.log(`  Formatage - problemes: ${r.breakdown.formatting.issues.join('; ')}`);
	}
	if (r.breakdown.sections.missing.length) {
		console.log(`  Sections manquantes: ${r.breakdown.sections.missing.join(', ')}`);
	}
	if (r.breakdown.keywordMatch.missing.length) {
		console.log(
			`  Mots-cles manquants (top 15): ${r.breakdown.keywordMatch.missing.slice(0, 15).join(', ')}`
		);
	}
	console.log(`  Experience: ${r.breakdown.experience.highlights.join(' | ')}`);
	console.log(`  Formation - notes: ${r.breakdown.education.notes.join(' | ')}`);
	if (r.suggestions.length) {
		console.log('  Suggestions:');
		for (const s of r.suggestions) {
			console.log(`    - ${typeof s === 'string' ? s : s.summary}`);
		}
	}
}

console.log('-'.repeat(72));
console.log(`SCORE MOYEN (6 plateformes): ${Math.round(totalWeighted / results.length)}/100`);
console.log(bar);

// sortie JSON complete pour exploitation ulterieure
writeFileSync(
	resumePath.replace(/\.txt$/, '') + '.ats-report.json',
	JSON.stringify({ label, input: { ...input, resumeText: undefined }, results }, null, 2)
);
