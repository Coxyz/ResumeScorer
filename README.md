# ats_cli — test ATS local pour CV (sans cle API)

Scanner ATS deterministe, base sur des regles (pas de LLM, pas de compte,
pas de cle API). Fork localise en francais du moteur MIT de
[sunnypatell/ats-screener](https://github.com/sunnypatell/ats-screener) :
la partie "LLM optionnel / UI web / auth" du projet original a ete retiree,
seul le coeur parser+scorer a ete garde, puis adapte pour un CV francais
(en-tetes de section, dates "aujourd'hui / en cours", diplomes RNCP/Bac+5,
verbes d'action au participe passe, gestion des accents). Voir LICENSE.

Simule 6 ATS reels (Workday, Taleo, iCIMS, Greenhouse, Lever, SuccessFactors)
sur 6 dimensions ponderees differemment par plateforme : formatage,
correspondance de mots-cles, sections presentes, qualite des bullets
d'experience, formation, quantification des resultats.

## Installation

```bash
npm install
```

(installe seulement `tsx` et `typescript`, aucune autre dependance —
le moteur n'utilise ni pdfjs ni mammoth ni compromise : il travaille sur
du texte brut, deja extrait.)

## Usage

1. Convertir le CV (HTML ou texte) en texte brut ligne-par-ligne :

```bash
python3 html_to_text.py mon_cv.html > mon_cv.txt
```

(Pour un CV deja en texte/.txt, cette etape est inutile.)

2. Lancer le scan :

```bash
# sans offre precise -> compare a un referentiel de competences
# firmware/embarque generique (reference_keywords_firmware_fr.txt)
npx tsx main.ts mon_cv.txt --jd reference_keywords_firmware_fr.txt --page-count 1 --label "Mon CV"

# avec une vraie offre d'emploi (texte colle dans un fichier) -> score
# beaucoup plus precis et cible sur CETTE offre
npx tsx main.ts mon_cv.txt --jd offre_witekio.txt --page-count 1 --label "CV x Offre Witekio"
```

`--page-count` : nombre de pages du PDF final (compte-le a la main, ou
recupere-le via `pdftoppm`/`pdfinfo` — le script ne lit pas le PDF lui-meme).

Sortie : un rapport texte dans le terminal (score par plateforme, mots-cles
manquants, suggestions) + un fichier `<cv>.ats-report.json` avec le detail
complet, a cote du .txt d'entree.

## Regle importante (projet CV d'Alexandre)

Ne jamais ajouter un mot-cle "manquant" signale par l'outil si tu ne peux
pas le defendre 3 minutes en entretien technique (ex: ARM Cortex-M, PWM,
timers, DMA, bus CAN — tant que ce n'est pas dans ton code). Le score ATS
n'est qu'un signal parmi d'autres, jamais une excuse pour sur-declarer une
competence.

## Limites connues (assumees, pas des bugs)

- Sans JD reelle, le score "mots-cles" utilise un referentiel generique
  construit a la main (`reference_keywords_firmware_fr.txt`), pas une
  vraie offre. Pour un score precis par entreprise, fournir le texte (ou
  l'URL a scraper) de l'offre visee.
- Les bullets de la section "Projets" ne comptent PAS dans le score
  "Experience" (D4) : un vrai ATS pondere l'experience professionnelle
  labellisee, pas les projets personnels, meme si ce sont objectivement
  les bullets les plus solides du CV. C'est fidele au fonctionnement reel,
  pas un oubli.
- Certaines heuristiques (nom de l'ecole, GPA, all-caps) restent
  volontairement simplistes : c'est representatif de la facon dont de
  vrais parseurs ATS regex-based se comportent, pas quelque chose a
  "corriger" pour gonfler la note.
