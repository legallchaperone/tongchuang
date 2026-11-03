"use client";
// R-019: merge a duplicate subject into another, or delete it
import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import type { Subject } from "@/lib/types";
import { seriesVar } from "./bits";

export function SubjectSheet({ subject, kind, onClose }: { subject: Subject; kind: "merge" | "delete"; onClose: () => void }) {
  const app = useApp();
  const others = app.subjects
    .filter((s) => s.userId === subject.userId && s.id !== subject.id)
    .sort((a, b) => Number(a.archived) - Number(b.archived));
  const [to, setTo] = useState<string>(others[0]?.id || "");
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const target = others.find((s) => s.id === to);

  useEffect(() => {
    let alive = true;
    app.countSubjectSessions(subject.id).then((n) => { if (alive) setCount(n); }).catch(() => { if (alive) setCount(-1); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject.id]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [busy, onClose]);

  const n = count == null ? "…" : count < 0 ? "若干" : String(count);

  async function go() {
    setBusy(true);
    try {
      if (kind === "merge") {
        if (!target) return;
        await app.mergeSubject(subject.id, target.id);
        app.pushToast({ title: `已合并到「${target.name}」`, color: target.color });
      } else {
        await app.deleteSubject(subject.id);
        app.pushToast({ title: `已删除「${subject.name}」` });
      }
      onClose();
    } catch (e) {
      app.pushToast({ title: kind === "merge" ? "合并失败" : "删除失败", body: (e as Error).message });
    } finally { setBusy(false); }
  }

  const name = <span className="subj-name"><span className="dot" style={{ background: seriesVar(subject.color) }} />{subject.name}</span>;

  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="subj-sheet-title" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="sheet card subj-sheet">
        <h1 id="subj-sheet-title" style={{ fontSize: 22 }}>{kind === "merge" ? "合并科目" : "删除科目"}</h1>
        {kind === "merge" ? (
          others.length === 0 ? <p className="muted">没有别的科目可以合并。</p> : (
            <>
              <div className="field">
                <label className="label" htmlFor="subj-merge-to">把 {name} 合并到</label>
                <select id="subj-merge-to" className="input select" value={to} onChange={(e) => setTo(e.target.value)} disabled={busy}>
                  {others.map((s) => <option key={s.id} value={s.id}>{s.name}{s.archived ? "（已归档）" : ""}</option>)}
                </select>
              </div>
              <p className="muted">
                {name} 的 <b className="num">{n}</b> 条记录会改到「{target?.name}」名下，然后删掉 {name}。数据页里它们会算在一起。
              </p>
            </>
          )
        ) : (
          <p>
            确定删除 {name} 吗？用过它的 <b className="num">{n}</b> 条记录会变成<b>未分类</b>，时长不受影响。
            {others.length > 0 && <span className="muted"> 如果它是重复建的，用“合并到…”更好。</span>}
          </p>
        )}
        <div className="subj-sheet-nav">
          <button className="btn ghost" onClick={onClose} disabled={busy}>取消</button>
          {kind === "merge"
            ? <button className="btn primary" onClick={go} disabled={busy || !target}>{busy ? "合并中…" : "合并"}</button>
            : <button className="btn danger" onClick={go} disabled={busy}>{busy ? "删除中…" : "删除"}</button>}
        </div>
      </div>
    </div>
  );
}
