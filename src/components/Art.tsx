import type { ReactNode } from "react";
import { Icon } from "./Icon";

/**
 * Local art library. Every path is served from public/art, so the offline PWA
 * never reaches the network for artwork.
 *
 * Example usage on a page:
 *
 *   <ArtHero
 *     image={ART.heroErdtree}
 *     kicker="The Lands Between"
 *     title="Continue the journey"
 *     description="One next action, the closeout state around it, and the current build."
 *     actions={<Button variant="primary" icon="map">Open journey</Button>}
 *     priority
 *   />
 *
 *   <ArtBanner image={ART.heroSote} kicker="Shadow of the Erdtree" title="Realm of Shadow" variant="sote" />
 *   <OrnamentRule label="Act I" />
 *   <UnofficialNote />
 */
export const ART = {
  heroErdtree: "/art/hero-erdtree.jpg",
  heroSote: "/art/hero-sote.jpg",
  world: "/art/bg-world.jpg",
  cover: "/art/vertical-erdtree.jpg",
  logo: "/art/logo-elden-ring.png",
  soteCapsule: "/art/sotet-capsule.jpg",
  soteHeader: "/art/sotet-header.jpg",
  erdtreeShots: [
    "/art/shot-erdtree-01.jpg",
    "/art/shot-erdtree-02.jpg",
    "/art/shot-erdtree-03.jpg",
    "/art/shot-erdtree-04.jpg",
    "/art/shot-erdtree-05.jpg",
    "/art/shot-erdtree-06.jpg",
  ],
  soteShots: [
    "/art/shot-sote-01.jpg",
    "/art/shot-sote-02.jpg",
    "/art/shot-sote-03.jpg",
    "/art/shot-sote-04.jpg",
  ],
} as const;

/* ---------- Hero ---------- */

export interface ArtHeroProps {
  /** Local image path — normally one of the ART constants. */
  image: string;
  /** Art is atmospheric; an empty alt is correct unless the image carries meaning. */
  alt?: string;
  kicker?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Extra content rendered below the actions. */
  children?: ReactNode;
  size?: "default" | "compact" | "tall";
  headingLevel?: 1 | 2 | 3;
  /** Set for above-the-fold heroes (eager decode); defaults to true. */
  priority?: boolean;
  className?: string;
}

export function ArtHero({
  image,
  alt = "",
  kicker,
  title,
  description,
  actions,
  children,
  size = "default",
  headingLevel = 2,
  priority = true,
  className = "",
}: ArtHeroProps) {
  const Heading = `h${headingLevel}` as "h1" | "h2" | "h3";
  return (
    <section
      className={`art-hero ${size === "compact" ? "art-hero--compact" : size === "tall" ? "art-hero--tall" : ""} ${className}`.trim()}
    >
      <img
        className="art-hero-img"
        src={image}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
      />
      <div className="art-hero-body">
        {kicker ? <div className="art-hero-kicker">{kicker}</div> : null}
        <Heading className="art-hero-title">{title}</Heading>
        {description ? <div className="art-hero-desc">{description}</div> : null}
        {actions ? <div className="art-hero-actions">{actions}</div> : null}
        {children ? <div className="art-hero-children">{children}</div> : null}
      </div>
    </section>
  );
}

/* ---------- Banner ---------- */

export type ArtBannerVariant = "erdtree" | "sote" | "world" | "plain";

export interface ArtBannerProps {
  image: string;
  alt?: string;
  /** Small uppercase line above the title. */
  caption?: ReactNode;
  title?: ReactNode;
  /** Extra content rendered under the title. */
  children?: ReactNode;
  variant?: ArtBannerVariant;
  size?: "default" | "tall" | "square";
  priority?: boolean;
  className?: string;
}

export function ArtBanner({
  image,
  alt = "",
  caption,
  title,
  children,
  variant = "erdtree",
  size = "default",
  priority = false,
  className = "",
}: ArtBannerProps) {
  return (
    <div
      className={`art-banner ${variant === "plain" ? "" : `art-banner--${variant}`} ${size === "tall" ? "art-banner--tall" : size === "square" ? "art-banner--square" : ""} ${className}`.trim()}
    >
      <img
        className="art-banner-img"
        src={image}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
      />
      <div className="art-banner-body">
        <div className="art-banner-copy">
          {caption ? <div className="art-banner-caption">{caption}</div> : null}
          {title ? <div className="art-banner-title">{title}</div> : null}
          {children}
        </div>
      </div>
    </div>
  );
}

/* ---------- Frame ---------- */

export interface ArtFrameProps {
  src: string;
  alt: string;
  caption?: ReactNode;
  portrait?: boolean;
  className?: string;
}

/** A framed screenshot or cover, with a gilded inner rule. */
export function ArtFrame({ src, alt, caption, portrait = false, className = "" }: ArtFrameProps) {
  return (
    <figure className={`art-frame ${portrait ? "art-frame--portrait" : ""} ${className}`.trim()}>
      <img src={src} alt={alt} loading="lazy" decoding="async" />
      {caption ? <figcaption className="art-frame-caption">{caption}</figcaption> : null}
    </figure>
  );
}

/* ---------- Ornament ---------- */

export interface OrnamentRuleProps {
  label?: ReactNode;
  className?: string;
}

/** A fine gold divider with a central rune diamond. */
export function OrnamentRule({ label, className = "" }: OrnamentRuleProps) {
  return (
    <div
      className={`ornament-rule ${className}`.trim()}
      role="separator"
      aria-orientation="horizontal"
    >
      {label ? (
        <span className="ornament-rule-label">{label}</span>
      ) : (
        <span className="ornament-rule-mark" aria-hidden="true" />
      )}
    </div>
  );
}

/* ---------- Unofficial note ---------- */

export interface UnofficialNoteProps {
  /** Short one-line form for the shell strip. */
  compact?: boolean;
  className?: string;
}

export function UnofficialNote({ compact = false, className = "" }: UnofficialNoteProps) {
  return (
    <p className={`unofficial-note ${className}`.trim()} role="note">
      <Icon name="rune" size={11} />
      <span>
        {compact
          ? "Unofficial fan project · not affiliated with FromSoftware or Bandai Namco"
          : "Unofficial fan project · not affiliated with FromSoftware or Bandai Namco. Game artwork and marks remain the property of their owners."}
      </span>
    </p>
  );
}
