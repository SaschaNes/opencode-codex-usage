# OpenCode Codex Usage

Native, kompakte Codex-Usage-Anzeige in der **Session-Sidebar der OpenCode-TUI**. Eigene Implementierung; kein Core-Patch und keine weitere Anmeldung.

Die Anzeige nutzt OpenCodes aktive Theme-Farben: Fenstername und verbleibender Anteil in einer Zeile, ein zweifarbiger Fortschrittsbalken (gefüllt = verwendet), darunter verbrauchter Anteil und Reset sowie dezente Konto-/Aktualisierungsinfos.

## Erkannt und getestet

- OpenCode **v2.0.16**, installiert unter `~/.opencode/bin/opencode` (Linux/WSL2).
- Node.js **v24.21.0** für Entwicklung/Tests; OpenCode selbst führt lokale Plugins aus.
- Verifizierte V2-Schnittstellen: `@opencode/plugin` (`integration.connection.active/resolve`, RPC und `session.hook("model.request")`) sowie `@opencode/plugin/tui` (`ui.slot({append:"sidebar.content"})`).
- Eine bereits vorhandene OpenAI-Anmeldung im OpenCode-Credential-Store wird verwendet. Keine Kopie aus `~/.codex/auth.json`.
- Bestehendes `@insd47/opencode-codex` in der globalen Konfiguration ist **unabhängig** und lädt unter v2.0.16 nicht (V1-Plugin-API); weder entfernt noch verändert.
- `~/.config/opencode/tui.jsonc` enthält außerdem eine ältere Quota-Plugin-Konfiguration; diese wird nicht verändert.

## Installation von GitHub auf einer anderen OpenCode-Instanz

Dieses Verzeichnis (`opencode-codex-usage/`) als **Wurzel eines GitHub-Repositories** veröffentlichen. `package.json` exportiert Server-Plugin (`.`) und TUI-Plugin (`./tui`); die Installation holt die Abhängigkeiten selbst. `node_modules/`, Zugangsdaten und lokale Konfiguration gehören nicht ins Repository. Es ist **keine npm-Veröffentlichung** nötig (`private: true` verhindert diese).

Auf der Zielinstanz mit OpenCode V2 (getestet mit v2.0.16):

```sh
opencode plugin add github:OWNER/REPO
opencode plugin list
```

Alternativ mit GitHub-URL: `opencode plugin add git+https://github.com/OWNER/REPO.git`. In einer OpenCode-Unterhaltung genügt später der Link mit der Bitte: „Installiere dieses V2-Plugin global von https://github.com/OWNER/REPO über `opencode plugin add` und prüfe `opencode plugin list`.“ OpenCode kann dabei eine Bestätigung für den Installationsbefehl verlangen. Für private Repositories benötigt die Zielinstanz passende Git-Zugangsdaten. Falls das **äußere Verzeichnis** `opencode-usage/` statt dieses Plugin-Verzeichnisses veröffentlicht wird, den Unterordner wählen: `opencode plugin add 'github:OWNER/REPO#main::path:opencode-codex-usage'` (`main` ggf. durch den verwendeten Branch ersetzen).

Danach die TUI neu öffnen; falls der Server das neue Plugin noch nicht lädt, `opencode service restart` ausführen. Auf der Zielinstanz muss die OpenAI-OAuth-Verbindung in OpenCode bereits bestehen bzw. dort eingerichtet werden; Anmeldedaten werden nicht über GitHub übertragen. Auf der Entwicklungsinstanz ist das Plugin bereits lokal über den absoluten Projektpfad in der globalen `~/.config/opencode/opencode.jsonc` eingebunden. Dieser Eintrag wird durch die Git-Installation **nicht** automatisch ersetzt; bei einem Wechsel zuerst den lokalen Eintrag entfernen, um das Plugin nicht doppelt zu laden.

## Usage und Authentifizierung

Der Server-Teil löst die **aktive OpenAI-OAuth-Verbindung über OpenCodes Plugin-API** auf. Er sendet ausschließlich einen GET an `https://chatgpt.com/backend-api/wham/usage` mit dem OAuth-Bearer und, falls im JWT vorhanden, der ChatGPT-Account-ID. HTTP-Redirects werden nicht verfolgt. Es wird **kein** API-Key, eigener Refresh-Token-Store, Cookie oder zusätzlicher Login benötigt. Ablauf/Refresh der OAuth-Verbindung wird von OpenCode verwaltet; das Plugin liest die jeweils aktuelle Verbindung bei jeder Abfrage erneut. Wenn OpenCode den Token nicht erneuern kann, bleibt die Anzeige „Unavailable“.

