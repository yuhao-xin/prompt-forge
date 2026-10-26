/* PromptForge validate-data.js — 策略库一致性校验
 *
 * 策略库是这个产品的心脏，但它只是一份数据：写错一个槽位名、漏一个默认值，
 * 在 UI 上表现为"内容莫名其妙"，极难排查。所以把一致性校验做成可执行断言，
 * 每次改动数据都跑一遍。
 *
 * 校验项：
 *   A. 每个 section 模板引用的槽位，都能被某个问题的 slot 或 defaults 覆盖
 *   B. 每个问题的 slot 都有对应 defaults 兜底（否则产物出现空白）
 *   C. 每个问题引用的 section 在 variants 中存在（否则该段永不出现）
 *   D. 关键词表不为空、权重为正
 *   E. 各类型 problems/questions id 唯一
 *   F. 体检维度 patterns 可编译
 *
 * 用法：node validate-data.js
 */
(function () {
  "use strict";

  var fs = require("fs");
  var path = require("path");
  global.window = {};
  var code = fs.readFileSync(path.join(__dirname, "data.js"), "utf8");
  eval(code);
  var D = window.PF_DATA;

  var errors = [];
  var warns = [];

  function err(msg) { errors.push(msg); }
  function warn(msg) { warns.push(msg); }

  var allTypes = D.taskTypes.concat([D.general]);
  var sectionIds = Object.keys(D.sections);

  /* 每个 section 模板引用的槽位 */
  var sectionSlots = {};
  sectionIds.forEach(function (sid) {
    var m = D.sections[sid].tpl.match(/\{(\w+)\}/g) || [];
    sectionSlots[sid] = m.map(function (s) { return s.slice(1, -1); });
  });

  allTypes.forEach(function (ty) {
    var prefix = "[" + ty.id + "] ";
    var qids = {};

    /* E. id 唯一 */
    ty.questions.forEach(function (q) {
      if (qids[q.id]) err(prefix + "问题 id 重复：" + q.id);
      qids[q.id] = 1;
      if (!q.text) err(prefix + q.id + " 缺少 text");
      if (!q.slot) err(prefix + q.id + " 缺少 slot");
    });

    /* B. 每个 slot 有 defaults 兜底 */
    ty.questions.forEach(function (q) {
      if (ty.defaults[q.slot] == null) {
        err(prefix + q.id + " 的槽位 `" + q.slot + "` 在 defaults 中没有兜底值");
      }
    });

    /* C-2. 反向：每个问题的 slot 必须被 standard 变体的某个 section 消费，
     * 否则用户回答了却不会出现在产物里（沉默丢失，最隐蔽的一类 bug） */
    if (ty.variants && ty.variants.standard) {
      var consumed = {};
      ty.variants.standard.sections.forEach(function (sid) {
        (sectionSlots[sid] || []).forEach(function (s) { consumed[s] = 1; });
      });
      ty.questions.forEach(function (q) {
        if (!consumed[q.slot]) {
          err(prefix + q.id + " 采集的槽位 `" + q.slot + "` 不在 standard 变体的任何段落里，答案会丢失");
        }
      });
    }

    /* D. 关键词 */
    if (!ty.keywords || !ty.keywords.length) {
      if (ty.id !== "general") err(prefix + "关键词表为空，分接器永远命中不了");
    } else if (ty.id !== "general") {
      ty.keywords.forEach(function (kw) {
        if (!kw.k) err(prefix + "存在空的关键词");
        if (!(kw.w > 0)) err(prefix + "关键词 `" + kw.k + "` 的权重非正数");
      });
    }

    /* A/C. variants 引用的 section 与槽位 */
    ["standard", "rigorous", "minimal"].forEach(function (vname) {
      var v = ty.variants[vname];
      if (!v) { err(prefix + "缺少变体：" + vname); return; }
      v.sections.forEach(function (sid) {
        if (sectionIds.indexOf(sid) < 0) {
          err(prefix + vname + " 引用了不存在的 section：" + sid);
          return;
        }
        sectionSlots[sid].forEach(function (slot) {
          var covered = ty.questions.some(function (q) { return q.slot === slot; })
            || (ty.defaults[slot] != null);
          if (!covered) {
            err(prefix + vname + " 的 section `" + sid + "` 需要槽位 `" + slot + "`，但既没有问题产出它，也没有 defaults");
          }
        });
      });
    });
  });

  /* F. 体检维度正则可编译 */
  D.health.dimensions.forEach(function (dim) {
    if (!dim.patterns || !dim.patterns.length) err("[health] 维度 " + dim.id + " 没有检测模式");
    dim.patterns.forEach(function (p) {
      try { new RegExp(p.source, "gm"); } catch (e) {
        err("[health] 维度 " + dim.id + " 的正则无法编译：" + p.source);
      }
    });
    if (!dim.advice || !dim.advice.length) warn("[health] 维度 " + dim.id + " 没有补强建议");
  });

  /* 输出 */
  if (warns.length) {
    console.log("警告 " + warns.length + " 条：");
    warns.forEach(function (w) { console.log("  - " + w); });
    console.log("");
  }
  if (errors.length) {
    console.log("校验失败，" + errors.length + " 个问题：");
    errors.forEach(function (e) { console.log("  ✗ " + e); });
    process.exit(1);
  }
  console.log("策略库校验通过：" + D.taskTypes.length + " 个任务类型 + 通用兜底，"
    + sectionIds.length + " 个段落模板，" + D.health.dimensions.length + " 个体检维度");
})();
