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

    const body = await request.json();

    const percent = body.percent ?? 0;
    const classification = body.classification || "Unknown";
    const manipulationRisk = body.manipulationRisk || "Unknown";
    const confidence = body.confidence || "Unknown";
    const signals = Array.isArray(body.signals) ? body.signals : [];

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      instructions:
        "You are ProofOrigin's forensic report assistant. Write cautious, professional authenticity analysis. Never claim certainty. Explain results as probabilistic. Keep the report concise, serious, and useful for digital media authenticity review.",
      input: `Provide a forensic authenticity analysis for this media.

AI Probability: ${percent}%
Classification: ${classification}
Manipulation Risk: ${manipulationRisk}
Confidence: ${confidence}
Detected Signals: ${signals.join(", ")}

Include:
- likely origin
- synthetic indicators
- artifact observations
- manipulation likelihood
- confidence reasoning
- texture/pattern analysis
- visual inconsistencies
- metadata implications if applicable

Keep it professional and unique to the uploaded media.

Write 2-3 clear professional sentences for a forensic summary. Mention likely origin, synthetic indicators, manipulation risk, and confidence reasoning. Do not claim certainty.`,
      max_output_tokens: 220,
    });

    return Response.json({
      summary: response.output_text || "No OpenAI summary returned.",
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
