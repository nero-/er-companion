import { PageHeader } from "../components/ui";

export function JourneyPage() {
  return (
    <div className="page">
      <PageHeader eyebrow="Companion" title="Journey" description="This module is being wired to the canonical content model." />
      <div className="card card-pad">
        <p className="muted">Canonical data is loaded. The interactive module is the next implementation slice.</p>
      </div>
    </div>
  );
}
