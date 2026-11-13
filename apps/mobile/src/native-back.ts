/** Give the top overlay its normal Escape/cancel path before changing navigation. */
export function dismissNativeOverlay() {
  const overlays = document.querySelectorAll(
    'dialog[open], [role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]',
  );
  const overlay = overlays.item(overlays.length - 1);
  if (typeof HTMLDialogElement !== "undefined" && overlay instanceof HTMLDialogElement) {
    const cancel = new Event("cancel", { cancelable: true });
    overlay.dispatchEvent(cancel);
    if (!cancel.defaultPrevented && overlay.open) overlay.close();
    return true;
  }
  if (overlay || document.getElementById("marketplace-menu")) {
    (document.activeElement ?? document).dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
    return true;
  }
  return false;
}
