import { useEffect, useState } from "react";
import type { ReferencePack } from "./reference-data";

/**
 * React hook that resolves the build reference pack once per session.
 *
 * The pack itself is a separate chunk (`reference-data.ts`) that the bundler
 * splits out because this module only references it through `import()`. Callers
 * render their existing empty state while `undefined`, so a slow fetch never
 * blocks a page.
 */
let loadedPack: ReferencePack | undefined;
let inFlight: Promise<ReferencePack> | undefined;

export type { ReferencePack };

export function useReferencePack(): ReferencePack | undefined {
  const [pack, setPack] = useState<ReferencePack | undefined>(() => loadedPack);

  useEffect(() => {
    if (pack) return;
    let active = true;
    inFlight ??= import("./reference-data").then((module) => {
      loadedPack = module;
      return module;
    });
    void inFlight.then((module) => {
      if (active) setPack(module);
    });
    return () => {
      active = false;
    };
  }, [pack]);

  return pack;
}
