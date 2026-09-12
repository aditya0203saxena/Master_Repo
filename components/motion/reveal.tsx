"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
};

export function Reveal({ children, className, delay = 0, y = 24 }: RevealProps) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.from(".reveal-item", {
        y,
        opacity: 0,
        duration: 0.8,
        delay,
        ease: "power3.out",
        clearProps: "transform,opacity",
      });
    },
    { scope },
  );

  return (
    <div ref={scope} className={className}>
      <div className="reveal-item">{children}</div>
    </div>
  );
}
