// R-030 同修: Claude writes feedback on a submission by itself.
// The learner's page calls this right after handing in with “请 Claude 帮我看看”. It answers at once and keeps working
// in the background; the feedback is written into submission_feedback, which reaches the learner through realtime.
// Needs ANTHROPIC_API_KEY and SUPABASE_SERVICE_ROLE_KEY on the server. Without them the request simply waits
// in the developers' queue (/tongxiu/staff), as before.
import Anthropic from "@anthropic-ai/sdk";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { getCourse } from "@/lib/courses";
import { feedbackPrompt, starStates } from "@/lib/tongxiu";
import { readLink } from "@/lib/aiFeedback";
import { toTestResults } from "@/lib/backend/supabase";

export const dynamic = "force-dynamic";
/** seconds; the Claude call runs after the response, inside this limit */
export const maxDuration = 60;

const MODEL = "claude-opus-5-5";
/** automatic feedback per submission, and per person per day */
const PER_SUBMISSION = 3;
const PER_DAY = 10;

const json = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !service || !process.env.ANTHROPIC_API_KEY) return json({ status: "disabled" }, 503);

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { submissionId } = (await req.json().catch(() => ({}))) as { submissionId?: string };
  if (!token || !submissionId) return json({ status: "error", message: "缺少登录信息或提交编号" }, 400);

  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: who } = await db.auth.getUser(token);
  const me = who?.user?.id;
  if (!me) return json({ status: "error", message: "登录已过期，刷新页面再试" }, 401);

  const { data: sub } = await db.from("submissions").select("*").eq("id", submissionId).maybeSingle();
  if (!sub || sub.user_id !== me) return json({ status: "error", message: "找不到这份提交" }, 404);
  if (!sub.feedback_requested_at) return json({ status: "error", message: "这份提交没有请求反馈" }, 400);

  // limits: a few rounds per submission, and a daily cap per person
  const [{ count: perSub }, { count: perDay }] = await Promise.all([
    db.from("submission_feedback").select("id", { count: "exact", head: true }).eq("submission_id", submissionId).eq("source", "ai"),
    db.from("submission_feedback").select("id", { count: "exact", head: true }).eq("user_id", me).eq("source", "ai")
      .gte("created_at", new Date(Date.now() - 86_400_000).toISOString()),
  ]);
  if ((perSub ?? 0) >= PER_SUBMISSION || (perDay ?? 0) >= PER_DAY) return json({ status: "limit" });

  after(() => writeFeedback(db, sub).catch((e) => console.error("tongxiu ai feedback", submissionId, e)));
  return json({ status: "started" }, 202);
}

async function writeFeedback(db: SupabaseClient, sub: any) {
  const [{ data: detail }, { data: cohort }, { data: tr }, { data: prof }] = await Promise.all([
    db.from("submission_details").select("*").eq("submission_id", sub.id).maybeSingle(),
    db.from("cohorts").select("*").eq("id", sub.cohort_id).maybeSingle(),
    db.from("test_results").select("*").eq("cohort_id", sub.cohort_id).eq("user_id", sub.user_id).maybeSingle(),
    db.from("profiles").select("name").eq("id", sub.user_id).maybeSingle(),
  ]);
  const course = cohort ? getCourse((cohort as any).course_id) : null;
  const m = course?.milestones.find((x) => x.id === sub.milestone_id);
  if (!course || !m) return;

  const link = (detail as any)?.link || "";
  const attached = await readLink(link);
  const stars = m.stars?.length ? starStates(m, tr ? toTestResults(tr) : undefined) : [];
  const extra = [
    ...(stars.length ? [`星星（官方测试自动判定）：亮了 ${stars.filter((x) => x.lit).length}/${stars.length}。没亮的：${stars.filter((x) => !x.lit).map((x) => x.star.label).join("、") || "无"}。`] : []),
    ...(attached.note ? [attached.note] : []),
  ];
  const tests = sub.tests_total ? `通过 ${sub.tests_passed ?? 0}/${sub.tests_total}` : "";
  const prompt = feedbackPrompt({
    course, m, learner: (prof as any)?.name || "这位同学", tests, metric: sub.metric != null ? String(sub.metric) : "",
    link, note: (detail as any)?.note || "", extra,
  });

  const client = new Anthropic();
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content: [...attached.blocks, { type: "text", text: prompt }] }],
  });
  if (res.stop_reason === "refusal") { console.warn("tongxiu ai feedback refused", sub.id, res.stop_details); return; }
  const text = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
  if (!text) return;

  const { error } = await db.from("submission_feedback").insert({
    submission_id: sub.id, user_id: sub.user_id, author_id: null, source: "ai", model: res.model, text: text.slice(0, 20000),
  } as any);
  if (error) console.error("tongxiu ai feedback insert", sub.id, error.message);
}
