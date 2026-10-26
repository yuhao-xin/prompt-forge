/* PromptForge app.js — 状态机 + 分接器 + 追问引擎 + 体检 + 导出
 * 零依赖，兼容现代浏览器；ES5 风格书写（var/function），避免新语法兼容性风险。
 */
(function () {
  "use strict";
  var D = window.PF_DATA;
  var S = window.PF_STORAGE;
  var E = window.PF_EXPERIENCE;
  var SCHEMA_VERSION = 2;   // v1=初始结构；v2=新增 overrides（产物手工改写层）
  var MAX_INPUT = 2000;     // 单次输入字符上限，防止超长需求撑爆卡片与导出文件名

  /* ---------------- 状态 ---------------- */
  var state = {
    mode: "forge",        // forge | health
    stage: "intake",      // intake | clarify | forge | review | deliver
    taskTypeId: null,
    variant: "standard",
    slots: {},            // slot -> value
    filled: {},           // slot -> user | default | rewrite
    overrides: {},        // sectionId -> 用户手工改写的整段文本（最高优先级）
    prefilled: {},        // 本次由经验库预填的槽位，用于提示来源
    acceptanceAsked: false,  // 验收用例问题是否已问过（每次开炉只问一次）
    acceptanceDone: false,   // 验收用例环节是否已结束（回答或跳过）
    asked: [],            // 已问过的问题 id
    currentQ: null,
    pendingOther: null,   // 等待“其他”自由输入的问题 id
    log: []               // {who, text, kind, options, qid}
  };

  /* ---------------- 工具 ---------------- */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.add("hidden"); }, 2200);
  }
  function copyText(text, okMsg) {
    function done() { toast(okMsg || "已复制到剪贴板"); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    } else { fallback(); }
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); done(); }
      catch (e) { toast("复制失败，请手动选择复制"); }
      document.body.removeChild(ta);
    }
  }
  function download(name, content, mime) {
    var blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function getType() {
    if (!state.taskTypeId) return null;
    if (state.taskTypeId === "general") return D.general;
    for (var i = 0; i < D.taskTypes.length; i++) {
      if (D.taskTypes[i].id === state.taskTypeId) return D.taskTypes[i];
    }
    return D.general;
  }
  /* 持久化只经 PF_STORAGE：它负责能力探测、损坏自愈与容量降级，
   * 上层拿到 false 时提示用户，而不是静默丢数据。 */
  var SESSION_KEY = "session";
  var warnedStorage = false;

  function save() {
    var ok = false;
    try {
      ok = S.write(SESSION_KEY, {
        v: SCHEMA_VERSION,
        mode: state.mode, stage: state.stage, taskTypeId: state.taskTypeId,
        variant: state.variant, slots: state.slots, filled: state.filled,
        overrides: state.overrides, asked: state.asked, log: state.log,
        prefilled: state.prefilled,
        acceptanceAsked: state.acceptanceAsked, acceptanceDone: state.acceptanceDone
      });
    } catch (e) {
      ok = false;
    }
    if (!ok && !warnedStorage) {
      warnedStorage = true;
      toast("浏览器存储不可用，本次对话不会被保存");
    }
  }

  /* 会话数据迁移：补齐新增字段，缺什么补什么，不因老数据中断 */
  function migrateSession(s) {
    s.slots = s.slots || {};
    s.filled = s.filled || {};
    s.overrides = s.overrides || {};
    s.asked = s.asked || [];
    s.log = s.log || [];
    s.variant = s.variant || "standard";
    s.acceptanceAsked = !!s.acceptanceAsked;
    s.acceptanceDone = !!s.acceptanceDone;
    if (s.mode !== "health" && s.mode !== "experience") s.mode = "forge";
    s.v = SCHEMA_VERSION;
    return s;
  }

  /* ---------------- 对话渲染 ---------------- */
  function scrollChat() {
    var list = $("chat-list");
    list.scrollTop = list.scrollHeight;
  }

  function lockOptions(box) {
    Array.prototype.forEach.call(box.children, function (x) {
      x.disabled = true;
      x.style.opacity = "0.55";
      x.style.cursor = "default";
    });
  }

  function addMsg(who, text, opts) {
    opts = opts || {};
    var wrap = el("div", "msg " + who);
    if (opts.kind === "system") wrap.className = "msg system";
    wrap.appendChild(el("div", "msg-tag"));
    var bubble = el("div", "bubble");
    if (opts.html) bubble.innerHTML = opts.html;
    else bubble.textContent = text;
    wrap.appendChild(bubble);
    if (opts.why) {
      var det = el("details", "why-line");
      det.appendChild(el("summary", null, "为什么问这个"));
      det.appendChild(el("p", null, opts.why));
      wrap.appendChild(det);
    }
    if (opts.options && opts.options.length) {
      var box = el("div", "options");
      var locked = false;
      opts.options.forEach(function (o) {
        var b = el("button", "opt-btn", o.label);
        if (o.value === "__other__") b.textContent = "其他，我自己说";
        b.onclick = function () {
          if (locked) return;
          locked = true;
          lockOptions(box);
          if (o.value === "__other__") {
            state.pendingOther = opts.qid;
            $("chat-input").focus();
            $("chat-input").placeholder = "直接说你的答案……";
            toast("说吧，我听着");
            return;
          }
          answerQuestion(opts.qid, o);
        };
        box.appendChild(b);
      });
      wrap.appendChild(box);
    }
    $("chat-list").appendChild(wrap);
    state.log.push({ who: who, text: text, kind: opts.kind || "text", options: opts.options, qid: opts.qid });
    save();
    scrollChat();
  }

  function addUserMsg(text) {
    addMsg("user", text);
  }

  function renderLog() {
    $("chat-list").innerHTML = "";
    state.log.forEach(function (m) {
      var wrap = el("div", "msg " + m.who);
      if (m.kind === "system") wrap.className = "msg system";
      wrap.appendChild(el("div", "msg-tag"));
      var bubble = el("div", "bubble");
      bubble.textContent = m.text;
      wrap.appendChild(bubble);
      if (m.options && m.options.length) {
        var box = el("div", "options");
        m.options.forEach(function (o) {
          var b = el("button", "opt-btn", o.value === "__other__" ? "其他，我自己说" : o.label);
          b.disabled = true;
          b.style.opacity = "0.55";
          b.style.cursor = "default";
          box.appendChild(b);
        });
        wrap.appendChild(box);
      }
      $("chat-list").appendChild(wrap);
    });
    scrollChat();
  }

  var quickDefs = [];
  function setQuickActions(list) {
    quickDefs = list || [];
    var box = $("quick-actions");
    box.innerHTML = "";
    quickDefs.forEach(function (a) {
      var b = el("button", "opt-btn", a.label);
      b.onclick = a.fn;
      box.appendChild(b);
    });
  }

  /* ---------------- 阶段条 ---------------- */
  function renderStages() {
    var bar = $("stage-bar");
    bar.innerHTML = "";
    var idx = 0;
    D.stages.forEach(function (s, i) {
      if (s.id === state.stage) idx = i;
    });
    D.stages.forEach(function (s, i) {
      var item = el("span", "stage-item" + (i === idx ? " active" : (i < idx ? " done" : "")));
      item.appendChild(el("span", "dot"));
      item.appendChild(document.createTextNode(s.name));
      bar.appendChild(item);
      if (i < D.stages.length - 1) {
        var sep = el("span", "sep", "›");
        sep.style.margin = "0 2px";
        bar.appendChild(sep);
      }
    });
  }

  /* ---------------- 分接器 ----------------
   * 判定规则：强命中(>=3)且领先第二名 >=2 → 直接定；任一命中且无竞争 → 定；
   * 两个以上类型都有命中且接近 → 列出候选让用户确认；全无命中 → 通用兜底。
   */
  function classify(text) {
    var t = text.toLowerCase();
    var results = [];
    D.taskTypes.forEach(function (ty) {
      var score = 0, hits = [];
      ty.keywords.forEach(function (kw) {
        if (t.indexOf(kw.k.toLowerCase()) >= 0) { score += kw.w; hits.push(kw.k); }
      });
      results.push({ type: ty, score: score, hits: hits });
    });
    results.sort(function (a, b) { return b.score - a.score; });
    return results;
  }

  function startForge(text) {
    var results = classify(text);
    var best = results[0], second = results[1];
    state.slots.task = text;
    state.filled.task = "user";

    // 经验预填：把历史画像里高频的取值先填上，标注来源为 experience。
    // 这样老用户不必每次重复交代背景，但每一格仍然可改。
    var sugg = E.suggest(state);
    Object.keys(sugg).forEach(function (slot) {
      if (state.slots[slot] != null && state.slots[slot] !== "") return;
      state.slots[slot] = sugg[slot].value;
      state.filled[slot] = "experience";
    });
    state.prefilled = sugg;

    if (best.score >= 3 && (!second || best.score - second.score >= 2)) {
      confirmType(best.type, best.hits, false);
    } else if (best.score >= 2 && (!second || second.score === 0)) {
      confirmType(best.type, best.hits, false);
    } else if (best.score >= 2 && second && second.score >= 1) {
      askPickType(results.slice(0, 3));
    } else {
      confirmType(D.general, [], true);
    }
  }

  function askPickType(results) {
    state.stage = "intake";
    renderStages();
    addMsg("bot",
      "你这个需求我闻到好几种味道，先确认走哪条锻法——选错了没关系，随时可以推倒重来。",
      {
        options: results.map(function (r) {
          return {
            label: r.type.name + "（" + r.type.tagline + "）",
            value: r.type.id,
            fn: null
          };
        }).concat([{ label: "通用任务（先按通用方式处理）", value: "general" }]),
        qid: "__picktype__"
      });
    // 覆盖默认点击行为：选项直接开炉
    var box = $("chat-list").lastChild.querySelector(".options");
    Array.prototype.forEach.call(box.children, function (btn, i) {
      btn.onclick = function () {
        lockOptions(box);
        var list = results.slice(0, 3);
        if (i < list.length) confirmType(list[i].type, list[i].hits, true);
        else confirmType(D.general, [], true);
      };
    });
  }

  function confirmType(type, hits, isFallback) {
    state.taskTypeId = type.id;
    state.stage = "clarify";
    renderStages();
    var reason = hits && hits.length
      ? "我接住了。这条需求归到「" + type.name + "」——命中了：" + hits.slice(0, 4).join("、") + "。"
      : (isFallback
        ? "这条需求我不太归类，先按「通用任务」处理，问题会问得保守一些。"
        : "这条需求归到「" + type.name + "」。");
    addMsg("bot", reason, { kind: "system" });
    updateAskCounter();
    renderCard();
    askNext();
  }

  /* ---------------- 追问引擎 ---------------- */
  function remainingQuestions() {
    var ty = getType();
    return ty.questions.filter(function (q) { return state.asked.indexOf(q.id) < 0; });
  }

  function askQuestion(q) {
    state.currentQ = q;
    state.pendingOther = null;
    $("chat-input").placeholder = q.placeholder || "说说你的答案……";
    $("btn-skip").classList.remove("hidden");
    $("btn-back").classList.toggle("hidden", state.asked.length <= 1);
    var opts = (q.type === "choice") ? q.options : null;
    addMsg("bot", q.text + (q.required ? "" : "（可跳过）"), {
      options: opts, qid: q.id, why: q.hint
    });
    updateAskCounter();
    renderStages();
    save();
  }

  function askNext() {
    var rest = remainingQuestions();
    if (!rest.length || state.asked.length >= D.meta.maxAsk) {
      generate();
      return;
    }
    var q = rest[0];
    state.asked.push(q.id);
    askQuestion(q);
  }

  /* 回退到上一题：保留原答案作为默认值，用户直接回车即可沿用 */
  function goBack() {
    if (state.stage !== "clarify" || state.asked.length <= 1) return;
    var lastId = state.asked.pop();
    var q = findQuestion(lastId);
    if (!q) { askNext(); return; }
    addMsg("bot", "回到上一题，改一下（原答案还在输入框里）：", { kind: "system" });
    var prev = state.slots[q.slot];
    if (prev != null) $("chat-input").value = String(prev);
    askQuestion(q);
  }

  function answerQuestion(qid, option) {
    var q = findQuestion(qid);
    if (!q) return;
    if (option && option.fills) {
      /* 先用选项值填本题槽位，再让 fills 覆盖/追加其他槽位（fills 优先） */
      if (option.value && option.value !== "__other__") {
        state.slots[q.slot] = option.value;
        state.filled[q.slot] = "user";
      }
      Object.keys(option.fills).forEach(function (slot) {
        state.slots[slot] = option.fills[slot];
        state.filled[slot] = "user";
      });
    } else if (option) {
      state.slots[q.slot] = option.value;
      state.filled[q.slot] = "user";
    }
    if (state.asked.indexOf(qid) < 0) state.asked.push(qid);
    addUserMsg(option ? option.label : "");
    renderCard();
    askNext();
  }

  function answerTextQuestion(qid, text) {
    var q = findQuestion(qid);
    if (!q) return;
    state.slots[q.slot] = text;
    state.filled[q.slot] = "user";
    if (state.asked.indexOf(qid) < 0) state.asked.push(qid);
    renderCard();
    askNext();
  }

  function findQuestion(qid) {
    var ty = getType();
    var all = ty.questions;
    for (var i = 0; i < all.length; i++) if (all[i].id === qid) return all[i];
    return null;
  }

  function skipQuestion() {
    // 验收环节跳过 = 直接收尾进自检
    if (state.stage === "forge" && state.acceptanceAsked && !state.acceptanceDone) {
      addUserMsg("（跳过验收用例）");
      finishGenerate();
      return;
    }
    var q = state.currentQ;
    if (!q) return;
    state.filled[q.slot] = "default";
    if (state.asked.indexOf(q.id) < 0) state.asked.push(q.id);
    addUserMsg("（跳过，用推荐值）");
    renderCard();
    askNext();
  }

  function updateAskCounter() {
    var ty = getType();
    if (!ty) { $("ask-counter").textContent = ""; return; }
    var total = Math.min(ty.questions.length, D.meta.maxAsk);
    $("ask-counter").textContent = state.stage === "clarify"
      ? "关键问题 " + state.asked.length + " / " + total
      : "";
  }

  /* ---------------- 生成 ---------------- */
  function forgeQuickActions() {
    setQuickActions([
      { label: "好用，就这样", fn: function () { gsb("good"); } },
      { label: "还差点意思", fn: function () { gsb("mid"); } },
      { label: "不行，重来", fn: function () { gsb("bad"); } },
      { label: "换一版（" + variantName() + "）", fn: cycleVariant },
      { label: "换个类型重锻", fn: askRetype },
      { label: "重新开炉", fn: resetForge }
    ]);
  }

  function generate() {
    state.stage = "forge";
    state.currentQ = null;
    $("btn-skip").classList.add("hidden");
    $("btn-back").classList.add("hidden");
    $("ask-counter").textContent = "";
    renderStages();
    renderCard();

    // 验收用例：生成之后、自检之前，问一次“拿什么去试”。
    // 没有验收标准的提示词，好坏全凭感觉——这是把“能用”从口号变成可判定的一步。
    if (!state.acceptanceAsked) {
      state.acceptanceAsked = true;
      addMsg("bot",
        "开炉了。右侧就是锻出来的提示词——灰字是跳过后用的推荐值，点任意一段可以直接改。\n\n最后一步，也是最容易被跳过、却最能拉开差距的一步：你打算拿什么真实输入去试它？想清楚这个，才知道这条提示词到底行不行。",
        { kind: "system" });
      $("chat-input").placeholder = "比如：拿我上周那篇 3000 字的初稿去试……（可跳过）";
      $("chat-input").disabled = false;
      $("chat-send").disabled = false;
      $("btn-skip").classList.remove("hidden");
      setQuickActions([
        { label: "先跳过，直接看结果", fn: finishGenerate },
        { label: "为什么先想验收？", fn: function () {
          toast("没有验收标准的提示词，好坏全凭感觉——这正是大多数人用 AI 翻车的地方");
        } }
      ]);
      save();
      return;
    }
    finishGenerate();
  }

  function answerAcceptance(text) {
    state.slots.acceptance = text;
    state.filled.acceptance = "user";
    finishGenerate();
  }

  function finishGenerate() {
    state.acceptanceDone = true;
    E.absorbForge(state);   // 沉淀本次经验，供下次开炉预填
    $("chat-input").disabled = true;
    $("chat-send").disabled = true;
    $("chat-input").placeholder = "需求已锻造成器，点下方按钮继续";
    $("btn-skip").classList.add("hidden");
    renderStages();
    renderCard();
    runSelfHealth();
    forgeQuickActions();
    save();
  }

  function variantSections() {
    var ty = getType();
    var v = ty.variants[state.variant] || ty.variants.standard;
    return { sections: v.sections, extraRules: v.extraRules || "" };
  }

  function sectionBody(id) {
    var sec = D.sections[id];
    if (state.overrides[id] != null) return state.overrides[id];
    var body = sec.tpl.replace(/\{(\w+)\}/g, function (m, slot) {
      if (state.slots[slot] != null && state.slots[slot] !== "") return esc(state.slots[slot]);
      var ty = getType();
      var def = ty.defaults[slot];
      return def != null ? esc(def) : esc("（待补充）");
    });
    if (id === "rules") body += variantSections().extraRules;
    return body;
  }

  function renderCard() {
    var ty = getType();
    if (!ty) return;
    $("card-empty").classList.add("hidden");
    $("prompt-card").classList.remove("hidden");
    var vs = variantSections();
    var card = $("prompt-card");
    card.innerHTML = "";

    var head = el("div", "card-head");
    var title = el("div", "card-title");
    title.innerHTML = esc(ty.name + " · 提示词") + "<small>" + esc(variantName()) + "</small>";
    head.appendChild(title);
    var answered = 0, total = 0;
    ty.questions.forEach(function (q) {
      total++;
      var f = state.filled[q.slot];
      if (f === "user" || f === "experience" || f === "rewrite") answered++;
    });
    var prog = el("div", "progress");
    var pct = total ? Math.round(answered / total * 100) : 0;
    prog.innerHTML = '<div class="progress-bar"><i style="width:' + pct + '%"></i></div><span>' + answered + "/" + total + " 槽位已答</span>";
    head.appendChild(prog);
    card.appendChild(head);

    vs.sections.forEach(function (sid) {
      var sec = D.sections[sid];
      var box = el("div", "prompt-section");
      box.appendChild(el("h4", null, sec.title));
      var body = el("div", "sec-body", sectionBody(sid));
      // 标记未亲答的槽位
      var slotsInSec = sec.tpl.match(/\{(\w+)\}/g) || [];
      var anyDefault = slotsInSec.some(function (s) {
        var name = s.slice(1, -1);
        return state.filled[name] === "default" || state.filled[name] === undefined;
      });
      if (anyDefault) body.classList.add("pending");
      box.appendChild(body);
      // 生成之后（非追问中）允许就地改写任意一段，改完自动重新体检
      if (state.stage !== "clarify") {
        body.title = "点一下可以直接改这一段";
        body.onclick = function () { enterEdit(box, sid, body); };
      }
      card.appendChild(box);
    });

    $("variant-name").textContent = "当前版本：" + variantName();
    $("card-footer").classList.remove("hidden");
  }

  /* 产物就地编辑：点任意一段 → textarea → 保存回 overrides → 重新体检。
   * overrides 优先级最高，会同时作用于卡片、复制、导出和体检。 */
  function enterEdit(box, sid, bodyEl) {
    if (box._editing) return;
    box._editing = true;
    bodyEl.style.display = "none";

    var ta = el("textarea", "sec-edit");
    ta.value = unesc(sectionBody(sid));
    var hint = el("div", "sec-edit-hint", "Ctrl / Cmd + Enter 保存，Esc 取消；改完会自动重新体检");
    var row = el("div", "sec-edit-actions");
    var btnSave = el("button", "btn-secondary", "保存");
    var btnReset = el("button", "btn-ghost", "还原为模板");
    var btnCancel = el("button", "btn-ghost", "取消");
    row.appendChild(btnSave);
    row.appendChild(btnReset);
    row.appendChild(btnCancel);
    box.appendChild(ta);
    box.appendChild(hint);
    box.appendChild(row);
    ta.focus();
    if (ta.setSelectionRange) ta.setSelectionRange(ta.value.length, ta.value.length);

    function finish(ok, reset) {
      if (ok) {
        if (reset) delete state.overrides[sid];
        else {
          var v = ta.value.trim();
          if (v) state.overrides[sid] = v; else delete state.overrides[sid];
        }
      }
      box._editing = false;
      if (ta.parentNode === box) box.removeChild(ta);
      if (hint.parentNode === box) box.removeChild(hint);
      if (row.parentNode === box) box.removeChild(row);
      bodyEl.style.display = "";
      renderCard();
      if (ok) {
        var scores = healthScores(buildPromptText());
        var total = scores.reduce(function (s, x) { return s + x.score; }, 0);
        toast(reset ? "已还原为模板输出" : "已改写，重新自检：" + total + " / 10");
      }
      save();
    }

    btnSave.onclick = function () { finish(true, false); };
    btnReset.onclick = function () { finish(true, true); };
    btnCancel.onclick = function () { finish(false, false); };
    ta.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finish(true, false); }
      else if (e.key === "Escape") { e.preventDefault(); finish(false, false); }
    });
  }

  function unesc(s) {
    return String(s)
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  }

  /* 分接器会误判（已实证），所以必须给一条低成本纠错路径：
   * 换类型 ≠ 重来，已填槽位尽量保留，只换问题树与框架。 */
  function askRetype() {
    addMsg("bot", "觉得归错类了？选一个更合适的——已经填过的内容会尽量保留。", {
      options: D.taskTypes.map(function (t) { return { label: t.name, value: t.id }; })
        .concat([{ label: "通用任务", value: "general" }]),
      qid: "__retype__"
    });
    var box = $("chat-list").lastChild.querySelector(".options");
    var list = D.taskTypes.concat([D.general]);
    Array.prototype.forEach.call(box.children, function (btn, i) {
      btn.onclick = function () {
        lockOptions(box);
        if (i < list.length) retypeTo(list[i]);
      };
    });
  }

  function retypeTo(type) {
    state.taskTypeId = type.id;
    state.stage = "clarify";
    state.asked = [];
    state.currentQ = null;
    state.acceptanceAsked = false;
    state.acceptanceDone = false;
    $("chat-input").disabled = false;
    $("chat-send").disabled = false;
    $("btn-skip").classList.remove("hidden");
    addMsg("bot", "好，改用「" + type.name + "」的锻法——之前填过的会预填进去，跳过即可沿用。", { kind: "system" });
    renderStages();
    renderCard();
    askNext();
  }

  function variantName() {
    return D.variantDefs[state.variant].name;
  }

  function cycleVariant() {
    var order = ["standard", "rigorous", "minimal"];
    var i = order.indexOf(state.variant);
    state.variant = order[(i + 1) % order.length];
    renderCard();
    forgeQuickActions();
    toast("已切换到「" + variantName() + "」：" + D.variantDefs[state.variant].desc);
    save();
  }

  /* ---------------- 自检（生成后自动跑五维体检） ---------------- */
  function healthScores(text) {
    return D.health.dimensions.map(function (dim) {
      var hits = 0;
      dim.patterns.forEach(function (p) {
        var m = text.match(new RegExp(p.source, "gm"));
        if (m) hits += m.length;
      });
      var score;
      if (dim.id === "role") {
        score = (hits >= 1 && dim.limitPattern.test(text)) ? 2 : (hits >= 1 ? 1 : 0);
      } else if (dim.id === "task") {
        score = hits >= 2 ? 2 : (hits === 1 ? 1 : 0);
      } else if (dim.id === "examples") {
        score = hits >= 1 ? 2 : 0;
      } else {
        score = hits >= 2 ? 2 : (hits === 1 ? 1 : 0);
      }
      return { dim: dim, score: score, hits: hits };
    });
  }

  function runSelfHealth() {
    var text = buildPromptText();
    var scores = healthScores(text);
    var total = scores.reduce(function (s, x) { return s + x.score; }, 0);
    state.stage = "review";
    renderStages();
    var weak = scores.filter(function (x) { return x.score < 2; });
    if (weak.length) {
      addMsg("bot", "自检跑完：" + total + "/10 分。弱项：" + weak.map(function (x) { return x.dim.name; }).join("、") + "。点下方对应按钮可以直接重写这些模块。", { kind: "system" });
      var extras = weak.map(function (x) {
        return {
          label: "重写「" + x.dim.name + "」模块",
          fn: (function (dim) {
            return function () { rewriteModule(dim.id); };
          })(x.dim)
        };
      });
      setQuickActions(quickDefs.concat(extras));
    } else {
      addMsg("bot", "自检跑完：10/10 满分，五件套齐全。可以直接导出用，或者点“好用”收工。", { kind: "system" });
    }
  }

  /* ---------------- GSB 反馈闭环 ---------------- */
  function gsb(level) {
    if (level === "good") {
      state.stage = "deliver";
      renderStages();
      addMsg("bot", "漂亮。点右下角「导出 MD」拿走完整提示词包——里面附了接到 WorkBuddy / Claude / API 的说明。换个需求随时可以重新开炉。", { kind: "system" });
      toast("已标记为好用");
      return;
    }
    var reasons = D.health.gsbReasons.map(function (r) {
      return {
        label: r.label, value: r.value, qid: "__gsb__"
      };
    });
    addMsg("bot", "哪里不对劲？选一个最接近的——我会重写提示词里对应的那个模块，而不是笼统地重新生成。", { options: reasons, qid: "__gsb__" });
    var box = $("chat-list").lastChild.querySelector(".options");
    Array.prototype.forEach.call(box.children, function (btn, i) {
      btn.onclick = function () {
        lockOptions(box);
        var r = D.health.gsbReasons[i];
        if (r.value === "other") {
          addMsg("bot", "记下了。你也可以直接把不满意的点打在输入框——不过输入框已锁，建议点“重新开炉”换个说法再来，或先导出再手工改。", { kind: "system" });
          return;
        }
        rewriteModule(r.value);
      };
    });
  }

  function rewriteModule(dimId) {
    var fn = D.rewrite[dimId];
    var cur = state.slots[dimId] || (getType().defaults[dimId] || "");
    if (!fn) { toast("这个模块暂无自动重写策略"); return; }
    state.slots[dimId] = fn(cur, state.slots);
    state.filled[dimId] = "rewrite";
    renderCard();
    var name = "";
    D.health.dimensions.forEach(function (d) { if (d.id === dimId) name = d.name; });
    addMsg("bot", "已按「" + name + "」的最佳实践重写该模块，卡片右侧已更新。还是不对就再点一次，或换个模块修。", { kind: "system" });
    save();
  }

  /* ---------------- 导出 ---------------- */
  function buildPromptText() {
    var ty = getType();
    var vs = variantSections();
    var lines = [];
    vs.sections.forEach(function (sid) {
      /* 用户没给示例时，整段省略，不留“（无，按上述标准生成）”占位 */
      if (sid === "examples") {
        var ex = state.slots.examples;
        if (ex == null || String(ex).trim() === "") return;
      }
      lines.push(D.sections[sid].title);
      lines.push(sectionBody(sid).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
      lines.push("");
    });
    return lines.join("\n").trim();
  }

  function exportMarkdown() {
    var ty = getType();
    var prompt = buildPromptText();
    var md = [];
    md.push("# " + ty.name + " 提示词（PromptForge 锻造 · " + variantName() + "）");
    md.push("");
    md.push(prompt);
    md.push("");
    md.push("---");
    md.push("");
    md.push("## 怎么把这提示词用进你的项目");
    md.push("");
    md.push("1. **WorkBuddy**：" + D.exportGuide.workbuddy);
    md.push("2. **Claude Projects**：" + D.exportGuide.claude);
    md.push("3. **API**：" + D.exportGuide.api);
    md.push("");
    md.push("## 槽位清单（可按需替换的变量）");
    md.push("");
    md.push("| 槽位 | 当前内容 | 来源 |");
    md.push("|---|---|---|");
    var seen = {};
    ty.questions.concat(D.general.questions).forEach(function (q) {
      if (seen[q.slot]) return;
      seen[q.slot] = 1;
      var v = state.slots[q.slot];
      var src = state.filled[q.slot] === "user" ? "你的回答"
        : (state.filled[q.slot] === "experience" ? "来自经验"
          : (state.filled[q.slot] === "rewrite" ? "自动重写" : "推荐默认值"));
      md.push("| " + q.slot + " | " + String(v != null ? v : ty.defaults[q.slot]).replace(/\n/g, " ").replace(/\|/g, "\\|").slice(0, 60) + " | " + src + " |");
    });
    md.push("");

    // 验收用例：让“能用”变成可判定的，而不是口号
    var acc = state.slots.acceptance;
    if (acc && String(acc).trim()) {
      md.push("## 验收用例");
      md.push("");
      md.push("- 真实输入：" + String(acc).replace(/\n/g, " "));
      md.push("- 通过判定：产出同时满足上面「完成标准」的每一条，且没有违反「明确不做」");
      md.push("- 不通过怎么办：把失败那次的具体输入贴回 PromptForge，选“重写”对应的模块");
      md.push("");
    } else {
      md.push("## 验收用例");
      md.push("");
      md.push("- 还没有指定验收输入。建议补一个：挑一个你真实会用的、有代表性的输入");
      md.push("- 通过判定：产出同时满足上面「完成标准」的每一条，且没有违反「明确不做」");
      md.push("");
    }

    md.push("> 由 PromptForge 提示词锻造台生成 · WorkBuddy「1024 造物挑战」参赛作品");
    download("promptforge-" + ty.id + ".md", md.join("\n"), "text/markdown;charset=utf-8");
    toast("已导出 Markdown 提示词包");
  }

  function exportJson() {
    var ty = getType();
    var data = {
      generator: "PromptForge",
      task_type: ty.id,
      variant: state.variant,
      prompt: buildPromptText(),
      slots: {},
      created_at: new Date().toISOString()
    };
    ty.questions.forEach(function (q) {
      data.slots[q.slot] = state.slots[q.slot] != null ? state.slots[q.slot] : ty.defaults[q.slot];
    });
    download("promptforge-" + ty.id + ".json", JSON.stringify(data, null, 2), "application/json");
    toast("已导出 JSON（供开发集成）");
  }

  /* ---------------- 体检模式 ---------------- */
  function switchMode(mode) {
    state.mode = mode;
    document.querySelectorAll(".mode-tab").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-mode") === mode);
    });
    $("chat-panel").classList.toggle("hidden", mode !== "forge");
    $("health-panel").classList.toggle("hidden", mode !== "health");
    $("experience-panel").classList.toggle("hidden", mode !== "experience");
    $("stage-bar").style.visibility = mode === "forge" ? "visible" : "hidden";
    $("card-footer").classList.toggle("hidden", !(mode === "forge" && state.taskTypeId));
    if (mode === "health") { $("health-input").focus(); }
    if (mode === "experience") { renderExperience(); }
    save();
  }

  /* ---------------- 经验库面板 ---------------- */
  function renderExperience() {
    var box = $("experience-body");
    if (!box) return;
    var sum = E.summary();
    box.innerHTML = "";

    if (!sum.forge_count) {
      box.appendChild(el("p", "dim",
        "还没有沉淀任何经验。完成一次锻造之后，你亲口回答的偏好会自动记在这里，下次开炉就不用重复交代了。"));
      return;
    }

    var head = el("div", "exp-head",
      "已完成 " + sum.forge_count + " 次锻造"
      + (sum.updated_at ? " · 最近更新 " + sum.updated_at.slice(0, 10) : ""));
    box.appendChild(head);

    if (sum.types.length) {
      box.appendChild(el("h3", "exp-h3", "常做的任务类型"));
      var tw = el("div", "exp-chips");
      sum.types.forEach(function (t) {
        tw.appendChild(el("span", "exp-chip", t.name + " × " + t.count));
      });
      box.appendChild(tw);
    }

    if (sum.rows.length) {
      box.appendChild(el("h3", "exp-h3", "沉淀下来的偏好"));
      sum.rows.forEach(function (r) {
        var row = el("div", "exp-row");
        row.appendChild(el("div", "exp-slot", r.label));
        var vals = el("div", "exp-vals");
        r.values.forEach(function (v) {
          var item = el("div", "exp-val");
          item.appendChild(el("span", "exp-val-text", v.value + (v.count > 1 ? "（" + v.count + " 次）" : "")));
          var del = el("button", "exp-del", "删除");
          del.onclick = function () {
            E.removeValue(r.slot, v.value);
            renderExperience();
            toast("已删除这条偏好");
          };
          item.appendChild(del);
          vals.appendChild(item);
        });
        row.appendChild(vals);
        box.appendChild(row);
      });
    }
  }

  function runHealthUI() {
    var text = $("health-input").value.trim();
    if (!text) { toast("先粘贴一条提示词"); return; }
    var scores = healthScores(text);
    var total = scores.reduce(function (s, x) { return s + x.score; }, 0);
    $("card-empty").classList.add("hidden");
    $("prompt-card").classList.add("hidden");
    var box = $("health-result");
    box.classList.remove("hidden");
    box.innerHTML = "";

    var head = el("div", "");
    head.innerHTML = '<div class="health-score-line"><span class="score">' + total + "</span><span class=\"of\">/ 10</span></div>";
    var verdict = total >= 9 ? "五件套齐全，这是一条能打的提示词。"
      : total >= 6 ? "骨架有了，按下面的建议补 1-2 处就能明显提升。"
      : "这条提示词还在“许愿”阶段——按下面的建议逐项补强。";
    head.appendChild(el("div", "health-verdict", verdict));
    box.appendChild(head);

    scores.forEach(function (x) {
      var row = el("div", "dim-row");
      var h = el("div", "dim-head");
      h.appendChild(el("span", "dim-name", x.dim.name));
      var badgeCls = x.score === 2 ? "good" : (x.score === 1 ? "mid" : "bad");
      var badgeTxt = x.score === 2 ? "2 分 · 达标" : (x.score === 1 ? "1 分 · 有但不硬" : "0 分 · 缺失");
      h.appendChild(el("span", "dim-badge " + badgeCls, badgeTxt));
      row.appendChild(h);
      row.appendChild(el("div", "dim-why",
        "满分标准：" + x.dim.score2 + "　·　当前检测到 " + x.hits + " 处信号"));
      if (x.score < 2) {
        var ul = el("ul");
        x.dim.advice.forEach(function (a) { ul.appendChild(el("li", null, a)); });
        row.appendChild(ul);
      }
      box.appendChild(row);
    });

    var fixBtn = el("button", "btn-secondary", "把体检结果带进锻造台补强");
    fixBtn.style.marginTop = "6px";
    fixBtn.onclick = function () {
      var weak = scores.filter(function (x) { return x.score < 2; }).map(function (x) { return x.dim.name; });
      switchMode("forge");
      $("chat-input").value = "补强这条提示词：" + text.slice(0, 200) + (weak.length ? "（重点问题：" + weak.join("、") + "）" : "");
      $("chat-input").focus();
      toast("已带回锻造台，改改这句话再发送");
    };
    box.appendChild(fixBtn);
    save();
  }

  /* ---------------- 会话控制 ---------------- */
  function resetForge() {
    state.stage = "intake";
    state.taskTypeId = null;
    state.slots = {};
    state.filled = {};
    state.asked = [];
    state.currentQ = null;
    state.log = [];
    $("chat-input").disabled = false;
    $("chat-send").disabled = false;
    $("chat-input").value = "";
    $("chat-input").placeholder = "说一句你想让 AI 做什么……";
    $("btn-skip").classList.add("hidden");
    $("ask-counter").textContent = "";
    setQuickActions([]);
    $("prompt-card").classList.add("hidden");
    $("card-footer").classList.add("hidden");
    $("card-empty").classList.remove("hidden");
    $("health-result").classList.add("hidden");
    renderLog();
    renderStages();
    welcome();
    save();
  }

  /* 冷启动示例：覆盖不同任务类型，且刻意混入“高难度复杂任务”，
   * 让首次打开的用户/评委一眼看到产品能承接的复杂度上限。 */
  var SAMPLES = [
    { label: "读一篇 Nature 论文，判断方法是否可靠", hint: "学术科研 · 复杂推理", text: "帮我读一篇 Nature 子刊的论文，说清它解决了什么问题、方法靠不靠谱、对我的课题有什么启发" },
    { label: "三个月完成综述投稿，拆成周计划", hint: "任务规划 · 复杂拆解", text: "我要在三个月内完成一篇综述投稿，帮我把这个复杂任务分解成可执行的周计划" },
    { label: "仪器 CSV 光谱数据批量转 Excel", hint: "代码+数据 · 多意图", text: "用 Python 写个脚本，把仪器导出的 CSV 光谱数据批量转成 Excel，每张谱图一个 sheet，再画一张叠加对比图" },
    { label: "给新员工写一篇入职指南", hint: "内容写作 · 入门", text: "帮我写一篇给新员工的入职指南" }
  ];

  function welcome() {
    if (state.log.length) return;
    addMsg("bot",
      "我是 PromptForge，一个提示词锻造台。\n你不用会写提示词——只要说清楚你想让 AI 干什么，我会像产品经理一样追问几个关键问题，然后按结构化模板现场锻出一条能直接用的提示词。\n越复杂的需求，追问越值钱。",
      { kind: "system" });
    setQuickActions(SAMPLES.map(function (ex) {
      return {
        label: ex.label,
        fn: function () {
          $("chat-input").value = ex.text;
          submit();
        }
      };
    }));
    renderEmptySamples();
  }

  function renderEmptySamples() {
    var box = $("empty-samples");
    if (!box) return;
    box.innerHTML = "";
    SAMPLES.forEach(function (ex) {
      var b = el("button", "sample-btn");
      var t = el("span", "sample-label", ex.label);
      var h = el("span", "sample-hint", ex.hint);
      b.appendChild(t);
      b.appendChild(h);
      b.onclick = function () {
        switchMode("forge");
        $("chat-input").value = ex.text;
        submit();
      };
      box.appendChild(b);
    });
  }

  function submit() {
    var input = $("chat-input");
    var text = input.value.trim();
    if (!text) return;
    if (text.length > MAX_INPUT) {
      text = text.slice(0, MAX_INPUT);
      toast("需求太长了，已截取前 " + MAX_INPUT + " 个字符");
    }
    // 纯符号/空白不算有效需求，避免把噪音喂进分接器
    if (!/[0-9A-Za-z\u4e00-\u9fa5]/.test(text)) {
      toast("说点具体的需求吧，比如“帮我写一篇入职指南”");
      return;
    }

    if (state.pendingOther) {
      var qid = state.pendingOther;
      state.pendingOther = null;
      input.value = "";
      $("chat-input").placeholder = "说说你的答案……";
      addUserMsg(text);
      answerTextQuestion(qid, text);
      return;
    }

    if (state.stage === "clarify" && state.currentQ) {
      var q = state.currentQ;
      input.value = "";
      addUserMsg(text);
      answerTextQuestion(q.id, text);
      return;
    }

    // 验收用例环节：生成后等待用户给出一个真实输入作为验收样本
    if (state.stage === "forge" && state.acceptanceAsked && !state.acceptanceDone) {
      input.value = "";
      addUserMsg(text);
      answerAcceptance(text);
      return;
    }

    // 新开炉
    resetForgeKeepLog();
    startForge(text);
    input.value = "";
  }

  function resetForgeKeepLog() {
    state.stage = "intake";
    state.taskTypeId = null;
    state.slots = {};
    state.filled = {};
    state.overrides = {};
    state.acceptanceAsked = false;
    state.acceptanceDone = false;
    state.asked = [];
    state.currentQ = null;
    state.pendingOther = null;
    $("chat-input").disabled = false;
    $("chat-send").disabled = false;
    $("btn-skip").classList.add("hidden");
    setQuickActions([]);
    $("prompt-card").classList.add("hidden");
    $("card-footer").classList.add("hidden");
    $("card-empty").classList.remove("hidden");
    renderStages();
  }

  /* ---------------- 恢复 ---------------- */
  function restore() {
    var s = null;
    try { s = S.read(SESSION_KEY); } catch (e) { }
    if (!s || !s.log || !s.log.length) { welcome(); renderStages(); return; }
    migrateSession(s);
    state.mode = s.mode || "forge";
    state.stage = s.stage || "intake";
    state.taskTypeId = s.taskTypeId;
    state.variant = s.variant || "standard";
    state.slots = s.slots || {};
    state.filled = s.filled || {};
    state.overrides = s.overrides || {};
    state.prefilled = s.prefilled || {};
    state.acceptanceAsked = !!s.acceptanceAsked;
    state.acceptanceDone = !!s.acceptanceDone;
    state.asked = s.asked || [];
    state.log = s.log || [];
    switchMode(state.mode);
    renderLog();
    renderStages();
    if (state.taskTypeId && (state.stage === "forge" || state.stage === "review" || state.stage === "deliver")) {
      renderCard();
      $("chat-input").disabled = true;
      $("chat-send").disabled = true;
      forgeQuickActions();
      updateAskCounter();
    } else if (state.taskTypeId && state.stage === "clarify") {
      renderCard();
      askNext();
    } else {
      welcome();
    }
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    $("chat-send").onclick = submit;
    $("chat-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter") submit();
    });
    $("btn-skip").onclick = skipQuestion;
    $("btn-back").onclick = goBack;
    document.querySelectorAll(".mode-tab").forEach(function (b) {
      b.onclick = function () { switchMode(b.getAttribute("data-mode")); };
    });
    $("btn-copy").onclick = function () { copyText(buildPromptText(), "提示词已复制，直接粘贴到 AI 对话框就能用"); };
    $("btn-export-md").onclick = exportMarkdown;
    $("btn-export-json").onclick = exportJson;
    $("btn-variant").onclick = cycleVariant;
    $("btn-health-run").onclick = runHealthUI;

    $("btn-exp-export").onclick = function () {
      download("promptforge-experience.json", E.exportJson(), "application/json");
      toast("已导出经验库，换台设备可导入");
    };
    $("btn-exp-import").onclick = function () {
      var ta = $("exp-import-input");
      if (ta.classList.contains("hidden")) { ta.classList.remove("hidden"); ta.focus(); return; }
      var r = E.importJson(ta.value);
      if (r.ok) { ta.value = ""; ta.classList.add("hidden"); renderExperience(); toast("经验库已导入"); }
      else { toast("导入失败：" + r.error); }
    };
    var clearArmed = false;
    $("btn-exp-clear").onclick = function () {
      if (!clearArmed) { clearArmed = true; this.textContent = "再点一次确认清空"; return; }
      clearArmed = false;
      this.textContent = "清空经验库";
      E.clear();
      renderExperience();
      toast("经验库已清空");
    };
    ensureA11y();
  }

  /* 无障碍：为纯图标/短文案按钮补齐可读名称 */
  function ensureA11y() {
    var labels = {
      "chat-send": "发送",
      "btn-skip": "跳过这个问题",
      "btn-back": "回到上一题",
      "btn-copy": "复制提示词",
      "btn-export-md": "导出 Markdown 提示词包",
      "btn-export-json": "导出 JSON 提示词包",
      "btn-variant": "换一个框架变体",
      "btn-health-run": "开始提示词体检",
      "btn-exp-export": "导出经验库 JSON",
      "btn-exp-import": "导入经验库",
      "btn-exp-clear": "清空经验库"
    };
    Object.keys(labels).forEach(function (id) {
      var e = $(id);
      if (e && !e.getAttribute("aria-label")) e.setAttribute("aria-label", labels[id]);
    });
  }

  bind();
  restore();
})();
