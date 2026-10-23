import { useEffect, useState } from "react";
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const routeStats = routeProgress(journey);
  const collection = collectionSummary(character);
  const level = levelFromStats(character.stats);

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
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
    setSearchOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [route.path]);

  const pageTitle = PAGE_TITLES[route.path] ?? "Companion";

  return (
    <div className={`app density-${state.settings.density}`}>
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} aria-label="Primary navigation">
        <div className="sidebar-brand">
          <div className="brand-mark" aria-hidden="true">
            <Icon name="flame" size={20} />
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
                  <Icon name={item.icon} size={17} />
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
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
          >
            <Icon name="menu" size={18} />
          </button>
          <div className="topbar-title">{pageTitle}</div>
          <div className="topbar-spacer" />
          <button className="search-trigger" onClick={() => setSearchOpen(true)}>
            <Icon name="search" size={15} />
            <span>Search the companion</span>
            <kbd>⌘K</kbd>
          </button>
          <span className="offline-dot">Offline ready</span>
          <div className="avatar" title={`${character.name} · Level ${level}`}>
            {initials(character.name)}
          </div>
        </header>
        <div className="unofficial-strip">
          <UnofficialNote compact />
        </div>
        {children}
      </div>

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
