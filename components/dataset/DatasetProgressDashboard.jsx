"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import GlassPanel from "../protocol/GlassPanel";
import LoadingState from "../protocol/LoadingState";
import ProtocolBadge from "../protocol/ProtocolBadge";
import StatusCard from "../protocol/StatusCard";
import { getDatasetCaptureAuthHeaders } from "../../app/lib/datasetCaptureClient";
import { DATASET_CAPTURE_EXPANSION_NOTICE } from "../../app/lib/datasetCapture";

function formatPercent(current, target) {
  if (!target) {
    return "0%";
  }

  return `${Math.min(100, (current / target) * 100).toFixed(1)}%`;
}

function ProgressBar({ current, target, label }) {
  const max = Math.max(target || 0, 1);
  const percent = Math.min(100, ((current || 0) / max) * 100);

  return (
    <div className="dataset-progress-bar">
      {label && (
        <div className="dataset-progress-bar__label">
          <span>{label}</span>
          <span className="dataset-progress-bar__value">
            {current}/{target}
          </span>
        </div>
      )}
      <div
        className="dataset-progress-bar__track"
        role="progressbar"
        aria-valuenow={current || 0}
        aria-valuemin={0}
        aria-valuemax={target || 0}
        aria-label={label || "Progress"}
      >
        <div
          className="dataset-progress-bar__fill"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function formatTimestamp(value) {
  if (!value) {
    return "None yet";
  }

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function StatCard({ label, value, hint }) {
  return (
    <div className="dataset-progress-total">
      <span className="dataset-progress-total__label">{label}</span>
      <strong>{value}</strong>
      {hint && <span className="dataset-progress-total__hint">{hint}</span>}
    </div>
  );
}

function HistoryTimelineRow({ point }) {
  return (
    <li className="dataset-history-row">
      <div className="dataset-history-row__header">
        <span>{point.date}</span>
        <span className="dataset-history-row__value">
          {point.approvedV02}/{point.target} · {point.percent}%
        </span>
      </div>
      <ProgressBar
        current={point.approvedV02}
        target={point.target}
        label={`Correction progress on ${point.date}`}
      />
    </li>
  );
}

function BucketProgressRow({ bucket, showTarget = true }) {
  const percent = showTarget
    ? formatPercent(bucket.current, bucket.target)
    : null;

  return (
    <li
      className={`dataset-progress-row ${
        bucket.met ? "dataset-progress-row--met" : ""
      }`.trim()}
    >
      <div className="dataset-progress-row__header">
        <span className="dataset-progress-row__name">{bucket.label || bucket.bucket}</span>
        <span className="dataset-progress-row__counts">
          {showTarget ? (
            <>
              {bucket.current}/{bucket.target}
              {typeof bucket.remaining === "number" && bucket.remaining > 0 && (
                <span className="dataset-progress-row__remaining">
                  · {bucket.remaining} remaining
                </span>
              )}
            </>
          ) : (
            <span>{bucket.current}</span>
          )}
        </span>
      </div>

      {showTarget ? (
        <>
          <ProgressBar
            current={bucket.current}
            target={bucket.target}
            label={`${bucket.label || bucket.bucket} progress`}
          />
          <span className="dataset-progress-row__percent">{percent}</span>
        </>
      ) : (
        <div className="dataset-progress-row__count-only">{bucket.current} approved</div>
      )}

      {bucket.met && showTarget && (
        <ProtocolBadge variant="success" className="dataset-progress-row__badge">
          Met
        </ProtocolBadge>
      )}
    </li>
  );
}

export default function DatasetProgressDashboard({
  accessToken,
  refreshSignal = 0,
  className = "",
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [gateOpen, setGateOpen] = useState(false);
  const [gateBuckets, setGateBuckets] = useState([]);
  const [overallCorrection, setOverallCorrection] = useState(null);
  const [expansionBuckets, setExpansionBuckets] = useState([]);
  const [totals, setTotals] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [correctionHistory, setCorrectionHistory] = useState(null);
  const [trainingHistory, setTrainingHistory] = useState(null);
  const [candidateModel, setCandidateModel] = useState(null);
  const [showTrainModal, setShowTrainModal] = useState(false);
  const [trainSubmitting, setTrainSubmitting] = useState(false);
  const [trainMessage, setTrainMessage] = useState("");
  const [trainError, setTrainError] = useState("");

  const gateRemaining = useMemo(
    () => gateBuckets.reduce((sum, bucket) => sum + (bucket.remaining || 0), 0),
    [gateBuckets]
  );

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const headers = {
        "Content-Type": "application/json",
        ...getDatasetCaptureAuthHeaders(accessToken),
      };

      const [gateRes, statsRes] = await Promise.all([
        fetch("/api/dataset-capture/gate-status", {
          method: "POST",
          headers,
          body: JSON.stringify({}),
        }),
        fetch("/api/dataset-capture/dataset-stats", {
          method: "POST",
          headers,
          body: JSON.stringify({}),
        }),
      ]);

      const gateData = await gateRes.json();
      const statsData = await statsRes.json();

      if (!gateRes.ok || !gateData.success) {
        setError(gateData.error || "Unable to load correction gate status.");
        setGateOpen(false);
        setGateBuckets([]);
        return;
      }

      if (!statsRes.ok || !statsData.success) {
        setError(statsData.error || "Unable to load dataset stats.");
        setGateOpen(Boolean(gateData.gateOpen));
        setGateBuckets(gateData.buckets || []);
        return;
      }

      setGateOpen(Boolean(gateData.gateOpen));
      setGateBuckets(gateData.buckets || []);
      setOverallCorrection(statsData.overallCorrection || null);
      setExpansionBuckets(statsData.expansionBuckets || []);
      setTotals(statsData.totals || null);
      setTimeline(statsData.timeline || null);
      setCorrectionHistory(statsData.correctionHistory || null);
      setTrainingHistory(statsData.trainingHistory || null);
      setCandidateModel(statsData.candidateModel || null);
    } catch {
      setError("Unable to reach dataset progress APIs.");
      setGateOpen(false);
      setGateBuckets([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (accessToken) {
      loadDashboard();
    }
  }, [accessToken, loadDashboard, refreshSignal]);

  async function requestTrainCandidate() {
    setTrainSubmitting(true);
    setTrainError("");
    setTrainMessage("");

    try {
      const res = await fetch("/api/dataset-capture/train-candidate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getDatasetCaptureAuthHeaders(accessToken),
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setTrainError(data.error || "Candidate training request failed.");
        if (data.buckets) {
          setGateBuckets(data.buckets);
          setGateOpen(Boolean(data.gateOpen));
        }
        return;
      }

      setTrainMessage(data.message || "Candidate training job created.");
      setShowTrainModal(false);
      loadDashboard();
    } catch {
      setTrainError("Unable to reach the train candidate API.");
    } finally {
      setTrainSubmitting(false);
    }
  }

  return (
    <>
      <GlassPanel
        className={`dataset-progress-dashboard ${className}`.trim()}
        title="Dataset progress"
        subtitle="Read-only counts from the private capture vault. No images are shown here."
      >
        {loading && <LoadingState message="Loading dataset progress..." />}

        {!loading && error && (
          <StatusCard variant="error" body={error} className="dataset-status" />
        )}

        {!loading && !error && (
          <>
            <div
              className={`dataset-progress-gate-banner dataset-progress-gate-banner--${
                gateOpen ? "open" : "closed"
              }`}
              role="status"
            >
              <div className="dataset-progress-gate-banner__label">
                Correction gate {gateOpen ? "OPEN" : "CLOSED"}
              </div>
              <p className="dataset-progress-gate-banner__body">
                {gateOpen
                  ? "All v0.2 correction bucket targets are met. You may request candidate training."
                  : `${gateRemaining} image${gateRemaining === 1 ? "" : "s"} remaining across v0.2 correction buckets before the gate opens.`}
              </p>
            </div>

            {timeline && (
              <section className="dataset-progress-section">
                <h3 className="dataset-progress-section__title">Dataset timeline</h3>
                <div className="dataset-progress-totals">
                  <StatCard label="Captures today" value={timeline.today} />
                  <StatCard label="Captures this week" value={timeline.thisWeek} />
                  <StatCard label="Captures this month" value={timeline.thisMonth} />
                </div>
              </section>
            )}

            {trainingHistory && (
              <section className="dataset-progress-section">
                <h3 className="dataset-progress-section__title">Training history</h3>
                <div className="dataset-progress-totals">
                  <StatCard
                    label="Candidate models trained"
                    value={trainingHistory.candidateModelsTrained}
                  />
                  <StatCard
                    label="Passed candidates"
                    value={trainingHistory.passedCandidates}
                  />
                  <StatCard
                    label="Failed candidates"
                    value={trainingHistory.failedCandidates}
                  />
                </div>
                <div className="dataset-history-meta">
                  <div className="dataset-history-meta__item">
                    <span className="dataset-history-meta__label">Last training run</span>
                    <strong>
                      {trainingHistory.lastTrainingRun
                        ? formatTimestamp(
                            trainingHistory.lastTrainingRun.finishedAt ||
                              trainingHistory.lastTrainingRun.startedAt ||
                              trainingHistory.lastTrainingRun.requestedAt
                          )
                        : "None yet"}
                    </strong>
                    {trainingHistory.lastTrainingRun && (
                      <span className="dataset-history-meta__hint">
                        Status: {trainingHistory.lastTrainingRun.status}
                      </span>
                    )}
                  </div>
                  <div className="dataset-history-meta__item">
                    <span className="dataset-history-meta__label">
                      Last promotion-ready candidate
                    </span>
                    <strong>
                      {trainingHistory.lastPromotionReady
                        ? formatTimestamp(
                            trainingHistory.lastPromotionReady.finishedAt ||
                              trainingHistory.lastPromotionReady.startedAt ||
                              trainingHistory.lastPromotionReady.requestedAt
                          )
                        : "None yet"}
                    </strong>
                    {trainingHistory.lastPromotionReady?.candidateModelPath && (
                      <span className="dataset-history-meta__hint">
                        {trainingHistory.lastPromotionReady.candidateModelPath}
                      </span>
                    )}
                  </div>
                </div>
              </section>
            )}

            {correctionHistory && (
              <section className="dataset-progress-section">
                <h3 className="dataset-progress-section__title">Correction progress history</h3>
                <div className="dataset-progress-totals">
                  <StatCard
                    label="Total approved captures"
                    value={correctionHistory.totalApproved}
                  />
                  <StatCard
                    label="Total rejected captures"
                    value={correctionHistory.totalRejected}
                  />
                  <StatCard
                    label="Total duplicates skipped"
                    value={correctionHistory.totalDuplicatesSkipped}
                  />
                </div>
                {correctionHistory.progressOverTime.length > 0 ? (
                  <>
                    <p className="dataset-progress-section__hint">
                      v0.2 correction progress over time (last{" "}
                      {correctionHistory.progressOverTime.length} days with activity).
                    </p>
                    <ul className="dataset-progress-list dataset-progress-list--compact">
                      {correctionHistory.progressOverTime.map((point) => (
                        <HistoryTimelineRow key={point.date} point={point} />
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="dataset-notice">
                    No approved v0.2 correction progress recorded yet.
                  </p>
                )}
              </section>
            )}

            {candidateModel && (
              <section className="dataset-progress-section">
                <h3 className="dataset-progress-section__title">Candidate model summary</h3>
                <div className="dataset-progress-totals">
                  <StatCard
                    label="Production model version"
                    value={candidateModel.productionModelVersion}
                    hint={
                      candidateModel.productionModelVersion === "Not reported"
                        ? "Set PROOFORIGIN_PRODUCTION_MODEL_VERSION when known."
                        : undefined
                    }
                  />
                  <StatCard
                    label="Latest candidate version"
                    value={candidateModel.latestCandidateVersion}
                  />
                  <StatCard label="Candidate status" value={candidateModel.candidateStatus} />
                </div>
              </section>
            )}

            {overallCorrection && (
              <section className="dataset-progress-section">
                <h3 className="dataset-progress-section__title">Overall correction progress</h3>
                <p className="dataset-progress-section__summary">
                  {overallCorrection.current} / {overallCorrection.target}
                  <span className="dataset-progress-section__percent">
                    {overallCorrection.percent}%
                  </span>
                </p>
                <ProgressBar
                  current={overallCorrection.current}
                  target={overallCorrection.target}
                  label="Overall v0.2 correction progress"
                />
                {overallCorrection.remaining > 0 && (
                  <p className="dataset-progress-section__hint">
                    {overallCorrection.remaining} images remaining to reach {overallCorrection.target}.
                  </p>
                )}
              </section>
            )}

            <section className="dataset-progress-section">
              <h3 className="dataset-progress-section__title">v0.2 correction buckets</h3>
              <ul className="dataset-progress-list">
                {gateBuckets.map((bucket) => (
                  <BucketProgressRow key={bucket.bucket} bucket={bucket} showTarget />
                ))}
              </ul>
            </section>

            <section className="dataset-progress-section">
              <h3 className="dataset-progress-section__title">Expansion dataset counts</h3>
              <p className="dataset-notice">{DATASET_CAPTURE_EXPANSION_NOTICE}</p>
              <ul className="dataset-progress-list dataset-progress-list--compact">
                {expansionBuckets.map((bucket) => (
                  <BucketProgressRow key={bucket.bucket} bucket={bucket} showTarget={false} />
                ))}
              </ul>
            </section>

            {totals && (
              <section className="dataset-progress-section">
                <h3 className="dataset-progress-section__title">Private dataset totals</h3>
                <div className="dataset-progress-totals">
                  <div className="dataset-progress-total">
                    <span className="dataset-progress-total__label">Approved for import</span>
                    <strong>{totals.approved}</strong>
                  </div>
                  <div className="dataset-progress-total">
                    <span className="dataset-progress-total__label">Pending review</span>
                    <strong>{totals.pending}</strong>
                  </div>
                  <div className="dataset-progress-total">
                    <span className="dataset-progress-total__label">Rejected</span>
                    <strong>{totals.rejected}</strong>
                  </div>
                  <div className="dataset-progress-total">
                    <span className="dataset-progress-total__label">Regression only</span>
                    <strong>{totals.regressionOnly}</strong>
                  </div>
                  <div className="dataset-progress-total dataset-progress-total--all">
                    <span className="dataset-progress-total__label">Total captures</span>
                    <strong>{totals.total}</strong>
                  </div>
                </div>
              </section>
            )}

            <section className="dataset-progress-section dataset-progress-section--train">
              <h3 className="dataset-progress-section__title">Train candidate</h3>
              <p className="dataset-notice">
                Creates a job request only. Training runs on the ProofOrigin AI backend and does
                not replace production automatically.
              </p>

              {trainMessage && (
                <StatusCard variant="success" body={trainMessage} className="dataset-status" />
              )}

              {trainError && (
                <StatusCard variant="error" body={trainError} className="dataset-status" />
              )}

              <div className="protocol-actions">
                <button
                  type="button"
                  className="primary"
                  disabled={!gateOpen || trainSubmitting}
                  onClick={() => setShowTrainModal(true)}
                >
                  Train Candidate Model
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={loading}
                  onClick={loadDashboard}
                >
                  Refresh progress
                </button>
              </div>
            </section>
          </>
        )}
      </GlassPanel>

      {showTrainModal && (
        <div className="dataset-training-modal-backdrop" role="presentation">
          <div
            className="dataset-training-modal glass-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dataset-progress-train-title"
          >
            <h3 id="dataset-progress-train-title" className="dataset-training-modal__title">
              Request candidate training
            </h3>
            <p className="dataset-training-modal__body">
              This creates a candidate training job only. It will not replace production.
              ProofOrigin AI backend will pull the job and run safe_auto_train.py when ready.
            </p>
            <div className="protocol-actions">
              <button
                type="button"
                className="primary"
                disabled={trainSubmitting}
                onClick={requestTrainCandidate}
              >
                {trainSubmitting ? "Creating job..." : "Create training job"}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={trainSubmitting}
                onClick={() => setShowTrainModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
