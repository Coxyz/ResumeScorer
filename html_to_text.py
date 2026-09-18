#!/usr/bin/env python3
"""
Convertit un CV HTML (nos fichiers CV_*.html) en texte brut ligne-par-ligne,
de la façon dont un parseur ATS le "verrait" apres extraction de texte :
- un element de bloc (h1, h2, div, p, li) = une ligne
- <style> et <script> sont ignores integralement (jamais visibles pour un ATS)
- les listes a puces gardent un "- " en tete de ligne (les scorers repere
  les puces via une regex sur ce prefixe)
- une ligne vide separe chaque "entry" (div.entry) pour aider le decoupage
  en blocs experience/formation

Usage: python3 html_to_text.py input.html > output.txt
"""
import sys
from bs4 import BeautifulSoup


def main():
    path = sys.argv[1]
    with open(path, encoding="utf-8") as f:
        soup = BeautifulSoup(f.read(), "html.parser")

    for tag in soup(["style", "script"]):
        tag.decompose()

    lines = []

    def add_line(text, bullet=False):
        text = " ".join(text.split())
        if not text:
            return
        lines.append(("- " if bullet else "") + text)

    body = soup.body or soup

    for el in body.find_all(["h1", "h2", "div", "p", "li"], recursive=True):
        # avoid double-counting: skip if this div's own direct text is just
        # a container for other block children we'll visit separately
        if el.name == "div":
            has_block_children = el.find(["div", "p", "li"], recursive=False)
            if has_block_children:
                continue
        if el.name == "li":
            add_line(el.get_text(" ", strip=True), bullet=True)
        else:
            add_line(el.get_text(" ", strip=True))
        if el.name == "h1":
            lines.append("")
        if el.get("class") and "entry" in el.get("class"):
            lines.append("")
        if el.name == "h2":
            pass

    print("\n".join(lines))


if __name__ == "__main__":
    main()
