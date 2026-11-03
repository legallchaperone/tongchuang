"use client";
import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { DeskScene } from "@/components/Pixel";
import { Heatmap, HourChart } from "@/components/Charts";
import { Logo, IHand, IUsers } from "@/components/Icons";
import { Ring } from "@/components/bits";
import { DAY, HOUR, MIN, dayKey, hhmm, partsIn, startOfDay, tzCity } from "@/lib/time";
import { yearGrid } from "@/lib/stats";
import type { LiveState, LiveStatus, Profile } from "@/lib/types";
import { APP_VERSION, CHANGELOG } from "@/lib/version";

/* ───────── sample classmates (illustration only) ───────── */
const mk = (id: string, name: string, tz: string, color: number, look: Profile["look"]): Profile => ({ id, name, tz, color, look, dailyGoalMin: 240, pomodoroMin: 25, breakMin: 5 });
const CAST = [
  mk("p-sh", "小陈", "Asia/Shanghai", 0, { skin: 0, hair: 0, hairColor: 0 }),
  mk("p-ld", "Mia", "Europe/London", 2, { skin: 1, hair: 2, hairColor: 2 }),
  mk("p-ny", "林舟", "America/New_York", 1, { skin: 2, hair: 4, hairColor: 1 }),
];
const live = (id: string, state: LiveState): LiveStatus => ({ userId: id, state, task: "", subjectName: "", subjectColor: null, mode: "pomodoro", startedAt: 0, plannedEnd: null, accumulatedMs: 0, runningSince: 0, updatedAt: 0 });

/** what a sample classmate is doing at a given local hour: studies 8–23, short breaks on the half hour, asleep at night */
function stateAt(tz: string, at: number): LiveState {
  const t = partsIn(at, tz);
  if (t.h < 8 || t.h >= 23) return "idle";
  if (t.h === 12 || t.h === 18) return "idle";
  return t.mi >= 25 && t.mi < 30 || t.mi >= 55 ? "break" : "focus";
}
const stateText: Record<LiveState, string> = { focus: "专注中", break: "休息中", paused: "暂停", idle: "不在桌前" };

function Section({ id, kicker, title, lead, children }: { id: string; kicker: string; title: string; lead: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="lp-sec" id={id}>
      <div className="lp-sec-head">
        <span className="lp-kicker">{kicker}</span>
        <h2 className="lp-h2">{title}</h2>
        <p className="lp-lead">{lead}</p>
      </div>
      {children}
    </section>
  );
}

