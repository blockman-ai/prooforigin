import OpenAI from "openai";

export async function POST(request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return Response.json(
        { error: "OPENAI_API_KEY is missing in Vercel." },
        { status: 500 }
      );
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const formData = await request.formData();

    const file = formData.get("image");
    const percent = formData.get("percent") || "0";
    const classification = formData.get("classification") || "Unknown";
    const manipulationRisk = formData.get("manipulationRisk") || "Unknown";
    const confidence = formData.get("confidence") || "Unknown";
    const signalsRaw = formData.get("signals") || "[]";

    if (!file) {
      return Response.json(
        { error: "No image provided for vision analysis." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const mimeType = file.type || "image/jpeg";

    let signals = [];

    try {
      signals = JSON.parse(signalsRaw);
    } catch {
      signals = [];
    }

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      instructions:
        "You are ProofOrigin's forensic vision assistant. Write cautious, professional authenticity analysis. Never claim certainty. Explain results as probabilistic. Use both the visual image and detector scores.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Provide a forensic authenticity analysis for this uploaded media.

Detector Results:
AI Probability: ${percent}%
Classification: ${classification}
Manipulation Risk: ${manipulationRisk}
Confidence: ${confidence}
Detected Signals: ${signals.join(", ")}

Analyze the visible image directly.

Include:
- likely origin
- visible synthetic indicators
- artifact observations
- manipulation likelihood
- confidence reasoning
- texture/pattern analysis
- visual inconsistencies
- screenshot/composite clues if present
- metadata implications only if applicable

Write 2-3 clear professional sentences for a forensic summary. Do not claim certainty.`,
            },
            {
              type: "input_image",
              image_url: `data:${mimeType};base64,${base64}`,
              detail: "low",
            },
          ],
        },
      ],
      max_output_tokens: 260,
    });

    return Response.json({
      summary: response.output_text || "No OpenAI vision summary returned.",
    });
  } catch (error) {
    return Response.json(
      {
        error: error.message || "Unable to generate vision forensic summary.",
      },
      { status: 500 }
    );
  }
}
