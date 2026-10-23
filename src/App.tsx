import { Shell } from "./components/Shell";
import { ToastProvider } from "./components/ui";
import { useRoute } from "./lib/router";
import { useEffect } from "react";
import { isDesktop, openExternal } from "./lib/desktop";
import { DashboardPage } from "./pages/DashboardPage";
import { JourneyPage } from "./pages/JourneyPage";
import { CollectionPage } from "./pages/CollectionPage";
import { BuildsPage } from "./pages/BuildsPage";
import { CharacterPage } from "./pages/CharacterPage";
import { BossesPage } from "./pages/BossesPage";
import { QuestsPage } from "./pages/QuestsPage";
import { LorePage } from "./pages/LorePage";
import { FarmsPage } from "./pages/FarmsPage";
import { TiersPage } from "./pages/TiersPage";
import { CompletionPage } from "./pages/CompletionPage";
import { SettingsPage } from "./pages/SettingsPage";
import { PatchPage } from "./pages/PatchPage";
import { AtlasPage } from "./pages/AtlasPage";
import { MaterialsPage } from "./pages/MaterialsPage";
import { ResourcesPage } from "./pages/ResourcesPage";

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
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <ToastProvider>
      <Shell>
        <Page />
      </Shell>
    </ToastProvider>
  );
}
