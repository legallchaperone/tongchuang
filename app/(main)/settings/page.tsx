"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store";
import { browserTz, COMMON_TZS, hhmm, tzCity } from "@/lib/time";
import { Avatar, seriesVar } from "@/components/bits";
import { resetDemo } from "@/lib/backend/demo";
import type { FocusPrefs, Profile, Subject } from "@/lib/types";
import { SubjectSheet } from "@/components/SubjectSheet";
import { BREAK_TABLE, prefsOf, suggestBreakMin } from "@/lib/focusModes";
import { MIN } from "@/lib/time";
import { CharacterEditor } from "@/components/CharacterEditor";
import { NumberField } from "@/components/NumberField";
import Link from "next/link";
import { APP_VERSION, BUILD_ID, CHANGELOG } from "@/lib/version";
import { writeStatusPrefs } from "@/lib/status";
import { StatusButton, useStatusPrefs } from "@/components/Status";
import { PushSettings } from "@/components/PushSettings";

export default function SettingsPage() {
  const app = useApp();
  const router = useRouter();
  const [p, setP] = useState<Profile>(app.myProfile!);
  const [saved, setSaved] = useState(false);
  const [subjSheet, setSubjSheet] = useState<{ s: Subject; kind: "merge" | "delete" } | null>(null);
  const [newSubj, setNewSubj] = useState("");
  /** the subject being renamed, and the name typed so far */
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  async function rename(s: Subject) {
    if (!renaming) return;
    const name = renaming.name.trim();
    if (!name || name === s.name) { setRenaming(null); return; }
    const twin = mine.find((x) => x.id !== s.id && x.name.trim().toLowerCase() === name.toLowerCase());
    if (twin) { app.pushToast({ title: `已经有「${twin.name}」了`, body: "想把两个算在一起，可以用“合并到…”" }); return; }
    try { await app.saveSubject({ ...s, name }); setRenaming(null); }
    catch (err) { app.pushToast({ title: "没能改名", body: (err as Error).message }); }
  }
  const dirty = JSON.stringify(p) !== JSON.stringify(app.myProfile);
  const fp = prefsOf(p);
  const setFp = (patch: Partial<FocusPrefs>) => setP({ ...p, focusPrefs: { ...fp, ...patch } });
  const mine = app.subjects.filter((s) => s.userId === app.me!.id);
  const tzs = Array.from(new Set([browserTz(), p.tz, ...COMMON_TZS]));
  const stPrefs = useStatusPrefs();

  async function save() {
    try { await app.saveProfile({ ...p, name: p.name.trim() || "同学" }); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    catch (e) { app.pushToast({ title: "保存失败", body: (e as Error).message }); }
  }

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="pagehead"><div><h1>设置</h1><p className="sub">{app.me?.email}</p></div></div>

      <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <h2>个人资料</h2>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <Avatar p={p} size={56} showSky={false} />
          <div className="field" style={{ flex: 1 }}>
            <label className="label" htmlFor="set-name">名字（同窗看到的）</label>
            <input id="set-name" className="input" value={p.name} maxLength={20} onChange={(e) => setP({ ...p, name: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor="set-tz">时区</label>
          <select id="set-tz" className="input select" value={p.tz} onChange={(e) => setP({ ...p, tz: e.target.value })}>
            {tzs.map((t) => <option key={t} value={t}>{tzCity(t)} · {t} · 现在 {hhmm(Date.now(), t)}</option>)}
          </select>
          <span className="muted" style={{ fontSize: 12, marginTop: 6 }}>每次打开会自动跟随设备时区，出差或换国家时不用手动改。“今天”按这个时区计算。</span>
        </div>
      </section>

      <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2>我的小人</h2>
        <CharacterEditor p={p} onChange={setP} />
      </section>

      <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <h2>目标与节奏</h2>
        <div className="field">
          <label className="label" htmlFor="set-goal">每日目标：<span className="num">{Math.floor(p.dailyGoalMin / 60)} 小时{p.dailyGoalMin % 60 ? ` ${p.dailyGoalMin % 60} 分` : ""}</span></label>
          <input id="set-goal" type="range" min={30} max={720} step={15} value={p.dailyGoalMin} onChange={(e) => setP({ ...p, dailyGoalMin: +e.target.value })} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="field">
            <label className="label" htmlFor="set-pomo">默认番茄时长（分）</label>
            <NumberField id="set-pomo" min={5} max={180} value={p.pomodoroMin} onCommit={(v) => setP({ ...p, pomodoroMin: v })} />
          </div>
          <div className="field">
            <label className="label" htmlFor="set-break">休息时长（分）</label>
            <NumberField id="set-break" min={1} max={60} value={p.breakMin} onCommit={(v) => setP({ ...p, breakMin: v })} />
          </div>
        </div>
        <label className="switchrow" htmlFor="set-overtime">
          <span>
            <b>番茄钟时间到了继续计时</b>
            <small className="muted">时间到了只提醒，不自动休息。准备好了再点结束。</small>
          </span>
          <input id="set-overtime" type="checkbox" className="pxswitch" checked={fp.pomoOvertime} onChange={(e) => setFp({ pomoOvertime: e.target.checked })} />
        </label>
        <div className="field">
          <span className="label" id="set-flow-lbl">心流结束后，建议休息多久</span>
          <div className="seg" role="group" aria-labelledby="set-flow-lbl" style={{ alignSelf: "flex-start" }}>
            <button aria-pressed={fp.flowBreak === "ratio"} onClick={() => setFp({ flowBreak: "ratio" })}>按比例</button>
            <button aria-pressed={fp.flowBreak === "table"} onClick={() => setFp({ flowBreak: "table" })}>按时长查表</button>
          </div>
          {fp.flowBreak === "ratio" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <label htmlFor="set-flow-pct">专注时长的</label>
              <span style={{ display: "inline-flex", flexDirection: "column", width: 90 }}>
                <NumberField id="set-flow-pct" min={5} max={50} value={fp.flowPct} onCommit={(v) => setFp({ flowPct: v })} />
              </span>
              <span>%，例如专注 50 分钟休息 {suggestBreakMin(50 * MIN, fp)} 分钟</span>
            </div>
          ) : (
            <table className="breaktable">
              <thead><tr><th>专注</th><th>休息</th></tr></thead>
              <tbody>
                {BREAK_TABLE.map(([upTo, b], i) => (
                  <tr key={i}><td>{i === 0 ? `不到 ${upTo} 分钟` : upTo === Infinity ? `${BREAK_TABLE[i - 1][0]} 分钟以上` : `${BREAK_TABLE[i - 1][0]}–${upTo} 分钟`}</td><td className="num">{b} 分钟</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <div className="savebar">
        <button className="btn primary lg" disabled={!dirty} onClick={save}>保存</button>
        {saved && <span className="up">已保存</span>}
      </div>

      <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2>科目</h2>
        {mine.length === 0 && <p className="muted">开始专注时可以添加科目。</p>}
        {mine.map((s) => (
          <div key={s.id} className="subj-row">
            <span className="dot" style={{ background: seriesVar(s.color), width: 10, height: 10 }} />
            {renaming?.id === s.id ? (
              <form className="subj-rename" onSubmit={(e) => { e.preventDefault(); rename(s); }}>
                <input className="input" autoFocus aria-label={`「${s.name}」的新名字`} maxLength={40} value={renaming.name}
                  onChange={(e) => setRenaming({ id: s.id, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Escape") setRenaming(null); }} />
                <button className="btn sm primary" type="submit" disabled={!renaming.name.trim()}>保存</button>
                <button className="btn sm ghost" type="button" onClick={() => setRenaming(null)}>取消</button>
              </form>
            ) : (
              <span className="subj-row-name" style={{ color: s.archived ? "var(--ink-3)" : undefined }}>{s.name}{s.archived && "（已归档）"}</span>
            )}
            {renaming?.id !== s.id && app.folders.length > 0 && (
              <select className="input subj-folder" aria-label={`「${s.name}」放在哪个文件夹`} value={s.folderId && app.folders.some((f) => f.id === s.folderId) ? s.folderId : ""}
                onChange={(e) => app.saveSubject({ ...s, folderId: e.target.value || null }).catch((err) => app.pushToast({ title: "没能移动", body: (err as Error).message }))}>
                <option value="">不放文件夹</option>
                {app.folders.map((f) => <option key={f.id} value={f.id}>📂 {f.name}</option>)}
              </select>
            )}
            {renaming?.id !== s.id && <span className="subj-row-acts">
              <button className="btn sm ghost" onClick={() => setRenaming({ id: s.id, name: s.name })}>改名</button>
              <button className="btn sm ghost" onClick={() => app.saveSubject({ ...s, color: (s.color + 1) % 8 })}>换色</button>
              <button className="btn sm ghost" onClick={() => app.saveSubject({ ...s, archived: !s.archived })}>{s.archived ? "恢复" : "归档"}</button>
              {mine.length > 1 && <button className="btn sm ghost" onClick={() => setSubjSheet({ s, kind: "merge" })}>合并到…</button>}
              <button className="btn sm ghost subj-del" onClick={() => setSubjSheet({ s, kind: "delete" })}>删除</button>
            </span>}
          </div>
        ))}
        <form className="subj-add" onSubmit={async (e) => {
          e.preventDefault();
          if (!newSubj.trim()) return;
          try { await app.ensureSubject(newSubj); setNewSubj(""); }
          catch (err) { app.pushToast({ title: "没能添加科目", body: (err as Error).message }); }
        }}>
          <input className="input" aria-label="新科目名称" placeholder="新科目名称" maxLength={40} value={newSubj} onChange={(e) => setNewSubj(e.target.value)} />
          <button className="btn sm" type="submit" disabled={!newSubj.trim()}>添加</button>
        </form>
        <FolderList />
        {subjSheet && <SubjectSheet subject={subjSheet.s} kind={subjSheet.kind} onClose={() => setSubjSheet(null)} />}
      </section>

      <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2>状态</h2>
        <p className="muted">不在书桌前的时候，告诉同窗你在干嘛。状态会显示在你的书桌、名牌和头像上。</p>
        <div><StatusButton /></div>
        <label className="check">
          <input type="checkbox" checked={!stPrefs.keepOnFocus} onChange={(e) => writeStatusPrefs({ ...stPrefs, keepOnFocus: !e.target.checked })} />
          <span>开始专注时自动清除状态</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={stPrefs.showInFeed} onChange={(e) => writeStatusPrefs({ ...stPrefs, showInFeed: e.target.checked })} />
          <span>在动态里显示状态</span>
        </label>
        <span className="muted" style={{ fontSize: 12 }}>这两项只对当前这台设备生效。</span>
      </section>

      <PushSettings />

      <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2>关于</h2>
        <p>同窗 <b className="num" style={{ fontWeight: 400 }}>v{APP_VERSION}</b> <span className="muted">· 构建 {BUILD_ID}</span></p>
        <p className="muted">最近一次更新：{CHANGELOG[0].title}（{CHANGELOG[0].date}）</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn sm" href="/release#changelog">更新日志</Link>
          <Link className="btn sm ghost" href="/release">产品介绍</Link>
        </div>
      </section>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="btn" onClick={async () => { await app.signOut(); router.replace("/login"); }}>退出登录</button>
        {app.backend.mode === "demo" && <button className="btn ghost" onClick={() => { resetDemo(); location.reload(); }}>重置演示数据</button>}
      </div>
    </div>
  );
}

/** R-026: my subject folders: add, rename, delete (subjects inside go back to the top level) */
function FolderList() {
  const app = useApp();
  const [name, setName] = useState("");
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const fail = (title: string) => (e: unknown) => app.pushToast({ title, body: (e as Error).message });
  const count = (id: string) => app.subjects.filter((x) => x.folderId === id).length;
  return (
    <div className="folders">
      <h3>文件夹 <span className="muted">只有你自己看得到</span></h3>
      {app.foldersError && <p className="muted">{app.foldersError}</p>}
      {app.folders.map((f) => (
        <div key={f.id} className="subj-row">
          <span aria-hidden>📂</span>
          {edit?.id === f.id ? (
            <form className="subj-rename" onSubmit={(e) => { e.preventDefault(); if (edit.name.trim()) app.saveFolder({ id: f.id, name: edit.name }).then(() => setEdit(null), fail("没能改名")); }}>
              <input className="input" autoFocus maxLength={40} value={edit.name} aria-label={`文件夹「${f.name}」的新名字`}
                onChange={(e) => setEdit({ id: f.id, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Escape") setEdit(null); }} />
              <button className="btn sm primary" type="submit" disabled={!edit.name.trim()}>保存</button>
              <button className="btn sm ghost" type="button" onClick={() => setEdit(null)}>取消</button>
            </form>
          ) : (
            <>
              <span className="subj-row-name">{f.name} <span className="muted num">{count(f.id)} 个科目</span></span>
              <span className="subj-row-acts">
                {confirm === f.id ? (
                  <>
                    <span className="muted">里面的科目会移到外面</span>
                    <button className="btn sm ghost subj-del" onClick={() => { setConfirm(null); app.deleteFolder(f.id).catch(fail("没能删除")); }}>删除</button>
                    <button className="btn sm ghost" onClick={() => setConfirm(null)}>留着</button>
                  </>
                ) : (
                  <>
                    <button className="btn sm ghost" onClick={() => setEdit({ id: f.id, name: f.name })}>改名</button>
                    <button className="btn sm ghost subj-del" onClick={() => setConfirm(f.id)}>删除</button>
                  </>
                )}
              </span>
            </>
          )}
        </div>
      ))}
      <form className="subj-add" onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        app.saveFolder({ name }).then(() => setName(""), fail("没能新建文件夹"));
      }}>
        <input className="input" aria-label="新文件夹名称" placeholder="新文件夹，例如：考研" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn sm" type="submit" disabled={!name.trim()}>新建文件夹</button>
      </form>
    </div>
  );
}
