import { Shell } from "./components/Shell";
import { ToastProvider } from "./components/ui";
import { useRoute } from "./lib/router";
import { Component, Suspense, lazy, useEffect } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { isDesktop, onQuickLog, openExternal } from "./lib/desktop";
import { DashboardPage } from "./pages/DashboardPage";

/**
 * Pages load on demand. The dashboard is the cold-start surface, so it stays in
 * the initial bundle; every other page becomes its own chunk and is fetched the
 * first time it is opened. Offline use is unaffected: the service worker
 * precaches every emitted chunk.
 */
function pageModule<T extends string>(
  loader: () => Promise<Record<T, React.ComponentType>>,
  name: T,
) {
  return lazy(async () => {
    const module = await loader();
    return { default: module[name] };
  });
}

const JourneyPage = pageModule(() => import("./pages/JourneyPage"), "JourneyPage");
const CollectionPage = pageModule(() => import("./pages/CollectionPage"), "CollectionPage");
const BuildsPage = pageModule(() => import("./pages/BuildsPage"), "BuildsPage");
const CharacterPage = pageModule(() => import("./pages/CharacterPage"), "CharacterPage");
const BossesPage = pageModule(() => import("./pages/BossesPage"), "BossesPage");
const QuestsPage = pageModule(() => import("./pages/QuestsPage"), "QuestsPage");
const LorePage = pageModule(() => import("./pages/LorePage"), "LorePage");
const FarmsPage = pageModule(() => import("./pages/FarmsPage"), "FarmsPage");
const TiersPage = pageModule(() => import("./pages/TiersPage"), "TiersPage");
const CompletionPage = pageModule(() => import("./pages/CompletionPage"), "CompletionPage");
const SettingsPage = pageModule(() => import("./pages/SettingsPage"), "SettingsPage");
const PatchPage = pageModule(() => import("./pages/PatchPage"), "PatchPage");
const AtlasPage = pageModule(() => import("./pages/AtlasPage"), "AtlasPage");
const MaterialsPage = pageModule(() => import("./pages/MaterialsPage"), "MaterialsPage");
const ResourcesPage = pageModule(() => import("./pages/ResourcesPage"), "ResourcesPage");

interface PageBoundaryState {
  error: Error | null;
}

/**
 * A single page failure must not blank the shell. The boundary keeps the
 * navigation, search and settings usable and offers a retry so a transient
 * render error does not cost the player their place.
 */
class PageBoundary extends Component<{ children: ReactNode; path: string }, PageBoundaryState> {
  state: PageBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): PageBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Page render failed", error, info.componentStack);
  }

  componentDidUpdate(previous: { path: string }): void {
    if (previous.path !== this.props.path && this.state.error) {
      this.setState({ error: null });
    }
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page" role="alert">
        <div className="card card-pad">
          <h2>This page could not render</h2>
          <p className="muted">
            The rest of the companion still works, and your progress is saved. Reloading the page
            usually clears it.
          </p>
          <p className="small faint">{this.state.error.message}</p>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}

function PageLoading() {
  return (
    <div className="page page-loading" role="status" aria-live="polite">
      <span className="faint small">Loading…</span>
    </div>
  );
}

function Page() {
  const route = useRoute();
  switch (route.path) {
    case "/":
      return <DashboardPage />;
    case "/journey":
      return <JourneyPage />;
    case "/collection":
      return <CollectionPage />;
    case "/builds":
      return <BuildsPage />;
    case "/character":
      return <CharacterPage />;
    case "/bosses":
      return <BossesPage />;
    case "/quests":
      return <QuestsPage />;
    case "/lore":
      return <LorePage />;
    case "/farms":
      return <FarmsPage />;
    case "/tiers":
      return <TiersPage />;
    case "/completion":
      return <CompletionPage />;
    case "/atlas":
      return <AtlasPage />;
    case "/materials":
      return <MaterialsPage />;
    case "/resources":
      return <ResourcesPage />;
    case "/patch":
      return <PatchPage />;
    case "/settings":
      return <SettingsPage />;
    default:
      return <DashboardPage />;
  }
}

export function App() {
  const route = useRoute();
  const routePath = route.path;
  useEffect(() => {
    if (!isDesktop()) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (!/^https?:\/\//i.test(anchor.href)) return;
      event.preventDefault();
      void openExternal(anchor.href).catch((error: unknown) => {
        console.error("Could not open external link", error);
      });
    };
    document.addEventListener("click", onClick);
    let unlisten: (() => void) | undefined;
    onQuickLog(() => {
      window.dispatchEvent(new Event("er-companion:quick-log"));
    })
      .then((off) => {
        unlisten = off;
      })
      .catch(() => {
        /* global shortcut is desktop-only; ignore in the browser build. */
      });
    return () => {
      document.removeEventListener("click", onClick);
      unlisten?.();
    };
  }, []);

  return (
    <ToastProvider>
      <Shell>
        <PageBoundary path={routePath}>
          <Suspense fallback={<PageLoading />}>
            <Page />
          </Suspense>
        </PageBoundary>
      </Shell>
    </ToastProvider>
  );
}
