import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

/* ---------- Button ---------- */

type ButtonVariant = "default" | "primary" | "ghost" | "danger";
type ButtonSize = "default" | "sm";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
}

export function Button({
  variant = "default",
  size = "default",
  icon,
  iconRight,
  className = "",
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`btn ${variant === "primary" ? "btn-primary" : variant === "ghost" ? "btn-ghost" : variant === "danger" ? "btn-danger" : ""} ${size === "sm" ? "btn-sm" : ""} ${className}`.trim()}
      {...rest}
    >
      {icon ? <Icon name={icon} size={size === "sm" ? 14 : 16} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={size === "sm" ? 14 : 16} /> : null}
    </button>
  );
}

/* ---------- Badge ---------- */

type BadgeTone = "default" | "accent" | "success" | "warning" | "danger" | "info";

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = "default", children, className = "" }: BadgeProps) {
  return <span className={`badge ${tone === "default" ? "" : `badge-${tone}`} ${className}`.trim()}>{children}</span>;
}

/* ---------- Progress ---------- */

interface ProgressBarProps {
  value: number;
  tone?: "accent" | "success";
  label?: string;
  detail?: string;
  className?: string;
}

export function ProgressBar({ value, tone = "accent", label, detail, className = "" }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={className}>
      <div className="progress-track" role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
        <div className={`progress-fill ${tone === "success" ? "success" : ""}`} style={{ width: `${clamped}%` }} />
      </div>
      {label || detail ? (
        <div className="progress-meta">
          <span>{label}</span>
          <span>{detail}</span>
        </div>
      ) : null}
    </div>
  );
}

interface RingProps {
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
  tone?: "accent" | "success";
}

