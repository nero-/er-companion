import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Checkbox, EmptyState, Modal, SearchInput, Select } from "./ui";
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

type PickerSort = "name" | "owned" | "category";

const KIND_LABEL: Record<EquipmentKind, string> = {
  weapon: "Weapons & casting tools",
  shield: "Shields",
  armor: "Armor",
  talisman: "Talismans",
  spell: "Spells",
  physick: "Crystal tears",
};

const SORTS: Record<PickerSort, string> = {
  name: "Name",
  owned: "Owned first",
  category: "Category",
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

const VISIBLE_LIMIT = 160;

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
  const [sort, setSort] = useState<PickerSort>("name");

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setOwnedOnly(false);
    setSort("name");
  }, [open, kind, title]);

  const pool = useMemo(() => ITEMS.filter((item) => matchesKind(item, kind)), [kind]);

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

  const rows = useMemo(() => {
    const next = [...filtered];
    next.sort((a, b) => {
      if (sort === "owned") {
        const byOwned = Number(owned[b.id] === true) - Number(owned[a.id] === true);
        if (byOwned) return byOwned;
      }
      if (sort === "category") {
        const byCategory = a.category.localeCompare(b.category);
        if (byCategory) return byCategory;
      }
      return a.name.localeCompare(b.name);
    });
    return next;
  }, [filtered, owned, sort]);

  const visible = rows.slice(0, VISIBLE_LIMIT);

  /**
   * Headings follow the active sort: ownership buckets when sorting owned-first,
   * otherwise the item's category (falling back to its group when the catalogue
   * left the category empty or identical to the group).
   */
  const sections = useMemo(() => {
    const grouped = new Map<string, Item[]>();
    for (const item of visible) {
      const key =
        sort === "owned"
          ? owned[item.id]
            ? "Owned"
            : "Missing"
          : item.category && item.category !== item.group
            ? item.category
            : item.group;
      const bucket = grouped.get(key);
      if (bucket) bucket.push(item);
      else grouped.set(key, [item]);
    }
    return [...grouped.entries()];
  }, [owned, sort, visible]);

  const ownedCount = filtered.filter((item) => owned[item.id]).length;
  const truncated = rows.length > VISIBLE_LIMIT;

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      className="picker-modal"
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
      <div className="equipment-picker">
        <div className="picker-scroll scroll-y">
          <div className="picker-toolbar">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={`Search ${KIND_LABEL[kind].toLowerCase()}…`}
            />
            <div className="picker-toolbar-row">
              <Select
                label="Sort"
                value={sort}
                onChange={(event) => {
                  const value = event.target.value;
                  setSort(value === "owned" || value === "category" ? value : "name");
                }}
              >
                {(Object.keys(SORTS) as PickerSort[]).map((key) => (
                  <option key={key} value={key}>
                    {SORTS[key]}
                  </option>
                ))}
              </Select>
              <div className="picker-toolbar-meta">
                <Checkbox checked={ownedOnly} onChange={setOwnedOnly} label="Owned only" />
                <span className="tiny faint">
                  {formatNumber(filtered.length)} of {formatNumber(pool.length)} · {formatNumber(ownedCount)} owned
                </span>
              </div>
            </div>
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
            <div className="picker-groups">
              {sections.map(([heading, items]) => (
                <section className="picker-group" key={heading}>
                  <h3 className="picker-group-title">
                    <span>{heading}</span>
                    <span className="tiny faint mono">{formatNumber(items.length)}</span>
                  </h3>
                  {items.map((item) => {
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
                              {item.category} · {item.game}
                              {item.region ? ` · ${item.region}` : ""}
                            </span>
                          </span>
                          {isCurrent ? <Badge tone="accent">Current</Badge> : null}
                          <span className={`owned-dot ${isOwned ? "yes" : ""}`} aria-hidden="true" />
                          <span className="tiny faint picker-own-label">{isOwned ? "Owned" : "Missing"}</span>
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
                </section>
              ))}
              {truncated ? (
                <p className="tiny faint picker-truncated">
                  Showing the first {VISIBLE_LIMIT} of {formatNumber(rows.length)} results. Refine the search to narrow
                  the list.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
