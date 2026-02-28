"use client";

import { useEffect, useRef, useState } from "react";
import { useParticleCanvas } from "@/components/global-canvas-layer";
import {
  HomeSceneController,
  type HomeSceneState
} from "@/lib/scenes/home-scene-controller";

const MENU_ITEMS = [
  { id: "menu-photo", label: "Photo", className: "menu-photo-trigger" },
  { id: "menu-video", label: "Video", className: "menu-video-trigger" },
  { id: "menu-music", label: "Music", className: "menu-music-trigger" },
  { id: "menu-blog", label: "Blog", className: "menu-blog-trigger" }
] as const;

export function HomeHero() {
  const { assemble, refreshSlotRect, refreshAllSlotRects, isBusy } = useParticleCanvas();
  const hasAssembledRef = useRef(false);
  const controllerRef = useRef<HomeSceneController | null>(null);
  const [sceneState, setSceneState] = useState<HomeSceneState>("collapsed");

  if (!controllerRef.current) {
    controllerRef.current = new HomeSceneController({
      assemble,
      refreshSlotRect,
      onStateChange: setSceneState
    });
  }

  useEffect(() => {
    if (hasAssembledRef.current) {
      return;
    }

    let cancelled = false;

    const start = async () => {
      refreshAllSlotRects();
      const measured = refreshSlotRect("hero");
      if (!measured || cancelled) {
        return;
      }

      hasAssembledRef.current = true;
      await assemble("hero", 1300);
    };

    const frame = window.requestAnimationFrame(start);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [assemble, refreshAllSlotRects, refreshSlotRect]);

  const handleClick = async () => {
    if (isBusy || !controllerRef.current) {
      return;
    }

    await controllerRef.current.expandMenu();
  };

  const menuEnabled = sceneState === "expanded" && !isBusy;

  return (
    <main className="home-page">
      <section className="home-stage" aria-label="Home particle stage">
        <button
          type="button"
          className="hero-trigger"
          onClick={handleClick}
          disabled={isBusy || sceneState !== "collapsed"}
          aria-label="Expand the home menu"
        >
          <div className="hero-anchor" data-slot="hero" />
        </button>
        {MENU_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`menu-trigger ${item.className}`}
            disabled={!menuEnabled}
            aria-label={`${item.label} section`}
          >
            <div className="menu-anchor" data-slot={item.id} />
          </button>
        ))}
      </section>
    </main>
  );
}
