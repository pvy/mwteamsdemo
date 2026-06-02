(() => {
  const DEFAULT_CONFIG = {
    bundleUrl: "",
    bundleType: "module",
    map: {
      id: "mo-teams-map",
      channel: "mo-teams-app",
      plugins: "+mcp",
      configs: "",
      owc: "",
      layout: "",
      token: "",
    },
    signalR: {
      url: "",
      autoConnect: false,
    },
  };

  const params = new URLSearchParams(window.location.search);
  const map = document.getElementById("mo-teams-map");
  const bundleStatus = document.getElementById("bundle-status");
  const bundleDot = document.getElementById("bundle-dot");
  const output = document.getElementById("output");

  const mergeConfig = (base, override) => ({
    ...base,
    ...override,
    map: {
      ...base.map,
      ...(override?.map || {}),
    },
    signalR: {
      ...base.signalR,
      ...(override?.signalR || {}),
    },
  });

  const readBoolean = (value, fallback) => {
    if (value === null || value === undefined || value === "") {
      return fallback;
    }

    return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
  };

  const setStatus = (text, ok = false) => {
    if (bundleStatus) {
      bundleStatus.textContent = text;
    }
    if (bundleDot) {
      bundleDot.classList.toggle("ok", ok);
    }
    window.dispatchEvent(new CustomEvent("mo-teams-runtime-updated"));
  };

  const print = (message) => {
    if (output) {
      output.textContent = `${message}\n\n${output.textContent || ""}`;
    }
  };

  const config = mergeConfig(DEFAULT_CONFIG, window.moTeamsConfig || {});
  const bundleUrl = params.get("bundle") || params.get("bundleUrl") || config.bundleUrl;
  const bundleType = params.get("bundleType") || config.bundleType || "classic";

  const runtime = {
    config,
    params,
    bundleUrl,
    bundleType,
    bundleLoaded: false,
    bundleError: null,
    setBundleStatus: setStatus,
  };

  window.moTeamsRuntime = runtime;

  const setMapAttribute = (attrName, value) => {
    if (value !== undefined && value !== null && value !== "") {
      map.setAttribute(attrName, String(value));
    }
  };

  const applyMapConfig = () => {
    if (!map) {
      runtime.bundleError = "Element map-window-app nebyl nalezen.";
      setStatus("Mapa nenalezena");
      print(runtime.bundleError);
      return false;
    }

    const mapConfig = config.map || {};
    const mapId = params.get("mapId") || mapConfig.id;
    if (mapId) {
      map.id = mapId;
    }

    setMapAttribute(
      "data-mcp-channel",
      params.get("channel") || mapConfig.channel,
    );
    setMapAttribute("plugins", params.get("plugins") || mapConfig.plugins);
    setMapAttribute("configs", params.get("configs") || mapConfig.configs);
    setMapAttribute("owc", params.get("owc") || mapConfig.owc);
    setMapAttribute("layout", params.get("layout") || mapConfig.layout);
    setMapAttribute("token", params.get("token") || mapConfig.token);

    config.signalR = {
      ...(config.signalR || {}),
      url: params.get("signalr") || config.signalR?.url || "",
      autoConnect: readBoolean(
        params.get("signalrAutoConnect"),
        config.signalR?.autoConnect || false,
      ),
    };

    return true;
  };

  const loadBundle = () => {
    if (!bundleUrl) {
      runtime.bundleError = "Neni nastavena URL webcomponent bundle.";
      setStatus("Bundle URL chybi");
      print(runtime.bundleError);
      return;
    }

    let resolvedUrl;
    try {
      resolvedUrl = new URL(bundleUrl, window.location.href);
    } catch (error) {
      runtime.bundleError = `Neplatna bundle URL: ${error.message}`;
      setStatus("Bundle URL je neplatna");
      print(runtime.bundleError);
      return;
    }

    const script = document.createElement("script");
    if (bundleType === "module") {
      script.type = "module";
      script.crossOrigin = "anonymous";
    } else {
      script.defer = true;
    }
    script.async = false;
    script.src = resolvedUrl.href;

    script.addEventListener("load", async () => {
      runtime.bundleLoaded = true;
      setStatus("Bundle nacten", true);
      await customElements.whenDefined("map-window-app");
      setStatus("map-window-app registrovan", true);
    });
    script.addEventListener("error", () => {
      runtime.bundleError = `Nepodarilo se nacist ${resolvedUrl.href}`;
      setStatus("Bundle se nenacetl");
      print(runtime.bundleError);
    });

    setStatus("Nacitam bundle...");
    document.head.appendChild(script);
  };

  if (applyMapConfig()) {
    loadBundle();
  }
})();
