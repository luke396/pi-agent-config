import assert from "node:assert/strict";
import { test } from "node:test";
import extension, { revealPaths } from "../index.ts";
const show = (s: string) => revealPaths(s, "/home/me/project", "/home/me");
const tick = String.fromCharCode(96);
const suffix = (s: string) => "（" + tick + " " + s + " " + tick + "）";

for (const [name, input, expected] of [
  ["project path and line", "[代码](/home/me/project/src/a.ts:12)", "src/a.ts:12"],
  ["relative path", "[代码](src/a.ts)", "src/a.ts"],
  ["relative filename and line", "[代码](a.ts:12)", "a.ts:12"],
  ["outside project", "[配置](/home/me/.config/pi.json)", "~/.config/pi.json"],
  ["outside home", "[配置](/etc/pi.json)", "/etc/pi.json"],
  ["spaces and parentheses", "[代码](</home/me/project/my (test).ts:8>)", "my (test).ts:8"],
  ["file URI", "[代码](file:///home/me/project/my%20file.ts#L8)", "my file.ts#L8"],
  ["basename hides directory", "[a.ts](/home/me/project/src/a.ts)", "src/a.ts"],
] as const) test(name, () => assert.equal(show(input), input + suffix(expected)));

for (const input of [
  "[网页](https://example.com/a)", "[邮件](mailto:a@example.com)", "[锚点](#section)",
  "[网页](//example.com/a)", "![图片](/tmp/a.png)", "[src/a.ts](/home/me/project/src/a.ts)",
  "[" + tick + "src/a.ts" + tick + "](/home/me/project/src/a.ts)",
  tick + "[代码](src/a.ts)" + tick, tick.repeat(3) + "md\n[代码](src/a.ts)\n" + tick.repeat(3),
  "    [代码](src/a.ts)\n", "[代码](/home/me/project/unfinished", "\\[代码](src/a.ts)",
]) test("preserve " + JSON.stringify(input), () => assert.equal(show(input), input));

test("nested quote, list, code and repeated links keep exact source locations", () => {
  const link = "[代码](src/a.ts)";
  const input = "> - " + tick + link + tick + " and **" + link + "**\n\n" + link;
  assert.equal(show(input), "> - " + tick + link + tick + " and **" + link + suffix("src/a.ts") + "**\n\n" + link + suffix("src/a.ts"));
});
test("reference links", () => assert.equal(show("[代码][a]\n\n[a]: src/a.ts"), "[代码][a]" + suffix("src/a.ts") + "\n\n[a]: src/a.ts"));
test("repeated transformation", () => assert.equal(show(show("[代码](src/a.ts)")), show("[代码](src/a.ts)")));
test("streamed prefixes preserve incomplete targets", () => {
  const input = "[代码](src/a.ts)";
  for (let i = 0; i < input.length; i++) assert.equal(show(input.slice(0, i)), input.slice(0, i));
});
test("extension uses session cwd and leaves user messages unchanged", () => {
  let start: any, transform: any;
  extension({ on: (_: string, fn: any) => { start = fn; }, registerMarkdownTransformer: (fn: any) => { transform = fn; } } as any);
  start({}, { cwd: "/home/me/project" });
  const input = "[代码](/home/me/project/src/a.ts)";
  assert.equal(transform(input, { messageType: "user" }), input);
  for (const isStreaming of [true, false]) assert.equal(transform(input, { messageType: "assistant", isStreaming }), input + suffix("src/a.ts"));
});
