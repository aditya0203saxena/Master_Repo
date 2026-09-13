import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { command, trigger } = (await request.json()) as { command?: string; trigger?: string };
    if (!command || !trigger) return NextResponse.json({ error: "command and trigger are required" }, { status: 400 });

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) return NextResponse.json({ error: "Telegram integration is not configured" }, { status: 503 });

    const text = `🚨 Patient Alert: ${command}\nAction: ${trigger}`;
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      cache: "no-store",
    });

    if (!response.ok) return NextResponse.json({ error: "Telegram request failed" }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram integration failed", error);
    return NextResponse.json({ error: "Unable to send Telegram alert" }, { status: 500 });
  }
}
