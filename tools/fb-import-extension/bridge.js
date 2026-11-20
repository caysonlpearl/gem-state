// Runs only on the GemList admin site. Lets the admin page ask the extension
// to refresh already-imported listings, and relays progress/results back.
// It never touches Facebook and carries no data except listing URLs out and
// extracted listing text back.
window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const data = event.data;
  if (!data || typeof data.type !== "string") return;
  if (data.type === "gemlist-ext-ping") {
    window.postMessage(
      { type: "gemlist-ext-pong", version: chrome.runtime.getManifest().version },
      window.location.origin,
    );
  } else if (data.type === "gemlist-ext-status" || data.type === "gemlist-ext-show-import") {
    chrome.runtime
      .sendMessage({ type: data.type === "gemlist-ext-status" ? "import-status" : "show-import" })
      .then((status) =>
        window.postMessage(
          { type: "gemlist-ext-status-result", ...status },
          window.location.origin,
        ),
      )
      .catch(() => {});
  } else if (data.type === "gemlist-ext-report" || data.type === "gemlist-ext-saved") {
    chrome.runtime
      .sendMessage({
        type: data.type === "gemlist-ext-report" ? "import-report" : "import-saved",
        requestId: data.requestId,
        sourceProfileUrl: data.sourceProfileUrl,
        staged: data.staged,
        updated: data.updated,
      })
      .then(
        (result) =>
          window.postMessage(
            { ...result, type: "gemlist-ext-journal-result", token: data.token },
            window.location.origin,
          ),
        () =>
          window.postMessage(
            { journalError: true, type: "gemlist-ext-journal-result", token: data.token },
            window.location.origin,
          ),
      );
  } else if (data.type === "gemlist-ext-refresh") {
    chrome.runtime
      .sendMessage({
        type: "refresh",
        streamReports: data.streamReports,
        requestId: data.requestId,
        targets: data.targets,
        profiles: data.profiles,
      })
      .catch(() => {
        window.postMessage(
          {
            type: "gemlist-fb-refresh-result",
            requestId: data.requestId,
            error:
              "Chrome could not start the importer. Check the extension connection and try again.",
          },
          window.location.origin,
        );
      });
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === "gemlist-ext-event") {
    window.postMessage(message.payload, window.location.origin);
  }
});
