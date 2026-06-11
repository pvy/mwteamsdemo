---
name: teams-project
description: "Projekt mo/teams - struktura vice Teams personal aplikaci, webapp/personalapp podadresare, konfigurace remote map-window-app bundle a baleni Teams ZIPu. Pouzij pri praci v /home/pavel/NetBeansProjects/mo/teams, pri pridavani nove Teams aplikace, uprave URL, manifestu, webapp konfigurace nebo package workflow."
---

# Teams Project

Pouzivej pro repozitar `/home/pavel/NetBeansProjects/mo/teams`.

## Struktura

- `webapp/<app>/` - staticka host stranka aplikace. Azure Static Web Apps deployuje cely adresar `webapp/`, proto ma aplikace URL podle podadresare, napr. `/demo/`.
- `personalapp/<app>/` - Teams personal app sablona pro stejnojmennou aplikaci. Obsahuje `manifest.json`, `color.png`, `outline.png`.
- `scripts/build-personal-app.mjs` - bali jednu aplikaci podle `--app`, default `demo`.
- `dist/` - generovany vystup, ignorovany gitem.
- `copilot-extension/` - oddelena Copilot/declarative agent cast; nemen pri bezne reorganizaci personal tab aplikaci.

Aktualni demo:

- web host: `webapp/demo/`
- Teams manifest sablona: `personalapp/demo/manifest.json`
- verejna URL: `https://witty-plant-03eae4c03.7.azurestaticapps.net/demo/`
- remote bundle: `https://dev.geo-portal.cz/mo_lcr_integration/1.7.16.2606031548/bundle.js`

## Jak pridat novou aplikaci

1. Zaloz stejne pojmenovane podadresare:
   - `webapp/<app>/`
   - `personalapp/<app>/`
2. Zkopiruj jako start `webapp/demo/*` a `personalapp/demo/*`.
3. V `webapp/<app>/config.js` nastav:
   - `bundleUrl` na publikovany `map-window-app` bundle,
   - `map.id` na unikatni DOM id, pokud aplikace potrebuje odliseni,
   - `map.channel` na unikatni MCP channel,
   - `map.plugins`, typicky `+mcp`,
   - `configs`, `owc`, `layout`, `token` podle konkretni aplikace.
4. V `personalapp/<app>/manifest.json` nastav:
   - unikatni `id` aplikace,
   - `name.short`, `name.full`,
   - `description`,
   - `staticTabs[0].entityId` a `staticTabs[0].name`,
   - placeholderove `contentUrl`/`websiteUrl` na cestu aplikace, napr. `https://example.com/<app>/`.
5. Vygeneruj ZIP:

```bash
npm run package:personal -- \
  --app <app> \
  --app-url https://witty-plant-03eae4c03.7.azurestaticapps.net/<app>/ \
  --bundle-url <remote-bundle-url>
```

Vystup je `dist/mo-teams-<app>-personalapp.zip`.

## Konfigurace webapp

`webapp/<app>/config.js` je runtime default. Hodnoty lze prepsat query parametry bez rebuildovani:

- `bundle` nebo `bundleUrl`
- `bundleType`, obvykle `module`
- `configs`
- `owc`
- `layout`
- `token`
- `plugins`
- `channel`
- `mapId`
- `signalr`
- `signalrAutoConnect`

Remote bundle musi byt dostupny pres HTTPS a pro cross-origin module script musi server povolit CORS.

## Baleni Teams personal app

`scripts/build-personal-app.mjs` cte sablonu z `personalapp/<app>/`, doplni `staticTabs[].contentUrl`, `websiteUrl`, query parametry a `validDomains`.

Uzitecne parametry:

- `--app <app>` nebo env `TEAMS_APP`
- `--app-url <https-url>` nebo `TEAMS_APP_URL`
- `--bundle-url <https-url>` nebo `MAP_BUNDLE_URL`
- `--configs`, `--owc`, `--layout`, `--plugins`, `--channel`
- `--signalr-url`, `--signalr-auto-connect`
- `--valid-domains`

## Overeni

Po zmene struktury nebo konfigurace spust:

```bash
npm run check
npm run package:personal -- --app demo --app-url https://witty-plant-03eae4c03.7.azurestaticapps.net/demo/ --bundle-url https://dev.geo-portal.cz/mo_lcr_integration/1.7.16.2606031548/bundle.js
```

Pro lokalni kontrolu webapp:

```bash
npm run serve
```

Otevri `http://127.0.0.1:8052/demo/`.

## Pravidla

- Nenasazuj ani nekopiruj build `itc-lightning` do tohoto repozitare; webcomponent se nacita jako remote bundle.
- Pri nove aplikaci drz paritu nazvu `webapp/<app>` a `personalapp/<app>`.
- Nemen `dist/` rucne; je generovany.
- Pokud menis public URL aplikace, zkontroluj `--app-url`, manifest `validDomains` a Azure Static Web Apps deploy cesty.
