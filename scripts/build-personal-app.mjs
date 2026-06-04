import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const DEFAULT_APP = "demo";

const args = process.argv.slice(2);
const options = new Map();
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (!arg.startsWith("--")) {
    continue;
  }

  const [rawName, inlineValue] = arg.slice(2).split("=", 2);
  const value = inlineValue ?? args[index + 1];
  if (inlineValue === undefined) {
    index += 1;
  }
  options.set(rawName, value);
}

const readOption = (name, envName, fallback = "") =>
  options.get(name) || process.env[envName] || fallback;

const normalizeAppName = (value) => {
  const appName = String(value || "").trim();
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(appName)) {
    throw new Error(
      `Nazev aplikace musi byt bezpecny nazev adresare, zadano: ${value}`,
    );
  }

  return appName;
};

const appName = normalizeAppName(readOption("app", "TEAMS_APP", DEFAULT_APP));
const sourceDir = path.join(rootDir, "personalapp", appName);
const distDir = path.join(rootDir, "dist", "personalapp", appName);
const packagePath = path.join(
  rootDir,
  "dist",
  `mo-teams-${appName}-personalapp.zip`,
);

const requireHttpsUrl = (value, label) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} musi byt platna absolutni URL.`);
  }

  if (url.protocol !== "https:") {
    throw new Error(`${label} musi zacinat na https:// pro upload do Teams.`);
  }

  return url;
};

const appendParam = (url, name, value) => {
  if (value !== undefined && value !== null && value !== "") {
    url.searchParams.set(name, value);
  }
};

const domainFromUrl = (value) => {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
};

const cleanDomain = (value) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return domainFromUrl(trimmed);
  }

  return trimmed.replace(/\/.*$/, "");
};

const copyPackageFiles = () => {
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });
  fs.copyFileSync(
    path.join(sourceDir, "color.png"),
    path.join(distDir, "color.png"),
  );
  fs.copyFileSync(
    path.join(sourceDir, "outline.png"),
    path.join(distDir, "outline.png"),
  );
};

const manifestPath = path.join(sourceDir, "manifest.json");
if (!fs.existsSync(manifestPath)) {
  throw new Error(
    `Neexistuje personal app sablona pro aplikaci '${appName}': ${sourceDir}`,
  );
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const appUrl = requireHttpsUrl(
  readOption("app-url", "TEAMS_APP_URL"),
  "TEAMS_APP_URL / --app-url",
);
const bundleUrl = readOption("bundle-url", "MAP_BUNDLE_URL");
const signalrUrl = readOption("signalr-url", "SIGNALR_URL");

if (bundleUrl) {
  requireHttpsUrl(bundleUrl, "MAP_BUNDLE_URL / --bundle-url");
}
if (signalrUrl) {
  requireHttpsUrl(signalrUrl, "SIGNALR_URL / --signalr-url");
}

appendParam(appUrl, "bundle", bundleUrl);
appendParam(appUrl, "bundleType", readOption("bundle-type", "MAP_BUNDLE_TYPE"));
appendParam(appUrl, "configs", readOption("configs", "MAP_CONFIGS"));
appendParam(appUrl, "owc", readOption("owc", "MAP_OWC"));
appendParam(appUrl, "layout", readOption("layout", "MAP_LAYOUT"));
appendParam(appUrl, "plugins", readOption("plugins", "MAP_PLUGINS"));
appendParam(appUrl, "channel", readOption("channel", "MAP_CHANNEL"));
appendParam(appUrl, "signalr", signalrUrl);
appendParam(
  appUrl,
  "signalrAutoConnect",
  readOption("signalr-auto-connect", "SIGNALR_AUTO_CONNECT"),
);

manifest.id = readOption("app-id", "TEAMS_APP_ID", manifest.id);
manifest.version = readOption("app-version", "TEAMS_APP_VERSION", manifest.version);
manifest.name.short = readOption(
  "name-short",
  "TEAMS_APP_NAME_SHORT",
  manifest.name.short,
);
manifest.name.full = readOption(
  "name-full",
  "TEAMS_APP_NAME_FULL",
  manifest.name.full,
);
manifest.developer.name = readOption(
  "developer-name",
  "TEAMS_DEVELOPER_NAME",
  manifest.developer.name,
);
manifest.developer.websiteUrl = readOption(
  "developer-website",
  "TEAMS_DEVELOPER_WEBSITE",
  manifest.developer.websiteUrl,
);
manifest.developer.privacyUrl = readOption(
  "privacy-url",
  "TEAMS_PRIVACY_URL",
  manifest.developer.privacyUrl,
);
manifest.developer.termsOfUseUrl = readOption(
  "terms-url",
  "TEAMS_TERMS_URL",
  manifest.developer.termsOfUseUrl,
);

manifest.staticTabs = manifest.staticTabs.map((tab) => ({
  ...tab,
  contentUrl: appUrl.href,
  websiteUrl: appUrl.href,
}));

const templateDomains = new Set(["example.com", "*.example.com"]);
const validDomains = new Set(
  [
    ...manifest.validDomains.filter((domain) => !templateDomains.has(domain)),
    appUrl.hostname,
    domainFromUrl(bundleUrl),
    domainFromUrl(signalrUrl),
    ...readOption("valid-domains", "VALID_DOMAINS")
      .split(",")
      .map(cleanDomain),
  ].filter(Boolean),
);
manifest.validDomains = [...validDomains].sort();

copyPackageFiles();
fs.writeFileSync(
  path.join(distDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

fs.rmSync(packagePath, { force: true });
execFileSync(
  "zip",
  ["-q", "-r", packagePath, "manifest.json", "color.png", "outline.png"],
  { cwd: distDir },
);

console.log(`Teams app package: ${packagePath}`);
console.log(`App: ${appName}`);
console.log(`Content URL: ${appUrl.href}`);
console.log(`Valid domains: ${manifest.validDomains.join(", ")}`);
