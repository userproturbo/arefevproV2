"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { usePathname } from "next/navigation";
import { CanvasParticleEngine } from "@/lib/particles/particle-engine";
import { HERO_SLOT, HOME_MENU_SLOTS, HOME_SLOT_IDS } from "@/lib/particles/slot-config";
import type { SlotId, SlotRect } from "@/lib/particles/types";

interface ParticleCanvasContextValue {
  assemble: (id: SlotId, durationMs?: number) => Promise<void>;
  disassemble: (id: SlotId, durationMs?: number) => Promise<void>;
  refreshSlotRect: (id: SlotId) => boolean;
  refreshAllSlotRects: () => void;
  isBusy: boolean;
}

const ParticleCanvasContext = createContext<ParticleCanvasContextValue | null>(null);

export function GlobalCanvasLayer({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<CanvasParticleEngine | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!canvasRef.current || engineRef.current) {
      return;
    }

    const engine = new CanvasParticleEngine(setIsBusy);
    engine.mount(canvasRef.current);
    engine.registerSlot(HERO_SLOT);
    for (const slot of HOME_MENU_SLOTS) {
      engine.registerSlot(slot);
    }
    engineRef.current = engine;

    return () => {
      observerRef.current?.disconnect();
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!engineRef.current) {
      return;
    }

    const resize = () => {
      engineRef.current?.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
      refreshAllSlotRects();
    };

    resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
    };
  }, []);

  useEffect(() => {
    refreshAllSlotRects();

    observerRef.current?.disconnect();
    if (!engineRef.current) {
      return;
    }

    const anchors = Array.from(document.querySelectorAll<HTMLElement>("[data-slot]"));
    if (anchors.length === 0) {
      return;
    }

    const observer = new ResizeObserver(() => {
      refreshAllSlotRects();
    });

    for (const anchor of anchors) {
      observer.observe(anchor);
    }

    observerRef.current = observer;

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [pathname]);

  const syncSlotRect = (id: SlotId) => {
    const anchor = document.querySelector<HTMLElement>(`[data-slot="${id}"]`);
    const engine = engineRef.current;

    if (!anchor || !engine) {
      return false;
    }

    const rect = anchor.getBoundingClientRect();
    const slotRect: SlotRect = {
      x: rect.left,
      y: rect.top,
      w: rect.width,
      h: rect.height
    };

    engine.updateSlotRect(id, slotRect);
    engine.setSlotVisible(id, rect.width > 0 && rect.height > 0);

    return rect.width > 0 && rect.height > 0;
  };

  const refreshAllSlotRects = () => {
    for (const slotId of HOME_SLOT_IDS) {
      syncSlotRect(slotId);
    }
  };

  const value = useMemo<ParticleCanvasContextValue>(
    () => ({
      assemble: async (id, durationMs) => {
        syncSlotRect(id);
        await engineRef.current?.assemble(id, { durationMs });
      },
      disassemble: async (id, durationMs) => {
        syncSlotRect(id);
        await engineRef.current?.disassemble(id, { durationMs });
      },
      refreshSlotRect: syncSlotRect,
      refreshAllSlotRects,
      isBusy
    }),
    [isBusy]
  );

  return (
    <ParticleCanvasContext.Provider value={value}>
      <div className="canvas-shell">
        <canvas ref={canvasRef} className="canvas-stage" aria-hidden="true" />
        {isBusy ? <div className="interaction-guard" aria-hidden="true" /> : null}
        <div className="page-shell">{children}</div>
      </div>
    </ParticleCanvasContext.Provider>
  );
}

export function useParticleCanvas() {
  const value = useContext(ParticleCanvasContext);

  if (!value) {
    throw new Error("useParticleCanvas must be used within GlobalCanvasLayer.");
  }

  return value;
}
