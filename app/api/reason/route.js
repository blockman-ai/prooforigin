import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request) {
  try {
    const body = await request.json();

    const {
      percent,
      classification,
      manipulationRisk,
      confidence,
      signals,
    } = body;

    const response = await openai.chat.completions.create({
      model: "gpt-5.5",
      messages: [
        {
          role: "system",
          content:
            "You are ProofOrigin's forensic report assistant. Write cautious, professional authenticity analysis. Never claim certainty. Explain results as probabilistic.",
        },
        {
          role: "user",
          content: `
Create a short forensic summary for this image scan.

AI Probability: ${percent}%
Classification: ${classification}
Manipulation Risk: ${manipulationRisk}
Confidence: ${confidence}
Detected Signals: ${signals?.join(", ")}

Return 2-3 clear sentences only.
          `,
        },
      ],
      max_tokens: 180,
    });

    const summary =
      response.choices?.[0]?.message?.content ||
      "Forensic summary unavailable.";

    return Response.json({ summary });
  } catch (error) {
    return Response.json(
      { error: "Unable to generate forensic summary." },
      { status: 500 }
    );
  }
}
