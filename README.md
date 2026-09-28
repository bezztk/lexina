# Lexina

Lexina ist eine lokale App zur Verwaltung von Wörtern, Texten, Journaleinträgen und Schulvokabeln. Enthalten sind ein JSON-Import für Vokabeln sowie ein gewichteter Vokabeltrainer.

## Start

```bash
cd src
npm install
npm run build
npm start
```

Anschließend: `http://localhost:3000`

## Sprachbausteine

Die optionale statische Konfiguration für den Grammatik-/Sprachbaustein-Bereich wird unter `src/public/data/language-blocks.json` erwartet. Fehlt die Datei oder entspricht sie nicht dem vorgesehenen Schema, bleibt der Bereich ausgeblendet und die übrige Wörteransicht funktioniert unverändert.
