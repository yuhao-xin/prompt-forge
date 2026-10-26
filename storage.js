/* PromptForge storage.js — 持久化抽象层
 *
 * 设计目标：让上层完全不必关心 localStorage 是否存在、是否写满、数据是否损坏。
 * 四道防线：
 *   1. 能力探测   —— 隐私模式 / 禁用 Cookie 时自动降级为内存存储，功能不中断
 *   2. 损坏自愈   —— JSON 解析失败时丢弃脏数据并返回 null，不让脏数据污染状态机
 *   3. 容量保护   —— 超过单键上限时先裁剪会话日志再重试，仍失败则降级内存
 *   4. 命名空间   —— 统一前缀，避免与其他同源页面互相踩踏
 *
 * 零依赖，ES5 风格。
 */
(function () {
  "use strict";

  var PREFIX = "promptforge.";
  var MAX_BYTES = 2 * 1024 * 1024;   // 单键 2MB 上限（浏览器普遍配额 5MB/源）
  var LOG_KEEP = 60;                  // 裁剪时保留的会话日志条数

  var memory = {};        // 降级存储
  var persistent = probe();

  function probe() {
    try {
      var k = PREFIX + "__probe__";
      window.localStorage.setItem(k, "1");
      window.localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* 读取：解析失败视为数据损坏，清除后返回 null（自愈） */
  function read(key) {
    var raw;
    try {
      raw = persistent ? window.localStorage.getItem(PREFIX + key) : memory[key];
    } catch (e) {
      return null;
    }
    if (raw == null || raw === "") return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      remove(key);
      return null;
    }
  }

  /* 写入：返回 true 表示已持久化，false 表示降级到内存（上层可据此提示用户） */
  function write(key, value) {
    var raw;
    try {
      raw = JSON.stringify(value);
    } catch (e) {
      return false;
    }
    if (!persistent) { memory[key] = raw; return false; }

    if (raw.length > MAX_BYTES) {
      var trimmed = trim(value);
      try { raw = JSON.stringify(trimmed); } catch (e) { raw = null; }
      if (!raw) return false;
      value = trimmed;
    }

    try {
      window.localStorage.setItem(PREFIX + key, raw);
      return true;
    } catch (e) {
      // QuotaExceededError：整体降级为内存，保证当前会话仍可用
      persistent = false;
      memory[key] = raw;
      return false;
    }
  }

  /* 裁剪：优先丢弃最老的会话日志，其次丢弃经验库的出现次数明细 */
  function trim(value) {
    if (!value || typeof value !== "object") return value;
    var out = shallowCopy(value);
    if (Array.isArray(out.log) && out.log.length > LOG_KEEP) {
      out.log = out.log.slice(out.log.length - LOG_KEEP);
      return out;
    }
    return out;
  }

  function shallowCopy(o) {
    var r = {}, k;
    for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = o[k];
    return r;
  }

  function remove(key) {
    try {
      if (persistent) window.localStorage.removeItem(PREFIX + key);
    } catch (e) { /* 忽略 */ }
    delete memory[key];
  }

  function clearAll() {
    if (!persistent) { memory = {}; return; }
    try {
      var doomed = [], i;
      for (i = 0; i < window.localStorage.length; i++) {
        var k = window.localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) doomed.push(k);
      }
      doomed.forEach(function (k) { window.localStorage.removeItem(k); });
    } catch (e) { /* 忽略 */ }
    memory = {};
  }

  window.PF_STORAGE = {
    read: read,
    write: write,
    remove: remove,
    clearAll: clearAll,
    isPersistent: function () { return persistent; }
  };
})();
