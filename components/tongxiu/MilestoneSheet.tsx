"use client";
// R-030 同修: one milestone — what to hand in, when, my submission, and what classmates handed in
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import type { Course, Milestone } from "@/lib/courses";
import { KIND_LABEL } from "@/lib/courses";
import type { Cohort, CohortMember, Submission, SubmissionDetail, SubmissionFeedback } from "@/lib/types";
import {
  dueAt, dueDay, EXTENSION_DAYS, isLate, keyLabel, leftLabel, LINK_MAX, localDeadline, MAX_EXTENSIONS, NOTE_MAX, parsePytest,
} from "@/lib/tongxiu";
import { ago } from "@/lib/time";
import { Avatar } from "@/components/bits";
import { IClose } from "@/components/Icons";

export function MilestoneSheet({ course, cohort, m, me, members, subs, details, feedback, onSaved, onExtensions, onClose }: {
  course: Course; cohort: Cohort; m: Milestone; me: CohortMember | null; members: CohortMember[];
  subs: Submission[]; details: Record<string, SubmissionDetail>; feedback: SubmissionFeedback[];
  onSaved: (s: Submission, d: SubmissionDetail) => void; onExtensions: (ids: string[]) => Promise<void>; onClose: () => void;
}) {
  const app = useApp();
  const tz = app.myProfile!.tz;
  const now = app.now;
  const mySub = me ? subs.find((s) => s.userId === me.userId && s.milestoneId === m.id) : undefined;
  const myDetail = mySub ? details[mySub.id] : undefined;
  const due = dueAt(cohort, m, me);
  const extended = !!me?.extensions.includes(m.id);
  const cardsLeft = MAX_EXTENSIONS - (me?.extensions.length || 0);

  const [link, setLink] = useState(myDetail?.link || "");
  const [note, setNote] = useState(myDetail?.note || "");
  const [pytest, setPytest] = useState("");
  const [passed, setPassed] = useState(mySub?.testsPassed != null ? String(mySub.testsPassed) : "");
  const [total, setTotal] = useState(mySub?.testsTotal != null ? String(mySub.testsTotal) : "");
  const [metric, setMetric] = useState(mySub?.metric != null ? String(mySub.metric) : "");
  const [priv, setPriv] = useState(!!myDetail?.private);
  const [askFb, setAskFb] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // the saved content arrives after the sheet opens (first load): fill the form once
  const [filled, setFilled] = useState(!!myDetail || !mySub);
  useEffect(() => {
    if (filled || !myDetail) return;
    setLink(myDetail.link); setNote(myDetail.note); setPriv(myDetail.private); setFilled(true);
  }, [filled, myDetail]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [busy, onClose]);

  const parsed = useMemo(() => (pytest.trim() ? parsePytest(pytest) : null), [pytest]);
  useEffect(() => { if (parsed) { setPassed(String(parsed.passed)); setTotal(String(parsed.total)); } }, [parsed]);

  const myFb = mySub ? feedback.filter((f) => f.submissionId === mySub.id) : [];
  const waiting = !!mySub?.feedbackRequestedAt && !myFb.some((f) => f.createdAt >= mySub.feedbackRequestedAt!);

  async function save() {
    if (!me) return;
    setErr(null);
    const p = passed.trim() === "" ? null : Number(passed), t = total.trim() === "" ? null : Number(total);
    if ((p != null && !(Number.isInteger(p) && p >= 0)) || (t != null && !(Number.isInteger(t) && t >= 0))) { setErr("测试数要是整数"); return; }
    if (p != null && t != null && p > t) { setErr("通过的数量不能比总数多"); return; }
    const x = metric.trim() === "" ? null : Number(metric);
    if (x != null && !Number.isFinite(x)) { setErr(`${m.metric?.name || "指标"}要是一个数`); return; }
    if (!link.trim() && !note.trim() && p == null && x == null) { setErr("至少填一项：链接、测试结果或说明"); return; }
    setBusy(true);
    try {
      const r = await app.backend.saveSubmission({
        cohortId: cohort.id, milestoneId: m.id, testsPassed: p, testsTotal: t ?? (p != null ? p : null), metric: x,
        dueAt: due, link, note, private: priv, requestFeedback: askFb,
      });
      onSaved(r.submission, r.detail);
      setAskFb(false);
      app.pushToast({ title: mySub ? "已更新" : isLate(r.submission) ? "交上去了（迟交）" : "交上去了", body: m.title, ttl: 3500 });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function addTodo() {
    try {
      await app.addTodo({ text: `${course.name} ${m.title}`.slice(0, 80), subjectId: me?.subjectId || null, estimateMin: null });
      app.pushToast({ title: "加到待办了", body: m.title, ttl: 3000 });
    } catch (e) { app.pushToast({ title: "没加上", body: (e as Error).message }); }
  }

  const others = members.filter((x) => !x.leftAt && x.userId !== me?.userId);

  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="tx-ms-title" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="sheet card tx-sheet">
        <div className="tx-sheet-head">
          <div>
            <span className={`tx-kind k-${m.kind}`}>{KIND_LABEL[m.kind]}</span> <span className="muted">第 {m.week} 周</span>
            <h1 id="tx-ms-title">{m.title}</h1>
          </div>
          <button className="iconbtn" onClick={onClose} aria-label="关闭"><IClose /></button>
        </div>

        <div className="tx-due">
          <div><b>{keyLabel(dueDay(cohort.startsOn, m, extended))}</b> 截止{extended ? `（用了缓交卡，晚 ${EXTENSION_DAYS} 天）` : ""}</div>
          <div className="muted">按地球上最晚的时区算；你这里是 {localDeadline(due, tz)} · {leftLabel(due, now)}</div>
        </div>

        <div className="tx-prose">
          <p>{m.summary}</p>
          <h3>要交</h3>
          <ul>{m.deliverables.map((d) => <li key={d}>{d}</li>)}</ul>
          {m.tests && <p>测试：<code>{m.tests.cmd}</code>{m.tests.hint ? <span className="muted">（{m.tests.hint}）</span> : null}</p>}
          {m.gpu === "required" && <p className="muted">这一步需要 NVIDIA GPU，可以用 molab 的免费 GPU。</p>}
          {m.offCampus && <p className="tx-off">校外自学：{m.offCampus}</p>}
          {m.links?.length ? <div className="chips">{m.links.map((l) => <a key={l.url} className="chip" href={l.url} target="_blank" rel="noreferrer">{l.label}</a>)}</div> : null}
        </div>

        {me && !me.leftAt ? (
          <section className="tx-form">
            <div className="tx-form-head">
              <h2>{mySub ? (isLate(mySub) ? "我交的（迟交）" : "我交的") : "交作业"}</h2>
              {mySub && <span className="muted">第一次交于 {ago(mySub.firstSubmittedAt, now)}{mySub.updatedAt - mySub.firstSubmittedAt > 60_000 ? ` · 改于 ${ago(mySub.updatedAt, now)}` : ""}</span>}
            </div>
            <div className="field">
              <label className="label" htmlFor="tx-link">链接（仓库、commit、报告、molab 笔记本）</label>
              <input id="tx-link" className="input" value={link} maxLength={LINK_MAX} placeholder="https://github.com/…" onChange={(e) => setLink(e.target.value)} disabled={busy} />
            </div>
            {m.tests && (
              <div className="field">
                <label className="label" htmlFor="tx-pytest">测试结果：把 pytest 最后一行贴进来，会自动数</label>
                <textarea id="tx-pytest" className="textarea" rows={2} value={pytest} placeholder="==== 46 passed, 2 failed in 3.21s ====" onChange={(e) => setPytest(e.target.value)} disabled={busy} style={{ minHeight: 48 }} />
                <div className="tx-tests">
                  通过 <input className="input num" inputMode="numeric" value={passed} onChange={(e) => setPassed(e.target.value)} disabled={busy} aria-label="通过的测试数" />
                  / 共 <input className="input num" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} disabled={busy} aria-label="测试总数" />
                  {pytest.trim() && !parsed && <span className="td-err">没认出来，手动填也行</span>}
                </div>
              </div>
            )}
            {m.metric && (
              <div className="field">
                <label className="label" htmlFor="tx-metric">{m.metric.name}（{m.metric.lowerIsBetter ? "越低越好" : "越高越好"}，没跑可以不填）</label>
                <input id="tx-metric" className="input num" inputMode="decimal" value={metric} onChange={(e) => setMetric(e.target.value)} disabled={busy} style={{ maxWidth: 180 }} />
              </div>
            )}
            <div className="field">
              <label className="label" htmlFor="tx-note">说明 / 报告（问答题、实验结论、卡住的地方都可以写）</label>
              <textarea id="tx-note" className="textarea" rows={6} value={note} maxLength={NOTE_MAX} onChange={(e) => setNote(e.target.value)} disabled={busy} />
              <span className="muted" style={{ textAlign: "right" }}>{note.length}/{NOTE_MAX}</span>
            </div>
            <label className="tx-check"><input type="checkbox" checked={askFb} onChange={(e) => setAskFb(e.target.checked)} disabled={busy} /> 请开发者帮我看看（用 Claude 写反馈，写好了会提醒你）</label>
            <label className="tx-check"><input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} disabled={busy} /> 截止后也只给自己看（同修们只看得到交没交、测试数）</label>
            {err && <p className="td-err">{err}</p>}
            <div className="tx-actions">
              <button className="btn primary" onClick={save} disabled={busy}>{busy ? "正在交…" : mySub ? "更新" : now > due ? "交上去（迟交）" : "交上去"}</button>
              <button className="btn ghost" onClick={addTodo} disabled={busy}>加到待办</button>
              {!mySub && !extended && cardsLeft > 0 && (
                <button className="btn ghost" disabled={busy} onClick={async () => {
                  try { await onExtensions([...(me.extensions || []), m.id]); app.pushToast({ title: `截止延后 ${EXTENSION_DAYS} 天`, body: `还剩 ${cardsLeft - 1} 张缓交卡`, ttl: 3500 }); }
                  catch (e) { setErr((e as Error).message); }
                }}>用缓交卡（晚 {EXTENSION_DAYS} 天，剩 {cardsLeft} 张）</button>
              )}
              {!mySub && extended && (
                <button className="btn ghost" disabled={busy} onClick={() => onExtensions(me.extensions.filter((x) => x !== m.id)).catch((e) => setErr((e as Error).message))}>收回缓交卡</button>
              )}
            </div>
            {waiting && <p className="muted">已经请开发者看了，等反馈中。</p>}
            {myFb.map((f) => (
              <div key={f.id} className="tx-fb"><div className="muted">反馈 · {ago(f.createdAt, now)}</div><div className="tx-fb-text">{f.text}</div></div>
            ))}
          </section>
        ) : (
          <p className="muted">加入这一期之后就能交作业。</p>
        )}

        <section className="tx-peers">
          <h2>同修们</h2>
          {others.length === 0 && <p className="muted">这一期还只有你。</p>}
          {others.map((x) => {
            const p = app.profiles[x.userId];
            const s = subs.find((y) => y.userId === x.userId && y.milestoneId === m.id);
            const d = s ? details[s.id] : undefined;
            const fb = s ? feedback.filter((f) => f.submissionId === s.id) : [];
            return (
              <div key={x.userId} className="tx-peer">
                <div className="tx-peer-head">
                  <Avatar p={p} size={22} showSky={false} /><b>{p?.name || "同窗"}</b>
                  {s ? (
                    <span className="muted">
                      {isLate(s) ? "迟交 · " : ""}{ago(s.firstSubmittedAt, now)}交的
                      {s.testsTotal ? ` · 测试 ${s.testsPassed ?? 0}/${s.testsTotal}` : ""}
                      {s.metric != null ? ` · ${m.metric?.name || "指标"} ${s.metric}` : ""}
                    </span>
                  ) : <span className="muted">还没交{x.extensions.includes(m.id) ? "（用了缓交卡）" : ""}</span>}
                </div>
                {s && d && (
                  <div className="tx-peer-body">
                    {d.link && <a href={d.link} target="_blank" rel="noreferrer nofollow" className="tx-link">{d.link}</a>}
                    {d.note && <div className="tx-fb-text">{d.note}</div>}
                    {fb.map((f) => <details key={f.id}><summary className="muted">开发者的反馈</summary><div className="tx-fb-text">{f.text}</div></details>)}
                  </div>
                )}
                {s && !d && <p className="muted tx-peer-body">截止之后、或者你也交了之后能看到内容（除非 TA 选了只给自己看）。</p>}
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
