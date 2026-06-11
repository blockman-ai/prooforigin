"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import GlassPanel from "../../components/protocol/GlassPanel";
import PageShell from "../../components/protocol/PageShell";
import ProtocolBadge from "../../components/protocol/ProtocolBadge";
import StatusCard from "../../components/protocol/StatusCard";
import UploadDropzone from "../../components/protocol/UploadDropzone";
import {
  clearStoredEnrollment,
  fingerprintPreview,
  readStoredEnrollment,
  VOICE_ANCHOR_MAX_BYTES,
  writeStoredEnrollment,
} from "../lib/voiceAnchor";

const MAX_RECORD_MS = 30_000;

const NOTICES = [
  "Voice anchoring is optional — you choose when to enroll.",
  "ProofOrigin creates a private fingerprint hash, not a public recording.",
  "Raw audio is processed in memory and is not permanently stored.",
  "ProofOrigin does not sell voiceprints or share them with third parties.",
  "You can delete your voice anchor record later from this browser session.",
  "This is V1 enrollment only — not live scam-call detection yet.",
];

function pickRecorderMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

export default function VoiceAnchorPage() {
  const [mode, setMode] = useState("record");
  const [file, setFile] = useState(null);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedMime, setRecordedMime] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [canRecord, setCanRecord] = useState(false);
  const [consent, setConsent] = useState(false);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [enrollment, setEnrollment] = useState(null);

  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const recordTimerRef = useRef(null);
  const recordStartedRef = useRef(0);

  const stopMediaStream = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  const clearRecordTimer = useCallback(() => {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    setCanRecord(
      typeof window !== "undefined" &&
        Boolean(navigator.mediaDevices?.getUserMedia) &&
        typeof MediaRecorder !== "undefined"
    );
    setEnrollment(readStoredEnrollment());
    return () => {
      clearRecordTimer();
      stopMediaStream();
    };
  }, [clearRecordTimer, stopMediaStream]);

  function resetCapture() {
    setFile(null);
    setRecordedBlob(null);
    setRecordedMime("");
    setRecordSeconds(0);
    setError("");
    setWarning("");
  }

  async function startRecording() {
    setError("");
    resetCapture();
    setMode("record");

    if (!canRecord) {
      setError("Recording is not supported in this browser. Upload an audio file instead.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      chunksRef.current = [];

      const mimeType = pickRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      recordStartedRef.current = Date.now();
      setRecordSeconds(0);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        clearRecordTimer();
        stopMediaStream();
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        setRecordedBlob(blob);
        setRecordedMime(type);
        setRecording(false);
      };

      recorder.start();
      setRecording(true);

      recordTimerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - recordStartedRef.current;
        setRecordSeconds(Math.floor(elapsed / 1000));
        if (elapsed >= MAX_RECORD_MS) {
          recorder.stop();
        }
      }, 250);
    } catch (err) {
      stopMediaStream();
      setRecording(false);
      setError(
        err?.message ||
          "Microphone access was denied or unavailable. Upload an audio file instead."
      );
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }

  async function handleEnroll() {
    setError("");
    setWarning("");

    if (!consent) {
      setError("Please confirm consent before creating a voice anchor.");
      return;
    }

    let audioFile = file;
    let durationMs = null;

    if (mode === "record") {
      if (!recordedBlob) {
        setError("Record a short clip or switch to file upload.");
        return;
      }
      audioFile = new File([recordedBlob], "voice-anchor-recording.webm", {
        type: recordedMime || recordedBlob.type || "audio/webm",
      });
      durationMs = recordSeconds * 1000;
    }

    if (!audioFile) {
      setError("Select or record an audio file first.");
      return;
    }

    if (audioFile.size > VOICE_ANCHOR_MAX_BYTES) {
      setError("Audio file is too large. Keep it under 10 MB.");
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("file", audioFile);
      formData.append("consent", "true");
      if (email.trim()) formData.append("contact_email", email.trim());
      if (durationMs != null) formData.append("duration_ms", String(durationMs));

      const res = await fetch("/api/voice-anchor/enroll", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Enrollment failed.");
      }

      if (data.warning) setWarning(data.warning);

      const record = {
        enrollment_id: data.enrollment_id || null,
        enrollment_token: data.enrollment_token,
        fingerprint_hash: data.fingerprint_hash,
        fingerprint_preview: fingerprintPreview(data.fingerprint_hash),
        enrolled_at: data.enrolled_at,
        stored: Boolean(data.stored),
      };

      writeStoredEnrollment(record);
      setEnrollment(record);
      resetCapture();
      setConsent(false);
    } catch (err) {
      setError(err.message || "Enrollment failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!enrollment) return;

    setDeleting(true);
    setError("");
    setWarning("");

    try {
      if (enrollment.enrollment_id && enrollment.enrollment_token) {
        const res = await fetch("/api/voice-anchor/enroll", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enrollment_id: enrollment.enrollment_id,
            enrollment_token: enrollment.enrollment_token,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Delete failed.");
        }
      }

      clearStoredEnrollment();
      setEnrollment(null);
    } catch (err) {
      setError(err.message || "Delete failed.");
    } finally {
      setDeleting(false);
    }
  }

  const activeLabel =
    mode === "record" && recordedBlob
      ? `Recording ready · ${recordSeconds}s`
      : file
        ? file.name
        : null;

  return (
    <PageShell
      narrow
      badge="Voice Identity • V1 Preview"
      title="Voice Identity Anchor"
      subtitle="Optional enrollment to create a private voice fingerprint hash — a first step toward protecting people from AI voice scams."
    >
      <GlassPanel title="How this works">
        <ul className="voice-anchor-notices">
          {NOTICES.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </GlassPanel>

      {enrollment && (
        <StatusCard variant="success">
          <div className="voice-anchor-result">
            <ProtocolBadge variant="success">Anchor active</ProtocolBadge>
            <p className="voice-anchor-result__lead">
              {enrollment.stored
                ? "Your fingerprint metadata is saved securely."
                : "Demo mode — fingerprint shown locally only."}
            </p>
            <dl className="voice-anchor-result__meta">
              {enrollment.enrollment_id && (
                <>
                  <dt>Enrollment ID</dt>
                  <dd className="voice-anchor-result__mono">{enrollment.enrollment_id}</dd>
                </>
              )}
              <dt>Fingerprint preview</dt>
              <dd className="voice-anchor-result__mono">
                {enrollment.fingerprint_preview ||
                  fingerprintPreview(enrollment.fingerprint_hash)}
              </dd>
              <dt>Enrolled</dt>
              <dd>{new Date(enrollment.enrolled_at).toLocaleString()}</dd>
            </dl>
            <p className="voice-anchor-result__hint">
              Save your delete token in this browser only. Clearing site data removes your
              ability to delete the server record.
            </p>
            <div className="protocol-actions">
              <button
                type="button"
                className="secondary"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "Removing…" : "Delete voice anchor"}
              </button>
            </div>
          </div>
        </StatusCard>
      )}

      <GlassPanel title="Enroll your voice anchor">
        <div className="voice-anchor-mode" role="tablist" aria-label="Audio input mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "record"}
            className={`voice-anchor-mode__btn ${mode === "record" ? "voice-anchor-mode__btn--active" : ""}`.trim()}
            onClick={() => {
              setMode("record");
              setFile(null);
            }}
          >
            Record
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "upload"}
            className={`voice-anchor-mode__btn ${mode === "upload" ? "voice-anchor-mode__btn--active" : ""}`.trim()}
            onClick={() => {
              setMode("upload");
              setRecordedBlob(null);
              stopRecording();
            }}
          >
            Upload file
          </button>
        </div>

        {mode === "record" ? (
          <div className="voice-anchor-record">
            <p className="voice-anchor-record__hint">
              Record a short phrase in your natural voice (up to {MAX_RECORD_MS / 1000}{" "}
              seconds). Audio stays in your browser until you submit — then only a hash is
              kept.
            </p>
            <div className="protocol-actions">
              {!recording ? (
                <button
                  type="button"
                  className="primary"
                  onClick={startRecording}
                  disabled={!canRecord || submitting}
                >
                  {recordedBlob ? "Record again" : "Start recording"}
                </button>
              ) : (
                <button type="button" className="secondary" onClick={stopRecording}>
                  Stop · {recordSeconds}s
                </button>
              )}
            </div>
            {!canRecord && (
              <p className="voice-anchor-record__unsupported">
                Browser recording unavailable — use upload instead.
              </p>
            )}
            {recordedBlob && (
              <p className="voice-anchor-record__ready">
                Recording ready ({Math.max(1, Math.round(recordedBlob.size / 1024))} KB)
              </p>
            )}
          </div>
        ) : (
          <UploadDropzone
            file={file}
            accept="audio/*,.webm,.wav,.mp3,.m4a,.ogg"
            onChange={(e) => {
              setRecordedBlob(null);
              setFile(e.target.files?.[0] || null);
            }}
            title="Drop an audio file or tap to browse"
            hint="MP3, WAV, M4A, OGG, WebM · max 10 MB"
          />
        )}

        {activeLabel && mode === "upload" && (
          <p className="voice-anchor-file-label">
            Selected: <strong>{activeLabel}</strong>
          </p>
        )}

        <label className="dataset-field voice-anchor-field">
          <span className="dataset-field__label">Email (optional)</span>
          <input
            className="dataset-field__input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="For waitlist or future anchor updates"
            autoComplete="email"
          />
          <span className="dataset-field__hint">
            Optional — only if you want updates about voice protection features.
          </span>
        </label>

        <label className="voice-anchor-consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            I consent to ProofOrigin processing my audio in memory to create a private
            fingerprint hash. I understand raw audio is not permanently stored and this is
            V1 enrollment, not scam-call blocking.
          </span>
        </label>

        <div className="protocol-actions">
          <button
            type="button"
            className="primary"
            onClick={handleEnroll}
            disabled={submitting || !consent}
          >
            {submitting ? "Creating anchor…" : "Create voice anchor"}
          </button>
        </div>
      </GlassPanel>

      {warning && (
        <div className="alert-banner alert-banner--warning" role="status">
          <strong>Notice</strong>
          {warning}
        </div>
      )}

      {error && (
        <div className="alert-banner alert-banner--error" role="alert">
          <strong>Unable to continue</strong>
          {error}
        </div>
      )}
    </PageShell>
  );
}
