"use client";
/* R-011 分享热力图：数据页“一年”卡片上的「分享」按钮 + 预览 sheet（components/ShareSheet） */
import { useCallback, useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { withLive } from "@/lib/stats";
import { renderCard, shareData, type CardTheme } from "@/lib/shareCard";
import { lookOf, shirtOf } from "@/components/Pixel";
import { ShareIcon, ShareSheet } from "@/components/ShareSheet";

/** always shares the signed-in person's own year, whoever the stats page is showing */
export function ShareYearButton() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button className="btn sm share-btn" onClick={() => setOpen(true)} aria-haspopup="dialog"><ShareIcon />分享</button>
      {open && <YearSheet onClose={close} />}
    </>
  );
}

function YearSheet({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const me = app.myProfile!;
  const [now] = useState(() => Date.now());

  const data = useMemo(() => shareData({
    sessions: withLive(app.sessions, me.id, app.live[me.id], me.tz, now),
    subjects: app.subjects.filter((s) => s.userId === me.id),
    tz: me.tz, now, name: me.name, look: lookOf(me), shirt: shirtOf(me),
  }), [app.sessions, app.subjects, app.live, me, now]);
  const render = useCallback((theme: CardTheme) => renderCard(data, theme), [data]);

  return (
    <ShareSheet
      title="分享一年的长势"
      render={render}
      // ASCII name: some browsers drop non-ASCII download names and save a bare "download"
      fileName={`tongchuang-year-${data.to}.png`}
      shareTitle="我的一年 · 同窗"
      alt={`${data.name === "我" ? "我" : data.name}最近一年的学习热力图卡片`}
      tip="只包含你自己的数据。手机上也可以长按图片保存。"
      onClose={onClose}
    />
  );
}
