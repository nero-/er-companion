import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Checkbox, EmptyState, Modal, SearchInput } from "./ui";
import { Icon } from "./Icon";
import { ITEMS } from "../lib/data";
import { formatNumber, itemGroupIcon } from "../lib/format";
import type { Item } from "../lib/types";

export type EquipmentKind = "weapon" | "shield" | "armor" | "talisman" | "spell" | "physick";

interface EquipmentPickerProps {
  open: boolean;
  title: string;
  kind: EquipmentKind;
  currentItemId?: string;
  owned: Record<string, boolean>;
  onClose: () => void;
  onSelect: (name: string) => void;
  onToggleOwned: (itemId: string, owned: boolean) => void;
}

const KIND_LABEL: Record<EquipmentKind, string> = {
  weapon: "Weapons & casting tools",
  shield: "Shields",
  armor: "Armor",
  talisman: "Talismans",
  spell: "Spells",
  physick: "Crystal tears",
};

function matchesKind(item: Item, kind: EquipmentKind): boolean {
  switch (kind) {
    case "weapon":
      return item.group === "Weapon" || item.category === "Casting Tool" || item.category === "Sacred Seal";
    case "shield":
      return item.group === "Shield";
    case "armor":
      return item.group === "Armor";
    case "talisman":
      return item.group === "Talisman";
    case "spell":
      return item.group === "Spell";
    case "physick":
      return item.group === "Crystal Tear";
    default:
      return false;
  }
}

const VISIBLE_LIMIT = 120;

export function EquipmentPicker({
  open,
  title,
  kind,
  currentItemId,
  owned,
  onClose,
  onSelect,
  onToggleOwned,
}: EquipmentPickerProps) {
  const [search, setSearch] = useState("");
  const [ownedOnly, setOwnedOnly] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setOwnedOnly(false);
  }, [open, kind, title]);

  const pool = useMemo(
    () => ITEMS.filter((item) => matchesKind(item, kind)).sort((a, b) => a.name.localeCompare(b.name)),
    [kind],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return pool.filter((item) => {
      if (ownedOnly && !owned[item.id]) return false;
      if (!needle) return true;
      return (
        item.name.toLowerCase().includes(needle) ||
        item.category.toLowerCase().includes(needle) ||
        item.group.toLowerCase().includes(needle) ||
        item.region.toLowerCase().includes(needle) ||
        item.location.toLowerCase().includes(needle)
      );
    });
  }, [pool, search, ownedOnly, owned]);

  const visible = filtered.slice(0, VISIBLE_LIMIT);
  const ownedCount = filtered.filter((item) => owned[item.id]).length;

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              onSelect("");
              onClose();
            }}
            icon="x"
          >
            Clear slot
          </Button>
        </>
      }
    >
      <div className="stack">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={`Search ${KIND_LABEL[kind].toLowerCase()}…`}
        />
        <div className="row-between wrap">
          <Checkbox checked={ownedOnly} onChange={setOwnedOnly} label="Owned only" />
          <span className="tiny faint">
            {formatNumber(filtered.length)} of {formatNumber(pool.length)} · {formatNumber(ownedCount)} marked owned
          </span>
        </div>
        {filtered.length === 0 ? (
          <EmptyState
            title="No matching equipment"
            description={
              ownedOnly
                ? "Nothing in this slot type is marked owned. Turn off the owned filter or mark items in the collection."
                : "Try a different search term."
            }
          />
        ) : (
          <>
            <div className="picker-list scroll-y">
              {visible.map((item) => {
                const isOwned = owned[item.id] === true;
                const isCurrent = item.id === currentItemId;
                return (
                  <div key={item.id} className={`picker-row ${isCurrent ? "is-current" : ""}`.trim()}>
                    <button
                      type="button"
                      className="picker-pick"
                      onClick={() => {
                        onSelect(item.name);
                        onClose();
                      }}
                      aria-label={`Select ${item.name}${isCurrent ? " (current)" : ""}`}
                    >
                      <span className="item-glyph">
                        <Icon name={itemGroupIcon(item.group)} size={14} />
                      </span>
                      <span className="grow">
                        <span className="item-name">{item.name}</span>
                        <span className="item-sub">
                          {item.category} · {item.game} · {item.region}
                        </span>
                      </span>
                      {isCurrent ? <Badge tone="accent">Current</Badge> : null}
                      <span className={`owned-dot ${isOwned ? "yes" : ""}`} aria-hidden="true" />
                      <span className="tiny faint">{isOwned ? "Owned" : "Missing"}</span>
                    </button>
                    <button
                      type="button"
                      className="picker-own"
                      onClick={() => onToggleOwned(item.id, !isOwned)}
                      aria-label={isOwned ? `Mark ${item.name} as not owned` : `Mark ${item.name} as owned`}
                      title={isOwned ? "Remove owned mark" : "Mark owned"}
                    >
                      <Icon name={isOwned ? "check" : "plus"} size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
            {filtered.length > VISIBLE_LIMIT ? (
              <p className="tiny faint" style={{ margin: 0 }}>
                Showing the first {VISIBLE_LIMIT} of {formatNumber(filtered.length)} results. Refine the search to narrow
                the list.
              </p>
            ) : null}
          </>
        )}
      </div>
    </Modal>
  );
}
