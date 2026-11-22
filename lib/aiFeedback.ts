/**
 * R-030 同修 · server only: what Claude gets to read when it writes feedback on a submission.
 * A link to a PDF is passed to Claude by URL (Anthropic fetches it, not our server);
 * a text file on GitHub (Markdown, LaTeX, Python...) is fetched here and put into the prompt.
 * Other links (a repo page, a commit) are only mentioned.
 */
import type Anthropic from "@anthropic-ai/sdk";

const TEXT_EXT = /\.(md|markdown|txt|tex|py|rst|csv|json|ya?ml|toml)$/i;
const TEXT_HOSTS = new Set(["raw.githubusercontent.com", "gist.githubusercontent.com"]);
/** characters of a fetched text file put into the prompt */
export const LINK_TEXT_MAX = 200_000;

/** github.com/o/r/blob/ref/path → raw.githubusercontent.com/o/r/ref/path; anything else unchanged */
export function rawUrl(link: string): URL | null {
  let u: URL;
  try { u = new URL(link.trim()); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const m = u.hostname === "github.com" && u.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
  if (m) return new URL(`https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`);
  return u;
}

export interface LinkContent {
  /** document blocks to put before the prompt text */
  blocks: Anthropic.Beta.BetaContentBlockParam[];
  /** a sentence for the prompt about what was attached */
  note: string | null;
}

export async function readLink(link: string): Promise<LinkContent> {
  const u = link ? rawUrl(link) : null;
  if (!u) return { blocks: [], note: null };
  if (/\.pdf$/i.test(u.pathname)) {
    return {
      blocks: [{ type: "document", source: { type: "url", url: u.toString() }, title: "同学交的报告" }],
      note: "报告的 PDF 附在最前面，请以它为准来看。",
    };
  }
  if (TEXT_HOSTS.has(u.hostname) && TEXT_EXT.test(u.pathname)) {
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(10_000), redirect: "error" });
      if (!res.ok) return { blocks: [], note: `链接里的文件没读到（HTTP ${res.status}，可能是私有仓库）。` };
      const text = await res.text();
      const cut = text.length > LINK_TEXT_MAX;
      return {
        blocks: [{ type: "document", source: { type: "text", media_type: "text/plain", data: cut ? text.slice(0, LINK_TEXT_MAX) : text }, title: u.pathname.split("/").pop() || "报告" }],
        note: cut
          ? `链接里的文件附在最前面；它太长了（${text.length} 字符），只附了前 ${LINK_TEXT_MAX} 个字符，反馈里请说明后面没看到。`
          : "链接里的文件附在最前面，请以它为准来看。",
      };
    } catch {
      return { blocks: [], note: "链接里的文件没读到（超时或打不开）。" };
    }
  }
  return { blocks: [], note: null };
}
