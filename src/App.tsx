import { Shell } from "./components/Shell";
import { ToastProvider } from "./components/ui";
import { useRoute } from "./lib/router";
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
    case "/settings":
      return <SettingsPage />;
    default:
      return <DashboardPage />;
  }
}

export function App() {
  return (
    <ToastProvider>
      <Shell>
        <Page />
      </Shell>
    </ToastProvider>
  );
}
