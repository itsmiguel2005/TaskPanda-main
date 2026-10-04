import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { adminRequest } from "../services/adminApi.js";

const dateTimeFormatter = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : dateTimeFormatter.format(date);
}

function verificationKey(applicant) {
  return `${applicant.type || "identity"}:${applicant.userId}:${applicant.certificateId || applicant.submittedAt || ""}`;
}

function ConfidenceBadge({ confidence, autoVerified, ocrProcessing }) {
  const needsReview = !ocrProcessing && (!autoVerified || confidence === null || confidence < 60);
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold tabular-nums ${
      needsReview
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-emerald-200 bg-emerald-50 text-emerald-900"
    }`}>
      {ocrProcessing ? "OCR processing" : confidence === null ? "OCR unavailable" : `${Math.round(confidence)}% confidence`}
      {needsReview && <span className="ml-1.5 font-semibold">· Needs review</span>}
    </span>
  );
}

function Icon({ name, className = "h-4 w-4" }) {
  const paths = {
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.4-3" /></>,
    close: <path d="m18 6-12 12M6 6l12 12" />,
    image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m21 15-5-5L5 20" /></>,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export default function VerificationsAdmin() {
  const { token } = useAuth();
  const [verifications, setVerifications] = useState([]);
  const [processingIdentityCount, setProcessingIdentityCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [processingUserId, setProcessingUserId] = useState("");
  const [viewing, setViewing] = useState(null);
  const [documents, setDocuments] = useState(null);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState("");
  const [viewedVerificationKey, setViewedVerificationKey] = useState("");
  const [approving, setApproving] = useState(null);
  const [nameMatchConfirmed, setNameMatchConfirmed] = useState(false);
  const [rejecting, setRejecting] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const loadQueue = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const result = await adminRequest("/api/v1/admin/verifications", token);
      setVerifications(result.verifications || []);
      setProcessingIdentityCount(result.processingIdentityCount || 0);
    } catch (requestError) {
      setError(requestError.message || "Could not load the verification queue.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (processingIdentityCount === 0) return undefined;
    const intervalId = window.setInterval(() => {
      if (!document.hidden) void loadQueue(true);
    }, 10000);
    return () => window.clearInterval(intervalId);
  }, [loadQueue, processingIdentityCount]);

  useEffect(() => {
    if (!viewing || !token) return undefined;
    const controller = new AbortController();
    const objectUrls = [];
    setDocuments(null);
    setDocumentsError("");
    setDocumentsLoading(true);

    const loadDocuments = async () => {
      try {
        const documentFields = viewing.type === "tesda"
          ? [["certificate", viewing.certificateUrl]]
          : [["front", viewing.idFrontUrl], ["back", viewing.idBackUrl]];
        const sides = await Promise.all(documentFields.map(async ([side, url]) => {
          const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
            signal: controller.signal,
          });
          const contentType = response.headers.get("content-type") || "";
          if (!response.ok || !contentType.toLowerCase().startsWith("image/")) {
            let message = `Could not load the ${side === "certificate" ? "TESDA certificate" : `ID ${side}`} image.`;
            try {
              const result = await response.json();
              message = result.message || message;
            } catch {
              // Keep the explicit document error when the response is not JSON.
            }
            throw new Error(message);
          }
          return URL.createObjectURL(await response.blob());
        }));
        objectUrls.push(...sides);
        setDocuments(Object.fromEntries(documentFields.map(([side], index) => [side, sides[index]])));
        setViewedVerificationKey(verificationKey(viewing));
      } catch (documentError) {
        if (documentError.name !== "AbortError") {
          setDocumentsError(documentError.message || "Could not load the submitted documents.");
        }
      } finally {
        if (!controller.signal.aborted) setDocumentsLoading(false);
      }
    };

    void loadDocuments();
    return () => {
      controller.abort();
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [viewing, token]);

  useEffect(() => {
    if (!viewing && !approving && !rejecting) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setViewing(null);
        setApproving(null);
        setNameMatchConfirmed(false);
        setRejecting(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewing, approving, rejecting]);

  const review = async (applicant, action, reason = "", confirmedNameMatch = false) => {
    setProcessingUserId(applicant.userId);
    setActionError("");
    try {
      const reviewPath = applicant.type === "tesda"
        ? `/api/v1/admin/verifications/${applicant.userId}/tesda/${applicant.certificateId}`
        : `/api/v1/admin/verifications/${applicant.userId}`;
      await adminRequest(reviewPath, token, {
        method: "PATCH",
        body: JSON.stringify({
          action,
          ...(action === "reject" ? { rejectionReason: reason } : {}),
          ...(action === "approve" && applicant.type === "tesda" ? { certificateInspected: confirmedNameMatch } : {}),
          ...(action === "approve" ? { nameMatchConfirmed: confirmedNameMatch } : {}),
        }),
      });
      setVerifications((current) => current.filter((item) => verificationKey(item) !== verificationKey(applicant)));
      setViewing(null);
      setApproving(null);
      setNameMatchConfirmed(false);
      setRejecting(null);
      setRejectionReason("");
    } catch (requestError) {
      setActionError(requestError.message || "Could not update this verification.");
    } finally {
      setProcessingUserId("");
    }
  };

  const submitRejection = (event) => {
    event.preventDefault();
    if (!rejecting || rejectionReason.trim().length < 5) return;
    void review(rejecting, "reject", rejectionReason.trim());
  };

  const submitApproval = (event) => {
    event.preventDefault();
    if (!approving || !nameMatchConfirmed || viewedVerificationKey !== verificationKey(approving)) return;
    void review(approving, "approve", "", true);
  };

  return (
    <section className="mt-6" aria-labelledby="verification-queue-title">
      <div className="overflow-hidden rounded-3xl border border-white/80 bg-white/85 shadow-[0_18px_48px_rgba(15,23,42,0.07)] backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 px-5 py-5 sm:px-7">
          <div>
            <h2 id="verification-queue-title" className="text-xl font-extrabold tracking-tight text-slate-950">Verification queue</h2>
            <p className="mt-1 text-sm text-slate-600">
              Review identity documents and TESDA certification evidence.
              {processingIdentityCount > 0 && (
                <span className="ml-1">
                  {processingIdentityCount} ID {processingIdentityCount === 1 ? "check is" : "checks are"} processing and will appear here when complete.
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-bold tabular-nums text-amber-950">
              {verifications.length} pending
            </span>
            <button
              type="button"
              onClick={() => void loadQueue(true)}
              disabled={loading || refreshing}
              className="dashboard-focus inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white/90 px-3 text-sm font-semibold text-sky-950 transition hover:border-sky-300 hover:bg-sky-50 disabled:cursor-wait disabled:opacity-60"
            >
              <Icon name="refresh" className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {actionError && (
          <p role="alert" className="mx-5 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900 sm:mx-7">
            {actionError}
          </p>
        )}
        {error && (
          <div className="m-5 rounded-2xl border border-rose-200 bg-rose-50/90 p-5 sm:m-7">
            <p role="alert" className="text-sm font-semibold text-rose-900">{error}</p>
            <button type="button" onClick={() => void loadQueue()} className="dashboard-focus mt-3 rounded-lg px-2 py-1 text-sm font-bold text-rose-900 underline underline-offset-4">
              Try again
            </button>
          </div>
        )}

        {!error && loading ? (
          <div className="space-y-3 p-5 sm:p-7" aria-label="Loading verifications">
            {[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" />)}
          </div>
        ) : !error && verifications.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-800">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" />
              </svg>
            </span>
            <h3 className="mt-4 text-base font-bold text-slate-900">Queue is clear</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-600">
              {processingIdentityCount > 0
                ? "ID checks in progress will appear here when OCR is complete."
                : "New manual-review submissions will appear here."}
            </p>
          </div>
        ) : !error && (
          <div className="admin-ledger-scroll" tabIndex={0} aria-label="Pending identity and TESDA certificate submissions">
            <table className="w-full min-w-[820px] text-left">
              <thead className="bg-slate-50/90 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                <tr>
                  <th scope="col" className="px-6 py-3">Applicant</th>
                  <th scope="col" className="px-5 py-3">Type</th>
                  <th scope="col" className="px-5 py-3">Submitted</th>
                  <th scope="col" className="px-5 py-3">Trade / OCR details</th>
                  <th scope="col" className="px-6 py-3 text-right">Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80">
                {verifications.map((applicant) => (
                  <tr key={verificationKey(applicant)} className="align-top transition hover:bg-sky-50/35">
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-950">{applicant.name}</p>
                      <p className="mt-0.5 text-sm text-slate-600">{applicant.email}</p>
                      <p className="mt-1 text-xs font-semibold capitalize text-slate-500">{applicant.role}</p>
                    </td>
                    <td className="px-5 py-4">
                      {applicant.type === "tesda" ? (
                        <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-900">TESDA certificate</span>
                      ) : (
                        <>
                          <ConfidenceBadge confidence={applicant.ocrConfidence} autoVerified={applicant.autoVerified} ocrProcessing={applicant.ocrProcessing} />
                          <p className="mt-2 text-xs text-slate-600">
                            Name match: {applicant.ocrProcessing ? "Processing" : applicant.nameMatchAccuracy === null ? "Unavailable" : `${Math.round(applicant.nameMatchAccuracy)}%`}
                          </p>
                          {applicant.securityFlags?.length > 0 && (
                            <ul className="mt-2 space-y-1">
                              {applicant.securityFlags.map((flag) => (
                                <li
                                  key={flag}
                                  className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-bold leading-4 ${
                                    flag === "AI_OR_EDITED_METADATA_DETECTED"
                                      ? "border-rose-200 bg-rose-50 text-rose-900"
                                      : "border-amber-200 bg-amber-50 text-amber-950"
                                  }`}
                                >
                                  {flag}
                                </li>
                              ))}
                            </ul>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700">
                      <p>{formatDate(applicant.submittedAt)}</p>
                      <p className="mt-1 text-xs text-slate-500">Joined {formatDate(applicant.accountCreatedAt)}</p>
                    </td>
                    <td className="max-w-48 px-5 py-4 text-sm text-slate-700">
                      <span className="line-clamp-2">{applicant.type === "tesda" ? applicant.trade : applicant.tradeCertificate || "Not provided"}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => { setActionError(""); setViewing(applicant); }}
                          className="dashboard-focus inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-sky-950 transition hover:border-sky-300 hover:bg-sky-50"
                        >
                          <Icon name="image" />
                          {applicant.type === "tesda" ? "View certificate" : "View ID"}
                        </button>
                        <button
                          type="button"
                          disabled={processingUserId === applicant.userId}
                          onClick={() => {
                            setActionError("");
                            if (viewedVerificationKey !== verificationKey(applicant)) {
                              setActionError(applicant.type === "tesda"
                                ? "Open and inspect the TESDA certificate before approving."
                                : "Open and inspect both sides of this ID before approving.");
                              return;
                            }
                            setApproving(applicant);
                            setNameMatchConfirmed(false);
                          }}
                          className="dashboard-focus min-h-9 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
                        >
                          {processingUserId === applicant.userId ? "Saving…" : "Approve"}
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(processingUserId)}
                          onClick={() => { setRejecting(applicant); setRejectionReason(""); setActionError(""); }}
                          className="dashboard-focus min-h-9 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-900 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:p-6" onMouseDown={() => setViewing(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="verification-document-title"
            className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-white/50 bg-white/95 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.35)] backdrop-blur-2xl sm:p-7"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="verification-document-title" className="text-lg font-extrabold text-slate-950">
                  {viewing.type === "tesda" ? "TESDA certificate" : "ID documents"}
                </h3>
                <p className="mt-1 text-sm text-slate-600">{viewing.name} · {viewing.email}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  {viewing.type === "tesda"
                    ? `Review the certificate evidence for the ${viewing.trade} trade before approving.`
                    : "Compare the full name on the ID front with this account name before approving."}
                </p>
              </div>
              <button type="button" aria-label="Close document viewer" onClick={() => setViewing(null)} className="dashboard-focus rounded-xl p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-950">
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>
            {documentsLoading && <p className="py-14 text-center text-sm font-medium text-slate-600">Loading secure documents…</p>}
            {documentsError && <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{documentsError}</p>}
            {documents && (
              viewing.type === "tesda" ? (
                <figure className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/80">
                  <figcaption className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-800">{viewing.trade} certificate</figcaption>
                  <div className="flex min-h-64 items-center justify-center p-3 sm:min-h-80">
                    <img src={documents.certificate} alt={`${viewing.name}'s TESDA ${viewing.trade} certificate`} className="max-h-[62vh] w-full rounded-lg object-contain" />
                  </div>
                </figure>
              ) : (
                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  {[["Front", documents.front], ["Back", documents.back]].map(([side, url]) => (
                    <figure key={side} className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/80">
                      <figcaption className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-800">ID {side}</figcaption>
                      <div className="flex min-h-64 items-center justify-center p-3 sm:min-h-80">
                        <img src={url} alt={`${viewing.name}'s ID ${side.toLowerCase()}`} className="max-h-[62vh] w-full rounded-lg object-contain" />
                      </div>
                    </figure>
                  ))}
                </div>
              )
            )}
          </section>
        </div>
      )}

      {approving && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm" onMouseDown={() => { setApproving(null); setNameMatchConfirmed(false); }}>
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="verification-approval-title"
            onSubmit={submitApproval}
            onMouseDown={(event) => event.stopPropagation()}
            className="w-full max-w-lg rounded-3xl border border-white/70 bg-white/95 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.3)] backdrop-blur-2xl sm:p-7"
          >
            <h3 id="verification-approval-title" className="text-lg font-extrabold text-slate-950">
              {approving.type === "tesda" ? "Confirm TESDA certificate" : "Confirm identity match"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {approving.type === "tesda"
                ? <>Approving will mark the <span className="font-bold text-slate-900">{approving.trade}</span> certificate for <span className="font-bold text-slate-900">{approving.name}</span> as verified.</>
                : <>Approving will verify <span className="font-bold text-slate-900">{approving.name}</span> and activate this account. Check the ID images against the account name before continuing.</>}
            </p>
            {actionError && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{actionError}</p>}
            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-sky-200 bg-sky-50/80 p-4 text-sm leading-6 text-sky-950">
              <input
                type="checkbox"
                checked={nameMatchConfirmed}
                onChange={(event) => setNameMatchConfirmed(event.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-sky-700"
              />
              <span>
                {approving.type === "tesda"
                  ? "I inspected the certificate and confirmed it supports the TESDA trade listed above."
                  : "I inspected both ID images and confirmed the full name on the ID matches this account holder."}
              </span>
            </label>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => { setApproving(null); setNameMatchConfirmed(false); }} className="dashboard-focus min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={!nameMatchConfirmed || Boolean(processingUserId) || viewedVerificationKey !== verificationKey(approving)} className="dashboard-focus min-h-11 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-55">
                {processingUserId === approving.userId
                  ? "Saving…"
                  : approving.type === "tesda" ? "Confirm and approve" : "Confirm name and approve"}
              </button>
            </div>
          </form>
        </div>
      )}

      {rejecting && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm" onMouseDown={() => setRejecting(null)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="rejection-reason-title"
            onSubmit={submitRejection}
            onMouseDown={(event) => event.stopPropagation()}
            className="w-full max-w-lg rounded-3xl border border-white/70 bg-white/95 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.3)] backdrop-blur-2xl sm:p-7"
          >
            <h3 id="rejection-reason-title" className="text-lg font-extrabold text-slate-950">
              {rejecting.type === "tesda" ? "Reject TESDA certificate" : "Reject identity documents"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Add feedback for {rejecting.name}. The applicant will be able to see why their {rejecting.type === "tesda" ? "certificate" : "documents"} were rejected.
            </p>
            <label htmlFor="verification-rejection-reason" className="mt-5 block text-sm font-bold text-slate-800">Reason for rejection</label>
            <textarea
              id="verification-rejection-reason"
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              minLength={5}
              maxLength={500}
              required
              rows={4}
              placeholder="Explain what needs to be corrected or resubmitted."
              className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm leading-6 text-slate-900 placeholder:text-slate-500 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20"
            />
            <p className="mt-1 text-right text-xs text-slate-600">{rejectionReason.length}/500</p>
            {actionError && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{actionError}</p>}
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setRejecting(null)} className="dashboard-focus min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={rejectionReason.trim().length < 5 || Boolean(processingUserId)} className="dashboard-focus min-h-11 rounded-xl bg-rose-700 px-4 text-sm font-bold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-55">
                {processingUserId === rejecting.userId ? "Saving…" : "Reject submission"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
