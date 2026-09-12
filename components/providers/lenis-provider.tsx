"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

export function LenisProvider() {
  useEffect(() => {
    const lenis = new Lenis({
      autoRaf: true,
      anchors: true,
      respectReducedMotion: true,
    });

    return () => lenis.destroy();
  }, []);

  return null;
}
