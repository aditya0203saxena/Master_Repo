"use client";

import type { ReactNode } from "react";
import { LenisProvider } from "@/components/providers/lenis-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <>
      <LenisProvider />
      {children}
    </>
  );
}
