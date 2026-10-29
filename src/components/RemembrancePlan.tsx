import { Icon } from "./Icon";
import { Badge } from "./ui";
import { formatNumber } from "../lib/format";
import { remembranceDuplicateCounts, remembrancePlanRows, type RemembrancePlanRow } from "../lib/remembrance";

const DUPLICATE_TONES: Record<RemembrancePlanRow["duplicateAction"], "warning" | "info" | "success" | "default"> = {
  now: "warning",
  defer: "info",
  none: "success",
  unknown: "default",
};

function RouteLinks({ row }: { row: RemembrancePlanRow }) {
  if (!row.routeLinks.length) return null;
  return (
    <span className="remembrance-route-links">
      {row.routeLinks.map((link) => (
        <a className="remembrance-route-link" href={link.href} key={link.stepId} title={`Route step in ${link.label}`}>
          <Icon name="map" size={11} /> {link.label}
        </a>
      ))}
    </span>
  );
}

function BossLink({ row }: { row: RemembrancePlanRow }) {
  if (!row.boss) return <span className="faint">—</span>;
  if (!row.bossHref) return <span>{row.boss}</span>;
  return (
    <a className="remembrance-entity-link" href={row.bossHref}>
      {row.boss}
    </a>
  );
}

function RewardChips({ rewards, takeFirst }: { rewards: string[]; takeFirst?: string }) {
  if (!rewards.length) return <span className="faint">—</span>;
  const ordered = takeFirst
    ? [takeFirst, ...rewards.filter((reward) => reward !== takeFirst)]
    : rewards;
  return (
    <span className="tag-list">
      {ordered.map((reward, index) => (
        <Badge key={reward} tone={index === 0 && takeFirst ? "accent" : "default"}>
          {reward}
        </Badge>
      ))}
    </span>
  );
}

/** Full ordered plan table: the ranking of remembrances by duplication risk. */
export function RemembrancePlanTable({ rows = remembrancePlanRows() }: { rows?: RemembrancePlanRow[] }) {
  if (!rows.length) {
    return (
      <p className="small faint remembrance-plan-empty">
        The ordered remembrance plan is not in this build yet. The per-remembrance ledger below still records
        rewards, duplication, and rune consumption.
      </p>
    );
  }
  return (
    <div className="table-wrap remembrance-plan-wrap">
      <table className="data-table remembrance-plan-table">
        <thead>
          <tr>
            <th scope="col" style={{ width: "54px" }}>
              Order
            </th>
            <th scope="col">Boss / remembrance</th>
            <th scope="col">Duplicate priority</th>
            <th scope="col">Journey 1</th>
            <th scope="col">Journey 2</th>
            <th scope="col">Rewards</th>
            <th scope="col">Area</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className={row.duplicateAction === "now" ? "is-duplicate-now" : undefined}>
              <td data-label="Order">
                <span className="remembrance-order">{row.order}</span>
              </td>
              <td data-label="Boss / remembrance" className="library-primary-cell">
                <div className="remembrance-plan-name">{row.remembrance}</div>
                <div className="library-sub">
                  <BossLink row={row} />
                  {row.game ? ` · ${row.game}` : ""}
                </div>
                <RouteLinks row={row} />
              </td>
              <td data-label="Duplicate priority">
                <Badge tone={DUPLICATE_TONES[row.duplicateAction]}>{row.duplicateLabel}</Badge>
                <div className="library-note remembrance-plan-detail">{row.duplicateDetail}</div>
              </td>
              <td data-label="Journey 1">
                {row.journey1Pick ? <Badge tone="accent">{row.journey1Pick}</Badge> : null}
                <div className="small">{row.journey1 || "—"}</div>
              </td>
              <td data-label="Journey 2">
                <div className="small">{row.journey2 || "—"}</div>
              </td>
              <td data-label="Rewards">
                <RewardChips rewards={row.rewards} takeFirst={row.journey1Pick} />
                {row.notes ? <div className="library-note remembrance-plan-detail">{row.notes}</div> : null}
              </td>
              <td data-label="Area">
                <div className="small">{row.area || "—"}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Numbered duplication plan used at the top of the completion remembrance tab:
 * order, priority, duplicate-now vs defer, and the reward to take.
 */
export function RemembrancePlanList({ rows = remembrancePlanRows() }: { rows?: RemembrancePlanRow[] }) {
  if (!rows.length) {
    return (
      <p className="small faint remembrance-plan-empty">
        The ordered remembrance plan is not in this build yet. Record rewards and duplication per remembrance
        below; the plan appears here once the data lands.
      </p>
    );
  }
  return (
    <ol className="remembrance-plan-list">
      {rows.map((row) => (
        <li className="remembrance-plan-item" key={row.key}>
          <span className="remembrance-plan-index" aria-hidden="true">
            {formatNumber(row.order)}
          </span>
          <div className="remembrance-plan-body">
            <div className="remembrance-plan-head">
              <span className="remembrance-plan-title">{row.remembrance}</span>
              <Badge tone={DUPLICATE_TONES[row.duplicateAction]}>{row.duplicateLabel}</Badge>
              {row.game ? <Badge>{row.game}</Badge> : null}
            </div>
            <div className="remembrance-plan-meta">
              <BossLink row={row} />
              {row.area ? <span className="faint"> · {row.area}</span> : null}
              <RouteLinks row={row} />
            </div>
            <p className="remembrance-plan-priority">{row.priority}</p>
            <div className="remembrance-plan-picks">
              <span className="remembrance-plan-pick">
                <span className="remembrance-plan-pick-label">Reward to take</span>
                {row.journey1Pick ?? row.rewards[0] ?? "—"}
              </span>
              <span className="remembrance-plan-pick">
                <span className="remembrance-plan-pick-label">Journey 2</span>
                {row.journey2 || "—"}
              </span>
            </div>
            {row.duplicateDetail ? <div className="tiny faint remembrance-plan-detail">{row.duplicateDetail}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Small summary of the duplication split, used above both views. */
export function RemembrancePlanSummary({ rows = remembrancePlanRows() }: { rows?: RemembrancePlanRow[] }) {
  if (!rows.length) return null;
  const counts = remembranceDuplicateCounts(rows);
  return (
    <div className="remembrance-plan-summary">
      <span>
        <strong>{formatNumber(counts.now)}</strong> duplicate in Journey 1
      </span>
      <span>
        <strong>{formatNumber(counts.defer)}</strong> defer to Journey 2
      </span>
      <span>
        <strong>{formatNumber(counts.none)}</strong> need no duplicate
      </span>
      {counts.unknown ? (
        <span>
          <strong>{formatNumber(counts.unknown)}</strong> unclassified
        </span>
      ) : null}
    </div>
  );
}