export function Landing() {
  const app = useApp();
  const signedIn = app.status === "ready";
  // the server renders without a clock; real times appear once the page is running in the browser
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const now = app.now;
  const t = (ms: number, tz: string) => (mounted ? hhmm(ms, tz) : "--:--");
  const cta = signedIn ? { href: "/", label: "进入我的书房" } : { href: "/login", label: "免费开始" };

  /* time-travel demo: hour of the viewer's day */
  const viewerTz = CAST[0].tz;
  const day0 = useMemo(() => startOfDay(Date.now(), viewerTz), [viewerTz]);
  const [hour, setHour] = useState(21);
  useEffect(() => { setHour(partsIn(Date.now(), viewerTz).h); }, [viewerTz]);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setHour((h) => (h + 0.25) % 24), 220);
    return () => clearInterval(t);
  }, [playing]);
  const at = day0 + hour * HOUR;
  const awake = CAST.map((p) => { const h = partsIn(at, p.tz).h; return h >= 8 && h < 23; });
  const allAwake = awake.every(Boolean);

  /* state demo */
  const [demoState, setDemoState] = useState<LiveState>("focus");
  const [rain, setRain] = useState(false);

  /* sample statistics */
  const sampleDaily = useMemo(() => {
    const m = new Map<string, number>();
    let s = 11;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 300; i++) {
      const k = dayKey(Date.now() - i * DAY, viewerTz);
      const wd = new Date(Date.now() - i * DAY).getDay();
      const base = i > 220 ? 0.15 : 0.85;
      if (r() < base) m.set(k, (wd === 0 || wd === 6 ? 1.2 : 2.2 + r() * 3.4) * HOUR * (r() < 0.12 ? 0.3 : 1));
    }
    return m;
  }, [viewerTz]);
  const grid = useMemo(() => yearGrid(sampleDaily, viewerTz, 53, Date.now()), [sampleDaily, viewerTz]);
  const hours = useMemo(() => Array.from({ length: 24 }, (_, h) => {
    const w = h >= 9 && h <= 11 ? 32 : h >= 14 && h <= 16 ? 28 : h >= 20 && h <= 22 ? 36 : h === 8 || h === 13 || h === 19 || h === 23 ? 10 : 0;
    return { h, ms: w * MIN * 7, rating: w ? (h >= 20 ? 4.2 : h >= 14 ? 3.4 : 3.9) : null };
  }), []);

  const pokeDemo = (kind: "poke" | "invite" | "cheer") => {
    if (kind === "poke") app.pushToast({ title: "Mia 戳了戳你", body: "该回来学习啦", color: 2 });
    if (kind === "invite") app.pushToast({ title: "林舟 邀请你一起专注", body: "25 分钟番茄钟 · GRE 填空", color: 1, action: { label: "一起开始", href: "/release#start" } });
    if (kind === "cheer") app.pushToast({ title: "小陈 给你的专注点了 🔥", body: "有机化学 · 反应机理卡片", color: 0 });
  };

  return (
    <div className="lp">
      {/* ───── top bar ───── */}
      <header className="lp-bar">
        <Link href="/release" className="logo" style={{ padding: 0 }}><Logo /> 同窗</Link>
        <nav className="lp-nav">
          <a href="#hall">书房</a><a href="#timezone">时差</a><a href="#focus">专注</a><a href="#together">陪伴</a><a href="#data">数据</a><a href="#faq">问答</a><a href="#changelog">更新日志</a>
        </nav>
        <Link href={cta.href} className="btn primary sm">{cta.label}</Link>
      </header>

      {/* ───── hero ───── */}
      <section className="lp-hero">
        <div className="lp-hero-text">
          <span className="lp-kicker light">跨时区自习室 · 免费 · 网页即开即用</span>
          <h1 className="lp-h1">隔着时差，<br />也坐在同一张书桌旁。</h1>
          <p>同窗是一个和朋友一起专注学习的地方。每个人有一张自己的像素小书桌：你开始专注，你的小人就坐到桌前；朋友在伦敦、纽约还是上海，打开页面都能看到你在学什么、学了多久。</p>
          <div className="lp-cta">
            <Link href={cta.href} className="btn primary lg">{cta.label}</Link>
            <a href="#hall" className="btn lg">看看怎么用</a>
          </div>
        </div>
        <div className="lp-hero-desks">
          {CAST.map((p) => {
            const st = mounted ? stateAt(p.tz, now) : "idle";
            return (
              <figure key={p.id} className="card lp-desk">
                <DeskScene p={p} live={live(p.id, st)} present={st !== "idle"} maxScale={3} />
                <figcaption><b>{tzCity(p.tz)}</b><span className="num">{t(now, p.tz)}</span><span className={`state-pill ${st}`}>{stateText[st]}</span></figcaption>
              </figure>
            );
          })}
          <p className="lp-note">这三张桌子跟着三座城市此刻的真实时间：窗外的天色和墙上的钟都是当地的。（示意人物）</p>
        </div>
      </section>

      {/* ───── 1. hall ───── */}
      <Section id="hall" kicker="核心 1 · 书房" title="你的小人，替你坐在书桌前"
        lead="不用开摄像头，也不用一直聊天。小人的状态就是你的状态，朋友扫一眼就知道你在干嘛。点下面的按钮试试。">
        <div className="lp-split">
          <div className="card">
            <DeskScene p={CAST[0]} live={live(CAST[0].id, demoState)} present rain={rain} maxScale={5} />
          </div>
          <div className="lp-explain">
            <div className="seg" role="group" aria-label="切换状态">
              <button aria-pressed={demoState === "focus"} onClick={() => setDemoState("focus")}>专注</button>
              <button aria-pressed={demoState === "break"} onClick={() => setDemoState("break")}>休息</button>
              <button aria-pressed={demoState === "idle"} onClick={() => setDemoState("idle")}>离开</button>
            </div>
            <ul className="lp-list">
              <li className={demoState === "focus" ? "on" : ""}><b>专注</b>小人坐下写字，台灯亮起。朋友那边会显示你的任务和倒计时，例如“线代 第 4 章 · 还剩 12:40”。</li>
              <li className={demoState === "break" ? "on" : ""}><b>休息</b>番茄钟结束后自动进入休息，小人站起来端杯热饮。</li>
              <li className={demoState === "idle" ? "on" : ""}><b>离开</b>椅子空着。如果你那边是深夜、也没打开页面，房间会暗下来，飘出 Zzz。</li>
            </ul>
            <label className="lp-check"><input type="checkbox" checked={rain} onChange={(e) => setRain(e.target.checked)} /> 专注时开着“雨声”，窗外也会下雨</label>
          </div>
        </div>
      </Section>

      {/* ───── 2. time zones ───── */}
      <Section id="timezone" kicker="核心 2 · 时差" title="每个人的“今天”，按自己的时间算"
        lead="拖动滑块，看看你在上海的一天里，伦敦和纽约的朋友分别在做什么。绿色提示出现时，就是大家都醒着、适合约一起开番茄钟的时段。">
        <div className="card lp-tz">
          <div className="lp-tz-ctrl">
            <span>上海时间 <b className="num big2">{String(Math.floor(hour)).padStart(2, "0")}:{String(Math.round((hour % 1) * 60)).padStart(2, "0")}</b></span>
            <input type="range" min={0} max={23.75} step={0.25} value={hour} onChange={(e) => { setPlaying(false); setHour(+e.target.value); }} aria-label="上海时间" />
            <button className="btn sm" onClick={() => setPlaying(!playing)}>{playing ? "暂停" : "▶ 播放一天"}</button>
          </div>
          <div className="lp-tz-desks">
            {CAST.map((p, i) => {
              const st = stateAt(p.tz, at);
              return (
                <figure key={p.id} className="lp-desk-mini">
                  <DeskScene p={p} live={live(p.id, st)} present={awake[i]} at={at} maxScale={3} />
                  <figcaption><b>{tzCity(p.tz)}</b><span className="num">{hhmm(at, p.tz)}</span><span className={`state-pill ${st}`}>{awake[i] ? stateText[st] : "睡觉"}</span></figcaption>
                </figure>
              );
            })}
          </div>
          <div className={`lp-overlap ${allAwake ? "yes" : ""}`}>
            {allAwake ? "✓ 现在三个人都醒着：发个“一起开始”的邀请吧" : "有人在睡觉。时差大的时候，同窗适合“接力”：一个人收工时，能看到下一个人刚开始。"}
          </div>
        </div>
        <div className="lp-facts">
          <div className="card pad"><b>自动识别时区</b><p>换国家、出差都不用改设置，打开页面就跟着设备时区走。</p></div>
          <div className="card pad"><b>记录标两个时间</b><p>朋友的每条记录同时显示你的时间和他们当地的时间，不用心算。</p></div>
          <div className="card pad"><b>时差带</b><p>自习室里把每个人的白天黑夜画在你的时间轴上，标出大家都醒着的时段。</p></div>
        </div>
      </Section>

      {/* ───── 3. focus ───── */}
      <Section id="focus" kicker="核心 3 · 专注" title="三步完成一次有记录的专注"
        lead="每次专注都留下一条记录：做了什么、多久、状态如何。这些记录会变成你的数据，也会出现在朋友的动态里。">
        <ol className="lp-steps">
          <li className="card pad">
            <span className="lp-num">1</span>
            <b>写下要做的事</b>
            <div className="inset lp-mock">线代 第 4 章 特征值习题<span className="chip" aria-pressed="true" style={{ marginLeft: 8 }}><span className="dot" style={{ background: "var(--s0)" }} />线性代数</span></div>
            <p>选科目，选番茄钟、心流（正计时）或倒计时，回车开始。</p>
          </li>
          <li className="card pad">
            <span className="lp-num">2</span>
            <b>全屏专注</b>
            <div className="inset lp-mock lp-timer"><span className="num">18:42</span><div className="progressbar" style={{ flex: 1 }}><div style={{ width: "26%" }} /></div></div>
            <p>环境声是真实录音：雨、咖啡馆、壁炉、溪流、虫鸣、海浪、鸟鸣，可以混着开、各自调音量。屏幕常亮，关掉页面计时也不会丢。</p>
          </li>
          <li className="card pad">
            <span className="lp-num">3</span>
            <b>一句话复盘</b>
            <div className="inset lp-mock">
              <div className="rating" style={{ marginBottom: 6 }}>
                {["很散", "一般", "还行", "专注", "心流"].map((l, i) => <button key={l} aria-pressed={i === 3} tabIndex={-1}><span className="bars">{[0, 1, 2, 3, 4].map((j) => <i key={j} className={j <= i ? "on" : ""} style={{ height: 4 + j * 3 }} />)}</span>{l}</button>)}
              </div>
              特征值终于理清了，明天做 SVD
            </div>
            <p>给专注度打分，写一句收获。今日目标的进度格会当场往前跳。</p>
          </li>
        </ol>
      </Section>

      {/* ───── 4. together ───── */}
      <Section id="together" kicker="核心 4 · 陪伴" title="不打扰，但彼此看得见"
        lead="同窗里没有聊天框，只有几个轻量的动作。点一下按钮，右上角会弹出朋友收到的样子。">
        <div className="lp-facts">
          <div className="card pad lp-act">
            <span className="lp-ico"><IHand /></span><b>戳一下</b><p>朋友好久没动静？戳他一下，提醒他回到书桌前。</p>
            <button className="btn sm" onClick={() => pokeDemo("poke")}>试试</button>
          </div>
          <div className="card pad lp-act">
            <span className="lp-ico"><IUsers /></span><b>邀请一起专注</b><p>发出邀请，对方点“一起开始”，两个人的番茄钟同时开跑。</p>
            <button className="btn sm" onClick={() => pokeDemo("invite")}>试试</button>
          </div>
          <div className="card pad lp-act">
            <span className="lp-ico">🔥</span><b>点赞</b><p>给朋友的专注记录点 👏 🔥 💪，对方会收到通知。</p>
            <button className="btn sm" onClick={() => pokeDemo("cheer")}>试试</button>
          </div>
        </div>
        <p className="lp-note dark">页面在后台时，这些提醒会变成系统通知（需要在设置里开启）。专注时，屏幕底部会显示“此刻也在书桌前”的朋友。</p>
      </Section>

      {/* ───── 5. data ───── */}
      <Section id="data" kicker="核心 5 · 数据" title="越记越想记"
        lead="每日目标、连续天数、一年的“庄稼长势”，还有你一天里最专注的时段。下面是示例数据。">
        <div className="lp-data">
          <div className="card pad lp-goal">
            <Ring value={0.72} size={120}><div><div className="num big2">72%</div><div className="muted">今日目标</div></div></Ring>
            <div><div className="muted">今天已专注</div><div className="num" style={{ fontSize: 36, lineHeight: "40px" }}>2小时53分</div><p className="muted">距离 4 小时的目标还差 1小时7分 · 连续 12 天</p></div>
          </div>
          <div className="card">
            <div className="cardhead"><h2>一年</h2><span className="hint">示例 · 越绿学得越多</span></div>
            <div className="cardbody"><Heatmap cols={grid} /></div>
          </div>
          <div className="card">
            <div className="cardhead"><h2>一天中的节奏</h2><span className="hint">示例 · 深色是最常学的 3 个小时</span></div>
            <div className="cardbody"><HourChart data={hours} color="var(--s0)" days={7} /></div>
          </div>
        </div>
        <p className="lp-note dark">还有：按科目分色的每日柱状图、本周和上周对比、和同窗的时长对比、每周自动小结（比如“你自评最专注的时段是 21 点前后”）。</p>
      </Section>

      {/* ───── start ───── */}
      <Section id="start" kicker="开始" title="三分钟开好你的书房" lead="不用下载 App。手机上用浏览器打开，选“添加到主屏幕”，就和 App 一样。">
        <ol className="lp-steps">
          <li className="card pad"><span className="lp-num">1</span><b>注册</b><p>邮箱和密码，或者用邮件里的登录链接。</p></li>
          <li className="card pad"><span className="lp-num">2</span><b>捏一个小人</b><p>选发型、发色、肤色和衣服颜色，再定一个每日目标。</p></li>
          <li className="card pad"><span className="lp-num">3</span><b>把邀请链接发给朋友</b><p>新建自习室，复制链接。朋友点开注册后，他的书桌就出现在你的书房里。</p></li>
        </ol>
        <div className="lp-cta center"><Link href={cta.href} className="btn primary lg">{cta.label}</Link></div>
      </Section>

      {/* ───── faq ───── */}
      <Section id="faq" kicker="问答" title="常见问题" lead="">
        <div className="lp-faq">
          {[
            ["要钱吗？", "免费。"],
            ["谁能看到我的记录？", "只有和你在同一个自习室的人。你可以随时退出自习室，每个人也只能改自己的数据。"],
            ["一个自习室最多几个人？", "12 个。你可以同时加入好几个自习室，比如一个和室友，一个和异地的朋友。"],
            ["我在上海，朋友在纽约，“今天”怎么算？", "各算各的。你的今天按上海的日期，朋友的今天按纽约的日期，所以连续天数和每日目标对两个人都公平。"],
            ["关掉页面，计时会停吗？", "不会。计时记在你的设备上，回来时接着走；朋友那边会一直看到你在专注，直到你点“结束”。"],
            ["忘记点结束怎么办？", "结束时弹出的复盘窗口里可以直接把时长改短；已经保存的记录，也能在“数据”页的记录明细里点“修改”改短。时长只能改短、不能改长，这样记录才有说服力。"],
          ].map(([q, a]) => (
            <details key={q} className="card pad"><summary>{q}</summary><p>{a}</p></details>
          ))}
        </div>
      </Section>

      <Section id="changelog" kicker={`当前版本 v${APP_VERSION}`} title="更新日志" lead="网站更新后，开着的页面会提示刷新；每次大更新后第一次打开，会告诉你这次改了什么。">
        <div className="lp-log">
          {CHANGELOG.map((e) => (
            <div key={e.version} className="card pad">
              <div className="lp-log-head"><span className="lp-kicker">v{e.version}</span><b>{e.title}</b><span className="muted">{e.date}</span></div>
              <ul>{e.items.map((i) => <li key={i}>{i}</li>)}</ul>
            </div>
          ))}
        </div>
      </Section>

      <footer className="lp-foot">
        <span className="logo" style={{ padding: 0 }}><Logo /> 同窗</span>
        <span>v{APP_VERSION} · 像素画为原创绘制 · 字体 Fusion Pixel（SIL OFL 1.1）</span>
        <Link href={cta.href} className="btn primary sm">{cta.label}</Link>
      </footer>
    </div>
  );
}