Der Endpoint ist eine von Codex verwendete, aber **nicht als stabile öffentliche OpenAI-API dokumentierte** Schnittstelle. Änderungen an Zugriff oder Antwortformat können die Anzeige vorübergehend deaktivieren. Die API liefert `rate_limit.primary_window` und optional `secondary_window`: `used_percent` ist bereits der **verwendete** Anteil; `Remaining = 100 - Used`. Fenster werden nach ihrer gelieferten Länge benannt (300 Minuten = „5h“, 10080 Minuten = „Weekly“), **nicht** allein nach der Reihenfolge im JSON. Fehlt ein Fenster, wird es nicht erfunden. Reset-Zeiten kommen als Unix-Sekunden und werden für die Sidebar in eine relative Dauer umgerechnet. Optionale Plan-, Credits- und Limit-Status-Felder erscheinen nur, wenn vorhanden und sicher lesbar. Ein Codex-Modell wird nicht angezeigt, weil der Usage-Endpoint keines für die accountweite Usage liefert.

Bei der lokalen Probe lieferte der Account **nur ein 10080-Minuten-Fenster als `primary_window` (Weekly)**, außerdem Plan und Credits. Deshalb zeigt dieses Konto aktuell keine 5h-Zeile. Die UI aktualisiert die relative Reset-Zeit durch erneutes Rendering alle 15 Sekunden.

## Aktualisierung und Fehler

Initiale, **nicht blockierende** Abfrage beim Laden des Server-Plugins; danach maximal eine externe Abfrage je 60 Sekunden. Nach einer OpenAI-Modellanfrage wird einmal nach 12 Sekunden ein Refresh versucht, aber niemals vor Ende der Cache-Frist. Der Hook verändert weder Requests noch Responses und schaltet den WebSocket-Transport nicht ab. Ein In-flight-Guard verhindert parallele Abfragen; Timeout 8 Sekunden. Bei Netzwerkproblemen, nicht angemeldet, ungültigem Antwortformat, 401/403 oder 429 wird nur „Unavailable“ angezeigt und exponentiell auf bis zu 15 Minuten zurückgestellt. Die TUI fragt alle 15 Sekunden nur die **lokale Plugin-RPC** nach dem letzten Cache-Wert, nicht OpenAI.

Keine Auth-Daten werden in Projektdateien gespeichert oder geloggt. Die Server-RPC gibt ausschließlich bereinigte Prozente, Reset-Zeit, Plan/Credits/Status und Zeitpunkt zurück. Der Zugriff auf die OpenCode-RPC unterliegt dem üblichen Zugriffsschutz des OpenCode-Servers; keinen ungeschützten Server im Internet bereitstellen. Der globale Konfigurationsdatei-Modus bleibt `0600`.

## Troubleshooting

1. `opencode --version` auf 2.0.16 prüfen; nach Updates `npm ci`, `npm run check` und TUI-Slot-Kompatibilität erneut prüfen.
2. `opencode plugin list` zeigt das installierte Git-Paket; `opencode api get /api/plugin` sollte `local.codex-usage` mit `state.status=active` für den aktuellen Ort liefern.
3. `opencode api post /api/rpc/local.codex-usage/status --data '{"input":{}}'` liefert ausschließlich öffentliche Anzeigewerte. Unmittelbar nach dem Laden kann die asynchrone erste Abfrage kurz „unavailable“ melden.
4. Die **Session-Sidebar** benötigt eine geöffnete Session und genügend Terminalbreite (`session.sidebar: auto`). Eine schmale TUI kann sie ausblenden. Die Web-UI ist nicht Teil dieses TUI-Plugins.
5. Bei dauerndem „Unavailable“ die OpenAI-Verbindung in OpenCode prüfen; OAuth-Ablauf, Offline-Verbindung und Änderungen am nicht-öffentlichen Endpoint sind mögliche Ursachen. Keine Token oder kompletten HTTP-Header in Tickets kopieren.
6. `npm test` und `npm run check` prüfen Parsing/Reset/Balken, Fehlerbehandlung und TypeScript.

## Deaktivieren / Entfernen

Zum Deaktivieren die lokale Projektpfad-Zeile aus `plugins` in `~/.config/opencode/opencode.jsonc` entfernen oder eine spätere `"-local.codex-usage"`-Direktive eintragen; für ein per CLI installiertes Git-Paket `opencode plugin remove github:OWNER/REPO` verwenden. Danach Server/TUI neu starten. Zur vollständigen Entfernung eines lokalen Plugins **zuerst** den globalen Plugin-Eintrag entfernen, dann das lokale Verzeichnis löschen. Weder OpenCode-Credentials noch das vorhandene Fremd-Plugin müssen angefasst werden.

## Upgrade

Die lokale OpenCode-Version, `@opencode/plugin` und TUI-Peers sind auf V2.0.16 abgestimmt. Vor einem Upgrade V2-Plugin- und TUI-Dokumentation sowie RPC/Sidebar-Slot vergleichen; insbesondere kann sich der nicht-öffentliche OpenAI-Usage-Endpoint unabhängig von OpenCode ändern. Der Core wird nie gepatcht.
