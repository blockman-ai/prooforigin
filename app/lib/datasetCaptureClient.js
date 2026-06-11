export function getDatasetCaptureAuthHeaders(accessToken) {
  if (!accessToken) {
    return {};
  }

  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function fetchDatasetCaptureSession(accessToken) {
  const res = await fetch("/api/dataset-capture/session", {
    headers: getDatasetCaptureAuthHeaders(accessToken),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    data = { authenticated: false, isAdmin: false, error: "Invalid session response." };
  }

  return { res, data };
}
