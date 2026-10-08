// Runs only on the GemList admin site. Lets the admin page ask the extension
// to refresh already-imported listings, and relays progress/results back.
// It never touches Facebook and carries no data except listing URLs out and
// extracted listing text back.
window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const data = event.data;
  if (!data || typeof data.type !== "string") return;
  if (data.type === "gemlist-ext-ping") {
    window.postMessage({ type: "gemlist-ext-pong" }, window.location.origin);
  } else if (data.type === "gemlist-ext-refresh") {
    chrome.runtime.sendMessage({
      type: "refresh",
      requestId: data.requestId,
      targets: data.targets,
    });
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === "gemlist-ext-event") {
    window.postMessage(message.payload, window.location.origin);
  }
});
