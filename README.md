# Lexina

Lokale Anwendung für den persönlichen Wortschatz, Zitate und Journaleinträge.

## Start

```powershell
cd src
npm install
npm run dev
```

Danach ist Lexina unter <http://localhost:3000> erreichbar.

Für einen Produktionsstart zuerst `npm run build` und anschließend `npm start` ausführen.

Beim ersten Start wird `data/lexina.sqlite` automatisch angelegt. Die vorhandene
OpenThesaurus-Datei wird von der Anwendung nicht mehr verwendet.

## Bereiche

- **Wörter:** Begriffe mit Wortart, ähnlichen Wörtern, Beispielsätzen und Lernstatus verwalten
- **Zitate & Gedichte:** Texte mit Notiz und wiederverwendbaren Tags sammeln
- **Journal:** Einträge für einen ausgewählten Tag chronologisch verwalten
