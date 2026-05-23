export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("image");

    if (!file) {
      return Response.json({ error: "No image uploaded." }, { status: 400 });
    }

    const hiveApiUrl = process.env.HIVE_API_URL;
    const hiveApiKey = process.env.HIVE_API_KEY;

    if (!hiveApiUrl || !hiveApiKey) {
      return Response.json(
        { error: "Hive credentials are missing." },
        { status: 500 }
      );
    }

    const hiveForm = new FormData();
    hiveForm.append("media", file);

    const res = await fetch(hiveApiUrl, {
      method: "POST",
      headers: {
        Authorization: `Token ${hiveApiKey}`,
      },
      body: hiveForm,
    });

    const data = await res.json();

    if (!res.ok) {
      return Response.json(
        { error: "Hive analysis failed.", raw: data },
        { status: 500 }
      );
    }

    return Response.json({
      hiveRaw: data,
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Hive server error." },
      { status: 500 }
    );
  }
}
