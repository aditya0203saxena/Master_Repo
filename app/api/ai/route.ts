import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { prompt?: unknown };
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
    }

    const { OPENAI_API_KEY, OPENAI_MODEL } = getServerEnv();

    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "AI provider is not configured. Add OPENAI_API_KEY to your environment." },
        { status: 503 },
      );
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: prompt,
      }),
    });

    if (!response.ok) {
      const providerError = await response.text();
      console.error("AI provider error", providerError);
      return NextResponse.json({ error: "AI provider request failed." }, { status: 502 });
    }

    const data = (await response.json()) as { output_text?: string };
    return NextResponse.json({ output: data.output_text ?? "" });
  } catch (error) {
    console.error("AI route error", error);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
