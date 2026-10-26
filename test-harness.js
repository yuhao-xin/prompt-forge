/* test-harness.js — 用 DOM 桩在 Node 里完整跑一遍 PromptForge 主链路 */
"use strict";

/* ---------- DOM 桩 ---------- */
function makeEl(tag) {
  var e = {
    tagName: tag || "div", children: [], style: {}, attrs: {},
    value: "", _text: "", innerHTML: "", className: "", disabled: false,
    placeholder: "", scrollTop: 0, _isOpts: false,
    classList: {
      _s: {},
      add: function (c) { this._s[c] = 1; },
      remove: function (c) { delete this._s[c]; },
      toggle: function (c, f) { if (f === undefined) f = !this._s[c]; if (f) this._s[c] = 1; else delete this._s[c]; },
      contains: function (c) { return !!this._s[c]; }
    },
    appendChild: function (c) { this.children.push(c); return c; },
    removeChild: function (c) { var i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
    querySelector: function (sel) {
      var cls = sel.replace(".", "");
      for (var i = 0; i < this.children.length; i++) {
        var names = (this.children[i].className || "").split(" ");
        if (names.indexOf(cls) >= 0) return this.children[i];
      }
      return null;
    },
    querySelectorAll: function () { return []; },
    addEventListener: function () { },
    setAttribute: function (k, v) { this.attrs[k] = v; },
    getAttribute: function (k) { return this.attrs[k]; },
    focus: function () { },
    click: function () { if (this.onclick) this.onclick(); }
  };
  Object.defineProperty(e, "lastChild", {
    get: function () { return this.children.length ? this.children[this.children.length - 1] : null; }
  });
  Object.defineProperty(e, "textContent", {
    get: function () { return this._text; },
    set: function (v) { this._text = v == null ? "" : String(v); }
  });
  return e;
}

var registry = {};
global.document = {
  getElementById: function (id) { if (!registry[id]) registry[id] = makeEl(); return registry[id]; },
  createElement: function (t) { return makeEl(t); },
  createTextNode: function (t) { var e = makeEl("#text"); e.textContent = t; return e; },
  querySelectorAll: function () { return []; },
  execCommand: function () { return true; },
  body: makeEl("body")
};
Object.defineProperty(global, "navigator", {
  value: { clipboard: { writeText: function (t) { global.__copied = t; return Promise.resolve(); } } },
  configurable: true, writable: true
});
global.localStorage = {
  _s: {},
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
  setItem: function (k, v) { this._s[k] = String(v); },
  removeItem: function (k) { delete this._s[k]; }
};
var downloads = [];
global.Blob = function (parts, opts) { this.parts = parts; this.opts = opts; };
/* 注意：只打补丁，不覆盖全局 URL 构造函数（文件代理层依赖它） */
URL.createObjectURL = function (b) { global.__lastBlob = b; return "blob:stub"; };
URL.revokeObjectURL = function () { };
global.__downloads = downloads;
var origCreate = document.createElement.bind(document);
document.createElement = function (t) {
  var e = origCreate(t);
  if (t === "a") {
    e.click = function () { downloads.push({ name: e.download, href: e.href, blob: global.__lastBlob }); };
  }
  return e;
};

/* ---------- 加载被测应用（fs + eval，规避沙箱 require 代理） ---------- */
var fs = require("fs");
var path = require("path");
global.window = {};
window.localStorage = global.localStorage;
function loadApp(file) {
  var code = fs.readFileSync(path.join(__dirname, file), "utf8");
  eval(code);
}
loadApp("data.js");
var D = window.PF_DATA;
loadApp("storage.js");
loadApp("experience.js");
loadApp("app.js");

/* ---------- 探针 ---------- */
function ls() { try { return JSON.parse(localStorage.getItem("promptforge.session") || "{}"); } catch (e) { return {}; } }
function walk(node, fn) {
  node.children.forEach(function (c) { fn(c); walk(c, fn); });
}
function activeOptionButtons() {
  var out = [];
  walk(registry["chat-list"], function (e) {
    if ((e.className || "").split(" ").indexOf("opt-btn") >= 0 && typeof e.onclick === "function" && !e.disabled) out.push(e);
  });
  return out;
}
function quickButtons() {
  var out = [];
  walk(registry["quick-actions"], function (e) {
    if ((e.className || "").split(" ").indexOf("opt-btn") >= 0 && typeof e.onclick === "function") out.push(e);
  });
  return out;
}
function submit(text) {
  registry["chat-input"].value = text;
  registry["chat-send"].onclick();
}
function lastBotText() {
  var msgs = ls().log || [];
  for (var i = msgs.length - 1; i >= 0; i--) if (msgs[i].who === "bot") return msgs[i].text;
  return "";
}

/* ---------- 场景 1：正常主链路（选项全点第一个） ---------- */
console.log("=== 场景1：写入职指南（应路由到 内容写作）===");
submit("帮我写一篇给新员工的入职指南");
var s = ls();
console.log("路由结果:", s.taskTypeId, "| 阶段:", s.stage);
if (s.taskTypeId !== "writing") { console.log("!! 路由错误"); process.exit(1); }

var guard = 0;
while (ls().stage === "clarify" && guard++ < 30) {
  var btns = activeOptionButtons().filter(function (b) { return b.textContent.indexOf("其他") < 0; });
  if (btns.length) { btns[0].onclick(); }
  else { submit("测试输入：这是自由文本答案"); }
}
// 验收用例环节（生成后、自检前）
if (ls().stage === "forge" && !ls().acceptanceDone) {
  console.log("[验收环节]", lastBotText().slice(0, 44));
  submit("拿我上周那篇 3000 字的初稿去试");
}
s = ls();
console.log("追问后阶段:", s.stage, "| 已回答槽位:", Object.keys(s.filled || {}).length);
if (s.stage !== "review") { console.log("!! 未进入评测阶段"); process.exit(1); }
console.log("生成消息:", lastBotText().slice(0, 60));

/* ---------- 场景 2：GSB 差评 → 重写模块 ---------- */
console.log("\n=== 场景2：差评闭环 ===");
var before = (ls().slots || {}).constraints || "";
quickButtons().filter(function (b) { return b.textContent.indexOf("不行") >= 0; })[0].onclick();
var reasonBtns = activeOptionButtons().filter(function (b) { return b.textContent.indexOf("角色") >= 0; });
if (reasonBtns.length) reasonBtns[0].onclick();
var after = (ls().slots || {}).role || "";
console.log("角色模块重写前长度:", before.length, "→ 重写后角色长度:", after.length);
if (after.length <= 0) { console.log("!! 重写未生效"); process.exit(1); }

/* ---------- 场景3：换一版 ---------- */
console.log("\n=== 场景3：换一版 ===");
var v0 = ls().variant;
quickButtons().filter(function (b) { return b.textContent.indexOf("换一版") >= 0; })[0].onclick();
console.log("变体:", v0, "→", ls().variant);
if (ls().variant === v0) { console.log("!! 变体未切换"); process.exit(1); }

/* ---------- 场景4：导出 ---------- */
console.log("\n=== 场景4：导出 ===");
registry["btn-export-md"].onclick();
registry["btn-export-json"].onclick();
console.log("下载文件:", downloads.map(function (d) { return d.name; }).join(", "));
if (downloads.length < 2) { console.log("!! 导出缺失"); process.exit(1); }
var md = downloads[0];
console.log("MD 大小:", md.blob.parts[0].length, "字符 | JSON 大小:", downloads[1].blob.parts[0].length, "字符");
console.log("MD 开头:", md.blob.parts[0].slice(0, 80).replace(/\n/g, " / "));

/* ---------- 场景5：体检模式 ---------- */
console.log("\n=== 场景5：体检模式 ===");
var hi = document.getElementById("health-input");
hi.value = "你是一个助手。帮我写一篇文章。";
document.getElementById("btn-health-run").onclick();
var hr = document.getElementById("health-result");
console.log("体检结果渲染:", hr.children.length > 0 ? "OK" : "!! 空");
var txt = JSON.stringify(hr);
console.log("含分数:", txt.indexOf("health-score-line") >= 0 || txt.indexOf("/ 10") >= 0 ? "OK" : "!! 缺分数");
console.log("含维度行:", (txt.match(/dim-row/g) || []).length, "个");

/* ---------- 场景6：刷新恢复 ---------- */
console.log("\n=== 场景6：刷新恢复 ===");
loadApp("app.js");
var s = ls();
console.log("恢复后阶段:", s.stage, "| 类型:", s.taskTypeId, "| 历史消息数:", (s.log || []).length);
if (s.stage !== "review" && s.stage !== "deliver") { console.log("!! 恢复异常"); process.exit(1); }

/* ---------- 场景7：路由回归（7 类型 + 边界） ---------- */
console.log("\n=== 场景7：路由回归 ===");
var cases = [
  ["帮我写一篇给新员工的入职指南", "writing"],
  ["写个 Python 脚本批量重命名文件", "coding"],
  ["分析这份销售数据，找出下滑原因", "data"],
  ["帮我把论文摘要改成投稿版的 cover letter", "academic"],
  ["讲讲这个知识点怎么理解", "study"],
  ["画一张夜空下的图书馆海报", "image"],
  ["帮我整理文件夹，重复劳动自动化", "automate"],
  ["今天天气怎么样", "general"],
  ["写个脚本分析数据", "ambiguous"]
];
function classifyOnly(text) {
  var t = text.toLowerCase(), results = [];
  D.taskTypes.forEach(function (ty) {
    var score = 0;
    ty.keywords.forEach(function (kw) { if (t.indexOf(kw.k.toLowerCase()) >= 0) score += kw.w; });
    results.push({ id: ty.id, score: score });
  });
  results.sort(function (a, b) { return b.score - a.score; });
  var best = results[0], second = results[1];
  if (best.score >= 3 && (!second || best.score - second.score >= 2)) return best.id;
  if (best.score >= 2 && (!second || second.score === 0)) return best.id;
  if (best.score >= 2 && second && second.score >= 1) return "ambiguous";
  return "general";
}
var pass = 0;
cases.forEach(function (c) {
  var got = classifyOnly(c[0]);
  var ok = got === c[1];
  if (ok) pass++;
  console.log((ok ? "PASS" : "FAIL"), JSON.stringify(c[0]), "→", got, ok ? "" : "(期望 " + c[1] + ")");
});
console.log("路由通过率:", pass + "/" + cases.length);

/* ---------- 场景8：经验库沉淀与预填 ---------- */
console.log("\n=== 场景8：经验库沉淀与预填 ===");
var exp = window.PF_EXPERIENCE.load();
console.log("累计锻造:", exp.forge_count,
  "| 画像槽:", Object.keys(exp.profiles).join(",") || "（无）",
  "| 类型分布:", JSON.stringify(exp.types));
if (!exp.forge_count) { console.log("!! 经验库未沉淀"); process.exit(1); }

var sug = window.PF_EXPERIENCE.suggest({ slots: {} });
var sugKeys = Object.keys(sug);
console.log("预填建议槽位:", sugKeys.join(",") || "（无）");
sugKeys.forEach(function (k) {
  console.log("   " + k + " → " + String(sug[k].value).slice(0, 40) + "（" + sug[k].count + " 次）");
});

var sum = window.PF_EXPERIENCE.summary();
console.log("摘要行数:", sum.rows.length, "| 类型数:", sum.types.length);

/* 导出/导入往返 */
var expJson = window.PF_EXPERIENCE.exportJson();
var imp = window.PF_EXPERIENCE.importJson(expJson);
console.log("经验库导入往返:", imp.ok ? "OK" : "!! 失败 " + imp.error);
if (!imp.ok) process.exit(1);
var badImp = window.PF_EXPERIENCE.importJson("{oops");
console.log("非法 JSON 被拒绝:", badImp.ok ? "!! 未拒绝" : "OK");
if (badImp.ok) process.exit(1);

console.log("\n全部场景执行完毕。");
