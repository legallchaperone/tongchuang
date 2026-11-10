"use client";
// R-030 同修: the developers' feedback queue. Copy a prompt, run it through Claude by hand, paste the answer back.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { getCourse } from "@/lib/courses";
import { feedbackPrompt, isLate } from "@/lib/tongxiu";
import { ago } from "@/lib/time";
import type { Cohort, Profile, Submission, SubmissionDetail, SubmissionFeedback } from "@/lib/types";
import { Avatar, Spinner } from "@/components/bits";
import { IBack, ICopy } from "@/components/Icons";

export default function StaffPage() {
  const app = useApp();
  const [staff, setStaff] = useState<boolean | null>(null);
  const [reqs, setReqs] = useState<Submission[] | null>(null);
  const [cohorts, setCohorts] = useState<Record<string, Cohort>>({});
  const [details, setDetails] = useState<Record<string, SubmissionDetail>>({});
  const [feedback, setFeedback] = useState<SubmissionFeedback[]>([]);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    try {
      const ok = await app.backend.isStaff();
      setStaff(ok);
      if (!ok) return;
      const [rs, cs] = await Promise.all([app.backend.listFeedbackRequests(), app.backend.listCohorts()]);
      const ids = rs.map((r) => r.id);
      const [ds, fs, ps] = await Promise.all([
        app.backend.listSubmissionDetails(ids), app.backend.listFeedback(ids),
        app.backend.getProfiles(Array.from(new Set(rs.map((r) => r.userId)))),
      ]);
      setReqs(rs);
      setCohorts(Object.fromEntries(cs.cohorts.map((c) => [c.id, c])));
      setDetails(Object.fromEntries(ds.map((d) => [d.submissionId, d])));
      setFeedback(fs);
      setPeople(Object.fromEntries(ps.map((p) => [p.id, p])));
      setError(null);
    } catch (e) { setError((e as Error).message); setReqs((r) => r || []); }
  }, [app.backend]);
  useEffect(() => { load(); }, [load]);

  const answered = (s: Submission) => feedback.some((f) => f.submissionId === s.id && f.createdAt >= (s.feedbackRequestedAt || 0));
  const list = (reqs || []).filter((s) => showDone || !answered(s));

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <Link href="/tongxiu" className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 4 }}><IBack />同修</Link>
          <h1>写反馈</h1>
          <p className="sub">同修们请求的反馈。复制提示词交给 Claude，把写好的反馈贴回来，对方会收到提醒。</p>
        </div>
        {staff && <label className="tx-check"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> 也显示已回复的</label>}
      </div>
      {error && <div className="card pad config-warn">{error}</div>}
      {staff == null ? <Spinner /> : !staff ? (
        <div className="card pad tx-prose">
          <b>这里只给开发者用</b>
          <p className="muted">在 Supabase 的 SQL Editor 里把自己加成开发者：</p>
          <pre className="tx-pre">{"insert into public.staff(user_id)\nselect id from auth.users where email = '你的邮箱';"}</pre>
        </div>
      ) : reqs == null ? <Spinner /> : list.length === 0 ? (
        <div className="card empty"><b>没有待回复的</b>{reqs.length ? "勾上右上角可以看已回复的。" : "还没有人请求反馈。"}</div>
      ) : list.map((s) => (
        <Request key={s.id} s={s} cohort={cohorts[s.cohortId]} detail={details[s.id]} person={people[s.userId] || app.profiles[s.userId]}
          feedback={feedback.filter((f) => f.submissionId === s.id)} done={answered(s)}
          onAdded={(f) => setFeedback((l) => [...l, f])} />
      ))}
    </div>
  );
}

function Request({ s, cohort, detail, person, feedback, done, onAdded }: {
  s: Submission; cohort?: Cohort; detail?: SubmissionDetail; person?: Profile; feedback: SubmissionFeedback[]; done: boolean;
  onAdded: (f: SubmissionFeedback) => void;
}) {
  const app = useApp();
  const course = cohort ? getCourse(cohort.courseId) : null;
  const m = course?.milestones.find((x) => x.id === s.milestoneId);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const tests = s.testsTotal ? `通过 ${s.testsPassed ?? 0}/${s.testsTotal}` : "";

  async function copy() {
    if (!course || !m) return;
    const prompt = feedbackPrompt({
      course, m, learner: person?.name || "这位同学", tests, metric: s.metric != null ? String(s.metric) : "",
      link: detail?.link || "", note: detail?.note || "", late: isLate(s),
    });
    try { await navigator.clipboard.writeText(prompt); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { app.pushToast({ title: "复制失败", body: "浏览器不让写剪贴板" }); }
  }
  async function send() {
    setBusy(true);
    try {
      const f = await app.backend.addFeedback({ submissionId: s.id, userId: s.userId, text });
      onAdded(f); setText("");
      app.pushToast({ title: "反馈发出去了", body: `${person?.name || "同学"} · ${m?.title || s.milestoneId}`, ttl: 3000 });
    } catch (e) { app.pushToast({ title: "没发出去", body: (e as Error).message }); } finally { setBusy(false); }
  }

  return (
    <section className="card">
      <div className="cardhead">
        <h2>{course?.name || cohort?.courseId || "?"} · {m?.title || s.milestoneId}</h2>
        <span className="hint">{done ? "已回复 · " : ""}请求于 {ago(s.feedbackRequestedAt || s.updatedAt, app.now)}</span>
      </div>
      <div className="cardbody tx-form">
        <div className="tx-peer-head"><Avatar p={person} size={22} showSky={false} /><b>{person?.name || "同学"}</b>
          <span className="muted">{cohort?.name || ""}{isLate(s) ? " · 迟交" : ""}{tests ? ` · ${tests}` : ""}{s.metric != null ? ` · ${m?.metric?.name || "指标"} ${s.metric}` : ""}</span>
        </div>
        {detail?.link && <a className="tx-link" href={detail.link} target="_blank" rel="noreferrer nofollow">{detail.link}</a>}
        {detail?.note ? <div className="tx-fb-text">{detail.note}</div> : <p className="muted">没有写说明。</p>}
        {feedback.map((f) => <details key={f.id}><summary className="muted">之前的反馈 · {ago(f.createdAt, app.now)}</summary><div className="tx-fb-text">{f.text}</div></details>)}
        <div className="tx-actions"><button className="btn" onClick={copy} disabled={!m}><ICopy />{copied ? "已复制" : "复制给 Claude 的提示词"}</button></div>
        <textarea className="textarea" rows={6} value={text} placeholder="把 Claude 写的反馈贴在这里（可以先改一改）" onChange={(e) => setText(e.target.value)} disabled={busy} aria-label="反馈" />
        <div className="tx-actions"><button className="btn primary" onClick={send} disabled={busy || !text.trim()}>{busy ? "正在发…" : "发给 TA"}</button></div>
      </div>
    </section>
  );
}
