(() => {
  const DEFAULT_SIGNALR_URL = "https://mwws.service.signalr.net";
  const PROTOCOL_VERSION = "2025-03-26";

  const runtime = window.moTeamsRuntime || {};
  const params = runtime.params || new URLSearchParams(window.location.search);
  const map = document.getElementById("mo-teams-map");
  const output = document.getElementById("output");
  const runtimeInfo = document.getElementById("runtime-info");
  const connectButton = document.getElementById("btn-signalr");

  const sessionId =
    params.get("session") ||
    map.getAttribute("data-mcp-channel") ||
    map.getAttribute("id") ||
    "mo-teams-app";
  const signalrUrl =
    params.get("signalr") || runtime.config?.signalR?.url || DEFAULT_SIGNALR_URL;
  const signalrToken = params.get("signalrToken") || "";
  const shouldAutoConnect = runtime.config?.signalR?.autoConnect || false;
  const targetOrigin = window.location.origin;

  const state = {
    connection: null,
    connectedToLocalMcp: false,
    localMcpReady: false,
    nextId: 1,
    pending: new Map(),
  };

  const log = (message, data) => {
    const line = `[signalr] ${message}`;
    console.info(line, data || "");
    if (output) {
      output.textContent = `${line}${data ? `\n${JSON.stringify(data, null, 2)}` : ""}\n\n${output.textContent || ""}`;
    }
  };

  const patchRuntimeInfo = () => {
    if (!runtimeInfo) {
      return;
    }

    let value = {};
    try {
      value = JSON.parse(runtimeInfo.textContent || "{}");
    } catch {
      value = {};
    }

    value.signalR = {
      url: signalrUrl,
      sessionId,
      state: state.connection?.state || "Disconnected",
      connectedToLocalMcp: state.connectedToLocalMcp,
      localMcpReady: state.localMcpReady,
    };
    runtimeInfo.textContent = JSON.stringify(value, null, 2);
  };

  const sendLocalMcp = (payload) => {
    window.postMessage(
      {
        channel: map.getAttribute("data-mcp-channel") || sessionId,
        type: "mcp",
        direction: "client-to-server",
        payload,
      },
      targetOrigin,
    );
  };

  const waitForLocalMcpReady = () =>
    new Promise((resolve, reject) => {
      let attempts = 0;
      const timer = setInterval(() => {
        attempts += 1;
        sendLocalMcp("mcp-check-ready");
        if (state.localMcpReady) {
          clearInterval(timer);
          resolve();
          return;
        }
        if (attempts > 40) {
          clearInterval(timer);
          reject(new Error("Local browser MCP server is not ready."));
        }
      }, 250);
    });

  const requestLocalMcp = (method, paramsValue = {}) => {
    if (!state.connectedToLocalMcp) {
      throw new Error("Local MCP client is not connected.");
    }

    const id = state.nextId++;
    sendLocalMcp({ jsonrpc: "2.0", id, method, params: paramsValue });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        state.pending.delete(id);
        reject(new Error(`Local MCP request timeout: ${method}`));
      }, 15000);

      state.pending.set(id, { resolve, reject, timeout, method });
    });
  };

  const onLocalMcpMessage = (event) => {
    const message = event.data;
    if (
      !message ||
      message.channel !== (map.getAttribute("data-mcp-channel") || sessionId) ||
      message.type !== "mcp" ||
      message.direction !== "server-to-client"
    ) {
      return;
    }

    if (message.payload === "mcp-server-ready") {
      state.localMcpReady = true;
      patchRuntimeInfo();
      return;
    }

    if (message.payload === "mcp-server-stopped") {
      state.localMcpReady = false;
      patchRuntimeInfo();
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
        new Error(payload.error.message || `Local MCP error: ${pending.method}`),
      );
      return;
    }

    pending.resolve(payload.result);
  };

  const connectLocalMcp = async () => {
    if (state.connectedToLocalMcp) {
      return;
    }

    window.addEventListener("message", onLocalMcpMessage);
    state.connectedToLocalMcp = true;
    await waitForLocalMcpReady();
    await requestLocalMcp("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: "mo-teams-signalr-client",
        version: "0.1.0",
      },
    });
    sendLocalMcp({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    });
    patchRuntimeInfo();
  };

  const callLocalTool = async (toolName, args = {}) => {
    await connectLocalMcp();
    return requestLocalMcp("tools/call", {
      name: toolName,
      arguments: args,
    });
  };

  const reply = async (requestId, result, error) => {
    if (!state.connection) {
      return;
    }

    const payload = {
      requestId,
      sessionId,
      result: error ? undefined : result,
      error: error ? String(error.message || error) : undefined,
    };

    await state.connection.invoke("MapWindowToolResponse", payload);
  };

  const handleToolRequest = async (request) => {
    const requestId = request?.requestId || request?.id || `${Date.now()}`;
    const toolName = request?.toolName || request?.name;
    const args = request?.args || request?.arguments || {};

    try {
      if (!toolName) {
        throw new Error("SignalR tool request is missing toolName.");
      }

      log("tool request", { requestId, toolName, args });
      const result = await callLocalTool(toolName, args);
      await reply(requestId, result);
    } catch (error) {
      log("tool request failed", {
        requestId,
        message: error.message || String(error),
      });
      await reply(requestId, null, error);
    }
  };

  const connectSignalR = async () => {
    if (!window.signalR) {
      throw new Error("SignalR browser client is not loaded.");
    }

    await connectLocalMcp();

    const connection = new window.signalR.HubConnectionBuilder()
      .withUrl(signalrUrl, {
        accessTokenFactory: () => signalrToken,
      })
      .withAutomaticReconnect()
      .configureLogging(window.signalR.LogLevel.Information)
      .build();

    connection.on("MapWindowToolRequest", handleToolRequest);
    connection.on("mapWindowToolRequest", handleToolRequest);
    connection.on("McpToolRequest", handleToolRequest);
    connection.on("mcpToolRequest", handleToolRequest);

    connection.onreconnecting((error) => {
      log("reconnecting", { message: error?.message || String(error || "") });
      patchRuntimeInfo();
    });
    connection.onreconnected(async () => {
      await registerSession().catch((error) => {
        log("session registration failed", {
          message: error.message || String(error),
        });
      });
      patchRuntimeInfo();
    });
    connection.onclose((error) => {
      log("closed", { message: error?.message || String(error || "") });
      patchRuntimeInfo();
    });

    state.connection = connection;
    await connection.start();
    await registerSession();
    log("connected", { signalrUrl, sessionId });
    patchRuntimeInfo();
  };

  const registerSession = async () => {
    await state.connection.invoke("RegisterMapWindow", {
      sessionId,
      channel: map.getAttribute("data-mcp-channel") || sessionId,
      mapId: map.id,
      href: window.location.href,
    });
  };

  window.moTeamsSignalR = {
    connect: connectSignalR,
    callLocalTool,
    state,
  };

  if (connectButton) {
    connectButton.addEventListener("click", () => {
      connectSignalR().catch((error) => {
        log("connection failed", {
          message: error.message || String(error),
        });
      });
    });
  }

  const onMapInitialized = () => {
    if (shouldAutoConnect) {
      connectSignalR().catch((error) => {
        log("connection failed", {
          message: error.message || String(error),
        });
      });
    } else {
      patchRuntimeInfo();
    }
  };

  map.addEventListener("map-window-initialized", onMapInitialized);
  customElements.whenDefined("map-window-app").then(() => {
    if (map.initialized) {
      onMapInitialized();
    }
  });
})();
