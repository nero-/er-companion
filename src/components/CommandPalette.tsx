import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { searchEntries } from "../lib/search";
import type { SearchEntry } from "../lib/search";
import { navigate } from "../lib/router";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const results = useMemo(() => searchEntries(query, 40), [query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Keep the keyboard cursor on screen: arrow keys can walk past the visible
  // slice of the result list.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, results]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, results.length - 1));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const entry = results[activeIndex];
        if (entry) {
          navigate(entry.path);
          onClose();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, results, activeIndex, onClose]);

  if (!open) return null;

  const grouped: { type: string; entries: { entry: SearchEntry; index: number }[] }[] = [];
  results.forEach((entry, index) => {
    const group = grouped.find((row) => row.type === entry.type);
    if (group) group.entries.push({ entry, index });
    else grouped.push({ type: entry.type, entries: [{ entry, index }] });
  });

  return createPortal(
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="command" role="dialog" aria-modal="true" aria-label="Search the companion">
        <div className="command-input-wrap">
          <Icon name="search" size={19} />
          <input
            ref={inputRef}
            className="command-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search route, items, builds, bosses, lore…"
            aria-label="Search"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="command-results">
          {results.length === 0 ? (
            <div className="empty" style={{ border: 0, padding: "34px 16px" }}>
              <div>
                <Icon name="search" size={22} />
                <h3>No matches</h3>
                <p className="small muted">Try an item name, area, boss, or build.</p>
              </div>
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.type}>
                <div className="command-group">{group.type}</div>
                {group.entries.map(({ entry, index }) => (
                  <button
                    key={entry.id}
                    ref={index === activeIndex ? activeRef : undefined}
                    aria-current={index === activeIndex ? "true" : undefined}
                    className={`command-item ${index === activeIndex ? "active" : ""}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => {
                      navigate(entry.path);
                      onClose();
                    }}
                  >
                    <span className="grow">
                      <span className="command-title">{entry.title}</span>
                      <span className="command-sub" style={{ display: "block" }}>
                        {entry.subtitle}
                      </span>
                    </span>
                    <Icon name="chevronRight" size={14} />
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
        <div className="command-footer">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span className="grow" />
          <span aria-live="polite">{results.length} results</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
