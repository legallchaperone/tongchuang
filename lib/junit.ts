/**
 * R-030: read pytest's --junitxml output into { "tests/test_model.py::test_rope": true, ... }.
 * Skipped tests are left out; a failure or an error counts as not passed. No XML library: pytest's output is regular.
 */
const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

function attrs(src: string) {
  const out: Record<string, string> = {};
  for (const m of src.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = unescape(m[2]);
  return out;
}

export function parseJunit(xml: string): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  const re = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
  for (const m of xml.matchAll(re)) {
    const a = attrs(m[1]);
    const body = m[2] || "";
    if (/<skipped\b/.test(body)) continue;
    const name = a.name || "";
    if (!name) continue;
    // pytest writes classname "tests.test_model" (or "tests.test_model.TestX"); newer versions may add file="tests/test_model.py"
    let file = a.file || "";
    if (!file && a.classname) {
      const parts = a.classname.split(".");
      const i = parts.findIndex((p) => p.startsWith("test_") || p.endsWith("_test"));
      file = (i >= 0 ? parts.slice(0, i + 1) : parts).join("/") + ".py";
    }
    out[`${file}::${name}`] = !/<(failure|error)\b/.test(body);
  }
  return out;
}
