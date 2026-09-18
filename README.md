# Lexina

Persönlicher Wortschatz, Zitate und Journal. Express, TypeScript und SQLite; keine zusätzlichen Laufzeitabhängigkeiten für den Lernbestand.

## Start und Prüfung

Im Verzeichnis `src`:

- `npm install`
- `npm run dev` (Standard: Port 3000)
- `npm test` (Build, Migration, Datenbeziehungen und HTTP-Prüfungen)
- `npm run build` und `npm start`

`LEXINA_DATABASE_PATH` kann für isolierte Tests eine andere Datenbank wählen; `LEXINA_PORT` einen anderen Port. Die Tests verwenden ausschließlich temporäre Datenbanken.

## Wortbereich

Die Schnellerfassung benötigt nur Wort und Sprache (standardmäßig Deutsch). Neue Worteinheiten sind Entwürfe. Die Status Entwurf, Bereit und Im Lernen sind ausschließlich manuell; weitere Pflichtfelder, Quiz oder automatische Wiederholungen gibt es nicht.

Eigenständige Worteinheiten speichern Sprache, konkrete Bedeutung, Beispiele, Notiz und Übersetzungen. Gleiche Schreibweisen dürfen mehrfach vorkommen. Bedeutungsräume besitzen Bezeichnung, Notiz und bei Altdaten gemeinsame Beispiele. Die Zuordnungstabelle speichert eine eigene Reihenfolge pro Raum; im Raumeditor lässt sie sich mit Pfeiltasten ändern. Neue Zuordnungen werden hinten angefügt. Entfernte Zuordnungen und gelöschte Räume löschen keine Wörter.

Übersetzungen speichern Zielsprache, Text und Kontext separat. Erst der Übernahme-Button erzeugt einen eigenen Entwurf oder verknüpft eine vorhandene, inhaltlich passende Worteinheit. Vorhandene Worteinheiten behalten ihren Status. Keine automatische Übersetzung oder automatische Aktivierung.

## Migration vorhandener Daten

Beim ersten Start führt `word-inventory-v1` eine atomare, versionierte Migration über `schema_migrations` aus. Vor jeder Änderung wird mittels SQLite `VACUUM INTO` eine konsistente Sicherung neben der Datenbank erstellt:
`lexina.sqlite.before-word-inventory-<Zeitstempel>-<UUID>.bak`.
Ein Sicherungsfehler verhindert die Migration.

- Alte Karten mit ähnlichen Wörtern werden Bedeutungsräume. Jedes ähnliche Wort wird eine separate deutsche Worteinheit; die ursprüngliche Reihenfolge bleibt erhalten.
- Gemeinsame Notizen und Beispiele verbleiben beim Raum. Es wird keine Bedeutung für einzelne Wörter geraten.
- Karten ohne ähnliche Wörter werden eigenständige deutsche Worteinheiten mit ihren eigenen Beispielen und Notizen.
- `unknown` (Neu) wird `draft` (Entwurf), `using` (In Benutzung) und ältere `learning`-Werte werden `learning` (Im Lernen), `familiar` (Geläufig) sowie ältere `finished`/`learned`-Werte werden `ready` (Bereit). Unbekannte Werte werden konservativ Entwurf. Der Originalstatus bleibt im Archiv erhalten.
- Gleiche Schreibweisen werden niemals automatisch zusammengeführt.
- Sämtliche Originalfelder (auch Wortart, `family_id` und weitere Altfelder), Beispielzeilen und ähnliche Wörter werden zusätzlich als vollständige Originalinformationen gespeichert und im Editor einsehbar gehalten.
- Die alten Tabellen `words`, `similar_words` und `example_sentences` bleiben erhalten. Die neue Anwendung schreibt ausschließlich in die neuen Worttabellen.
- Die Migration prüft Übernahmezahlen und Fremdschlüssel vor dem Abschluss; bei Fehlern wird alles zurückgerollt. Wiederholte Starts erzeugen weder Duplikate noch weitere Sicherungen.
- Tabellen und Funktionen für Zitate, Tags und Journal werden nicht umgebaut.

Die Migration speichert den Versionsmarker erst mit der erfolgreichen Übernahme. Für eine Wiederherstellung die App beenden und die Datenbank durch die passende Sicherung ersetzen; die Originaldatei und etwaige WAL-Dateien dabei zunächst separat bewahren.
