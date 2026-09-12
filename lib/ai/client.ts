export async function askAI(prompt: string, signal?: AbortSignal) {
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
    signal,
  });

  const data = (await response.json()) as { output?: string; error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "AI request failed.");
  }

  return data.output ?? "";
}
