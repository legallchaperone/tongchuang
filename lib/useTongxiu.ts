"use client";
// R-030 同修: loading cohorts and one cohort's submissions. Kept out of the app store: only the 同修 pages need it.
import { useCallback, useEffect, useState } from "react";
import { useApp } from "./store";
import type { Cohort, CohortMember, Submission, SubmissionDetail, SubmissionFeedback } from "./types";

export function useCohorts() {
  const app = useApp();
  const [cohorts, setCohorts] = useState<Cohort[] | null>(null);
  const [members, setMembers] = useState<CohortMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const roomKey = app.rooms.map((r) => r.id).join(",");
  const reload = useCallback(async () => {
    try {
      const r = await app.backend.listCohorts();
      setCohorts(r.cohorts); setMembers(r.members); setError(null);
    } catch (e) { setError((e as Error).message); setCohorts((c) => c || []); }
  }, [app.backend]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [reload, roomKey]);
  return { cohorts, members, error, reload, setMembers };
}

/** submissions of one cohort (live), plus the details and feedback I am allowed to read */
export function useCohortWork(cohortId: string | null) {
  const app = useApp();
  const [subs, setSubs] = useState<Submission[] | null>(null);
  const [details, setDetails] = useState<Record<string, SubmissionDetail>>({});
  const [feedback, setFeedback] = useState<SubmissionFeedback[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadContent = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const [ds, fs] = await Promise.all([app.backend.listSubmissionDetails(ids), app.backend.listFeedback(ids)]);
    setDetails((m) => { const n = { ...m }; ds.forEach((d) => { n[d.submissionId] = d; }); return n; });
    setFeedback((l) => { const seen = new Set(fs.map((f) => f.id)); return [...l.filter((f) => !seen.has(f.id)), ...fs].sort((a, b) => a.createdAt - b.createdAt); });
  }, [app.backend]);

  const reload = useCallback(async () => {
    if (!cohortId) return;
    try {
      const ss = await app.backend.listSubmissions([cohortId]);
      setSubs(ss); setError(null);
      await loadContent(ss.map((s) => s.id));
    } catch (e) { setError((e as Error).message); setSubs((s) => s || []); }
  }, [app.backend, cohortId, loadContent]);

  useEffect(() => {
    if (!cohortId) return;
    reload();
    const off = app.backend.subscribeSubmissions([cohortId], (s) => {
      setSubs((l) => [...(l || []).filter((x) => x.id !== s.id), s]);
    });
    // a deadline passing makes classmates' work readable: look again every few minutes
    const t = setInterval(() => { if (document.visibilityState === "visible") reload(); }, 5 * 60_000);
    return () => { off(); clearInterval(t); };
  }, [app.backend, cohortId, reload]);

  useEffect(() => {
    if (!app.me) return;
    return app.backend.subscribeFeedback(app.me.id, (f) => setFeedback((l) => (l.some((x) => x.id === f.id) ? l : [...l, f])));
  }, [app.backend, app.me]);

  return {
    subs, details, feedback, error, reload, loadContent,
    /** after I save: my row and its content, without waiting for realtime */
    put(s: Submission, d: SubmissionDetail) {
      setSubs((l) => [...(l || []).filter((x) => x.id !== s.id), s]);
      setDetails((m) => ({ ...m, [d.submissionId]: d }));
    },
  };
}
