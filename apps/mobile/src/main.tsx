/* eslint-disable react-refresh/only-export-components -- application entrypoint mounts its local screens. */
import { useEffect, useState, useRef, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import type {
  ConversationSummary,
  ConversationDetail,
} from "../../../src/lib/conversation.functions";
import type { MobileAdConsent } from "../../../src/lib/mobile-advertising";
import type { Session } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { App as NativeApp } from "@capacitor/app";
import { PushNotifications } from "@capacitor/push-notifications";
import { Share } from "@capacitor/share";
import {
  MagnifyingGlass,
  Heart,
  PlusCircle,
  ChatCircle,
  UserCircle,
  ArrowLeft,
} from "@phosphor-icons/react";
import type { MobileListing, MobileBrowse } from "../../../src/lib/mobile-contract";
import {
  api,
  apiOrigin,
  auth,
  initialize,
  socialLogin,
  finishLogin,
  mobileLinkTarget,
  type Bootstrap,
  ApiError,
} from "./client";
import { sendMessageOnce, clearMessageRetries } from "./message-retries";
import { ListingGallery } from "../../../src/components/classifieds/ListingGallery";
import { listingPresentation } from "./listing-presentation";
import { MarketplaceHero } from "../../../src/components/classifieds/MarketplaceHero";
import { HomeSearchDropdown } from "../../../src/components/classifieds/HomeSearchDropdown";
import { headlineOptions } from "../../../src/config/homepage-headlines";
import { parseLocationSearch } from "../../../src/lib/location-search";
import { suggestLocations } from "../../../src/lib/location-suggest";
import { ListingSourceCredits } from "./ListingSourceCredits";
import { HomeDiscovery } from "./HomeDiscovery";
import type { MobileHome } from "../../../src/lib/mobile-contract";
import { BrandMark } from "../../../src/components/layout/BrandMark";
import { SavedCardsProvider } from "./SavedCards";
import { Post } from "./Post";
import { useListingActivity, setShoppingForeground } from "./shopping-activity";
import { ListingTile, ShoppingRows, PrivacyChoices } from "./ShopperExperience";
import {
  setShopperIdentity,
  applyShopperStatus,
  shopperStatus,
  trackShopping,
  flushShopping,
  resetShoppingSession,
  type ShopperStatus,
} from "./shopping";
import {
  configureAdvertising,
  disableAdvertising,
  setAdvertising,
  trackAdvertising,
} from "./advertising";
import "./style.css";

const tabs = [
  { path: "/", label: "Browse", Icon: MagnifyingGlass },
  { path: "/saved", label: "Saved", Icon: Heart },
  { path: "/post", label: "Post", Icon: PlusCircle },
  { path: "/messages", label: "Messages", Icon: ChatCircle },
  { path: "/account", label: "Account", Icon: UserCircle },
];
const currentPath = () => location.hash.slice(1).split("?")[0] || "/";
function go(path: string) {
  if (path === "/") window.dispatchEvent(new Event("bluebird-home"));
  location.hash = path;
}
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";
const money = (c: MobileListing) =>
  c.priceLabel ??
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: c.currency || "USD",
    maximumFractionDigits: c.priceCents % 100 === 0 ? 0 : 2,
  }).format(c.priceCents / 100);

