export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="flex items-center gap-3 text-sm text-zinc-400">
        <span className="size-2 animate-pulse rounded-full bg-white" />
        Loading...
      </div>
    </main>
  );
}