export function Ring({ value, size = 76, stroke = 5, label, tone = "accent" }: RingProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const color = tone === "success" ? "var(--success)" : "var(--accent)";
  return (
    <div className={`ring ${size < 60 ? "ring-sm" : ""}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255,255,255,.07)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 400ms ease" }}
        />
      </svg>
      <span className="ring-value">{label ?? `${clamped}%`}</span>
    </div>
  );
}

/* ---------- Page header ---------- */

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header-main">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="page-title">{title}</h1>
        {description ? <div className="page-description">{description}</div> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

/* ---------- Section title ---------- */

interface SectionTitleProps {
  title: string;
  note?: ReactNode;
  actions?: ReactNode;
}

export function SectionTitle({ title, note, actions }: SectionTitleProps) {
  return (
    <div className="section-title">
      <div className="row" style={{ gap: 10 }}>
        <h2>{title}</h2>
        {note ? <span className="section-note">{note}</span> : null}
      </div>
      {actions}
    </div>
  );
}

/* ---------- Stat ---------- */

interface StatProps {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}

export function Stat({ label, value, detail }: StatProps) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {detail ? <div className="stat-delta">{detail}</div> : null}
    </div>
  );
}

/* ---------- Tabs ---------- */

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

interface TabBarProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
}

export function TabBar({ items, value, onChange }: TabBarProps) {
  return (
    <div className="tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          role="tab"
          aria-selected={item.id === value}
          className={`tab ${item.id === value ? "active" : ""}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
          {typeof item.count === "number" ? <span className="tab-count">{item.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/* ---------- Search input ---------- */

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({ value, onChange, placeholder = "Search…", className = "" }: SearchInputProps) {
  const id = useId();
  return (
    <div className={`search-field ${className}`.trim()}>
      <Icon name="search" size={15} />
      <input
        id={id}
        className="input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
      />
    </div>
  );
}

/* ---------- Select ---------- */

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export function Select({ label, className = "", children, ...rest }: SelectProps) {
  return (
    <label className="field">
      {label ? <span className="field-label">{label}</span> : null}
      <select className={`select ${className}`.trim()} {...rest}>
        {children}
      </select>
    </label>
  );
}

/* ---------- Switch / Checkbox ---------- */

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export function Switch({ checked, onChange, label }: SwitchProps) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="switch-track" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  className?: string;
}

export function Checkbox({ checked, onChange, label, className = "" }: CheckboxProps) {
  return (
    <label className={`check ${className}`.trim()}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="check-box">
        <Icon name="check" size={12} strokeWidth={2.4} />
      </span>
      {label ? <span>{label}</span> : null}
    </label>
  );
}

/* ---------- Empty state ---------- */

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: IconName;
}

export function EmptyState({ title, description, action, icon = "search" }: EmptyStateProps) {
  return (
    <div className="empty">
      <div>
        <Icon name={icon} size={26} />
        <h3>{title}</h3>
        {description ? <p className="small muted">{description}</p> : null}
        {action ? <div style={{ marginTop: 14 }}>{action}</div> : null}
      </div>
    </div>
  );
}

/* ---------- Callout ---------- */

interface CalloutProps {
  tone?: "default" | "warning" | "danger" | "success";
  children: ReactNode;
  icon?: IconName;
}

export function Callout({ tone = "default", children, icon = "spark" }: CalloutProps) {
  return (
    <div className={`callout ${tone === "default" ? "" : tone}`}>
      <Icon name={icon} size={16} />
      <div>{children}</div>
    </div>
  );
}

/* ---------- Tier badge ---------- */

export function TierBadge({ tier }: { tier: string }) {
  const normalized = tier.replace(/\s+/g, "-");
  return <span className={`tier tier-${normalized}`}>{tier}</span>;
}

/* ---------- Modal / Drawer ---------- */

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function Modal({ open, title, onClose, children, actions, className = "" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`modal ${className}`.trim()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="row-between" style={{ marginBottom: 12 }}>
          <h2 className="dialog-title">{title}</h2>
          <Button variant="ghost" size="sm" icon="x" onClick={onClose} aria-label="Close" />
        </div>
        <div>{children}</div>
        {actions ? <div className="modal-actions">{actions}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

interface DrawerProps {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Drawer({ open, title, subtitle, onClose, children, footer }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : "Details"}>
        <div className="drawer-header">
          <div className="grow">
            <div className="eyebrow" style={{ marginBottom: 4 }}>
              Details
            </div>
            <h2 className="dialog-title dialog-title--drawer">{title}</h2>
            {subtitle ? <div className="small muted" style={{ marginTop: 4 }}>{subtitle}</div> : null}
          </div>
          <Button variant="ghost" size="sm" icon="x" onClick={onClose} aria-label="Close details" />
        </div>
        <div className="drawer-body">{children}</div>
        {footer ? <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)" }}>{footer}</div> : null}
      </aside>
    </>,
    document.body,
  );
}

/* ---------- Toasts ---------- */

type ToastTone = "default" | "success" | "error";

interface ToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  push: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const push = useCallback((message: string, tone: ToastTone = "default") => {
    const id = Date.now() + Math.random();
    setMessages((current) => [...current.slice(-3), { id, message, tone }]);
    window.setTimeout(() => {
      setMessages((current) => current.filter((entry) => entry.id !== id));
    }, 4200);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className={`toast ${message.tone}`}>
            <Icon name={message.tone === "success" ? "check" : message.tone === "error" ? "alert" : "spark"} size={16} />
            <div>{message.message}</div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider");
  return value;
}


/* ---------- Progressive disclosure ---------- */

interface DisclosureProps {
  title: ReactNode;
  summary?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  className?: string;
  tone?: "default" | "accent" | "muted";
  icon?: IconName;
}

/**
 * A native <details> disclosure. Native semantics keep keyboard and screen
 * reader behavior correct without extra JS, while the page stays quiet until
 * the player asks for the rest of the ledger.
 */
export function Disclosure({
  title,
  summary,
  children,
  defaultOpen = false,
  open,
  onToggle,
  className = "",
  tone = "default",
  icon,
}: DisclosureProps) {
  return (
    <details
      className={`disclosure disclosure-${tone} ${className}`.trim()}
      open={open}
      onToggle={onToggle ? (event) => onToggle(event.currentTarget.open) : undefined}
    >
      <summary className="disclosure-summary">
        {icon ? <Icon name={icon} size={15} /> : null}
        <span className="disclosure-title">{title}</span>
        {summary ? <span className="disclosure-meta">{summary}</span> : null}
        <Icon name="chevronDown" size={14} className="disclosure-chevron" />
      </summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}

interface CollapsibleCardProps {
  title: string;
  note?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function CollapsibleCard({
  title,
  note,
  actions,
  children,
  defaultOpen = false,
  className = "",
}: CollapsibleCardProps) {
  return (
    <details className={`card card-pad collapsible-card ${className}`.trim()} open={defaultOpen}>
      <summary className="collapsible-summary">
        <span className="row" style={{ gap: 10 }}>
          <h2>{title}</h2>
          {note ? <span className="section-note">{note}</span> : null}
        </span>
        <span className="row" style={{ gap: 8 }}>
          {actions}
          <Icon name="chevronDown" size={15} className="disclosure-chevron" />
        </span>
      </summary>
      <div className="collapsible-body">{children}</div>
    </details>
  );
}

/* ---------- Stat comparison ---------- */

export interface StatCompareRow {
  key: string;
  label: string;
  current: number;
  target: number;
  softCap?: number;
}

export function StatCompare({ rows }: { rows: StatCompareRow[] }) {
  return (
    <div className="stat-compare" role="table" aria-label="Current and planned stats">
      <div className="stat-compare-row stat-compare-head" role="row">
        <span role="columnheader">Stat</span>
        <span role="columnheader">Now</span>
        <span role="columnheader">Target</span>
        <span role="columnheader">Δ</span>
      </div>
      {rows.map((row) => {
        const delta = row.target - row.current;
        const capped = row.softCap ? row.target >= row.softCap : false;
        return (
          <div className="stat-compare-row" role="row" key={row.key}>
            <span className="stat-compare-label" role="cell">
              {row.label}
              {row.softCap ? <span className="tiny faint"> cap {row.softCap}</span> : null}
            </span>
            <span role="cell">{row.current}</span>
            <span role="cell" className={capped ? "success" : undefined}>{row.target}</span>
            <span role="cell" className={delta > 0 ? "warning" : delta < 0 ? "danger" : "faint"}>
              {delta > 0 ? `+${delta}` : delta}
            </span>
          </div>
        );
      })}
    </div>
  );
}
