# AHPV — Carte interactive

Déposez simplement ce dossier dans un nouveau dépôt GitHub (« test » ou autre) et activez GitHub Pages
(branche `main`, dossier racine). L'application sera disponible immédiatement à l'URL :

    https://<utilisateur>.github.io/<repo>/

## Structure

* `index.html` — page principale (Leaflet, PapaParse)
* `assets/logo_ahpv.png` — logo (remplacez-le si besoin)
* `data/articles.csv` — votre catalogue (UTF‑8, séparateur `,`)
* `data/villes_coords.json` — coordonnées géocodées (optionnel, peut rester vide)

## Mise à jour des données

1. Exportez vos articles au format CSV avec les colonnes : `Titre`, `Ville(s)`, `Année`, `Auteur(s)`.
2. Remplacez simplement `data/articles.csv` puis poussez sur GitHub — fin.

## Générer le fichier `villes_coords.json`

Pour éviter d’appeler Nominatim à chaque visite :

```bash
python scripts/generate_coords.py data/articles.csv data/villes_coords.json
```

(script à écrire selon vos préférences ; l'app lira automatiquement ce fichier s'il existe).
