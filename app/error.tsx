"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="max-w-md text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">Unexpected error</p>
        <h1 className="mt-3 text-3xl font-semibold">Something broke.</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">Try the page again. The error has been logged to the browser console for debugging.</p>
        <Button className="mt-6" onClick={reset}>Try again</Button>
      </div>
    </main>
  );
}
