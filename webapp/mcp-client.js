(() => {
  const PROTOCOL_VERSION = "2025-03-26";
  const runtime = window.moTeamsRuntime || {};
  const params = runtime.params || new URLSearchParams(window.location.search);
  const map = document.getElementById("mo-teams-map");
  const statusText = document.getElementById("mcp-status");
  const statusDot = document.getElementById("mcp-dot");
  const runtimeInfo = document.getElementById("runtime-info");
  const output = document.getElementById("output");
  const methodInput = document.getElementById("method");
  const argsInput = document.getElementById("args");

  const state = {
    channel:
      params.get("channel") ||
      runtime.config?.map?.channel ||
      map.getAttribute("data-mcp-channel"),
    connected: false,
    ready: false,
    teamsContext: null,
    nextId: 1,
    pending: new Map(),
  };

  const setStatus = (text, ok = false) => {
    statusText.textContent = text;
    statusDot.classList.toggle("ok", ok);
  };

  const print = (value) => {
    output.textContent =
      typeof value === "string" ? value : JSON.stringify(value, null, 2);
  };

  const readJson = (text, fallback) => {
    try {
      return JSON.parse(text);
    } catch {
      return fallback;
    }
  };

  const applyQueryOverrides = () => {
    const attrMap = {
      configs: "configs",
      owc: "owc",
      layout: "layout",
      token: "token",
      plugins: "plugins",
      channel: "data-mcp-channel",
    };

    Object.entries(attrMap).forEach(([paramName, attrName]) => {
      const value = params.get(paramName);
      if (value !== null && value !== "") {
        map.setAttribute(attrName, value);
      }
    });

    state.channel = map.getAttribute("data-mcp-channel") || state.channel;
  };

  const updateRuntimeInfo = () => {
    runtimeInfo.textContent = JSON.stringify(
      {
        href: window.location.href,
        bundleUrl: runtime.bundleUrl,
        bundleType: runtime.bundleType,
        bundleLoaded: runtime.bundleLoaded,
        bundleError: runtime.bundleError,
        teamsContext: state.teamsContext,
        mapId: map.id,
        mcpChannel: state.channel,
        resolvedChannel: map.getAttribute("data-mcp-channel-resolved"),
        plugins: map.getAttribute("plugins"),
        configs: map.getAttribute("configs"),
        owc: map.getAttribute("owc"),
        layout: map.getAttribute("layout"),
        connected: state.connected,
        ready: state.ready,
      },
      null,
      2,
    );
  };

  const initializeTeams = async () => {
    const teams = window.microsoftTeams;
    if (!teams?.app?.initialize) {
      return;
    }

    await teams.app.initialize();
    state.teamsContext = await teams.app.getContext();
  };

  const notifyTeamsReady = async () => {
    const teams = window.microsoftTeams;
    if (!teams?.app?.notifySuccess || !teams?.app?.isInitialized?.()) {
      return;
    }

    await teams.app.notifySuccess();
  };

  const sendMcp = (payload) => {
    window.postMessage(
      {
        channel: state.channel,
        type: "mcp",
        direction: "client-to-server",
        payload,
      },
      window.location.origin,
    );
  };

  const requestMcp = (method, paramsValue = {}) => {
    if (!state.connected) {
      throw new Error("MCP klient neni pripojeny.");
    }

    const id = state.nextId++;
    sendMcp({ jsonrpc: "2.0", id, method, params: paramsValue });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        state.pending.delete(id);
        reject(new Error(`MCP request timeout: ${method}`));
      }, 15000);

      state.pending.set(id, { resolve, reject, timeout, method });
    });
  };

  const waitForReady = () =>
    new Promise((resolve, reject) => {
      let attempts = 0;
      const timer = setInterval(() => {
        attempts += 1;
        sendMcp("mcp-check-ready");
        if (state.ready) {
          clearInterval(timer);
          resolve();
          return;
        }
        if (attempts > 40) {
          clearInterval(timer);
          reject(new Error("MCP server not ready."));
        }
      }, 250);
    });

  const parseToolResult = (result) => {
    const text = result?.content?.find((item) => item.type === "text")?.text;
    return readJson(text, text || result);
  };

  const callTool = async (name, args = {}) => {
    const result = await requestMcp("tools/call", {
      name,
      arguments: args,
    });
    return parseToolResult(result);
  };

  const connect = async () => {
    if (state.connected) {
      return;
    }

    window.addEventListener("message", onMcpMessage);
    state.connected = true;
    setStatus("Cekam na MCP server...");
    updateRuntimeInfo();

    await waitForReady();
    await requestMcp("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: "mo-teams-tab-diagnostics",
        version: "1.0.0",
      },
    });
    sendMcp({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    });

    setStatus("MCP pripojeno", true);
    updateRuntimeInfo();
  };

  const onMcpMessage = (event) => {
    const message = event.data;
    if (
      !message ||
      message.channel !== state.channel ||
      message.type !== "mcp" ||
      message.direction !== "server-to-client"
    ) {
      return;
    }

    if (message.payload === "mcp-server-ready") {
      state.ready = true;
      updateRuntimeInfo();
      return;
    }

    if (message.payload === "mcp-server-stopped") {
      state.ready = false;
      setStatus("MCP server zastaven");
      updateRuntimeInfo();
      return;
    }

    const payload = message.payload;
    if (!payload || typeof payload !== "object" || !("id" in payload)) {
      return;
    }

    const pending = state.pending.get(payload.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    state.pending.delete(payload.id);

    if (payload.error) {
      pending.reject(
        new Error(payload.error.message || `MCP error: ${pending.method}`),
      );
      return;
    }

    pending.resolve(payload.result);
  };

  const bindActions = () => {
    document.getElementById("btn-connect").addEventListener("click", () => {
      connect().catch((error) => {
        setStatus("MCP chyba");
        print(error.stack || error.message || String(error));
      });
    });

    document.getElementById("btn-tools").addEventListener("click", async () => {
      try {
        await connect();
        const result = await requestMcp("tools/list", {});
        print(result);
      } catch (error) {
        print(error.stack || error.message || String(error));
      }
    });

    document
      .getElementById("btn-providers")
      .addEventListener("click", async () => {
        try {
          await connect();
          const result = await callTool("webcomponent_api_invoke", {
            method: "getApiProviders",
            args: [],
          });
          print(result);
        } catch (error) {
          print(error.stack || error.message || String(error));
        }
      });

    document.getElementById("btn-invoke").addEventListener("click", async () => {
      try {
        await connect();
        const args = readJson(argsInput.value, []);
        if (!Array.isArray(args)) {
          throw new Error("Argumenty musi byt JSON pole.");
        }
        const result = await callTool("webcomponent_api_invoke", {
          method: methodInput.value.trim(),
          args,
        });
        print(result);
      } catch (error) {
        print(error.stack || error.message || String(error));
      }
    });

    document
      .getElementById("btn-subscribe")
      .addEventListener("click", async () => {
        try {
          await connect();
          print(
            await callTool("webcomponent_dom_event_subscribe", {
              eventName: "*",
            }),
          );
        } catch (error) {
          print(error.stack || error.message || String(error));
        }
      });

    document.getElementById("btn-pull").addEventListener("click", async () => {
      try {
        await connect();
        print(
          await callTool("webcomponent_dom_event_pull", {
            limit: 50,
            clear: true,
          }),
        );
      } catch (error) {
        print(error.stack || error.message || String(error));
      }
    });
  };

  const onMapInitialized = () => {
    setStatus("Mapa inicializovana, MCP pripraveno k pripojeni");
    updateRuntimeInfo();
    notifyTeamsReady().catch((error) => {
      console.warn("[teams] notifySuccess failed", error);
    });
  };

  const main = async () => {
    applyQueryOverrides();
    bindActions();
    window.addEventListener("mo-teams-runtime-updated", updateRuntimeInfo);
    map.addEventListener("map-window-initialized", onMapInitialized);
    setStatus("Cekam na map-window-app...");
    await customElements.whenDefined("map-window-app");
    setStatus("map-window-app registrovan, cekam na inicializaci mapy");
    await initializeTeams().catch((error) => {
      console.warn("[teams] initialize failed", error);
    });
    if (map.initialized) {
      onMapInitialized();
    }
    updateRuntimeInfo();
  };

  main().catch((error) => {
    setStatus("Inicializace selhala");
    print(error.stack || error.message || String(error));
  });
})();
