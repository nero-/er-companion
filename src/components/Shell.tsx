import { useEffect, useLayoutEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { ART, UnofficialNote } from "./Art";
import { CommandPalette } from "./CommandPalette";
import { Ring } from "./ui";
import { useActiveCharacter, useActiveJourney, useAppState } from "../lib/store";
import { collectionSummary, routeProgress } from "../lib/selectors";
import { levelFromStats } from "../lib/classes";
import { initials } from "../lib/format";
import { navigate, useRoute } from "../lib/router";
import { isDesktop } from "../lib/desktop";

interface NavItem {
  path: string;
  label: string;
  icon: IconName;
  count?: number;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

/* The manual "large" override always pins the top step; "auto" resolves from
   the logical viewport, which is what the user's desktop scaling already
   normalises. A 4K panel at 200% reports 1920x1080 CSS pixels and keeps 1080p
   sizing; an unscaled 4K panel reports 3840x2160 and gets the top step. */
const TOP_SCALE = 1.25;

function resolveUiScale(mode: "auto" | "large"): number {
  if (mode === "large") return TOP_SCALE;
  if (typeof window === "undefined") return 1;

  const width = window.innerWidth || 1280;
  const height = window.innerHeight || 800;

  // Phones and narrow split windows keep their natural size whatever the DPR.
  if (width < 1024) return 1;

  // The browser already reports CSS pixels, so a 4K panel running at 200% OS
  // scaling is a 1920x1080 viewport. Only add scale when the *logical* viewport
  // is genuinely large, otherwise the operating system's scaling and this app's
  // scaling compound and the interface becomes enormous.
  const shortEdge = Math.min(width, height);
  const longEdge = Math.max(width, height);

  // 2160p logical viewport.
  if (shortEdge >= 2000 || longEdge >= 3400) return TOP_SCALE;
  // 1440p / 1600p logical viewport.
  if (shortEdge >= 1300 || longEdge >= 2400) return 1.1;
  return 1;
}

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/journey": "Journey",
  "/collection": "Collection",
  "/builds": "Builds",
  "/character": "Character",
  "/bosses": "Bosses",
  "/quests": "Quests",
  "/lore": "Lore",
  "/farms": "Farms",
  "/tiers": "Tier Lists",
  "/completion": "Completion",
  "/atlas": "World Atlas",
  "/materials": "Materials",
  "/resources": "Resources",
  "/patch": "Patch & DLC",
  "/settings": "Settings",
};

export function Shell({ children }: { children: ReactNode }) {
  const route = useRoute();
  const state = useAppState();
  const character = useActiveCharacter();
  const journey = useActiveJourney();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [storage, setStorage] = useState<"ok" | "tight" | "unavailable">("ok");
  const [uiScale, setUiScale] = useState(() =>
    typeof window === "undefined" ? 1 : resolveUiScale(state.settings.interfaceScale),
  );
  const routeStats = routeProgress(journey);
  const collection = collectionSummary(character);
  const level = levelFromStats(character.stats);
  const commandKey =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K";

  const groups: NavGroup[] = [
    {
      label: "Play",
      items: [
        { path: "/", label: "Dashboard", icon: "grace" },
        { path: "/journey", label: "Journey", icon: "map", count: routeStats.total - routeStats.resolved },
        { path: "/collection", label: "Collection", icon: "bag", count: collection.owned },
      ],
    },
    {
      label: "Craft",
      items: [
        { path: "/builds", label: "Builds", icon: "greatsword" },
        { path: "/character", label: "Character", icon: "armor" },
        { path: "/bosses", label: "Bosses", icon: "skull" },
      ],
    },
    {
      label: "World",
      items: [
        { path: "/quests", label: "Quests & NPCs", icon: "quest" },
        { path: "/lore", label: "Lore", icon: "book" },
        { path: "/farms", label: "Farms", icon: "leaf" },
        { path: "/tiers", label: "Tier Lists", icon: "list" },
      ],
    },
    {
      label: "Reference",
      items: [
        { path: "/atlas", label: "World Atlas", icon: "map", count: 697 },
        { path: "/materials", label: "Materials", icon: "flask", count: 725 },
        { path: "/resources", label: "Resources", icon: "scroll" },
      ],
    },
    {
      label: "Journey",
      items: [
        { path: "/completion", label: "Completion", icon: "achievement" },
        { path: "/patch", label: "Patch & DLC", icon: "spark" },
        { path: "/settings", label: "Settings", icon: "settings" },
      ],
    },
  ];

  useEffect(() => {
    try {
      const probe = "er-companion.probe";
      localStorage.setItem(probe, "1");
      localStorage.removeItem(probe);
      setStorage("ok");
    } catch {
      setStorage("unavailable");
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.scale = state.settings.interfaceScale;
  }, [state.settings.interfaceScale]);

  // The in-app motion setting is applied on <html> so portalled surfaces
  // (palette, modal, drawer, toasts) honour it too.
  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", state.settings.reducedMotion);
  }, [state.settings.reducedMotion]);

  // Resolve the runtime UI scale. Recomputed on viewport resize and whenever
  // the device pixel ratio changes (monitor move, browser zoom, Linux display
  // scaling change) — `min-width` alone cannot see any of that.
  useLayoutEffect(() => {
    const mode = state.settings.interfaceScale;
    let frame = 0;

    const apply = () => {
      frame = 0;
      const scale = resolveUiScale(mode);
      setUiScale(scale);
      // Also written on <html> so portalled surfaces (palette, modal, drawer,
      // toasts) inherit the same scale as the app root.
      document.documentElement.style.setProperty("--ui-scale", String(scale));
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(apply);
    };

    apply();

    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);

    // A `resolution` media query fires when the pixel ratio changes (monitor
    // move, desktop scaling change). Re-arm after each hit because the query
    // string embeds the ratio it watches. Older WebKitGTK only ships the
    // deprecated addListener pairs, so try the modern API and fall back.
    let dprQuery: MediaQueryList | null = null;
    const supportsEvents = (query: MediaQueryList) =>
      typeof (query as { addEventListener?: unknown }).addEventListener === "function";
    const stopWatching = (query: MediaQueryList) => {
      if (supportsEvents(query)) query.removeEventListener("change", onDprChange);
      else query.removeListener(onDprChange);
    };
    const watchDpr = () => {
      if (dprQuery) stopWatching(dprQuery);
      dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      if (supportsEvents(dprQuery)) dprQuery.addEventListener("change", onDprChange);
      else dprQuery.addListener(onDprChange);
    };
    function onDprChange() {
      schedule();
      watchDpr();
    }
    watchDpr();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      if (dprQuery) stopWatching(dprQuery);
    };
  }, [state.settings.interfaceScale]);

  // "Everything" opens every disclosure in the current page. Re-runs on route
  // changes so newly mounted panels open too.
  useEffect(() => {
    if (state.settings.disclosure !== "everything") return;
    const openAll = () => {
      for (const node of document.querySelectorAll("details")) {
        if (!node.open) node.open = true;
      }
    };
    openAll();
    const observer = new MutationObserver(openAll);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [state.settings.disclosure, route.path]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    const onSearchRequest = () => setSearchOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("er-companion:search", onSearchRequest);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("er-companion:search", onSearchRequest);
    };
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
    setSearchOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [route.path]);

  const pageTitle = PAGE_TITLES[route.path] ?? "Companion";

  const scaleStyle = { ["--ui-scale" as string]: String(uiScale) } as CSSProperties;
  const statusText = storage === "unavailable" ? "Storage blocked" : isDesktop() ? "Desktop · offline" : "Offline ready";
  const statusTone = storage === "unavailable" ? " is-warning" : "";

  return (
    <div
      className={`app density-${state.settings.density} disclosure-${state.settings.disclosure}${
        sidebarCollapsed ? " sidebar-collapsed" : ""
      }`}
      style={scaleStyle}
      data-scale={state.settings.interfaceScale}
    >
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} aria-label="Primary navigation">
        <div className="sidebar-brand">
          <div className="brand-mark" aria-hidden="true">
            <img src={ART.emblem} alt="" width={40} height={40} className="brand-emblem" />
          </div>
          <div className="brand-text">
            {logoFailed ? (
              <div className="brand-title">Elden Ring</div>
            ) : (
              <img
                className="brand-logo"
                src={ART.logo}
                alt="Elden Ring"
                width={640}
                height={98}
                onError={() => setLogoFailed(true)}
              />
            )}
            <div className="brand-sub">Definitive Companion</div>
          </div>
        </div>

        <nav>
          {groups.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.items.map((item) => (
                <button
                  key={item.path}
                  className={`nav-item ${route.path === item.path ? "active" : ""}`}
                  onClick={() => navigate(item.path)}
                  aria-current={route.path === item.path ? "page" : undefined}
                >
                  <Icon name={item.icon} size={Math.round(17 * uiScale)} />
                  <span>{item.label}</span>
                  {typeof item.count === "number" && item.count > 0 ? (
                    <span className="nav-count">{item.count > 999 ? "999+" : item.count}</span>
                  ) : null}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            className="party-card"
            style={{ width: "100%", textAlign: "left", cursor: "pointer" }}
            onClick={() => navigate("/settings")}
          >
            <div className="row-between">
              <div className="party-name">
                <span className="truncate">{character.name}</span>
                <span className="badge badge-accent">Lv {level}</span>
              </div>
            </div>
            <div className="party-meta">
              {journey.label} · {routeStats.resolved}/{routeStats.total} route
            </div>
            <div className="party-progress">
              <Ring value={routeStats.requiredPercent} size={44} stroke={3} />
              <div style={{ flex: 1 }}>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${routeStats.requiredPercent}%` }} />
                </div>
                <div className="progress-meta">
                  <span>Route</span>
                  <span>{routeStats.requiredPercent}%</span>
                </div>
              </div>
            </div>
          </button>
          <div className="sidebar-disclaimer">
            <UnofficialNote />
          </div>
        </div>
      </aside>

      {sidebarOpen ? <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} /> : null}

      <div className="main">
        <header className="topbar">
          <button
            className="btn btn-ghost btn-icon menu-btn"
            onClick={() => {
              if (window.matchMedia("(max-width: 960px)").matches) {
                setSidebarOpen((open) => !open);
              } else {
                setSidebarCollapsed((collapsed) => !collapsed);
              }
            }}
            aria-label={sidebarCollapsed ? "Show navigation" : "Hide navigation"}
            aria-expanded={!sidebarCollapsed}
          >
            <Icon name={sidebarCollapsed ? "menu" : "x"} size={Math.round(18 * uiScale)} />
          </button>
          <div className="topbar-title">{pageTitle}</div>
          <div className="topbar-spacer" />
          <button className="search-trigger" onClick={() => setSearchOpen(true)}>
            <Icon name="search" size={Math.round(15 * uiScale)} />
            <span>Search the companion</span>
            <kbd>{commandKey}</kbd>
          </button>
          <button
            type="button"
            className={`offline-dot${statusTone}`}
            onClick={() => navigate("/settings#storage")}
            title={
              storage === "unavailable"
                ? "Browser storage is unavailable; progress cannot be saved. Open settings."
                : "Progress is stored locally. Open data settings."
            }
          >
            {statusText}
          </button>
          <div className="avatar" title={`${character.name} · Level ${level}`}>
            {initials(character.name)}
          </div>
        </header>
        <div className="unofficial-strip">
          <UnofficialNote compact />
        </div>
        {children}
      </div>

      <nav className="mobile-nav" aria-label="Quick navigation">
        {[
          { path: "/", label: "Home", icon: "grace" as const },
          { path: "/journey", label: "Journey", icon: "map" as const },
          { path: "/collection", label: "Collection", icon: "bag" as const },
        ].map((item) => (
          <button
            key={item.path}
            type="button"
            className={`mobile-nav-item${route.path === item.path ? " active" : ""}`}
            onClick={() => navigate(item.path)}
            aria-current={route.path === item.path ? "page" : undefined}
          >
            <Icon name={item.icon} size={19} />
            <span>{item.label}</span>
          </button>
        ))}
        <button
          type="button"
          className="mobile-nav-item"
          onClick={() => setSearchOpen(true)}
          aria-label="Search the companion"
        >
          <Icon name="search" size={19} />
          <span>Search</span>
        </button>
      </nav>

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
