/* PromptForge experience.js — 经验库（跨会话记忆）
 *
 * 这是产品唯一的护城河所在：追问引擎本身谁都能做，但"用得越久越懂你"的数据复利抄不走。
 *
 * 核心模型：把每次锻造中「用户亲答」的画像槽沉淀下来，形成带频次的偏好画像，
 * 下次开炉时预填，并明确标注来源（来自经验），用户可随时改、删、导出。
 *
 * 数据结构：
 *   {
 *     v: 1,
 *     updated_at: ISO string,
 *     forge_count: number,                       // 完成的锻造次数
 *     profiles: {                                // 槽位 -> 取值列表（按频次降序）
 *       audience: [{ value, count, last_at }],
 *       ...
 *     },
 *     types: { writing: 3, planning: 1 }         // 任务类型分布
 *   }
 *
 * 边界原则：
 *   - 只沉淀用户亲答的内容（filled === "user"），推荐默认值不沉淀
 *   - 过长的文本不沉淀（> MAX_VALUE_LEN），避免把整段需求当用户画像
 *   - 频次上限 MAX_VALUES，每个槽位只保留最常用的若干取值
 *   - 任何读写异常都不阻断主流程
 *
 * 零依赖，ES5 风格。
 */
(function () {
  "use strict";

  var D = window.PF_DATA;
  var S = window.PF_STORAGE;
  var KEY = "experience";
  var VERSION = 1;

  /* 值得长期沉淀的画像槽位：这些是"你是谁 / 你给谁做 / 你讨厌什么" */
  var PERSISTENT_SLOTS = ["audience", "style", "format", "constraints", "non_goals", "stack", "venue"];

  var MAX_VALUE_LEN = 200;   // 单条取值长度上限
  var MAX_VALUES = 3;        // 每个槽位保留的取值数量
  var MAX_FORGES = 200;      // 累计锻造次数上限，防止无限增长

  function blank() {
    return { v: VERSION, updated_at: null, forge_count: 0, profiles: {}, types: {} };
  }

  function load() {
    var d = null;
    try { d = S.read(KEY); } catch (e) { }
    if (!d || typeof d !== "object") return blank();
    return migrate(d);
  }

  function migrate(d) {
    var v = d.v || 1;
    while (v < VERSION) { v++; }        // 当前仅 v1；预留逐级迁移位
    d.v = VERSION;
    if (!d.profiles || typeof d.profiles !== "object") d.profiles = {};
    if (!d.types || typeof d.types !== "object") d.types = {};
    if (typeof d.forge_count !== "number" || !isFinite(d.forge_count)) d.forge_count = 0;
    return d;
  }

  function save(d) {
    try {
      d.updated_at = new Date().toISOString();
      return S.write(KEY, d);
    } catch (e) {
      return false;
    }
  }

  /* 从一次完成的锻造中沉淀经验。
   * 只取用户亲答、长度合理的画像槽位；出现次数多的排前面。 */
  function absorbForge(state) {
    if (!state || !state.taskTypeId) return;
    var d = load();
    var changed = false;

    PERSISTENT_SLOTS.forEach(function (slot) {
      if (state.filled[slot] !== "user") return;
      var v = state.slots[slot];
      if (v == null) return;
      v = String(v).trim();
      if (!v || v.length > MAX_VALUE_LEN) return;
      // 排除明显的“随便/占位”类回答
      if (/^(随便|都行|无|没有|不知道|按默认|测试|占位)/.test(v)) return;

      var list = d.profiles[slot] || [];
      var hit = null, i;
      for (i = 0; i < list.length; i++) if (list[i].value === v) { hit = list[i]; break; }
      if (hit) { hit.count++; hit.last_at = new Date().toISOString(); }
      else { list.push({ value: v, count: 1, last_at: new Date().toISOString() }); }

      list.sort(function (a, b) { return b.count - a.count; });
      if (list.length > MAX_VALUES) list = list.slice(0, MAX_VALUES);
      d.profiles[slot] = list;
      changed = true;
    });

    var tid = state.taskTypeId;
    d.types[tid] = (d.types[tid] || 0) + 1;

    if (d.forge_count < MAX_FORGES) d.forge_count++;
    // 低频类型老化清理，避免分布被远古记录长期绑架
    Object.keys(d.types).forEach(function (k) {
      if (d.forge_count >= 30 && d.types[k] <= 1) delete d.types[k];
    });

    save(d);
    return changed;
  }

  /* 为新会话生成预填建议：slot -> { value, count }，只挑频次最高的那个 */
  function suggest(state) {
    var d = load(), out = {};
    if (!d.forge_count) return out;
    PERSISTENT_SLOTS.forEach(function (slot) {
      var list = d.profiles[slot];
      if (!list || !list.length) return;
      if (state && state.slots && state.slots[slot] != null && state.slots[slot] !== "") return;
      out[slot] = { value: list[0].value, count: list[0].count };
    });
    return out;
  }

  /* 经验库摘要，用于展示与管理 */
  function summary() {
    var d = load(), rows = [];
    PERSISTENT_SLOTS.forEach(function (slot) {
      var list = d.profiles[slot] || [];
      if (!list.length) return;
      rows.push({
        slot: slot,
        label: slotLabel(slot),
        values: list.map(function (x) { return { value: x.value, count: x.count }; })
      });
    });
    var types = Object.keys(d.types).map(function (k) {
      return { id: k, name: typeName(k), count: d.types[k] };
    }).sort(function (a, b) { return b.count - a.count; });
    return { forge_count: d.forge_count, updated_at: d.updated_at, rows: rows, types: types };
  }

  function typeName(id) {
    for (var i = 0; i < D.taskTypes.length; i++) if (D.taskTypes[i].id === id) return D.taskTypes[i].name;
    return id === "general" ? "通用任务" : id;
  }

  function slotLabel(slot) {
    var map = {
      audience: "给谁用", style: "语气风格", format: "输出格式",
      constraints: "常用约束", non_goals: "明确不做", stack: "技术栈", venue: "场合"
    };
    return map[slot] || slot;
  }

  function removeValue(slot, value) {
    var d = load();
    var list = d.profiles[slot] || [];
    d.profiles[slot] = list.filter(function (x) { return x.value !== value; });
    if (!d.profiles[slot].length) delete d.profiles[slot];
    save(d);
  }

  function clear() { try { S.remove(KEY); } catch (e) { } }

  function exportJson() {
    return JSON.stringify(load(), null, 2);
  }

  function importJson(text) {
    var d;
    try { d = JSON.parse(text); } catch (e) { return { ok: false, error: "不是合法的 JSON" }; }
    if (!d || typeof d !== "object") return { ok: false, error: "内容不是对象" };
    if (!d.profiles || typeof d.profiles !== "object") return { ok: false, error: "缺少 profiles 字段" };
    var clean = migrate({ v: VERSION, forge_count: 0, profiles: {}, types: {} });
    PERSISTENT_SLOTS.forEach(function (slot) {
      var list = d.profiles[slot];
      if (!Array.isArray(list)) return;
      var kept = [];
      list.forEach(function (x) {
        if (!x || typeof x.value !== "string") return;
        var v = x.value.trim();
        if (!v || v.length > MAX_VALUE_LEN) return;
        kept.push({ value: v, count: typeof x.count === "number" && isFinite(x.count) ? Math.max(1, Math.floor(x.count)) : 1, last_at: x.last_at || new Date().toISOString() });
      });
      kept.sort(function (a, b) { return b.count - a.count; });
      if (kept.length) clean.profiles[slot] = kept.slice(0, MAX_VALUES);
    });
    if (d.types && typeof d.types === "object") {
      Object.keys(d.types).forEach(function (k) {
        var c = Number(d.types[k]);
        if (isFinite(c) && c > 0) clean.types[k] = Math.floor(c);
      });
    }
    clean.forge_count = (typeof d.forge_count === "number" && isFinite(d.forge_count))
      ? Math.min(MAX_FORGES, Math.max(0, Math.floor(d.forge_count))) : 0;
    save(clean);
    return { ok: true };
  }

  window.PF_EXPERIENCE = {
    load: load,
    absorbForge: absorbForge,
    suggest: suggest,
    summary: summary,
    removeValue: removeValue,
    clear: clear,
    exportJson: exportJson,
    importJson: importJson,
    slotLabel: slotLabel,
    PERSISTENT_SLOTS: PERSISTENT_SLOTS
  };
})();
