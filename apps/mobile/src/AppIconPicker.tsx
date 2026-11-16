import { Capacitor, registerPlugin } from "@capacitor/core";
import { useEffect, useRef, useState } from "react";
import { CheckCircle } from "@phosphor-icons/react";

const icons = [
  ["yellow", "Yellow"],
  ["blue-gloss", "Blue gloss"],
  ["sky-shadow", "Sky blue shadow"],
  ["midnight", "Midnight blue"],
  ["sky", "Sky blue"],
  ["black", "Black"],
  ["yellow-gloss", "Yellow gloss"],
  ["blue", "Blue"],
] as const;
type IconStatus = { supported: boolean; current: string };
export type AppIconAdapter = {
  status(): Promise<IconStatus>;
  setIcon(options: { id: string }): Promise<IconStatus>;
};
const nativeIcons = registerPlugin<AppIconAdapter>("BluebirdAppIcon");

/** The OS owns this device preference. No account write or remote icon changes. */
export function AppIconPicker({ adapter }: { adapter?: AppIconAdapter }) {
  const available = adapter || Capacitor.getPlatform() === "ios";
  const service = adapter ?? nativeIcons;
  const [status, setStatus] = useState<IconStatus | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const locked = useRef(false);
  useEffect(() => {
    if (!available) return;
    let active = true;
    setError("");
    service
      .status()
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch(() => {
        if (active) setError("Your app icons couldn’t load. Please try again.");
      });
    return () => {
      active = false;
    };
  }, [available, service, revision]);
  if (!available) return null;
  const choose = async (id: string) => {
    if (locked.current || !status?.supported || status.current === id) return;
    locked.current = true;
    setPending(id);
    setError("");
    try {
      setStatus(await service.setIcon({ id }));
    } catch {
      setError("The icon couldn’t change. Keep Bluebird open and try again.");
    } finally {
      locked.current = false;
      setPending(null);
    }
  };
  return (
    <section
      aria-labelledby="app-icon-heading"
      className="native-app-icon-picker rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <h3 id="app-icon-heading" className="text-[0.824em] font-bold">
        App icon
      </h3>
      <p className="mt-1 text-[0.706em] leading-relaxed text-muted-foreground">
        Choose the Bluebird on your Home Screen. This changes only this iPhone.
      </p>
      {!status && !error && (
        <p role="status" className="mt-4 text-[0.706em]">
          Loading app icons…
        </p>
      )}
      {status?.supported === false && (
        <p className="mt-4 text-[0.706em]">Icon changes aren’t available on this device.</p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-[0.706em] text-destructive">
          {error}
        </p>
      )}
      {!status && error && (
        <button
          type="button"
          className="mt-2 min-h-11 text-[0.706em] font-semibold text-primary underline"
          onClick={() => setRevision((value) => value + 1)}
        >
          Try again
        </button>
      )}
      {status?.supported && (
        <>
          <div
            className="native-app-icon-grid mx-auto mt-5 grid w-full gap-x-3 gap-y-4"
            role="group"
            aria-label="Choose an app icon"
            aria-busy={pending !== null}
          >
            {icons.map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-label={label}
                aria-pressed={status.current === id}
                disabled={pending !== null}
                onClick={() => void choose(id)}
                className="group flex min-h-11 flex-col items-center gap-2 rounded-xl py-1 text-center text-[0.647em] text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:cursor-wait"
              >
                <span className="relative block w-full max-w-[72px]">
                  <img
                    src={`/app-icons/${id}.png`}
                    alt=""
                    width={72}
                    height={72}
                    className={`aspect-square w-full rounded-2xl ${status.current === id ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : "group-hover:ring-2 group-hover:ring-border"}`}
                  />
                  {status.current === id && (
                    <CheckCircle
                      size={20}
                      weight="fill"
                      aria-hidden="true"
                      className="absolute -bottom-1 -right-1 rounded-full bg-card text-primary"
                    />
                  )}
                </span>
                <span>{label}</span>
              </button>
            ))}
          </div>
          <p role="status" aria-live="polite" className="mt-4 text-[0.706em] text-muted-foreground">
            {pending
              ? "Changing app icon…"
              : `Current: ${icons.find(([id]) => id === status.current)?.[1] ?? "Original blue"}`}
          </p>
          {status.current !== "original" && (
            <button
              type="button"
              disabled={pending !== null}
              className="mt-2 min-h-11 text-[0.706em] font-semibold text-primary underline disabled:opacity-50"
              onClick={() => void choose("original")}
            >
              Use original icon
            </button>
          )}
        </>
      )}
    </section>
  );
}
