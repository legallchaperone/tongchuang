/** R-020 留言板: limits shared by the board, both backends and the database check */
export const GB_MAX_TEXT = 60;
/** the error a backend throws while the guestbook table does not exist yet (schema.sql not re-run) */
export const GB_MISSING = "留言板还没开通：需要在 Supabase 里重新执行一遍 supabase/schema.sql（R-020 部分）";
/** characters as the database counts them (code points), so an emoji is not two */
export const gbLength = (s: string) => Array.from(s).length;

/** trimmed text, or an error message in plain Chinese */
export function checkGuestbook(text: string, sticker: string | null): { text: string; error: string | null } {
  const t = text.trim();
  if (!t && !sticker) return { text: t, error: "写句话或者选张贴纸吧" };
  if (gbLength(t) > GB_MAX_TEXT) return { text: t, error: `最多 ${GB_MAX_TEXT} 个字` };
  return { text: t, error: null };
}
