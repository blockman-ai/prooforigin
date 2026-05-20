export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("image");

    if (!file) {
      return Response.json({ error: "No image uploaded." }, { status: 400 });
    }

    const apiUser = process.env.SIGHTENGINE_USER;
    const apiSecret = process.env.SIGHTENGINE_SECRET;

    if (!apiUser || !apiSecret) {
      return Response.json(
        { error: "Sightengine credentials are missing." },
        { status: 500 }
      );
    }

    const sightForm = new FormData();
    sightForm.append("media", file);
    sightForm.append("models", "genai");
    sightForm.append("api_user", apiUser);
    sightForm.append("api_secret", apiSecret);

    const res = await fetch("https://api.sightengine.com/1.0/check.json", {
      method: "POST",
      body: sightForm,
    });

    const data = await res.json();

    if (!res.ok || data.status === "failure") {
      return Response.json(
        { error: data.error?.message || "Analysis failed.", raw: data },
        { status: 500 }
      );
    }

    const aiScore =
      data.type?.ai_generated ??
      data.ai_generated ??
      data.genai?.ai_generated ??
      0;

    const percent = Math.round(aiScore * 100);

    let verdict = "Uncertain";
    if (percent >= 70) verdict = "Likely AI-generated";
    if (percent <= 30) verdict = "Likely human-made";

    return Response.json({
      percent,
      verdict,
      raw: data,
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Server error." },
      { status: 500 }
    );
  }
}
