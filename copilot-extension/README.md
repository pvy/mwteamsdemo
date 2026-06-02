# Copilot extension skeleton

Tento adresar obsahuje skeleton pro Microsoft 365 Copilot deklarativniho
agenta. Runtime komunikace je navrzena pres SignalR hub pouzivany webapp.

## Obsah

- `manifest.json` - Microsoft 365 app manifest.
- `declarativeAgent.json` - definice agenta.
- `ai-plugin.json` - plugin manifest.
- `mcp-tools.json` - staticky popis tool kontraktu odpovidajiciho MCP toolum
  Mapoveho okna.
- `color.png`, `outline.png` - ikony pro app package.

## Komunikacni model

Copilot backend/runtime posila tool request pres SignalR hub:

```text
https://mwws.service.signalr.net
```

Webapp prijima `MapWindowToolRequest`, vola lokalni browser MCP server
`map-window-app` a odpovida pres `MapWindowToolResponse`.

Tento adresar zatim neobsahuje backend cast, ktera by Copilot plugin requesty
prekladala na SignalR zpravy. Ta musi byt doplnena podle produkcniho
autentizacniho a session modelu.

## Sideload balicek

Do ZIP balicku pro agent prototyp patri obsah tohoto adresare:

```text
manifest.json
declarativeAgent.json
ai-plugin.json
mcp-tools.json
color.png
outline.png
```
