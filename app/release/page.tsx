import type { Metadata } from "next";
import { Landing } from "./Landing";

export const metadata: Metadata = {
  title: "同窗 · 隔着时差，也坐在同一张书桌旁",
  description: "和朋友一起专注学习的像素风自习室：实时看到彼此在学什么、学了多久，每个人的今天按自己的时区算。免费，网页即开即用。",
  openGraph: {
    title: "同窗 · 跨时区自习室",
    description: "你的像素小人替你坐在书桌前。番茄钟、一句话复盘、每日目标和一年的学习记录。",
    type: "website",
  },
};

export default function ReleasePage() {
  return <Landing />;
}
