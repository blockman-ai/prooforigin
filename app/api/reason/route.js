import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request) {
  try {
    const body = await request.json();

    const percent = body.percent ?? 0;
    const classification = body.classification || "Unknown";
    const manipulationRisk = body.manipulationRisk || "Unknown";
    const confidence = body.confidence || "Unknown";
    const signals = Array.isArray(body.signals) ? body.signals : [];

    if (!process.env.OPENAI_API_KEY) {
      return Response.json(
        { error: "OPENAI_API_KEY is missing." },
        { status: 500 }
      );
    }

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      instructions:
        "You are ProofOrigin's forensic report assistant. Write cautious, professional authenticity analysis. Never claim certainty. Explain results as probabilistic.",
      input: `
AI Probability: ${percent}%
Classification: ${classification}
Manipulation Risk: ${manipulationRisk}
Confidence: ${confidence}
Detected Signals: ${signals.join(", ")}

Write 2 clear sentences for a forensic summary.
      `,
      max_output_tokens: 150,
    });

    return Response.json({
      summary:
        response.output_text ||
        "The media shows mixed authenticity signals. This result should be treated as probabilistic, not definitive.",
    });
  } catch (error) {
    return Response.json(
      {
        error: error.message || "Unable to generate forensic summary.",
      },
      { status: 500 }
    );
  }
}
