/* eval-runner.js — 用语义化答案模拟真实用户，跑三个场景并导出产物，供独立评估 */
"use strict";

/* ---------- DOM 桩（与 test-harness 相同） ---------- */
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
  removeItem: function (k) { delete this._s[k]; },
  clear: function () { this._s = {}; }
};
var downloads = [];
global.Blob = function (parts, opts) { this.parts = parts; this.opts = opts; };
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

/* ---------- 加载被测应用 ---------- */
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
function walk(node, fn) { node.children.forEach(function (c) { fn(c); walk(c, fn); }); }
function activeOptionButtons() {
  var out = [];
  walk(registry["chat-list"], function (e) {
    if ((e.className || "").split(" ").indexOf("opt-btn") >= 0 && typeof e.onclick === "function" && !e.disabled) out.push(e);
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

/* ---------- 场景定义：语义化答案（按 slot） ---------- */
/* pick: 点包含该文字的选项按钮；text: 以自由文本回答 */
var SCENARIOS = [
  {
    name: "论文阅读",
    pickType: "学术",
    need: "帮我读一篇 Nature Biomedical Engineering 的论文，弄清楚它解决了什么问题、方法靠不靠谱、对我的课题有什么启发",
    answers: {
      done: { pick: "组会汇报" },
      non_goals: { pick: "不编造文献" },
      venue: { text: "文献汇报用，听众是同方向博士生；我的课题是柔性传感器用于术后康复监测" },
      format: { pick: "结构化文献阅读笔记" },
      inputs: { text: "论文 PDF 全文，约 12 页，材料学+器件+动物实验" },
      constraints: { text: "每个论断标注出自论文哪个章节/图表；区分「作者原话」「你的推断」；不确定就写 [需核实]" }
    },
    acceptance: "拿 Kim 2023 那篇 Nature BME 的柔性传感器论文 PDF 去试，看它能不能指出对照组设计的漏洞"
  },
  {
    name: "代码生成",
    pickType: "代码",
    need: "用 Python 写一个脚本，把实验室仪器导出的 CSV 光谱数据批量转成 Excel，每张谱图单独一个 sheet，再画一张叠加对比图",
    answers: {
      done: { pick: "边界" },
      non_goals: { pick: "不要过度设计" },
      stack: { pick: "Python" },
      audience: { pick: "只有我自己" },
      format: { pick: "完整可运行的单文件" },
      inputs: { text: "CSV 两列：波长(nm)、吸光度；文件名即样品编号（S01.csv…S200.csv）；编码 GBK；部分文件尾部有空行" },
      examples: { text: "输入 data/S01.csv → 输出 spectra.xlsx（每样品一个 sheet，含波长-吸光度两列）+ overlay.png（全样品叠加图，图例为样品编号）" }
    },
    acceptance: "拿 data/S01.csv 和 S02.csv 两个真实文件跑一遍，确认能生成 xlsx 和叠加图且图例正确"
  },
  {
    name: "复杂任务分解",
    pickType: "通用",
    need: "我要在三个月内完成一篇综述投稿，帮我把这个复杂任务分解成可执行的周计划",
    answers: {
      done: { text: "每周计划具体到可直接执行：有明确任务、交付物、完成标准；总计划覆盖文献调研-结构搭建-写作-修改-投稿全链路" },
      non_goals: { text: "不要「多读文献、多思考」这类空话；不要塞和学习冲突的日程；不要假设我周末全天有空" },
      inputs: { text: "主题：柔性电子在术后康复监测中的应用；目标期刊 Biosensors & Bioelectronics（IF≈5.8）；已有约 40 篇文献笔记，综述类型：叙述性综述" },
      constraints: { text: "每周可投入约 20 小时；12 月中旬要交开题报告；周末有一天必须进实验室做实验" },
      format: { pick: "按周分解的表格" },
      risks: { text: "连续两周没完成周交付物就砍文献范围；导师反馈要返工，后续周顺延；实验数据不及预期就把案例部分换成仿真" },
      examples: { text: "第 1 周：精读 5 篇综述，产出主题地图（1 张手绘/软件图）；第 2 周：定大纲并给导师过目……" }
    },
    acceptance: "拿第 1 周的计划去真实执行一周，看交付物是否真的在 20 小时内做得完"
  }
];

/* ---------- 执行器 ---------- */
function runScenario(sc, opts) {
  opts = opts || {};
  console.log("\n" + "=".repeat(72));
  console.log("【场景】" + sc.name + (opts.suffix ? "（" + opts.suffix + "）" : ""));
  console.log("需求：" + sc.need);
  console.log("=".repeat(72));

  localStorage.clear();
  loadApp("app.js");

  if (opts.forceGeneral) {
    // 评估手段：屏蔽 academic 关键词，让该需求走通用兜底分支
    D.taskTypes.forEach(function (t) { if (t.id === "academic") t.keywords = []; });
  }

  submit(sc.need);
  var s = ls();
  console.log("\n[路由] → " + s.taskTypeId + " | 阶段：" + s.stage);

  var guard = 0, trace = [], consumed = [];
  while (guard++ < 30) {
    var stage = ls().stage;
    if (stage === "intake") {
      // 多意图确认：应用主动问用户选哪个类型
      var typeBtns = activeOptionButtons();
      var typeTarget = (typeBtns.filter(function (b) { return b.textContent.indexOf(sc.pickType) >= 0; })[0]) || typeBtns[0];
      console.log("  [多意图确认] 选项：" + typeBtns.map(function (b) { return b.textContent; }).join(" | "));
      console.log("  [多意图确认] 用户选择：" + typeTarget.textContent);
      trace.push({ q: "（分接器拿不准，问用户）", picked: "选择「" + typeTarget.textContent + "」" });
      typeTarget.onclick();
      continue;
    }
    if (stage !== "clarify") break;

    var qText = lastBotText();
    var allBtns = activeOptionButtons();
    // 按 answers 表顺序找下一个未消费的答案
    var key = Object.keys(sc.answers).filter(function (k) { return consumed.indexOf(k) < 0; })[0];
    var a = key ? sc.answers[key] : null;
    var picked = "";
    if (a && a.pick) {
      var m = allBtns.filter(function (b) { return b.textContent.indexOf(a.pick) >= 0; })[0];
      if (m) {
        picked = key + " → 选项「" + m.textContent + "」";
        m.onclick();
        if (m.textContent.indexOf("其他") >= 0 && a.text) {
          submit(a.text);
          picked += " + 补充「" + a.text.slice(0, 24) + "…」";
        }
      } else {
        m = allBtns[0];
        picked = key + " → ⚠️未匹配「" + a.pick + "」，退选「" + (m ? m.textContent : "?") + "」";
        if (m) m.onclick();
      }
    } else if (a && a.text) {
      picked = key + " → 文本「" + a.text.slice(0, 30) + (a.text.length > 30 ? "…" : "") + "」";
      submit(a.text);
    } else {
      picked = key + " → ⚠️无预设答案，输入占位文本";
      submit("（评估占位：按默认推荐来）");
    }
    if (key) consumed.push(key);
    trace.push({ q: qText, picked: picked });
    console.log("  Q" + (trace.length) + ": " + qText.replace(/（可跳过）/, "").slice(0, 46));
    console.log("    答: " + picked);
  }

  // 验收用例环节（生成后、自检前）
  if (ls().stage === "forge" && !ls().acceptanceDone) {
    var accText = sc.acceptance || "拿一个真实、有代表性的输入去试";
    console.log("  [验收] " + accText);
    submit(accText);
  }

  s = ls();
  console.log("\n[流程结果] 阶段：" + s.stage + " | 类型：" + s.taskTypeId + " | 变体：" + s.variant);
  var filled = s.filled || {};
  var userCount = 0, defCount = 0;
  Object.keys(filled).forEach(function (k) { if (filled[k] === "user") userCount++; else defCount++; });
  console.log("[槽位] 用户作答 " + userCount + " 个 / 推荐值兜底 " + defCount + " 个");

  // 自检分数
  var msgs = s.log || [];
  for (var i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].who === "bot" && /自检跑完/.test(msgs[i].text)) {
      console.log("[自检] " + msgs[i].text);
      break;
    }
  }

  // 导出产物
  downloads.length = 0;
  registry["btn-export-md"].onclick();
  var md = downloads[0];
  console.log("\n[产物] " + md.name + "（" + md.blob.parts[0].length + " 字符）");
  return { state: s, md: md ? md.blob.parts[0] : "", trace: trace };
}

var results = {};
SCENARIOS.forEach(function (sc) { results[sc.name] = runScenario(sc); });

/* 场景3对照：屏蔽 academic 关键词后走通用兜底，评估「正确路由」下的产物 */
var sc3 = SCENARIOS[2];
results[sc3.name + "（走通用兜底）"] = runScenario(sc3, { forceGeneral: true, suffix: "对照：屏蔽 academic 关键词，强制走通用兜底" });

/* ---------- 汇总 ---------- */
console.log("\n\n" + "#".repeat(72));
console.log("# 三场景汇总");
console.log("#".repeat(72));
var outDir = path.join(__dirname, "eval-output");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
Object.keys(results).forEach(function (k) {
  var r = results[k];
  var lines = r.md.split("\n");
  var file = path.join(outDir, k.replace(/[（）]/g, "") + ".md");
  fs.writeFileSync(file, r.md, "utf8");
  console.log("\n--- " + k + " ---");
  console.log("路由: " + r.state.taskTypeId + " | 追问轮数: " + r.trace.length + " | 产物长度: " + r.md.length + " 字符 | 存档: " + file);
});
console.log("\n完成。");
