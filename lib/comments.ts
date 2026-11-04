/** R-024 自习记录评论: limits shared by the feed, both backends and the database check */
export const COMMENT_MAX = 100;
/** the error a backend throws while the session_comments table does not exist yet (schema.sql not re-run) */
export const COMMENT_MISSING = "评论还没开通：需要在 Supabase 里重新执行一遍 supabase/schema.sql";
/** trimmed text, or an error message in plain Chinese */
export function checkComment(text: string): { text: string; error: string | null } {
  const t = text.trim();
  if (!t) return { text: t, error: "写句话吧" };
  if (Array.from(t).length > COMMENT_MAX) return { text: t, error: `最多 ${COMMENT_MAX} 个字` };
  return { text: t, error: null };
}
