// Lets `node --test` load the app's TypeScript sources: Node 22 strips the types, and this resolves
// extensionless relative imports ("./clock") to .ts files the way the Next.js bundler does.
// Usage: node --import ./scripts/test-ts-hooks.mjs --test lib/*.test.mjs
import { register } from "node:module";
register("data:text/javascript," + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    try { return await next(spec, ctx); }
    catch (e) {
      if ((spec.startsWith("./") || spec.startsWith("../")) && !/\\.[cm]?[jt]sx?$/.test(spec)) {
        for (const ext of [".ts", ".tsx"]) { try { return await next(spec + ext, ctx); } catch {} }
      }
      throw e;
    }
  }
`));
