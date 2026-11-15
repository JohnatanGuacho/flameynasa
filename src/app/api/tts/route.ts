import { NextRequest, NextResponse } from "next/server";

const JARVIS_REFERENCE_ID = "ae74d1059517440aa6e5d2d50598d179";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.FISH_AUDIO_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Falta FISH_AUDIO_API_KEY en .env.local" },
        { status: 500 }
      );
    }

    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Texto inválido para síntesis de voz" },
        { status: 400 }
      );
    }

    const fishResponse = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        model: "s2.1-pro-free",
      },
      body: JSON.stringify({
        text,
        reference_id: JARVIS_REFERENCE_ID,
      }),
    });

    if (!fishResponse.ok) {
      const errorDetail = await fishResponse.text();
      return NextResponse.json(
        { error: "Error en Fish Audio", detail: errorDetail },
        { status: fishResponse.status }
      );
    }

    const audioBuffer = await fishResponse.arrayBuffer();

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Fallo interno generando audio", detail: String(error) },
      { status: 500 }
    );
  }
}