# Teams aplikace pro Mapove okno

Tento adresar obsahuje statickou Microsoft Teams personal aplikaci pro
`map-window-app`. Teams hostuje jen iframe s HTTPS URL; vlastni logika mapy se
nacita z konfigurovatelneho webcomponent bundle.

## Struktura

- `personalapp/` - sablona obsahu ZIP balicku pro upload do Teams jako aplikace:
  `manifest.json`, `color.png`, `outline.png`.
- `webapp/` - webova aplikace hostujici `map-window-app`.
- `webapp/config.js` - vychozi runtime konfigurace bundle URL, mapovych atributu
  a SignalR endpointu.
- `scripts/build-personal-app.mjs` - vygeneruje nahratelny Teams ZIP balicek do
  `dist/mo-teams-personalapp.zip`.
- `copilot-extension/` - skeleton deklarativniho agenta; komunikacni runtime
  vrstva je SignalR hub.

## Webapp

Stranka `webapp/index.html` nacita webcomponent bundle z `webapp/config.js`.
Vychozi hodnota je:

```text
https://dev.geo-portal.cz/test_mo8052/bundle.js
```

URL lze prepsat bez rebuildovani:

```text
https://<hosting>/teams/webapp/index.html?bundle=https%3A%2F%2Fdev.geo-portal.cz%2Ftest_mo8052%2Fbundle.js
```

Vychozi `bundleType` je `module`, protoze aktualni build webcomponenty pouziva
`import.meta.url`, dynamicky import chunku a `export`. Pro cross-origin module
script musi server s bundle povolit CORS pro domenu hostujici Teams webapp.

Webapp vytvori mapu takto:

```html
<map-window-app
  id="mo-teams-map"
  data-mcp-channel="mo-teams-app"
  plugins="+mcp"
></map-window-app>
```

Vychozi `configs` a `owc` jsou prazdne. Pokud mapa potrebuje konkretni data,
predavej je pres `config.js`, query parametry nebo `package:personal`.

Query parametry pro mapu:

- `bundle` nebo `bundleUrl` - URL webcomponent bundle.
- `bundleType` - `module` nebo `classic`, default `module`.
- `configs`
- `owc`
- `layout`
- `token`
- `plugins`
- `channel`
- `mapId`

## Lokalne spusteni

```bash
npm install
npm run check
npm run serve
```

Pak otevri:

```text
http://127.0.0.1:8052
```

Do Teams je potreba webapp vystavit na HTTPS URL.

## Vytvoreni Teams balicku

Po vystaveni `webapp/` na HTTPS URL vygeneruj ZIP:

```bash
npm run package:personal -- \
  --app-url https://<hosting>/teams/webapp/index.html \
  --bundle-url https://dev.geo-portal.cz/test_mo8052/bundle.js
```

Vystup:

```text
dist/mo-teams-personalapp.zip
```

Ten nahraj v Teams jako custom app. Build skript doplni:

- `staticTabs[].contentUrl` a `websiteUrl`,
- `validDomains` pro hosting webapp, bundle a SignalR,
- query parametr `bundle` do `contentUrl`.

Volitelne parametry:

- `--bundle-type module`
- `--configs <value>`
- `--owc <value>`
- `--layout <value>`
- `--plugins <value>`
- `--channel <value>`
- `--signalr-url <https-url>`
- `--signalr-auto-connect true`
- `--valid-domains domena1,domena2`

Stejne hodnoty lze predat pres env promene `TEAMS_APP_URL`,
`MAP_BUNDLE_URL`, `MAP_BUNDLE_TYPE`, `MAP_CONFIGS`, `MAP_OWC`, `MAP_LAYOUT`,
`MAP_PLUGINS`, `MAP_CHANNEL`, `SIGNALR_URL`, `SIGNALR_AUTO_CONNECT` a
`VALID_DOMAINS`.

## MCP a SignalR

Browserova cast umi komunikovat dvouvrstve:

1. `map-window-app` expose-uje in-page MCP server pres `window.postMessage`.
2. `webapp/signalr-client.js` se pripoji na SignalR a tool requesty preposila
   do lokalniho MCP serveru mapy.

Default SignalR endpoint v konfiguraci:

```text
https://mwws.service.signalr.net
```

Query parametry:

- `signalr` - prepis SignalR endpointu.
- `signalrToken` - access token pro SignalR klienta.
- `session` - session id pro parovani tabu, default `mo-teams-app`.
- `configs`
- `owc`
- `layout`
- `token`
- `plugins`
- `channel`

SignalR se automaticky nepripojuje, pokud neni nastaveno
`signalrAutoConnect=true` nebo `signalR.autoConnect` v `config.js`.

SignalR metoda, kterou webapp ocekava pro prichozi pozadavky:

```text
MapWindowToolRequest
```

Alternativne jsou registrovane i aliasy `mapWindowToolRequest`,
`McpToolRequest` a `mcpToolRequest`.

Odpoved webapp posila metodou:

```text
MapWindowToolResponse
```

Payload requestu:

```json
{
  "requestId": "abc",
  "toolName": "webcomponent_api_list",
  "args": {}
}
```

Payload odpovedi:

```json
{
  "requestId": "abc",
  "sessionId": "mo-teams-app",
  "result": {},
  "error": null
}
```

Do ZIP balicku pro sideload patri obsah adresare vygenerovaneho
`dist/personalapp/`:

```text
manifest.json
color.png
outline.png
```

## Poznamky k Copilot integraci

Copilot extension nemuze primo volat browserove `window.postMessage`.
Prakticky model je tento:

- webapp drzi SignalR spojeni na `https://mwws.service.signalr.net`,
- backend/Copilot runtime posila tool requesty pres stejny SignalR hub,
- webapp je prelozi do MCP tool callu nad aktivni instanci mapy.

Produkce musi doresit autentizaci, access tokeny pro SignalR a parovani
tenant/user/tab/session.