function Application() {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null),
    [session, setSession] = useState<Session | null>(null);
  const [path, setPath] = useState(currentPath),
    [error, setError] = useState("");
  const [account, setAccount] = useState<{
      account: { displayName: string | null };
      consent: { terms_version: string | null; shopping_alerts: boolean };
    } | null>(null),
    [revision, setRevision] = useState(0),
    [recovery, setRecovery] = useState(false);
  const [alerts, setAlerts] = useState(false),
    [terms, setTerms] = useState(false),
    [busy, setBusy] = useState(false);
  const [advertising, setAdvertisingChoice] = useState(false);
  const [shopping, setShopping] = useState<ShopperStatus | null>(null),
    [privacyOpen, setPrivacyOpen] = useState(false);
  const learning = shopping?.personalization === true && shopping.trackingAvailable === true;
  const [pushToken, setPushToken] = useState<string | null>(null);
  useEffect(() => {
    let alive = true,
      stop = () => {};
    initialize()
      .then(async (b) => {
        if (!alive) return;
        const advertisingReady = configureAdvertising(b.features.advertising);
        b.features.advertising = advertisingReady;
        await disableAdvertising();
        setBootstrap(b);
        const { data } = await auth.auth.getSession();
        setShopperIdentity(data.session?.user.id ?? null);
        if (alive) setSession(data.session);
        let priorUserId = data.session?.user.id;
        const listener = auth.auth.onAuthStateChange((event, next) => {
          if (!alive) return;
          if (next?.user.id !== priorUserId) {
            clearMessageRetries();
            setAccount(null);
            setAlerts(false);
            void disableAdvertising();
            setShopperIdentity(next?.user.id ?? null);
            setShopping(null);
            setPrivacyOpen(false);
          }
          priorUserId = next?.user.id;
          setSession(next);
          if (event === "PASSWORD_RECOVERY") setRecovery(true);
        });
        stop = () => listener.data.subscription.unsubscribe();
        if (location.search.includes("code=") || location.hash.includes("code=")) {
          await finishLogin(location.href);
          if (alive) go("/account");
        }
      })
      .catch((e) => {
        if (alive) setError(message(e));
      });
    const hash = () => {
      setPath(currentPath());
      setError("");
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", hash);
    return () => {
      alive = false;
      stop();
      window.removeEventListener("hashchange", hash);
    };
  }, []);
  useEffect(() => {
    if (!bootstrap) return;
    setShopperIdentity(session?.user.id ?? null);
    let alive = true;
    shopperStatus()
      .then((status) => {
        if (alive) {
          applyShopperStatus(status);
          setShopping(status);
        }
      })
      .catch(() => {
        if (alive) {
          applyShopperStatus(null);
          setShopping(null);
        }
      });
    return () => {
      alive = false;
    };
  }, [session?.user.id, bootstrap, revision]);
  useEffect(() => {
    if (!session?.user.id || !bootstrap) return;
    let alive = true;
    api<{
      account: { displayName: string | null };
      consent: { terms_version: string | null; shopping_alerts: boolean };
    }>("account")
      .then((a) => {
        if (alive) {
          setAccount(a);
          setAlerts(a.consent.shopping_alerts === true);
        }
      })
      .catch((e) => {
        if (alive) setError(message(e));
      });
    return () => {
      alive = false;
    };
  }, [session?.user.id, bootstrap, revision]);
  useEffect(() => {
    if (!bootstrap || !Capacitor.isNativePlatform()) return;
    let alive = true;
    let lastActive = Date.now();
    const handlers = [
      NativeApp.addListener("appUrlOpen", async ({ url }) => {
        try {
          const target = mobileLinkTarget(url);
          if (target === "/auth/callback") {
            if (await finishLogin(url)) go("/account");
          } else if (target) go(target);
        } catch (e) {
          if (alive) setError(message(e));
        }
      }),
      NativeApp.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack && currentPath() !== "/") history.back();
        else if (currentPath() !== "/") go("/");
        else void NativeApp.exitApp();
      }),
      NativeApp.addListener("appStateChange", ({ isActive }) => {
        setShoppingForeground(isActive);
        if (isActive) {
          if (Date.now() - lastActive > 30 * 60000) resetShoppingSession();
          void auth.auth.startAutoRefresh();
          setRevision((v) => v + 1);
        } else {
          lastActive = Date.now();
          void flushShopping();
          auth.auth.stopAutoRefresh();
        }
      }),
    ];
    void NativeApp.getState()
      .then((state) => setShoppingForeground(state.isActive))
      .catch(() => undefined);
    void NativeApp.getLaunchUrl()
      .then(async (result) => {
        if (!result || !alive) return;
        const target = mobileLinkTarget(result.url);
        if (target === "/auth/callback") {
          if (await finishLogin(result.url)) go("/account");
        } else if (target) go(target);
      })
      .catch((e) => setError(message(e)));
    return () => {
      alive = false;
      for (const p of handlers) void p.then((h) => h.remove());
    };
  }, [bootstrap]);
  useEffect(() => {
    if (!bootstrap?.features.push || !Capacitor.isNativePlatform() || !session?.user.id) return;
    if (Capacitor.getPlatform() === "android")
      void PushNotifications.createChannel({
        id: "bluebird_updates",
        name: "Bluebird updates",
        description: "Messages and permitted shopping alerts",
        importance: 4,
        visibility: 0,
      }).catch(() => undefined);
    const platform = Capacitor.getPlatform() as "ios" | "android";
    const registrations = [
      PushNotifications.addListener("pushNotificationReceived", () => setRevision((v) => v + 1)),
      PushNotifications.addListener("registration", (token) => {
        setPushToken(token.value);
        void api("devices", "PUT", { token: token.value, platform }).catch((e) =>
          setError(message(e)),
        );
      }),
      PushNotifications.addListener("registrationError", () =>
        setError("Phone notifications could not be connected. You can still use Bluebird."),
      ),
      PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
        const target = mobileLinkTarget(String(event.notification.data?.url ?? ""));
        if (target) go(target);
      }),
    ];
    void PushNotifications.checkPermissions()
      .then((p) => {
        if (p.receive === "granted") return PushNotifications.register();
      })
      .catch(() => undefined);
    return () => {
      for (const p of registrations) void p.then((h) => h.remove());
    };
  }, [session?.user.id, bootstrap?.features.push]);
  useEffect(() => {
    if (!session?.user.id || !bootstrap?.features.advertising || !Capacitor.isNativePlatform())
      return;
    let alive = true;
    api<MobileAdConsent | null>(`advertising?platform=${Capacitor.getPlatform()}`)
      .then(async (c) => {
        if (!alive || !c) return;
        setAdvertisingChoice(c.advertising);
        await setAdvertising(c.advertising, false);
      })
      .catch(() => disableAdvertising());
    return () => {
      alive = false;
      void disableAdvertising();
    };
  }, [session?.user.id, bootstrap?.features.advertising, revision]);
  const signOut = async () => {
    setBusy(true);
    setError("");
    try {
      await disableAdvertising();
      applyShopperStatus(null);
      setShopping(null);
      setAdvertisingChoice(false);
      if (pushToken) {
        await api("devices", "DELETE", { token: pushToken });
        await PushNotifications.unregister();
        setPushToken(null);
      }
      const { error: e } = await auth.auth.signOut();
      if (e) throw e;
      for (const key of Object.keys(sessionStorage))
        if (key.startsWith("bb-draft-")) sessionStorage.removeItem(key);
      setAccount(null);
      go("/");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const saveConsent = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!bootstrap) return;
    setBusy(true);
    setError("");
    try {
      await api("consent", "PUT", {
        acceptTerms: true,
        shoppingAlerts: alerts,
        version: bootstrap.policyVersion,
      });
      setTerms(false);
      setRevision((v) => v + 1);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const needsTerms =
    session && account && bootstrap && account.consent.terms_version !== bootstrap.policyVersion;
  return (
    <SavedCardsProvider userId={session?.user.id ?? null} revision={revision} onError={setError}>
      <PrivacyChoices
        open={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
        status={shopping}
        onStatus={(status) => {
          applyShopperStatus(status);
          setShopping(status);
          setRevision((v) => v + 1);
        }}
        userId={session?.user.id ?? null}
      />
      <header className="mobile-site-header">
        <button className="brand" onClick={() => go("/")}>
          <BrandMark mobile />
        </button>
        <button className="text-button" onClick={() => setPrivacyOpen(true)}>
          Privacy
        </button>
        {path.startsWith("/listings/") || path.startsWith("/messages/") ? (
          <button
            className="back"
            aria-label="Go back"
            onClick={() => (history.length > 1 ? history.back() : go("/"))}
          >
            <ArrowLeft size={23} />
          </button>
        ) : null}
      </header>
      <main>
        {bootstrap && !needsTerms && (
          <div hidden={path !== "/"}>
            <Feed
              key={session?.user.id ?? "guest"}
              bootstrap={bootstrap}
              revision={revision}
              active={path === "/"}
              learning={learning}
            />
          </div>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
            {!bootstrap && <button onClick={() => location.reload()}>Retry connection</button>}
          </div>
        )}
        {!bootstrap ? (
          <p role="status">Connecting to Bluebird…</p>
        ) : needsTerms ? (
          <form onSubmit={saveConsent} className="stack">
            <h1>Welcome to Bluebird</h1>
            <p>
              Review the current terms and choose whether to receive personalized shopping alerts.
            </p>
            <label className="check">
              <input
                required
                type="checkbox"
                checked={terms}
                onChange={(e) => setTerms(e.target.checked)}
              />
              I agree to the{" "}
              <a href={`${apiOrigin}/terms`} target="_blank" rel="noreferrer">
                Terms of Service
              </a>
              .
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={alerts}
                onChange={(e) => setAlerts(e.target.checked)}
              />
              Send me personalized shopping emails and notifications about listings,
              recommendations, price drops, and offers.
            </label>
            <button className="primary" disabled={!terms || busy}>
              Continue
            </button>
            <button type="button" onClick={signOut}>
              Sign out
            </button>
          </form>
        ) : recovery && session ? (
          <PasswordRecovery done={() => setRecovery(false)} />
        ) : !session &&
          ["/saved", "/post", "/messages", "/account"].some((p) => path.startsWith(p)) ? (
          <Login onError={setError} />
        ) : path === "/" ? null : path.startsWith("/listings/") ? (
          <Listing
            key={`${session?.user.id ?? "guest"}:${path}`}
            id={path.slice(10)}
            session={session}
            learning={learning}
            revision={revision}
            onError={setError}
          />
        ) : path === "/post" ? (
          <Post
            key={session!.user.id}
            ownerId={session!.user.id}
            bootstrap={bootstrap}
            onPublished={(id) => go(`/listings/${id}`)}
          />
        ) : path.startsWith("/messages") ? (
          <Messages
            key={`${session?.user.id}:${path}`}
            ownerId={session!.user.id}
            id={path.split("/")[2]}
            revision={revision}
            onError={setError}
          />
        ) : path === "/account" ? (
          <section className="stack">
            <h1>Your account</h1>
            <p>{account?.account.displayName || session?.user.email}</p>
            <label className="check">
              <input
                type="checkbox"
                checked={alerts}
                onChange={(e) => {
                  const next = e.target.checked;
                  setAlerts(next);
                  setBusy(true);
                  api("consent", "PUT", {
                    acceptTerms: true,
                    shoppingAlerts: next,
                    version: bootstrap.policyVersion,
                  })
                    .catch((error) => {
                      setAlerts(!next);
                      setError(message(error));
                    })
                    .finally(() => setBusy(false));
                }}
                disabled={busy}
              />
              Personalized shopping emails and notifications
            </label>
            <p className="muted">
              Bluebird chooses relevant listings and timing. You can turn shopping alerts off at any
              time.
            </p>
            {Capacitor.isNativePlatform() && bootstrap.features.push && (
              <button
                onClick={async () => {
                  try {
                    const p = await PushNotifications.requestPermissions();
                    if (p.receive === "granted") await PushNotifications.register();
                    else
                      setError(
                        "Notifications are off. You can enable them in your phone settings.",
                      );
                  } catch (e) {
                    setError(message(e));
                  }
                }}
              >
                Enable phone notifications
              </button>
            )}
            {Capacitor.isNativePlatform() && bootstrap.features.advertising && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={advertising}
                  onChange={async (e) => {
                    const next = e.target.checked;
                    try {
                      const choice = await setAdvertising(next, true);
                      setAdvertisingChoice(
                        choice.advertising &&
                          (choice.platform === "android" || choice.att === "authorized"),
                      );
                    } catch (error) {
                      setAdvertisingChoice(false);
                      setError(message(error));
                    }
                  }}
                />
                Allow advertising measurement across apps and websites
              </label>
            )}
            <a href={`${apiOrigin}/terms`} target="_blank" rel="noreferrer">
              Terms and privacy
            </a>
            <a href="mailto:bluebirdmarketplaceid@gmail.com">Contact Bluebird</a>
            <button disabled={busy} onClick={signOut}>
              Sign out
            </button>
            <DeleteAccount onError={setError} />
          </section>
        ) : path === "/saved" ? (
          <Feed saved bootstrap={bootstrap} revision={revision} learning={learning} />
        ) : (
          <Feed bootstrap={bootstrap} revision={revision} learning={learning} />
        )}
      </main>
      <nav aria-label="Main navigation">
        {tabs.map(({ path: p, label, Icon }) => (
          <button
            key={p}
            aria-current={
              p === "/"
                ? path === "/"
                  ? "page"
                  : undefined
                : path.startsWith(p)
                  ? "page"
                  : undefined
            }
            onClick={() => go(p)}
          >
            <Icon size={25} weight={path === p ? "fill" : "regular"} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </SavedCardsProvider>
  );
}
function Login({ onError }: { onError: (s: string) => void }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [signup, setSignup] = useState(false),
    [terms, setTerms] = useState(false),
    [alerts, setAlerts] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    onError("");
    try {
      if (signup && !terms) throw Error("Please accept the Terms of Service.");
      const result = signup
        ? await auth.auth.signUp({ email, password })
        : await auth.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (signup && result.data.session)
        await api("consent", "PUT", {
          acceptTerms: true,
          shoppingAlerts: alerts,
          version: "2026-11-12",
        });
      if (signup && !result.data.session)
        setNotice(
          "Check your email to confirm your account. You’ll review your choices when you sign in.",
        );
    } catch (e) {
      onError(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="stack" onSubmit={submit}>
      <h1>{signup ? "Join Bluebird" : "Welcome back"}</h1>
      <p>Use the same account as the Bluebird website.</p>
      {notice && <p role="status">{notice}</p>}
      <label>
        Email
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label>
        Password
        <input
          type="password"
          autoComplete={signup ? "new-password" : "current-password"}
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {signup && (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={terms}
              required
              onChange={(e) => setTerms(e.target.checked)}
            />
            I agree to the{" "}
            <a href={`${apiOrigin}/terms`} target="_blank" rel="noreferrer">
              Terms of Service
            </a>
            .
          </label>
          <label className="check">
            <input type="checkbox" checked={alerts} onChange={(e) => setAlerts(e.target.checked)} />
            Send me personalized shopping emails and notifications about listings, recommendations,
            price drops, and offers.
          </label>
        </>
      )}
      <button className="primary" disabled={busy}>
        {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
      </button>
      <button type="button" onClick={() => setSignup(!signup)}>
        {signup ? "Already have an account? Sign in" : "Create an account"}
      </button>
      <button type="button" onClick={() => socialLogin("google").catch((e) => onError(message(e)))}>
        Continue with Google
      </button>
      <button type="button" onClick={() => socialLogin("apple").catch((e) => onError(message(e)))}>
        Continue with Apple
      </button>
      <button
        type="button"
        onClick={async () => {
          if (!email) {
            onError("Enter your email first.");
            return;
          }
          const { error } = await auth.auth.resetPasswordForEmail(email, {
            redirectTo: Capacitor.isNativePlatform()
              ? "com.onbluebird.marketplace://auth/callback"
              : `${location.origin}/#/auth/callback`,
          });
          if (error) onError(error.message);
          else setNotice("Check your email for the password-reset link.");
        }}
      >
        Reset password
      </button>
      <button type="button" onClick={() => go("/")}>
        Keep browsing
      </button>
    </form>
  );
}
function PasswordRecovery({ done }: { done: () => void }) {
  const [password, setPassword] = useState(""),
    [error, setError] = useState("");
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const { error } = await auth.auth.updateUser({ password });
        if (error) setError(error.message);
        else done();
      }}
    >
      <h1>Choose a new password</h1>
      {error && <p role="alert">{error}</p>}
      <label>
        New password
        <input
          required
          type="password"
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <button className="primary">Save password</button>
    </form>
  );
}
function Feed({
  bootstrap,
  saved = false,
  revision,
  active = true,
  learning = false,
}: {
  bootstrap: Bootstrap;
  saved?: boolean;
  revision: number;
  active?: boolean;
  learning?: boolean;
}) {
  const scroll = useRef(0);
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => window.scrollTo(0, scroll.current));
    const remember = () => {
      if (currentPath() === "/") scroll.current = window.scrollY;
    };
    window.addEventListener("scroll", remember, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", remember);
    };
  }, [active]);
  const [incomplete, setIncomplete] = useState(false),
    [selection, setSelection] = useState(false);
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState(""),
    [sort, setSort] = useState("newest"),
    [page, setPage] = useState(1),
    [items, setItems] = useState<MobileListing[]>([]),
    [next, setNext] = useState<number | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [search, setSearch] = useState("");
  const [home, setHome] = useState<MobileHome | null>(null);
  const [discovery, setDiscovery] = useState(true);
  const [location, setLocation] = useState("Idaho"),
    [appliedLocation, setAppliedLocation] = useState("Idaho");
  const [headline, setHeadline] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(
      () => setHeadline((index) => (index + 1) % headlineOptions.length),
      9000,
    );
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const reset = () => {
      setDiscovery(true);
      setSearch("");
      setQuery("");
      setCategory("");
      setSort("newest");
      setPage(1);
    };
    window.addEventListener("bluebird-home", reset);
    return () => window.removeEventListener("bluebird-home", reset);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setHome(null);
    const read = async () => {
      if (!saved && discovery && !search && !category && sort === "newest" && page === 1) {
        try {
          const result = await api<MobileHome>("home", "GET", undefined, controller.signal);
          if (controller.signal.aborted) return;
          setHome(result);
          setItems([]);
          setNext(null);
          setIncomplete(false);
          setSelection(false);
          return;
        } catch (error) {
          if (controller.signal.aborted) throw error;
        }
      }
      const filters = parseLocationSearch(appliedLocation);
      const params = new URLSearchParams({
        q: search,
        sort,
        page: String(page),
        ...(category ? { category } : {}),
        ...filters,
      });
      const result = await api<MobileBrowse>(
        saved ? "saved" : `listings?${params}`,
        "GET",
        undefined,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setIncomplete(result.incomplete === true);
      setSelection(result.selection === true);
      setItems((previous) =>
        page === 1 || saved
          ? result.items
          : [...new Map([...previous, ...result.items].map((c) => [c.id, c])).values()],
      );
      setNext(result.nextPage ?? null);
    };
    void read()
      .catch((error) => {
        if (!controller.signal.aborted) setError(message(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [saved, search, category, sort, page, revision, discovery, appliedLocation]);
  return (
    <section className="mobile-home">
      {saved ? (
        <h1 className="mt-6">Saved for later</h1>
      ) : (
        <MarketplaceHero items={headlineOptions[headline]}>
          <form
            className="floating-card mt-3 grid grid-cols-2 gap-1.5 border border-brand-blue/15 p-1.5 ring-1 ring-brand-warm/10 sm:mt-5 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:gap-2 sm:p-3"
            onSubmit={(event) => {
              event.preventDefault();
              setDiscovery(false);
              setPage(1);
              setSearch(query);
              setAppliedLocation(location);
              trackShopping("search", undefined, {}, { q: query, category, sort });
            }}
          >
            <label className="relative col-span-2 block sm:col-span-1">
              <MagnifyingGlass
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="search"
                aria-label="Search Bluebird"
                placeholder="Search listings"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-10 w-full rounded-full border-0 bg-transparent pl-9 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none sm:h-12"
              />
            </label>
            <HomeSearchDropdown
              value={category}
              onChange={(value) => {
                setCategory(value);
                setDiscovery(false);
                setPage(1);
              }}
              label="Category"
              placeholder="All categories"
              options={[
                { value: "", label: "All categories" },
                ...bootstrap.categories.map((c) => ({ value: c.slug, label: c.name })),
              ]}
            />
            <HomeSearchDropdown
              value={location}
              onChange={setLocation}
              label="City or ZIP code"
              placeholder="City or ZIP code"
              shortPlaceholder="City or ZIP"
              editable
              options={suggestLocations(location)}
            />
            <button
              type="submit"
              className="col-span-2 h-10 rounded-full bg-primary px-7 text-[13px] font-semibold text-primary-foreground shadow-sm sm:col-span-1 sm:h-12"
            >
              Search
            </button>
          </form>
          <p className="mt-3 text-[12px] text-muted-foreground">
            Search area:{" "}
            <span className="font-semibold text-foreground">
              {appliedLocation || "All locations"}
            </span>
          </p>
        </MarketplaceHero>
      )}
      {!saved && !discovery && (
        <label className="mt-5 block text-xs text-muted-foreground">
          Sort listings
          <select
            aria-label="Sort listings"
            className="filter-input mt-1"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setPage(1);
            }}
          >
            <option value="newest">Newest</option>
            <option value="price_low">Price: low first</option>
            <option value="price_high">Price: high first</option>
            <option value="mileage_low">Lowest mileage</option>
          </select>
        </label>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
          <button onClick={() => setPage(1)}>Retry</button>
        </p>
      )}
      {incomplete && (
        <p className="muted" role="status">
          {selection
            ? "Showing a selection of listings. Search to explore more."
            : "Some sources are temporarily unavailable. Showing available cached listings."}
        </p>
      )}
      {!saved && !search && !category && sort === "newest" && (
        <ShoppingRows
          learning={learning}
          revision={revision}
          onOpen={(id) => go(`/listings/${id}`)}
        />
      )}
      {home && discovery && !saved ? (
        <HomeDiscovery
          home={home}
          learning={learning && active}
          onOpen={(id) => go(`/listings/${id}`)}
          onBrowse={(value) => {
            setDiscovery(false);
            setCategory(value);
            setSearch("");
            setQuery("");
            setPage(1);
          }}
        />
      ) : (
        <div className="listing-grid">
          {items.map((card, position) => (
            <ListingTile
              key={card.id}
              card={card}
              position={position}
              placement={saved ? "saved" : "browse"}
              learning={learning && active}
              onOpen={(id) => go(`/listings/${id}`)}
            />
          ))}
        </div>
      )}

      {!home && <ListingSourceCredits cards={items} />}
      {loading ? (
        <p role="status">Loading listings…</p>
      ) : !items.length && !home && !error ? (
        <p>
          {saved
            ? "Save a listing to find it here."
            : "No listings match this search. Try another category or search."}
        </p>
      ) : (
        next && <button onClick={() => setPage(next)}>Load more</button>
      )}
    </section>
  );
}

function Listing({
  id,
  session,
  learning,
  revision,
  onError,
}: {
  id: string;
  learning: boolean;
  revision: number;
  session: Session | null;
  onError: (s: string) => void;
}) {
  const [card, setCard] = useState<MobileListing | null>(null),
    [error, setError] = useState(""),
    [body, setBody] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setCard(null);
    setError("");
    api<MobileListing>(`listings/${encodeURIComponent(id)}`, "GET", undefined, controller.signal)
      .then((card) => {
        setCard(card);
        void trackAdvertising("listing_viewed", card.categorySlug);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(message(e));
      });
    return () => controller.abort();
  }, [id]);
  useEffect(() => {
    if (!session?.user.id || !card?.canSave) return;
    let alive = true;
    api<{ saved: boolean }>(`saved-state?listingId=${encodeURIComponent(id)}`)
      .then((state) => {
        if (alive) setSaved(state.saved);
      })
      .catch((e) => {
        if (alive) onError(message(e));
      });
    return () => {
      alive = false;
    };
  }, [session?.user.id, card?.id, card?.canSave, id, onError]);
  useListingActivity(card?.id, learning);
  const act = async (work: () => Promise<unknown>) => {
    if (!session) {
      go("/account");
      return;
    }
    setBusy(true);
    try {
      await work();
    } catch (e) {
      onError(message(e));
    } finally {
      setBusy(false);
    }
  };
  if (error) return <p role="alert">{error}</p>;
  if (!card) return <p role="status">Loading listing…</p>;
  return (
    <article className="stack">
      <ListingGallery
        listing={{
          ...listingPresentation(card),
          images: card.images?.length
            ? card.images
            : card.imageUrl
              ? [{ url: card.imageUrl, alt: card.title }]
              : [],
        }}
        onPhoto={(photo) => trackShopping("photo", id, { photo })}
      />

      <div className="listing-price">{money(card)}</div>
      <h1>{card.title}</h1>
      {card.available === false && (
        <p role="status">This listing has ended. It is no longer available.</p>
      )}
      <p>
        {card.city}, {card.state}
      </p>
      <div className="actions">
        {card.canSave && (
          <button
            disabled={busy}
            onClick={() =>
              act(async () => {
                await api("saved", "POST", { listingId: id, saved: !saved });
                setSaved(!saved);
                window.dispatchEvent(new Event("bluebird-saved-changed"));
                trackShopping(saved ? "unsave" : "save", id);
                if (!saved) void trackAdvertising("listing_saved", card.categorySlug);
              })
            }
          >
            {saved ? "Remove from saved" : "Save listing"}
          </button>
        )}
        <button
          onClick={() =>
            Share.share({ title: card.title, url: `${apiOrigin}/listings/${id}` }).catch((e) =>
              onError(message(e)),
            )
          }
        >
          Share
        </button>
      </div>
      <p className="description">{card.description}</p>
      {card.source && <p className="muted">Source: {card.source}</p>}
      {card.seller && (
        <section className="stack">
          <h2>{card.seller.displayName}</h2>
          {card.seller.contactPhone && (
            <a
              onClick={() => trackShopping("contact_open", id, { method: "phone" })}
              href={`tel:${card.seller.contactPhone.replace(/[^+0-9]/g, "")}`}
            >
              Call seller
            </a>
          )}
          {card.seller.contactEmail && (
            <a
              onClick={() => trackShopping("contact_open", id, { method: "email" })}
              href={`mailto:${card.seller.contactEmail}`}
            >
              Email seller
            </a>
          )}
        </section>
      )}
      {card.canMessage && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              const result = await sendMessageOnce<{ conversationId: string }>(
                session!.user.id,
                "conversations",
                {
                  listingId: id,
                  body,
                },
              );
              trackShopping("contact", id, { method: "message" });
              void trackAdvertising("seller_contacted", card.categorySlug);
              go(`/messages/${result.conversationId}`);
            });
          }}
        >
          <label>
            Message the seller
            <textarea
              required
              maxLength={4000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Is this still available?"
            />
          </label>
          <button className="primary" disabled={busy}>
            {session ? "Send message" : "Sign in to message"}
          </button>
        </form>
      )}
      <button
        className="text-button"
        onClick={() => {
          const reason = prompt("Why are you reporting this listing?");
          if (reason) void act(() => api("reports", "POST", { listingId: id, reason }));
        }}
      >
        Report listing
      </button>
      <ShoppingRows
        similarId={id}
        learning={learning}
        revision={revision}
        onOpen={(next) => go(`/listings/${next}`)}
      />
    </article>
  );
}
function Messages({
  ownerId,
  id,
  revision,
  onError,
}: {
  ownerId: string;
  id?: string;
  revision: number;
  onError: (s: string) => void;
}) {
  const [data, setData] = useState<ConversationSummary[] | ConversationDetail | null>(null),
    [body, setBody] = useState(""),
    [refresh, setRefresh] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    try {
      setBody(sessionStorage.getItem(`bb-draft-message-${ownerId}-${id}`) ?? "");
    } catch {
      /* storage optional */
    }
  }, [id, ownerId]);
  const updateBody = (value: string) => {
    setBody(value);
    try {
      sessionStorage.setItem(`bb-draft-message-${ownerId}-${id}`, value);
    } catch {
      /* storage optional */
    }
  };
  useEffect(() => {
    setData(null);
    setError("");
    let alive = true;
    const load = () =>
      api<ConversationSummary[] | ConversationDetail>(id ? `conversations/${id}` : "conversations")
        .then((d) => {
          if (alive) setData(d);
        })
        .catch((e) => {
          if (alive) setError(message(e));
        });
    void load();
    const timer = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [id, refresh, revision]);
  const action = async (type: string, payload: object = {}) => {
    if (!id) return;
    setBusy(true);
    try {
      if (type === "messages")
        await sendMessageOnce(ownerId, `conversations/${id}/messages`, payload as { body: string });
      else await api(`conversations/${id}/${type}`, "POST", payload);
      if (type === "block") go("/messages");
      else {
        updateBody("");
        setRefresh((v) => v + 1);
      }
    } catch (e) {
      onError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const detail = data && !Array.isArray(data) ? data : null;
  const summaries = Array.isArray(data) ? data : [];
  const messageCount = detail?.messages.length ?? 0;
  useEffect(() => {
    if (id && messageCount) void api(`conversations/${id}/read`, "POST", {}).catch(() => undefined);
  }, [id, messageCount]);
  return (
    <section className="stack">
      <h1>{id ? detail?.listingTitle || "Conversation" : "Messages"}</h1>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Loading messages…</p>}
      {data &&
        !id &&
        (summaries.length ? (
          summaries.map((c) => (
            <button className="conversation" key={c.id} onClick={() => go(`/messages/${c.id}`)}>
              <strong>
                {c.otherMemberName}
                {c.unread ? " · New" : ""}
              </strong>
              <span>{c.listingTitle}</span>
            </button>
          ))
        ) : (
          <p>Your conversations with buyers and sellers will appear here.</p>
        ))}
      {id && detail?.messages && (
        <>
          <div className="messages">
            {detail.messages.map((m) => (
              <div className="message" key={m.id}>
                <strong>{m.senderLabel || "Bluebird member"}</strong>
                <p>{m.body}</p>
                <small>{new Date(m.createdAt).toLocaleString()}</small>
              </div>
            ))}
          </div>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void action("messages", { body });
            }}
          >
            <label>
              Reply
              <textarea
                required
                value={body}
                maxLength={4000}
                onChange={(e) => updateBody(e.target.value)}
              />
            </label>
            <button className="primary" disabled={busy}>
              Send reply
            </button>
          </form>
          <div className="actions">
            <button
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    "Block this member? They will no longer be able to send messages in this conversation.",
                  )
                )
                  void action("block");
              }}
            >
              Block member
            </button>
            <button
              disabled={busy}
              onClick={() => {
                const reason = prompt("Tell Bluebird why you are reporting this conversation.");
                if (reason) void action("report", { reason });
              }}
            >
              Report conversation
            </button>
          </div>
        </>
      )}
    </section>
  );
}
function DeleteAccount({ onError }: { onError: (s: string) => void }) {
  const [open, setOpen] = useState(false),
    [confirmation, setConfirmation] = useState(""),
    [requested, setRequested] = useState(false);
  useEffect(() => {
    api<{ status: string } | null>("account/deletion")
      .then((result) => setRequested(Boolean(result)))
      .catch(() => undefined);
  }, []);
  return (
    <section className="stack">
      <h2>Account deletion</h2>
      {requested ? (
        <p role="status">
          Your deletion request has been received. Bluebird will confirm completion.
        </p>
      ) : !open ? (
        <button className="danger" onClick={() => setOpen(true)}>
          Delete account
        </button>
      ) : (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("account/deletion", "POST", { confirm: confirmation });
              setRequested(true);
            } catch (e) {
              onError(message(e));
            }
          }}
        >
          <p>
            This requests removal of your account and associated personal data. Records required for
            legal obligations or disputes may be retained as explained in the privacy policy.
          </p>
          <label>
            Type DELETE to confirm
            <input
              required
              pattern="DELETE"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
          <button className="danger">Request account deletion</button>
          <button type="button" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </form>
      )}
    </section>
  );
}
createRoot(document.getElementById("root")!).render(<Application />);
