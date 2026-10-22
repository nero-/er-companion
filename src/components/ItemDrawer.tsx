import { useEffect, useState } from "react";
import { Badge, Button, Callout, Drawer, SectionTitle, Switch, TierBadge, useToast } from "./ui";
import { Icon } from "./Icon";
import { setItemOwned, useActiveCharacter, useActiveJourney } from "../lib/store";
import { STEP_BY_ID, TIERS_BY_NAME } from "../lib/data";
import { PATCH_IMPACT_BY_NAME } from "../data/game";
import { stepStatusLabel, stepStatusTone } from "../lib/selectors";
import { navigate } from "../lib/router";
import type { Item, RouteStep, StepStatus } from "../lib/types";

interface ItemDrawerProps {
  item: Item | null;
  onClose: () => void;
}

function badgeTone(status: StepStatus | undefined): "default" | "success" | "warning" {
  const tone = stepStatusTone(status);
  if (tone === "success") return "success";
  if (tone === "warning") return "warning";
  return "default";
}

const NOT_IN_PACK = "Not in the content pack.";

export function ItemDrawer({ item, onClose }: ItemDrawerProps) {
  const character = useActiveCharacter();
  const journey = useActiveJourney();
  const toast = useToast();
  const [showAllSteps, setShowAllSteps] = useState(false);

  useEffect(() => {
    setShowAllSteps(false);
  }, [item?.id]);

  if (!item) return null;

  const owned = character.items[item.id] === true;
  const patchImpact = PATCH_IMPACT_BY_NAME[item.name];
  const tierEntries = Object.prototype.hasOwnProperty.call(TIERS_BY_NAME, item.name)
    ? TIERS_BY_NAME[item.name]
    : [];
  const stepIds = [...new Set([...item.routeStepIds, ...(item.autoStepId ? [item.autoStepId] : [])])];
  const linkedSteps = stepIds
    .map((id) => STEP_BY_ID[id])
    .filter((step): step is RouteStep => Boolean(step))
    .sort((a, b) => {
      if (a.id === item.autoStepId) return -1;
      if (b.id === item.autoStepId) return 1;
      return a.order - b.order;
    });
  const autoStep = item.autoStepId ? STEP_BY_ID[item.autoStepId] : undefined;
  const firstStep = autoStep ?? linkedSteps[0];
  const visibleSteps = showAllSteps ? linkedSteps : linkedSteps.slice(0, 6);

  const toggleOwned = () => {
    const next = !owned;
    setItemOwned(item.id, next);
    toast.push(`${item.name} ${next ? "marked owned" : "marked missing"}.`, next ? "success" : "default");
  };

  const openStep = (step: RouteStep) => {
    navigate(`/journey?area=${encodeURIComponent(step.area)}&step=${encodeURIComponent(step.id)}`);
  };

  return (
    <Drawer
      open
      title={item.name}
      subtitle={
        <div className="col-drawer-sub">
          <span className="row wrap col-drawer-badges">
            <Badge tone="accent">{item.group}</Badge>
            {item.category && item.category !== item.group ? <Badge>{item.category}</Badge> : null}
            <Badge tone="info">{item.game}</Badge>
          </span>
          <Switch checked={owned} onChange={toggleOwned} label="Owned" />
        </div>
      }
      onClose={onClose}
      footer={
        <div className="row-between wrap">
          <Button variant={owned ? "default" : "primary"} icon={owned ? "x" : "check"} onClick={toggleOwned}>
            {owned ? "Mark missing" : "Mark owned"}
          </Button>
          <Button icon="map" onClick={() => firstStep && openStep(firstStep)} disabled={!firstStep}>
            Open route step
          </Button>
        </div>
      }
    >
      {patchImpact ? (
        <Callout tone="warning" icon="alert">
          <strong>Patch 1.17 balance change:</strong> {patchImpact.summary} ({patchImpact.category}). The certified
          build and tier data is 1.16.1 baseline; re-check this item before relying on its ranking.
        </Callout>
      ) : null}
      <dl className="kv col-kv">
        <dt>Location</dt>
        <dd>{item.location || NOT_IN_PACK}</dd>
        <dt>Region</dt>
        <dd>{item.region || NOT_IN_PACK}</dd>
        <dt>Acquisition</dt>
        <dd>{item.acquisitionType || NOT_IN_PACK}</dd>
        <dt>Missable / timing</dt>
        <dd>{item.missable || NOT_IN_PACK}</dd>
        <dt>Validation</dt>
        <dd>{item.validation || NOT_IN_PACK}</dd>
        <dt>Source</dt>
        <dd>
          {item.sourceUrl ? (
            <a className="col-source-link" href={item.sourceUrl} target="_blank" rel="noreferrer">
              <span>{item.sourceUrl}</span>
              <Icon name="external" size={12} />
            </a>
          ) : (
            NOT_IN_PACK
          )}
        </dd>
        <dt>Item ID</dt>
        <dd className="mono tiny col-item-id">{item.id}</dd>
      </dl>

      <div className="col-drawer-section">
        <SectionTitle title="Notes" />
        <p className="small muted col-notes">{item.notes || NOT_IN_PACK}</p>
      </div>

      {tierEntries.length ? (
        <div className="col-drawer-section">
          <SectionTitle
            title="Tier placement"
            note={`${tierEntries.length} ${tierEntries.length === 1 ? "entry" : "entries"}`}
          />
          <div className="col-tier-list">
            {tierEntries.map((entry, index) => (
              <div className="col-tier" key={`${entry.list}-${entry.rank}-${index}`}>
                <div className="row-between wrap">
                  <span className="row wrap">
                    <TierBadge tier={entry.tier} />
                    <span className="small muted">{entry.list}</span>
                    <span className="tiny faint mono">Rank #{entry.rank}</span>
                  </span>
                  {entry.className ? <Badge>{entry.className}</Badge> : null}
                </div>
                {entry.poolType ? <div className="tiny faint">Pool: {entry.poolType}</div> : null}
                {entry.notes ? <p className="small muted col-tier-notes">{entry.notes}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="col-drawer-section">
        <SectionTitle
          title="Linked route steps"
          note={linkedSteps.length ? `${linkedSteps.length} linked` : undefined}
        />
        {autoStep ? (
          <Callout tone="success" icon="check">
            <span>
              Auto-acquired: marking step {autoStep.order + 1} done in the active journey adds this item to the
              collection automatically.
              <span className="col-auto-instruction">{autoStep.instruction}</span>
            </span>
          </Callout>
        ) : null}
        {linkedSteps.length ? (
          <div className="col-step-list">
            {visibleSteps.map((step) => {
              const status = journey.steps[step.id];
              return (
                <button
                  type="button"
                  className="col-step"
                  key={step.id}
                  onClick={() => openStep(step)}
                  aria-label={`Open route step: ${step.instruction}`}
                >
                  <span className="row-between wrap">
                    <span className="row">
                      <span className="tiny faint mono">#{step.order + 1}</span>
                      <Badge>{step.area}</Badge>
                      {step.id === item.autoStepId ? <Badge tone="success">Auto</Badge> : null}
                    </span>
                    <Badge tone={badgeTone(status)}>{stepStatusLabel(status)}</Badge>
                  </span>
                  <span className="col-step-instruction">{step.instruction}</span>
                  <span className="tiny faint">
                    {step.objectiveName} · {step.type}
                  </span>
                </button>
              );
            })}
            {linkedSteps.length > 6 ? (
              <Button size="sm" variant="ghost" icon={showAllSteps ? "chevronDown" : "chevronRight"} onClick={() => setShowAllSteps(!showAllSteps)}>
                {showAllSteps
                  ? "Show fewer linked steps"
                  : `Show all ${linkedSteps.length} linked steps`}
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="small faint">This item is not linked to an Act I route step in the content pack.</p>
        )}
      </div>
    </Drawer>
  );
}
