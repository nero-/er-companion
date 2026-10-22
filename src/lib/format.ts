import type { IconName } from "../components/Icon";

export const ITEM_GROUP_ICONS: Record<string, IconName> = {
  Weapon: "sword",
  Shield: "shield",
  Armor: "helmet",
  Talisman: "talisman",
  Spell: "spark",
  "Ash of War": "flame",
  "Spirit Ash": "users",
  "Recipe & Knowledge": "scroll",
  Upgrade: "layers",
  Material: "leaf",
  Consumable: "flask",
  "Crystal Tear": "flask",
  Gesture: "users",
  Tool: "bag",
  Note: "book",
  Flask: "flask",
  "Key & Lore": "book",
};

export function itemGroupIcon(group: string): IconName {
  return ITEM_GROUP_ICONS[group] ?? "bag";
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function formatDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function titleCase(value: string): string {
  return value.replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
}

export function tierClass(tier: string): string {
  return tier.replace(/\s+/g, "-");
}

export function equipmentModeLabel(mode: string): string {
  if (mode === "optimized") return "Optimized";
  if (mode === "fashion") return "Fashion";
  if (mode === "custom") return "Custom";
  return "Signature";
}
