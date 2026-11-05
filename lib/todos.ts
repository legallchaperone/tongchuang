/** R-025 待办: limits shared by the card, both backends and the database check */
export const TODO_MAX = 80;
/** quick picks (minutes); any whole number of minutes up to TODO_EST_MAX can be typed too */
export const TODO_ESTIMATES = [15, 25, 45, 60, 120] as const;
export const TODO_EST_MAX = 600;
/** the error a backend throws while the todos table does not exist yet (schema.sql not re-run) */
export const TODO_MISSING = "待办还没开通：需要在 Supabase 里重新执行一遍 supabase/schema.sql";
/** "15 分" / "1 小时" / "1 小时 30 分" */
export const estLabel = (min: number) => (min < 60 ? `${min} 分` : min % 60 === 0 ? `${min / 60} 小时` : `${Math.floor(min / 60)} 小时 ${min % 60} 分`);
/** trimmed text, or an error message in plain Chinese */
export function checkTodo(text: string): { text: string; error: string | null } {
  const t = text.trim();
  if (!t) return { text: t, error: "写点要做的事吧" };
  if (Array.from(t).length > TODO_MAX) return { text: t, error: `最多 ${TODO_MAX} 个字` };
  return { text: t, error: null };
}
