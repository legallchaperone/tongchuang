"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store";
import { browserTz, COMMON_TZS, hhmm, tzCity } from "@/lib/time";
import { Avatar, seriesVar } from "@/components/bits";
import { resetDemo } from "@/lib/backend/demo";
import type { Profile } from "@/lib/types";
import { CharacterEditor } from "@/components/CharacterEditor";
import { NumberField } from "@/components/NumberField";
import Link from "next/link";
import { APP_VERSION, BUILD_ID, CHANGELOG } from "@/lib/version";

export default function SettingsPage() {
  const app = useApp();
  const router = useRouter();
  const [p, setP] = useState<Profile>(app.myProfile!);
  const [saved, setSaved] = useState(false);
  const [notif, setNotif] = useState<string>("default");
  useEffect(() => { if ("Notification" in window) setNotif(Notification.permission); }, []);
  const dirty = JSON.stringify(p) !== JSON.stringify(app.myProfile);
  const mine = app.subjects.filter((s) => s.userId === app.me!.id);
  const tzs = Array.from(new Set([browserTz(), p.tz, ...COMMON_TZS]));

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
      </section>

      <div className="savebar">
        <button className="btn primary lg" disabled={!dirty} onClick={save}>保存</button>
        {saved && <span className="up">已保存</span>}
      </div>

      <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2>科目</h2>
        {mine.length === 0 && <p className="muted">开始专注时可以添加科目。</p>}
        {mine.map((s) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="dot" style={{ background: seriesVar(s.color), width: 10, height: 10 }} />
            <span style={{ flex: 1, color: s.archived ? "var(--ink-3)" : undefined }}>{s.name}{s.archived && "（已归档）"}</span>
            <button className="btn sm ghost" onClick={() => app.saveSubject({ ...s, color: (s.color + 1) % 8 })}>换色</button>
            <button className="btn sm ghost" onClick={() => app.saveSubject({ ...s, archived: !s.archived })}>{s.archived ? "恢复" : "归档"}</button>
          </div>
        ))}
      </section>

      <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2>通知</h2>
        <p className="muted">在后台时，同窗戳你、邀请你一起专注、给你点赞，会弹出系统通知。</p>
        <div>
          {notif === "granted" ? <span className="up">已开启</span>
            : notif === "denied" ? <span className="muted">浏览器已拒绝通知，请在浏览器地址栏的站点设置里开启。</span>
            : <button className="btn" onClick={async () => setNotif(await Notification.requestPermission())}>开启通知</button>}
        </div>
      </section>

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
