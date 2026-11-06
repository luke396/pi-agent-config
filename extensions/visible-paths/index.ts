import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { fromMarkdown } from "mdast-util-from-markdown";
import type { Nodes } from "mdast";

function displayPath(target: string, cwd: string, home: string): string | undefined {
  if (!target || target.startsWith("#") || target.startsWith("//")) return;
  let path = target;
  if (target.startsWith("file:")) {
    try {
      const url = new URL(target);
      path = fileURLToPath(url) + url.hash;
    } catch { return; }
  } else {
    // A line suffix is part of a path, not a URI scheme.
    if (/^[a-z][a-z\d+.-]*:/i.test(target) && !/^[^/]+:\d+(?::\d+)?$/.test(target)) return;
    try { path = decodeURIComponent(path); } catch { /* Keep literal percent signs. */ }
  }
  if (/[\x00-\x1f\x7f]/.test(path)) return;
  const absolute = resolve(cwd, path.startsWith("~/") ? home + path.slice(1) : path);
  const local = relative(cwd, absolute);
  if (local !== ".." && !local.startsWith(".." + sep) && !local.startsWith(sep)) return local || ".";
  const fromHome = relative(home, absolute);
  return fromHome !== ".." && !fromHome.startsWith(".." + sep) && !fromHome.startsWith(sep)
    ? "~/" + fromHome : absolute;
}

function codeSpan(text: string): string {
  const fence = "`".repeat(Math.max(0, ...(text.match(/`+/g) ?? []).map(s => s.length)) + 1);
  return fence + " " + text + " " + fence;
}

export function revealPaths(markdown: string, cwd: string, home = homedir()): string {
  if (!markdown.includes("[")) return markdown;
  const tree = fromMarkdown(markdown);
  const definitions = new Map<string, string>();
  const additions: { offset: number; text: string }[] = [];
  function visit(node: Nodes, fn: (node: Nodes) => void) {
    fn(node);
    if ("children" in node) for (const child of node.children) visit(child, fn);
  }
  visit(tree, node => {
    if (node.type === "definition" && !definitions.has(node.identifier)) definitions.set(node.identifier, node.url);
  });
  visit(tree, node => {
    if (node.type !== "link" && node.type !== "linkReference") return;
    const target = node.type === "link" ? node.url : definitions.get(node.identifier);
    if (!target) return;
    const path = displayPath(target, cwd, home);
    const end = node.position?.end.offset;
    if (!path || end === undefined) return;
    let label = "";
    visit(node, child => {
      if (child.type === "text" || child.type === "inlineCode") label += child.value;
    });
    // Only suppress a complete visible path; a basename can hide its directory.
    if (label === path || label === target) return;
    const suffix = "（" + codeSpan(path) + "）";
    if (!markdown.startsWith(suffix, end)) additions.push({ offset: end, text: suffix });
  });
  for (const { offset, text } of additions.sort((a, b) => b.offset - a.offset)) {
    markdown = markdown.slice(0, offset) + text + markdown.slice(offset);
  }
  return markdown;
}

export default function (pi: ExtensionAPI) {
  let cwd = process.cwd();
  pi.on("session_start", (_event, ctx) => { cwd = ctx.cwd; });
  pi.registerMarkdownTransformer((markdown, context) =>
    context.messageType === "user" ? markdown : revealPaths(markdown, cwd));
}
