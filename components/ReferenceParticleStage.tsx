"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { mountReferenceEngine } from "@/lib/reference/particle-engine-reference";
import styles from "./ReferenceParticleStage.module.css";

function hasThree() {
  return typeof window !== "undefined" && Boolean((window as typeof window & { THREE?: unknown }).THREE);
}

export function ReferenceParticleStage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const starsRef = useRef<HTMLCanvasElement | null>(null);
  const mainRef = useRef<HTMLCanvasElement | null>(null);
  const destroyRef = useRef<(() => void) | null>(null);
  const [threeReady, setThreeReady] = useState(hasThree);

  useEffect(() => {
    if (!threeReady || !containerRef.current || !starsRef.current || !mainRef.current) {
      return;
    }

    const mounted = mountReferenceEngine({
      container: containerRef.current,
      canvasMain: mainRef.current,
      canvasStars: starsRef.current,
      imageSrc: "/images/reference-home.png",
      maskSrc: "/images/face-mask.png"
    });

    destroyRef.current = mounted.destroy;

    return () => {
      destroyRef.current?.();
      destroyRef.current = null;
    };
  }, [threeReady]);

  return (
    <>
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r72/three.min.js"
        strategy="afterInteractive"
        onLoad={() => {
          setThreeReady(true);
        }}
      />
      <div ref={containerRef} className={styles.wrapper}>
        <canvas ref={starsRef} id="stars" className={`${styles.canvas} ${styles.stars}`} />
        <canvas ref={mainRef} id="yahia" className={`${styles.canvas} ${styles.main}`} />
        <div className={styles.vignette} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.template} data-template="home" />
        </div>
      </div>
    </>
  );
}
