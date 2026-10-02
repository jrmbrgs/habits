# Habits

Petit tracker d'habitudes inspiré de Moto. C'est une PWA statique (HTML/CSS/JS, sans build ni dépendance) qu'on installe sur l'écran d'accueil de l'iPhone.

## Fonctionnalités
- **Aujourd'hui** : touche l'anneau pour valider, **appui long pour un jour de repos** (la série continue). Les habitudes « plusieurs fois par jour » se remplissent à chaque touche.
- **7 jours** : tu peux corriger les jours passés (touche pour valider, appui long pour un repos).
- **Analyse** : série actuelle et meilleure série, taux de réussite sur 30 jours, heatmap sur un an et tes meilleurs jours de la semaine.
- Trois fréquences possibles : chaque jour, certains jours, ou X fois par semaine.
- Ça marche hors ligne. Les données restent sur l'appareil (localStorage), avec un export/import JSON dans Réglages.

## Lancer en local
```bash
python3 -m http.server 8765
```
Puis ouvre http://localhost:8765.

## Installer sur iPhone
1. Héberge le dossier en HTTPS (GitHub Pages, Netlify Drop, Cloudflare Pages…).
2. Ouvre l'URL dans Safari, puis Partager → **Sur l'écran d'accueil**.

## Déploiement
Chaque push sur `main` déploie sur GitHub Pages via `.github/workflows/pages.yml`. Le workflow renouvelle aussi le cache du service worker, donc les iPhones récupèrent la nouvelle version à l'ouverture suivante.
