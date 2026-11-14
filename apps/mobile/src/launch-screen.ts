let closing = false;

/** Hand off the bundled launch artwork to the real header, once the first
 * screen has data. Below-fold lazy images never hold startup hostage. */
export async function finishLaunchScreen(waitForPhotos = false) {
  const screen = document.getElementById("bluebird-launch");
  if (!screen || closing) return;
  closing = true;
  if (waitForPhotos) {
    const photos = [...document.querySelectorAll<HTMLImageElement>(".mobile-home img")]
      .filter((image) => {
        const rect = image.getBoundingClientRect();
        return rect.top < innerHeight && rect.bottom > 0;
      })
      .slice(0, 4);
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.all(photos.map((image) => image.decode().catch(() => {}))),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 1800);
      }),
    ]);
    clearTimeout(timer);
  }
  const logo = screen.querySelector<HTMLImageElement>("img");
  const target = document.querySelector<HTMLImageElement>(".native-brand-row img");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const from = logo?.getBoundingClientRect(),
    targetBox = target?.getBoundingClientRect();
  // BrandMark uses object-contain: animate to the artwork within its box,
  // rather than stretching our full-ratio logo into the wider header box.
  const width =
    targetBox && logo?.naturalWidth
      ? Math.min(targetBox.width, (targetBox.height * logo.naturalWidth) / logo.naturalHeight)
      : 0;
  const height = logo?.naturalWidth ? (width * logo.naturalHeight) / logo.naturalWidth : 0;
  const to = targetBox
    ? {
        left: targetBox.left + (targetBox.width - width) / 2,
        top: targetBox.top + (targetBox.height - height) / 2,
        width,
        height,
      }
    : null;
  const backdrop = screen.querySelector<HTMLElement>(".launch-background");
  screen.classList.add("is-ready");
  if (logo && from && to && to.width > 0 && !reduced) {
    const animation = logo.animate(
      [
        { transform: "translate(0, 0) scale(1)" },
        {
          transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width}, ${to.height / from.height})`,
        },
      ],
      { duration: 380, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "forwards" },
    );
    backdrop?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "forwards" });
    await animation.finished.catch(() => {});
  } else {
    await screen
      .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100 })
      .finished.catch(() => {});
  }
  document.getElementById("root")?.removeAttribute("inert");
  screen.remove();
}

export function launchFailed() {
  const screen = document.getElementById("bluebird-launch");
  if (!screen) return;
  const status = screen.querySelector("p");
  if (status) {
    status.className = "";
    status.textContent = "Bluebird could not open. Please try again.";
  }
  const button = screen.querySelector("button");
  if (button) {
    button.hidden = false;
    button.onclick = () => location.reload();
  }
}
