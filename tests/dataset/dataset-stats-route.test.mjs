import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const state = {
  auth: {
    ok: true,
    email: "admin@prooforigin.test",
  },
  captures: [],
  jobs: [],
  captureSelect: null,
  jobSelect: null,
};

mock.module("../../app/lib/datasetCaptureAdmin.js", {
  exports: {
    authorizeDatasetCaptureAdmin: async () => state.auth,
    datasetCaptureAuthFailureResponse: (auth) => ({
      success: false,
      error: auth.error,
    }),
  },
});

mock.module("../../app/lib/supabaseAdmin.js", {
  exports: {
    isSupabaseAdminConfigured: () => true,
    getSupabaseAdmin: () => ({
      from: (table) => {
        if (table === "private_dataset_captures") {
          return {
            select: (columns) => {
              state.captureSelect = columns;
              return Promise.resolve({ data: state.captures, error: null });
            },
          };
        }

        if (table === "dataset_training_jobs") {
          return {
            select: (columns) => {
              state.jobSelect = columns;
              return {
                order: () => Promise.resolve({ data: state.jobs, error: null }),
              };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  },
});

const { POST } = await import("../../app/api/dataset-capture/dataset-stats/route.js");

function resetState() {
  state.auth = {
    ok: true,
    email: "admin@prooforigin.test",
  };
  state.captures = [];
  state.jobs = [];
  state.captureSelect = null;
  state.jobSelect = null;
}

function makeRequest() {
  return new Request("http://localhost/api/dataset-capture/dataset-stats", {
    method: "POST",
    headers: {
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
}

function findKeyDeep(value, key) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  if (Object.prototype.hasOwnProperty.call(value, key)) {
    return value[key];
  }

  for (const nested of Object.values(value)) {
    const found = findKeyDeep(nested, key);
    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

function assertNoCaptureMediaOrSecrets(payload) {
  const text = JSON.stringify(payload);

  assert.doesNotMatch(text, /https?:\/\/[^\s"']+\.(jpg|jpeg|png|webp|gif)/i);
  assert.doesNotMatch(text, /storage\/v1\/object/i);
  assert.doesNotMatch(text, /SUPABASE_SERVICE_ROLE_KEY/i);
  assert.doesNotMatch(text, /service_role/i);
  assert.doesNotMatch(text, /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);

  for (const key of [
    "storagePath",
    "storage_path",
    "imageUrl",
    "image_url",
    "publicUrl",
    "public_url",
    "signedUrl",
    "signed_url",
  ]) {
    assert.equal(findKeyDeep(payload, key), undefined, `unexpected ${key} in response`);
  }
}

test("dataset-stats rejects unauthorized requests", async () => {
  resetState();
  state.auth = {
    ok: false,
    status: 401,
    error: "Login required.",
  };

  const response = await POST(makeRequest());
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(json.success, false);
  assert.equal(json.error, "Login required.");
});

test("dataset-stats rejects non-admin requests", async () => {
  resetState();
  state.auth = {
    ok: false,
    status: 403,
    error: "Access denied. Admin approval required.",
  };

  const response = await POST(makeRequest());
  const json = await response.json();

  assert.equal(response.status, 403);
  assert.equal(json.success, false);
  assert.equal(json.error, "Access denied. Admin approval required.");
});

test("dataset-stats returns metadata-only success shape", async () => {
  resetState();
  state.captures = [
    {
      id: "capture-v02",
      sha256: "sha256-v02",
      selected_bucket: "real_pet_photos",
      human_verified_label: null,
      approved_for_training: true,
      ready_for_import: true,
      rejected: false,
      is_duplicate: false,
      keep_for_regression_only: false,
      review_status: "approved",
      reviewed_at: "2026-06-10T12:00:00.000Z",
      created_at: "2026-06-10T11:00:00.000Z",
    },
    {
      id: "capture-expansion",
      sha256: "sha256-expansion",
      selected_bucket: "real_people_photos",
      human_verified_label: null,
      approved_for_training: true,
      ready_for_import: true,
      rejected: false,
      is_duplicate: false,
      keep_for_regression_only: false,
      review_status: "approved",
      reviewed_at: "2026-06-10T12:30:00.000Z",
      created_at: "2026-06-10T11:30:00.000Z",
    },
    {
      id: "capture-pending",
      sha256: "sha256-pending",
      selected_bucket: "screenshots",
      human_verified_label: null,
      approved_for_training: false,
      ready_for_import: false,
      rejected: false,
      is_duplicate: false,
      keep_for_regression_only: false,
      review_status: "pending",
      reviewed_at: null,
      created_at: "2026-06-10T13:00:00.000Z",
    },
  ];
  state.jobs = [];

  const response = await POST(makeRequest());
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.ok(json.totals);
  assert.ok(json.overallCorrection);
  assert.ok(Array.isArray(json.expansionBuckets));
  assert.ok(json.timeline);
  assert.ok(json.correctionHistory);
  assert.ok(json.trainingHistory);
  assert.ok(json.candidateModel);
  assert.match(json.note, /metadata only/i);

  assert.equal(typeof json.totals.approved, "number");
  assert.equal(typeof json.totals.pending, "number");
  assert.equal(typeof json.overallCorrection.current, "number");
  assert.equal(typeof json.overallCorrection.target, "number");
  assert.equal(typeof json.overallCorrection.remaining, "number");
  assert.equal(typeof json.overallCorrection.percent, "number");

  assert.equal(json.overallCorrection.current, 1);
  assert.equal(
    json.expansionBuckets.find((bucket) => bucket.bucket === "real_people_photos")?.current,
    1
  );

  assertNoCaptureMediaOrSecrets(json);

  assert.match(state.captureSelect, /sha256/);
  assert.doesNotMatch(state.captureSelect, /storage_path|image_url|public_url|signed_url/i);
});
