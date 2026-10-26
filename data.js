/* PromptForge 策略库 v1.0
 * 任务分接器 + 问题树 + 模板 + 体检规则，全部数据驱动，无逻辑依赖。
 * 设计规范见 docs/02-策略库设计.md
 */
window.PF_DATA = {

  meta: {
    name: "PromptForge",
    slogan: "把一句模糊的想法，锻造成能直接用的提示词",
    maxAsk: 7
  },

  stages: [
    { id: "intake", name: "接单" },
    { id: "clarify", name: "澄清" },
    { id: "forge", name: "生成" },
    { id: "review", name: "评测" },
    { id: "deliver", name: "交付" }
  ],

  /* 通用章节池：每个任务类型按需取用，变体只改组合 */
  sections: {
    role:      { title: "# 角色",            tpl: "{role}" },
    goal:      { title: "## 目标",           tpl: "- 要做什么：{task}\n- 完成标准：{done}\n- 明确不做：{non_goals}" },
    context:   { title: "## 背景与输入",      tpl: "- 使用者/受众：{audience}\n- 输入材料：{inputs}" },
    steps:     { title: "## 步骤与方法",      tpl: "{steps}" },
    rules:     { title: "## 规则与约束",      tpl: "{constraints}" },
    checklist: { title: "## 自检清单",        tpl: "完成后逐项核对，任何一项不满足就修改后再交付：\n{checklist}" },
    format:    { title: "## 输出格式",        tpl: "{format}" },
    examples:  { title: "## 示例（可选）",     tpl: "{examples}" },
    stack:     { title: "## 技术栈与环境",     tpl: "{stack}" },
    dataDesc:  { title: "## 数据说明",        tpl: "{data_desc}" },
    venue:     { title: "## 目标场合与读者",   tpl: "{venue}" },
    risks:     { title: "## 风险与调整",       tpl: "{risks}" },
    style:     { title: "## 语气与风格",       tpl: "{style}" }
  },

  /* 变体：保留全部槽位，只改章节组合与额外约束 */
  variantDefs: {
    standard: { name: "标准版", desc: "完整骨架，适合大多数场景" },
    rigorous: { name: "严谨版", desc: "追加自检清单，约束升级为禁止项" },
    minimal:  { name: "简洁版", desc: "只留角色/目标/格式，适合简单任务" }
  },

  taskTypes: [

    {
      id: "writing", name: "内容写作", tagline: "文章、文案、脚本、公文",
      keywords: [
        { k: "文案", w: 3 }, { k: "写一篇文章", w: 3 }, { k: "写篇", w: 3 }, { k: "公众号", w: 2 },
        { k: "小红书", w: 2 }, { k: "软文", w: 2 }, { k: "脚本", w: 2 }, { k: "标题", w: 2 },
        { k: "写作", w: 2 }, { k: "稿件", w: 2 }, { k: "指南", w: 2 }, { k: "润色", w: 3 },
        { k: "改写", w: 3 }, { k: "写一", w: 3 }, { k: "写份", w: 3 }, { k: "写", w: 2 },
        { k: "文章", w: 1 }
      ],
      sectionOrder: ["role", "goal", "context", "steps", "rules", "format", "examples"],
      variants: {
        standard: { sections: ["role", "goal", "context", "steps", "rules", "style", "format", "examples"] },
        rigorous: { sections: ["role", "goal", "context", "steps", "rules", "style", "checklist", "format", "examples"], extraRules: "\n- 完成后逐项自检：读者能在 30 秒内抓住重点；每个观点都有依据；无绝对化用语" },
        minimal:  { sections: ["role", "goal", "format"] }
      },
      defaults: {
        role: "一位资深内容编辑，擅长把复杂信息写成读者爱看的文字",
        task: "（见上方需求）",
        done: "读者读完后知道该做什么（行动导向）",
        style: "专业但不端着：观点先行，证据跟上，不绕弯",
        non_goals: "不说教、不堆专业术语、不超过约定字数",
        audience: "完全不懂该领域的普通读者",
        inputs: "无，从零开始写",
        steps: "1. 先列读者最关心的 3 个问题\n2. 每个问题用一段话回答，先结论后展开\n3. 结尾给一个可立即执行的动作",
        constraints: "语言口语化，长句拆短句；不用“赋能、抓手、闭环”类黑话；数据需标注来源",
        checklist: "□ 开头 3 秒内出现核心结论 □ 每个小节可独立成立 □ 删除所有不承载信息的形容词",
        format: "总分结构：一句核心结论 + 3-5 个小节（每节一个加粗小标题）+ 结尾行动建议；全文 800 字以内",
        examples: "（无参考样例，按上述标准生成）"
      },
      questions: [
        { id: "q_done", slot: "done", required: true, type: "choice",
          text: "这篇东西写成什么样算好？",
          hint: "完成标准是提示词的分水岭——没有它，AI 只能猜你想要什么",
          options: [
            { label: "读者看完知道该做什么", value: "行动导向" },
            { label: "读者被说服或打动", value: "情感导向" },
            { label: "信息准确完整、不出错", value: "准确导向" },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_non_goals", slot: "non_goals", required: true, type: "choice",
          text: "有什么明确不想要的？",
          hint: "写清“不做什么”比写“要做什么”更能防范围蔓延",
          options: [
            { label: "不要超过一定字数", value: "字数超限", fills: { non_goals: "不超过约定字数，超了就先砍次要内容" } },
            { label: "不要用专业术语", value: "禁术语", fills: { non_goals: "不使用专业术语和黑话，必须用时当场解释" } },
            { label: "不要煽情说教", value: "禁煽情", fills: { non_goals: "不煽情、不说教、不用“你应该”句式" } },
            { label: "没什么特别的", value: "none" },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_audience", slot: "audience", required: false, type: "choice",
          text: "写给谁看？",
          hint: "受众决定词汇难度、案例选择和语气",
          options: [
            { label: "完全不懂的小白", value: "完全不懂该领域的普通读者" },
            { label: "有点了解的同行", value: "有基本了解的同行，可用行业常见词" },
            { label: "专业人士/决策者", value: "专业人士或决策者，重结论和依据" },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_style", slot: "style", required: false, type: "choice",
          text: "语气风格偏哪种？",
          hint: "风格写进约束，比写“写得生动一点”有效得多",
          options: [
            { label: "专业严谨", value: "专业严谨", fills: { style: "专业严谨，像资深从业者在做内部分享" } },
            { label: "轻松口语", value: "轻松口语", fills: { style: "轻松口语化，像懂行的朋友在聊天，可用短句和问句" } },
            { label: "温暖陪伴感", value: "温暖", fills: { style: "温暖有陪伴感，先接住情绪再给建议" } },
            { label: "犀利直接", value: "犀利", fills: { style: "犀利直接，删掉所有客套，观点先行" } },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_format", slot: "format", required: false, type: "choice",
          text: "想要什么形式？",
          hint: "输出格式越具体，AI 越稳定，你越省修改时间",
          options: [
            { label: "分点清单，易扫读", value: "分点清单", fills: { format: "分点清单：每个要点一行，加粗关键词；总长 500 字以内" } },
            { label: "连贯文章", value: "连贯文章", fills: { format: "连贯文章：有起承转合，小节之间自然过渡；总长 1000 字以内" } },
            { label: "对话脚本", value: "对话脚本", fills: { format: "对话脚本：标注说话人与情绪，一句一轮" } },
            { label: "表格对比", value: "表格", fills: { format: "Markdown 表格对比，列：维度/方案A/方案B/结论" } },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_inputs", slot: "inputs", required: false, type: "text",
          text: "有没有现成材料要它参考或改写？比如一段草稿、几个要点",
          hint: "有材料就贴关键部分，AI 会基于材料而不是凭空编",
          placeholder: "例如：一段草稿 / 几个要点 / 相关链接" },
        { id: "q_examples", slot: "examples", required: false, type: "text",
          text: "有没有一句“对味”的参考句子？贴一句让它模仿",
          hint: "给 1 个理想样例，比写十句形容词都管用",
          placeholder: "例如：像这样的句子——“……”" }
      ]
    },

    {
      id: "coding", name: "代码开发", tagline: "脚本、函数、调试、重构",
      keywords: [
        { k: "代码", w: 3 }, { k: "脚本", w: 3 }, { k: "python", w: 3 }, { k: "报错", w: 3 },
        { k: "bug", w: 3 }, { k: "函数", w: 2 }, { k: "调试", w: 2 }, { k: "重构", w: 2 },
        { k: "javascript", w: 2 }, { k: "sql", w: 2 }, { k: "程序", w: 2 }, { k: "开发", w: 2 }
      ],
      sectionOrder: ["role", "goal", "context", "stack", "steps", "rules", "format", "examples"],
      variants: {
        standard: { sections: ["role", "goal", "context", "stack", "steps", "rules", "format", "examples"] },
        rigorous: { sections: ["role", "goal", "context", "stack", "steps", "rules", "checklist", "format", "examples"], extraRules: "\n- 完成后逐项自检：空输入/超长输入/异常字符不崩溃；关键步骤有注释；无安全隐患" },
        minimal:  { sections: ["role", "goal", "stack", "format"] }
      },
      defaults: {
        role: "一位资深工程师，写代码以清晰、可维护、考虑边界情况著称",
        task: "（见上方需求）",
        done: "代码能直接跑通不出错，关键步骤有注释",
        non_goals: "不过度设计，不引入不必要的第三方库",
        audience: "只有我自己看和使用，能跑就行",
        inputs: "无，从零写",
        stack: "Python 3.10+，只用标准库",
        steps: "1. 先用一句话说清思路\n2. 写主逻辑，每步配一句注释\n3. 列出边界情况和对应处理",
        constraints: "变量命名表意；不写超过 50 行的单函数；涉及文件操作必须先判断存在性",
        checklist: "□ 能跑通 □ 边界输入不崩 □ 无硬编码路径 □ 注释说明“为什么”而非“是什么”",
        format: "完整可运行的单文件代码 + 末尾附使用示例（怎么调用、预期输出）",
        examples: "（无，按上述标准生成）"
      },
      questions: [
        { id: "q_done", slot: "done", required: true, type: "choice",
          text: "代码做到什么样算完成？",
          hint: "“能跑”和“能放心用”是两回事，先说清要哪个",
          options: [
            { label: "能直接跑通不出错", value: "能跑" },
            { label: "有注释、每步能讲清楚", value: "可读" },
            { label: "考虑边界情况和报错处理", value: "健壮" },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_non_goals", slot: "non_goals", required: true, type: "choice",
          text: "明确不要什么？",
          hint: "防止 AI 顺手帮你重构整个项目",
          options: [
            { label: "不要引入第三方库", value: "禁依赖", fills: { non_goals: "不引入任何第三方库，只用标准库" } },
            { label: "不要动其他代码", value: "禁扩散", fills: { non_goals: "只改指定部分，不顺手重构其他代码" } },
            { label: "不要过度设计", value: "禁过度", fills: { non_goals: "不过度设计，能跑就行，不提前抽象" } },
            { label: "没什么", value: "none" },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_stack", slot: "stack", required: false, type: "choice",
          text: "用什么语言/环境？",
          hint: "版本和环境写清楚，避免 AI 用过时语法",
          options: [
            { label: "Python", value: "Python 3.10+" },
            { label: "JavaScript/网页", value: "JavaScript，现代浏览器可直接运行" },
            { label: "SQL", value: "SQL，兼容主流关系型数据库" },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_audience", slot: "audience", required: false, type: "choice",
          text: "这代码给谁看、谁来维护？",
          hint: "决定注释密度和健壮性要求",
          options: [
            { label: "只有我自己，能跑就行", value: "只有我自己看和使用，能跑就行" },
            { label: "同事要接手，需要清晰", value: "同事要接手维护，命名和注释必须清晰" },
            { label: "进生产环境，要健壮", value: "进生产环境，需考虑边界、异常和日志" },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_format", slot: "format", required: false, type: "choice",
          text: "输出形式？",
          hint: "要“完整文件”还是“改动说明”，说清楚省得返工",
          options: [
            { label: "完整可运行的单文件", value: "完整可运行的单文件 + 末尾附使用示例" },
            { label: "函数 + 调用示例", value: "一个函数 + 调用示例 + 输入输出说明" },
            { label: "改造后的完整文件（带改动说明）", value: "改造后的完整文件，并在末尾列出改动点" },
            { label: "分步讲解 + 代码", value: "先分步讲思路，再给完整代码" },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_inputs", slot: "inputs", required: false, type: "text",
          text: "有报错信息或现有代码吗？贴关键部分",
          hint: "贴原始报错全文，AI 定位会准得多",
          placeholder: "例如：Traceback ... / 现有代码片段" },
        { id: "q_examples", slot: "examples", required: false, type: "text",
          text: "有输入输出样例吗？",
          hint: "一对“输入→期望输出”样例，能堵住一半的理解偏差",
          placeholder: "例如：输入 a.csv → 输出汇总.xlsx" }
      ]
    },

    {
      id: "data", name: "数据分析", tagline: "清洗、统计、图表、报表",
      keywords: [
        { k: "数据", w: 2 }, { k: "清洗", w: 3 }, { k: "统计", w: 3 }, { k: "图表", w: 3 },
        { k: "报表", w: 3 }, { k: "excel", w: 2 }, { k: "csv", w: 2 }, { k: "透视", w: 2 },
        { k: "数据集", w: 3 }, { k: "字段", w: 2 }, { k: "可视化", w: 3 }, { k: "看板", w: 2 },
        { k: "分析", w: 1 }, { k: "指标", w: 1 }
      ],
      sectionOrder: ["role", "goal", "context", "dataDesc", "steps", "rules", "format", "examples"],
      variants: {
        standard: { sections: ["role", "goal", "context", "stack", "dataDesc", "steps", "rules", "format", "examples"] },
        rigorous: { sections: ["role", "goal", "context", "stack", "dataDesc", "steps", "rules", "checklist", "format", "examples"], extraRules: "\n- 完成后逐项自检：每个数字可追溯到原始数据；结论区分事实与推断；注明数据局限性" },
        minimal:  { sections: ["role", "goal", "dataDesc", "format"] }
      },
      defaults: {
        role: "一位资深数据分析师，擅长从数据里提炼可执行的结论",
        task: "（见上方需求）",
        done: "给出结论 + 数字依据，结论可直接用于决策",
        non_goals: "不编造数据，不下绝对化结论",
        audience: "自己看，要完整可复现",
        inputs: "数据见下方说明",
        data_desc: "（待补充：字段、格式、量级、脏数据情况）",
        stack: "Python（pandas + matplotlib）；若对方指定了别的工具，以对方要求为准",
        steps: "1. 先说明数据质量和口径\n2. 做描述性统计，发现异常\n3. 分维度下钻，定位关键因子\n4. 结论 + 建议 + 局限性",
        constraints: "区分事实与推断；单位口径写清楚；不用“显著提升”类无依据表述",
        checklist: "□ 每个数字可追溯 □ 口径一致 □ 异常值有交代 □ 结论有反例检查",
        format: "一页纸报告：核心结论（3 条）→ 数字依据 → 图表 → 建议清单",
        examples: "（无，按上述标准生成）"
      },
      questions: [
        { id: "q_done", slot: "done", required: true, type: "choice",
          text: "分析出什么算合格？",
          hint: "“给结论”和“给报表”是两种完全不同的活",
          options: [
            { label: "给结论 + 数字依据", value: "给结论 + 数字依据，结论可直接用于决策" },
            { label: "给可执行的建议清单", value: "给可执行的建议清单，按优先级排序" },
            { label: "图表 + 一句话洞察", value: "图表 + 每图一句话洞察" },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_non_goals", slot: "non_goals", required: true, type: "choice",
          text: "不要什么？",
          hint: "数据分析最常见的翻车就是编数和过度解读",
          options: [
            { label: "不要编造数据/趋势", value: "不编造数据和趋势，没有的不许补" },
            { label: "不要下绝对化结论", value: "不下绝对化结论，相关不等于因果" },
            { label: "不要堆术语，说人话", value: "不堆术语，用业务语言说人话" },
            { label: "没什么", value: "none" },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_stack", slot: "stack", required: false, type: "choice",
          text: "用什么工具？",
          hint: "工具决定代码语法和交付物形态",
          options: [
            { label: "Excel/WPS", value: "Excel/WPS，用函数和数据透视表" },
            { label: "Python（pandas）", value: "Python + pandas/matplotlib" },
            { label: "SQL", value: "SQL，兼容主流数据库" },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_data_desc", slot: "data_desc", required: false, type: "text",
          text: "数据长什么样？字段、格式、大概量级",
          hint: "说清字段和脏数据情况，结论才不会跑偏",
          placeholder: "例如：1000 行订单，字段有日期/金额/渠道，日期格式不统一" },
        { id: "q_format", slot: "format", required: false, type: "choice",
          text: "结论怎么呈现？",
          hint: "呈现方式决定分析深度和组织方式",
          options: [
            { label: "一页纸报告（结论先行）", value: "一页纸报告：核心结论（3 条）→ 数字依据 → 建议清单" },
            { label: "分点清单", value: "分点清单，每条一个发现 + 依据" },
            { label: "图表 + 解读", value: "每张图表配一句话解读，指出看什么、说明什么" },
            { label: "表格明细", value: "Markdown 表格明细，附口径说明" },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_audience", slot: "audience", required: false, type: "choice",
          text: "给谁看这份分析？",
          hint: "给老板看要短，给自己看要全",
          options: [
            { label: "自己看，要完整", value: "自己看，要完整可复现" },
            { label: "老板/决策者，要短", value: "老板/决策者，结论先行，一页以内" },
            { label: "同事协作，要细", value: "同事协作，过程和口径要写细" },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_inputs", slot: "inputs", required: false, type: "text",
          text: "数据能贴出来吗（前几行）？",
          hint: "贴表头和两三行样例，AI 就能理解结构",
          placeholder: "例如：日期,渠道,金额 …" }
      ]
    },

    {
      id: "academic", name: "学术科研", tagline: "论文、基金、审稿回复、实验设计",
      keywords: [
        { k: "论文", w: 3 }, { k: "摘要", w: 3 }, { k: "基金", w: 3 }, { k: "审稿", w: 3 },
        { k: "评审", w: 3 }, { k: "参考文献", w: 2 }, { k: "投稿", w: 2 }, { k: "学术", w: 2 },
        { k: "科研", w: 2 }, { k: "研究", w: 1 }
      ],
      sectionOrder: ["role", "goal", "context", "venue", "steps", "rules", "format", "examples"],
      variants: {
        standard: { sections: ["role", "goal", "context", "venue", "steps", "rules", "format", "examples"] },
        rigorous: { sections: ["role", "goal", "context", "venue", "steps", "rules", "checklist", "format", "examples"], extraRules: "\n- 完成后逐项自检：每个论断有文献或数据支撑；不超出数据能支持的范围；学术不端零容忍（不编造引用、不捏造数据）" },
        minimal:  { sections: ["role", "goal", "venue", "format"] }
      },
      defaults: {
        role: "一位严谨的学术写作导师，熟悉本研究领域的写作规范与审稿人口味",
        task: "（见上方需求）",
        done: "逻辑严密、每个论断有依据、达到目标场合的规范要求",
        non_goals: "不夸大结论，不引用不存在的文献，不替用户做学术不端的事",
        audience: "领域内的专业审稿人或同行",
        inputs: "材料见下方说明",
        venue: "（待补充：目标期刊/会议/课程，或读者身份）",
        steps: "1. 先明确核心贡献（一句话说清新在哪）\n2. 按目标场合的规范组织结构\n3. 每个论断配文献或数据支撑\n4. 通读一遍，删掉所有无依据的形容词",
        constraints: "推断与事实分开陈述；不超出数据能支持的范围；引用格式统一",
        checklist: "□ 核心贡献一句话说清 □ 每个论断有支撑 □ 局限性有交代 □ 无绝对化用语",
        format: "按目标场合规范组织；语言为要求的语言；字数与图表数符合要求",
        examples: "（无，按上述标准生成）"
      },
      questions: [
        { id: "q_done", slot: "done", required: true, type: "choice",
          text: "做到什么样算达标？",
          hint: "投稿、组会、作业的标准完全不同，先说清场合",
          options: [
            { label: "达到可投稿水平", value: "达到可投稿水平：新颖性明确、论证严密、符合期刊规范" },
            { label: "达到组会汇报水平", value: "达到组会汇报水平：逻辑清晰、问题意识突出" },
            { label: "达到课程作业水平", value: "达到课程作业水平：规范完整、概念准确" },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_non_goals", slot: "non_goals", required: true, type: "choice",
          text: "红线是什么？",
          hint: "学术场景的红线必须先说死，这是底线问题",
          options: [
            { label: "不夸大结论/不过度 claim", value: "不夸大结论、不过度 claim，推断与事实分开" },
            { label: "不编造文献和数据", value: "不编造文献和数据，不确定就标注 [需核实]" },
            { label: "都不要，按最严格来", value: "以上全部遵守，按最严格学术标准执行" },
            { label: "没什么", value: "none" },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_venue", slot: "venue", required: false, type: "text",
          text: "投向哪/什么场合？读者是谁？",
          hint: "场合决定结构、口吻和取舍，写清楚 AI 才知道对谁说话",
          placeholder: "例如：某领域一区期刊 / 组会 / 本科课程作业" },
        { id: "q_format", slot: "format", required: false, type: "choice",
          text: "要什么体裁？",
          hint: "不同体裁有不同骨架，选对了结构就稳了",
          options: [
            { label: "研究论文（IMRaD）", value: "研究论文，按 IMRaD 结构组织" },
            { label: "结构化文献阅读笔记", value: "结构化阅读笔记：①一句话结论 ②研究问题与方法 ③方法可靠性与弱点（像审稿人一样挑毛病）④与我课题的关联与可借鉴点 ⑤我没读懂、想追问的问题", fills: { role: "一位严谨的文献分析伙伴，像方法审稿人一样读论文：擅长识别本研究领域的范式、常见方法论缺陷和审稿人关注点", steps: "1. 先读摘要和结论，用一句话说清这篇论文声称解决了什么问题\n2. 拆解方法与证据链，评估证据能否支撑结论\n3. 以审稿人视角列出局限与潜在弱点\n4. 找出与我课题的关联点和可借鉴方法\n5. 列出我没读懂、想追问的问题" } },
            { label: "多篇文献对比矩阵", value: "Markdown 表格：论文 | 研究问题 | 方法 | 主要结论 | 局限性 | 与我课题的关联；表后附 3 条跨论文综合发现", fills: { role: "一位严谨的文献综合伙伴，擅长跨论文对比方法、结论与局限，识别领域共识与矛盾", steps: "1. 逐篇提取研究问题、方法、主要结论、局限性\n2. 建对比矩阵，逐格填充，缺信息写「未报告」\n3. 横看矩阵找共识、矛盾与空白\n4. 归纳 3 条跨论文综合发现，各附依据论文" } },
            { label: "摘要 / Cover letter", value: "摘要或 Cover letter，突出核心贡献与契合点" },
            { label: "基金申请书", value: "基金申请书，突出科学问题与可行性" },
            { label: "审稿回复信", value: "审稿回复信，逐条回应，礼貌而坚定" },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_inputs", slot: "inputs", required: false, type: "text",
          text: "有材料吗（摘要/数据/导师意见）？",
          hint: "贴关键部分，AI 基于事实写，不凭空发挥",
          placeholder: "例如：一段摘要草稿 / 三条审稿意见" },
        { id: "q_constraints", slot: "constraints", required: false, type: "text",
          text: "有格式要求吗（字数/图表数/引用风格）？",
          hint: "硬性要求写进约束，AI 才不会自由发挥",
          placeholder: "例如：8000 字以内 / 6 图 / APA 第 7 版" }
      ]
    },

    {
      id: "study", name: "学习研究", tagline: "讲题、复习、概念解释、规划",
      keywords: [
        { k: "讲解", w: 2 }, { k: "解释", w: 2 }, { k: "复习", w: 3 }, { k: "做题", w: 3 },
        { k: "学习", w: 2 }, { k: "入门", w: 2 }, { k: "教程", w: 2 }, { k: "背", w: 2 },
        { k: "讲课", w: 3 }, { k: "刷题", w: 3 }, { k: "考点", w: 2 }, { k: "零基础", w: 2 },
        { k: "规划", w: 1 }, { k: "讲讲", w: 2 }, { k: "怎么理解", w: 3 }
      ],
      sectionOrder: ["role", "goal", "context", "steps", "rules", "format", "examples"],
      variants: {
        standard: { sections: ["role", "goal", "context", "steps", "rules", "style", "format", "examples"] },
        rigorous: { sections: ["role", "goal", "context", "steps", "rules", "style", "checklist", "format", "examples"], extraRules: "\n- 完成后逐项自检：每个概念都先用一句人话解释再上严格定义；例题步骤完整不跳步" },
        minimal:  { sections: ["role", "goal", "context", "format"] }
      },
      defaults: {
        role: "一位耐心的名师，擅长把复杂概念讲到零基础也能懂",
        task: "（见上方需求）",
        done: "学习者能自己做对同类题，或能讲给别人听",
        style: "先直觉后严格：先用类比建立感觉，再给准确定义",
        non_goals: "不一上来堆公式，不跳步骤，不只给答案不给思路",
        audience: "零基础初学者",
        inputs: "（待补充：具体题目或材料）",
        steps: "1. 先用生活类比建立直觉\n2. 再给严格定义和条件\n3. 带着做一道例题，每步说明为什么\n4. 出一道同类题让学习者试",
        constraints: "先直觉后严格；每步给“为什么”不只给“是什么”；发现误区主动点出",
        checklist: "□ 有一句人话版本 □ 有至少一个例子 □ 指出至少一个常见误区 □ 结尾有自测",
        format: "一页知识卡片：一句人话解释 + 严格定义 + 一个例子 + 一个常见误区",
        examples: "（无，按上述标准生成）"
      },
      questions: [
        { id: "q_done", slot: "done", required: true, type: "choice",
          text: "学到什么程度算会了？",
          hint: "“看懂”和“会做”是两回事，完成标准要说哪个",
          options: [
            { label: "能自己做对同类题", value: "能独立做对同类题，步骤完整" },
            { label: "能讲给别人听", value: "能讲给别人听（费曼标准）" },
            { label: "能说出知识框架", value: "能说出该知识点的框架和位置" },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_non_goals", slot: "non_goals", required: true, type: "choice",
          text: "不想要什么讲法？",
          hint: "说清讨厌的讲法，AI 才会避开",
          options: [
            { label: "不要一上来堆公式", value: "不一上来堆公式，先建立直觉" },
            { label: "不要跳步骤", value: "不跳步骤，每一步都说明为什么" },
            { label: "不要只给答案", value: "不只给答案，要给思路和自查方法" },
            { label: "没什么", value: "none" },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_audience", slot: "audience", required: false, type: "choice",
          text: "你现在什么水平？",
          hint: "水平决定起点，AI 不会从零基础听不懂的高度讲起",
          options: [
            { label: "完全零基础", value: "完全零基础，从生活经验讲起" },
            { label: "学过一点，忘了", value: "学过但忘了，需要唤醒和串联" },
            { label: "有基础，要进阶", value: "有基础，直接讲进阶和坑点" },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_style", slot: "style", required: false, type: "choice",
          text: "喜欢什么讲法？",
          hint: "讲法偏好写进步骤，AI 的组织方式会跟着变",
          options: [
            { label: "先直觉后严格", value: "1. 先用生活类比建立直觉\n2. 再给严格定义\n3. 例题带做\n4. 同类题自测", fills: { style: "1. 先用生活类比建立直觉\n2. 再给严格定义和适用条件\n3. 带着做一道例题，每步说明为什么\n4. 出一道同类题自测" } },
            { label: "先严格后应用", value: "严格优先", fills: { style: "1. 先给严格定义\n2. 再讲适用条件和常见误区\n3. 例题带做\n4. 同类题自测" } },
            { label: "刷题带练", value: "刷题带练", fills: { style: "1. 直接上题，先让学习者试\n2. 卡壳处再讲对应知识点\n3. 总结通用解法\n4. 再练一道变式题" } },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_inputs", slot: "inputs", required: false, type: "text",
          text: "有具体题目或材料吗？贴上来",
          hint: "有题就按题讲，没有就按知识点讲",
          placeholder: "例如：一道课后题 / 一段看不懂的教材" },
        { id: "q_format", slot: "format", required: false, type: "choice",
          text: "产出形式？",
          hint: "形式决定内容组织：卡片重凝练，讲解稿重起承转合",
          options: [
            { label: "一页知识卡片", value: "一页知识卡片：一句人话解释 + 严格定义 + 例子 + 误区" },
            { label: "30 分钟讲解稿", value: "30 分钟讲解稿：有起承转合和互动提问" },
            { label: "10 道练习题 + 解析", value: "10 道同类练习题 + 逐步解析" },
            { label: "费曼式问答脚本", value: "费曼式问答脚本：AI 提问、引导学习者讲出来" },
            { label: "其他，我自己说", value: "__other__" }
          ] }
      ]
    },

    {
      id: "image", name: "绘图生成", tagline: "AI 绘画、海报、插画、封面",
      keywords: [
        { k: "画一", w: 3 }, { k: "文生图", w: 3 }, { k: "海报", w: 3 }, { k: "插画", w: 3 },
        { k: "logo", w: 3 }, { k: "封面", w: 2 }, { k: "壁纸", w: 2 }, { k: "头像", w: 2 },
        { k: "生成图", w: 2 }, { k: "配图", w: 2 }, { k: "画", w: 1 }
      ],
      sectionOrder: ["role", "goal", "context", "steps", "rules", "format", "examples"],
      variants: {
        standard: { sections: ["role", "goal", "context", "steps", "rules", "style", "format", "examples"] },
        rigorous: { sections: ["role", "goal", "context", "steps", "rules", "style", "checklist", "format", "examples"], extraRules: "\n- 完成后逐项自检：主体、环境、光线、色调、风格五要素齐全；无冲突描述；无文字水印要求" },
        minimal:  { sections: ["role", "goal", "format"] }
      },
      defaults: {
        role: "一位资深视觉总监，擅长把模糊的画面想法写成 AI 能听懂的画面指令",
        task: "（见上方需求）",
        done: "画面五要素（主体/环境/光线/色调/风格）齐全，主体清晰可识别",
        style: "写实摄影为主，自然光，高细节",
        non_goals: "画面不出现文字、水印、畸形手部和多余元素",
        audience: "用于文章配图，需干净清晰",
        inputs: "（待补充：参考图或主体描述）",
        steps: "1. 确定主体和主体动作\n2. 补环境与氛围\n3. 定光线与色调\n4. 定风格与质量词",
        constraints: "描述具体可拍；不用“美丽、壮观”类空词；一个画面只讲一件事",
        checklist: "□ 主体明确 □ 环境具体 □ 光线/色调/风格齐全 □ 无冲突描述 □ 无文字元素",
        format: "画面描述按要素分述：主体 / 环境 / 构图 / 光线 / 色调 / 风格 / 质量词；比例见背景",
        examples: "（无，按上述标准生成）"
      },
      questions: [
        { id: "q_done", slot: "done", required: true, type: "choice",
          text: "图要达成什么效果？",
          hint: "“好看”AI 听不懂，“主体清晰、有氛围”才听得懂",
          options: [
            { label: "主体清晰可识别", value: "主体清晰可识别，一眼能看出画的是什么" },
            { label: "有特定氛围/情绪", value: "有明确氛围和情绪，能感染人" },
            { label: "干净可直接用", value: "干净无干扰元素，可直接投入使用" },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_non_goals", slot: "non_goals", required: true, type: "choice",
          text: "画面里不要出现什么？",
          hint: "AI 画画最大的坑就是多出手、多出字，提前说死",
          options: [
            { label: "不要文字/水印", value: "画面不出现任何文字、字母和水印" },
            { label: "不要多余的人", value: "画面不出现多余人物，只保留必要主体" },
            { label: "不要某种颜色", value: "避开指定颜色（说明见输入）", fills: { non_goals: "避开指定颜色，整体色调统一" } },
            { label: "没什么", value: "none" },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_audience", slot: "audience", required: false, type: "choice",
          text: "用在哪？",
          hint: "用途决定尺寸、信息密度和风格",
          options: [
            { label: "文章配图", value: "文章配图，干净清晰、不抢正文" },
            { label: "海报/封面", value: "海报/封面，视觉冲击优先" },
            { label: "头像/图标", value: "头像/图标，简洁高识别" },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_style", slot: "style", required: false, type: "choice",
          text: "风格参考？",
          hint: "风格词是画面指令里最有效的部分之一",
          options: [
            { label: "写实摄影", value: "写实摄影，自然光，高细节", fills: { style: "写实摄影风，自然光，高细节，真实材质" } },
            { label: "插画/扁平", value: "插画扁平", fills: { style: "扁平插画风，色块分明，轮廓清晰" } },
            { label: "3D 渲染", value: "3D 渲染", fills: { style: "3D 渲染风，柔和材质，工作室灯光" } },
            { label: "国风/水彩", value: "国风水彩", fills: { style: "国风水彩风，留白意境，淡雅色调" } },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_format", slot: "format", required: false, type: "choice",
          text: "尺寸/比例？",
          hint: "比例写进格式要求，避免出来裁不齐",
          options: [
            { label: "横图 16:9", value: "画面描述五要素齐全；横图 16:9" },
            { label: "竖图 9:16", value: "画面描述五要素齐全；竖图 9:16，主体居中偏上" },
            { label: "方形 1:1", value: "画面描述五要素齐全；方形 1:1" },
            { label: "无所谓", value: "画面描述五要素齐全，比例不限" },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_inputs", slot: "inputs", required: false, type: "text",
          text: "有参考图链接或要画的主体描述吗？",
          hint: "主体描述越具体，出图越稳",
          placeholder: "例如：一只戴眼镜的橘猫在书桌前看代码" }
      ]
    },

    {
      id: "automate", name: "效率自动化", tagline: "工作流、批处理、模板、整理",
      keywords: [
        { k: "自动", w: 3 }, { k: "批量", w: 3 }, { k: "模板", w: 2 }, { k: "整理", w: 2 },
        { k: "转换", w: 2 }, { k: "提取", w: 2 }, { k: "监控", w: 2 }, { k: "定时", w: 2 },
        { k: "爬虫", w: 2 }, { k: "重复", w: 1 }, { k: "流程", w: 1 }
      ],
      sectionOrder: ["role", "goal", "context", "steps", "rules", "format", "examples"],
      variants: {
        standard: { sections: ["role", "goal", "context", "stack", "steps", "rules", "format", "examples"] },
        rigorous: { sections: ["role", "goal", "context", "stack", "steps", "rules", "checklist", "format", "examples"], extraRules: "\n- 完成后逐项自检：失败有提示而非静默；不覆盖原文件；关键步骤留日志" },
        minimal:  { sections: ["role", "goal", "context", "format"] }
      },
      defaults: {
        role: "一位效率工程师，擅长把重复劳动拆成可自动运行的稳定流程",
        task: "（见上方需求）",
        done: "全自动运行，产出结果文件，失败有明确提示",
        non_goals: "不动线上数据，不删原文件",
        audience: "我自己使用，要求稳定省心",
        inputs: "（待补充：输入是什么、输出要什么）",
        stack: "Python + 系统自带的定时/脚本能力，不依赖需要付费的服务",
        steps: "1. 说清输入和触发条件\n2. 主流程分步，每步可单独验证\n3. 异常处理：失败时提示而不是静默跳过",
        constraints: "不覆盖原文件，输出到新位置；关键步骤打印日志；先 Dry-run 再执行",
        checklist: "□ 输入输出路径写死 □ 失败有提示 □ 不覆盖原文件 □ 可重复运行结果一致",
        format: "先给流程说明（输入→步骤→输出），再给可运行的脚本或配置",
        examples: "（无，按上述标准生成）"
      },
      questions: [
        { id: "q_done", slot: "done", required: true, type: "choice",
          text: "跑完什么样算成？",
          hint: "自动化最容易在“边界情况”上翻车，先说清达成标准",
          options: [
            { label: "全自动不用我管", value: "全自动运行，无需人工介入，失败有明确提示" },
            { label: "半自动，我确认关键步", value: "半自动：关键步骤暂停等我确认" },
            { label: "产出整理好的结果", value: "产出整理好的结果文件，过程可不管" },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_non_goals", slot: "non_goals", required: true, type: "choice",
          text: "明确不做？",
          hint: "自动化的破坏力比手工大，红线必须先说",
          options: [
            { label: "不要联网/不动线上数据", value: "不联网、不动任何线上数据" },
            { label: "不要删原文件", value: "不删除、不覆盖任何原文件，输出到新位置" },
            { label: "一次性就行，不用天天跑", value: "一次性任务，不需要定时和持久化" },
            { label: "没什么", value: "none" },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_io", slot: "inputs", required: false, type: "text",
          text: "输入是什么、想要什么输出？",
          hint: "“输入→输出”一句话说清，流程就成型了一半",
          placeholder: "例如：一个文件夹的 CSV → 一份汇总 Excel" },
        { id: "q_freq", slot: "constraints", required: false, type: "choice",
          text: "多久跑一次/什么触发？",
          hint: "触发方式决定技术方案（定时任务 vs 事件监听 vs 手动）",
          options: [
            { label: "一次性", value: "一次性任务，跑完即止", fills: { constraints: "一次性任务，不需要定时和状态保持" } },
            { label: "每天定时", value: "每天定时", fills: { constraints: "每天定时运行，需记录上次运行时间避免重复处理" } },
            { label: "有文件进来就跑", value: "事件触发", fills: { constraints: "监听目录，有新文件即触发，处理完移到已处理目录" } },
            { label: "我手动点", value: "手动触发", fills: { constraints: "手动触发，提供一个明确的运行入口" } },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_stack", slot: "stack", required: false, type: "choice",
          text: "在哪跑？",
          hint: "运行环境决定能用什么工具",
          options: [
            { label: "我电脑上（本地脚本）", value: "本地脚本，Python 3.10+ 或系统自带工具" },
            { label: "WorkBuddy 里对话完成", value: "在 WorkBuddy 对话中分步完成，我逐步确认" },
            { label: "云端/网页", value: "云端或网页环境，可定时触发" },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_format", slot: "format", required: false, type: "choice",
          text: "结果怎么交付？",
          hint: "交付物形态写清楚，省得返工",
          options: [
            { label: "一个文件", value: "交付一个结果文件，路径明确" },
            { label: "一条消息/通知", value: "交付一条汇总消息/通知" },
            { label: "一段可复用脚本", value: "交付一段可复用脚本，附使用说明" },
            { label: "看板/汇总表", value: "交付一个看板或汇总表" },
            { label: "其他，我自己说", value: "__other__" }
          ] }
      ]
    },

    /* 任务规划：复杂任务分解、周计划、里程碑——高位实践：复杂任务先拆解再逐段执行 */
    {
      id: "planning", name: "任务规划", tagline: "复杂任务分解、周计划、里程碑",
      keywords: [
        { k: "分解", w: 3 }, { k: "拆解", w: 3 }, { k: "周计划", w: 3 }, { k: "任务拆分", w: 3 },
        { k: "里程碑", w: 3 }, { k: "计划", w: 2 }, { k: "规划", w: 2 }, { k: "排期", w: 2 },
        { k: "roadmap", w: 2 }, { k: "安排", w: 2 }, { k: "节奏", w: 2 }, { k: "步骤", w: 1 },
        { k: "怎么推进", w: 2 }, { k: "时间线", w: 2 }
      ],
      questions: [
        { id: "q_done", slot: "done", required: true, type: "choice",
          text: "计划做到什么样算好？",
          hint: "“看起来合理”和“能直接开工”是两种完全不同的计划",
          options: [
            { label: "每周任务具体到能直接开工", value: "可执行：每周任务有明确动作、交付物和完成标准" },
            { label: "阶段清晰，风险有预案", value: "阶段划分清晰，关键风险有预案和调整机制" },
            { label: "能跟踪进度，有检查点", value: "有检查点和量化进度跟踪方式" },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_non_goals", slot: "non_goals", required: true, type: "choice",
          text: "明确不要什么样的计划？",
          hint: "计划类需求最常见的翻车就是空话和理想化排期",
          options: [
            { label: "不要空话套话", value: "不写“加强、推进、深入”这类空话，每条任务必须可执行" },
            { label: "不要把日程排满", value: "不把日程排满，每周留 20% 缓冲时间" },
            { label: "不要假设我全天有空", value: "按我实际可投入的时间排，不假设全天可投入" },
            { label: "没什么", value: "none" },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_scope", slot: "inputs", required: false, type: "text",
          text: "整体目标和现状是什么？要达成什么、已经有什么",
          hint: "目标+现状+边界说清，分解才不是空中楼阁",
          placeholder: "比如：三个月内完成综述投稿，已有约 40 篇文献笔记……" },
        { id: "q_constraints", slot: "constraints", required: false, type: "text",
          text: "有什么硬约束？时间、精力、不能碰的日期",
          hint: "每周能投入几小时、有没有动不了的 deadline，写清楚",
          placeholder: "比如：每周 20 小时；12 月要开题；周末有一天要进实验室……" },
        { id: "q_format", slot: "format", required: false, type: "choice",
          text: "计划要什么形式？",
          hint: "形式决定分解粒度：表格按周，里程碑按阶段",
          options: [
            { label: "按周分解的表格", value: "按周分解的 Markdown 表格：周次 | 任务 | 交付物 | 完成标准；末尾附风险清单与调整机制" },
            { label: "里程碑 + 阶段清单", value: "先列 3-5 个里程碑，每个里程碑下拆阶段任务清单" },
            { label: "倒排时间表", value: "从截止日倒排：每个节点标注最晚完成时间与依赖关系" },
            { label: "其他，我自己说", value: "__other__" }
          ] },
        { id: "q_risks", slot: "risks", required: false, type: "text",
          text: "什么情况算计划跑偏？到时候怎么调？",
          hint: "提前约定“偏离信号”和调整规则，计划才活得久",
          placeholder: "比如：连续两周没交周交付物就砍范围；导师要返工就顺延一周……" },
        { id: "q_examples", slot: "examples", required: false, type: "text",
          text: "有没有一个“对味”的计划片段？贴一段让它模仿",
          hint: "一段理想计划的样子，比十句“要具体”都管用",
          placeholder: "比如：第 1 周：精读 5 篇综述，产出主题地图（1 张）……" }
      ],
      defaults: {
        role: "一位经验丰富的项目规划顾问，擅长把模糊目标拆成可执行、可跟踪的计划",
        task: "（见上方需求）",
        done: "计划可执行：每个任务有明确动作、交付物和完成标准",
        non_goals: "不写空话套话；不排满日程；不假设全天可投入",
        audience: "计划执行者本人",
        inputs: "（待补充：整体目标与现状）",
        constraints: "尊重实际可投入时间；每周留 20% 缓冲；依赖关系写明",
        risks: "（待补充：偏离信号与调整规则）",
        steps: "1. 先复述目标、约束和现状，确认理解无误\n2. 按里程碑划分阶段，明确每阶段的出口条件\n3. 把每阶段拆成周级任务：动作、交付物、完成标准\n4. 标注任务间依赖与关键路径\n5. 给出检查点：每周怎么判断在轨，偏了怎么调",
        checklist: "□ 每周任务可直接开工 □ 交付物可检验 □ 有缓冲时间 □ 偏离时有明确调整规则",
        format: "按周分解的 Markdown 表格：周次 | 任务 | 交付物 | 完成标准；末尾附风险清单与调整机制",
        examples: "（无，按上述标准生成）"
      },
      variants: {
        standard: { sections: ["role", "goal", "context", "steps", "rules", "risks", "format", "examples"] },
        rigorous: {
          sections: ["role", "goal", "context", "steps", "rules", "checklist", "risks", "format", "examples"],
          extraRules: "\n- 计划必须自洽：总工作量 ≤ 可投入总工时；每个里程碑前留出返工时间"
        },
        minimal: { sections: ["role", "goal", "format"] }
      }
    }
  ],

  /* 通用兜底：分接器没把握时用，问题树最简 */
  general: {
    id: "general", name: "通用任务", tagline: "我先按通用方式处理",
    sectionOrder: ["role", "goal", "context", "steps", "rules", "format"],
    variants: {
      standard: { sections: ["role", "goal", "context", "steps", "rules", "format"] },
      rigorous: { sections: ["role", "goal", "context", "steps", "rules", "checklist", "format"], extraRules: "\n- 完成后逐项自检：是否回应了原始需求的每一个要点" },
      minimal:  { sections: ["role", "goal", "format"] }
    },
    defaults: {
      role: "一位经验丰富的专家顾问，擅长把模糊需求拆成清晰可执行的方案",
      task: "（见上方需求）",
      done: "产出可直接使用的结果，覆盖需求的每个要点",
      non_goals: "不编造不存在的信息，不引入无关内容",
      audience: "（待补充：给谁用/谁看）",
      inputs: "（待补充：现成材料）",
      steps: "1. 先复述需求确认理解无误\n2. 拆解成 2-4 个步骤\n3. 逐步执行并说明依据",
      constraints: "不确定的信息标注 [需核实]；不夸大、不臆测",
      checklist: "□ 需求每个要点都有回应 □ 无编造信息 □ 结构清晰",
      format: "结构化输出：先结论/结果，后过程与依据",
      examples: "（无，按上述标准生成）"
    },
    questions: [
      { id: "q_done", slot: "done", required: true, type: "text",
        text: "做成什么样算好？说一个你能想到的标准",
        hint: "哪怕只说一条（比如“要能直接用”），也比不说强得多",
        placeholder: "例如：读完知道该怎么做" },
      { id: "q_audience", slot: "audience", required: false, type: "text",
        text: "给谁用/谁看？",
        hint: "受众决定深度和语气",
        placeholder: "例如：完全不懂的同事" },
      { id: "q_non_goals", slot: "non_goals", required: false, type: "text",
        text: "有什么不想要的？",
        hint: "写一条“不做什么”，能挡掉一大类翻车",
        placeholder: "例如：不要太长" },
      { id: "q_format", slot: "format", required: false, type: "text",
        text: "想要什么形式的产出？",
        hint: "清单、文章、表格、代码……说个大概就行",
        placeholder: "例如：分点清单" },
      { id: "q_inputs", slot: "inputs", required: false, type: "text",
        text: "有现成材料吗？",
        hint: "有就贴关键部分，AI 基于材料发挥",
        placeholder: "例如：一段草稿" }
    ]
  },

  /* 五维体检：对已有提示词做规则检测 */
  health: {
    dimensions: [
      {
        id: "role", name: "角色",
        score2: "有具体身份 + 专长/领域/年限限定",
        patterns: [/^#+\s*角色/m, /你是[^，。；\n]{2,}/, /作为[^，。；\n]{2,}/],
        limitPattern: /(资深|经验|擅长|专家|顾问|导师|总监|工程师|分析师|编辑)/,
        advice: [
          "补一个具体身份：例如“你是一位有 10 年经验的投资分析师，擅长用通俗语言解释复杂概念”。",
          "只写“你是一个助手”等于没写——没有专长和视角，输出必然平庸。"
        ]
      },
      {
        id: "task", name: "任务",
        score2: "有任务描述 + 有完成标准",
        patterns: [/要做什么|任务|目标|帮我|请/, /完成标准|标准|要求|确保|使得|达到|合格/],
        advice: [
          "把任务改成“动作 + 对象 + 标准”：“分析（动作）这份财报（对象），找出三个最关键的风险点（标准）”。",
          "最关键的是补上完成标准：写成什么样算好？没有它，AI 只能靠猜。"
        ]
      },
      {
        id: "constraints", name: "约束",
        score2: "至少 1 条明确的禁止项或边界",
        patterns: [/不要|禁止|不得|避免|仅|只许|勿|不引用|不编造|标注|区分|注明|引用|锚定|推断|不确定|逐条|分开|原文|必须|不超过|先判断|只改|仅改/],
        advice: [
          "加 1-3 条“不做什么”：不要用专业术语、不要超过 800 字、不要给出投资建议。",
          "写清“明确不做”能防范围蔓延，比写“要做什么”更能提升稳定性。"
        ]
      },
      {
        id: "format", name: "格式",
        score2: "输出结构描述具体（结构/字数/载体）",
        patterns: [/格式|表格|Markdown|JSON|列表|分点|字数|标题|分段|结构|单文件|函数|示例|代码|脚本|完整|可运行|sheet|图/],
        advice: [
          "把输出格式写具体：“用 Markdown 表格，三列：风险类型 / 具体表现 / 建议应对”。",
          "格式越具体，AI 输出越稳定，你越省修改时间。"
        ]
      },
      {
        id: "examples", name: "示例",
        score2: "至少 1 个完整示例",
        patterns: [/示例|例如|比如|样例|参考[：:样]/],
        advice: [
          "给 1-3 个理想输出的例子（few-shot），AI 会快速对齐你的风格和颗粒度。",
          "示例比形容词管用：“像这样：……”胜过“写得生动一点”。"
        ]
      }
    ],
    /* 差评/一般 必选原因 → 对应维度 */
    gsbReasons: [
      { value: "role", label: "角色不对味" },
      { value: "task", label: "任务/完成标准不清" },
      { value: "constraints", label: "约束不够，跑偏了" },
      { value: "format", label: "格式不对" },
      { value: "examples", label: "缺少示例，风格对不上" },
      { value: "other", label: "其他" }
    ]
  },

  /* 模块级针对性重写策略（规则增强，非 LLM） */
  rewrite: {
    role: function (v) {
      var hasLimit = /(资深|经验|擅长|专家|顾问|导师|总监|工程师|分析师|编辑)/.test(v);
      return hasLimit ? v : v + "，在该领域有 10 年以上经验，以严谨和清晰著称";
    },
    task: function (v, slots) {
      return v.indexOf("完成标准") >= 0 ? v : v + "\n  完成标准：" + (slots.done || "产出可直接使用、覆盖全部需求要点");
    },
    constraints: function (v, slots) {
      var extra = slots.non_goals && slots.non_goals !== "none" ? "\n- 明确不做：" + slots.non_goals : "";
      return v + extra;
    },
    format: function (v) {
      return /（|具体|表格|Markdown|JSON|列表|分点/.test(v) ? v : v + "\n  具体要求：结构化输出，先结论后依据，长度克制";
    },
    examples: function (v) {
      return /示例|例如/.test(v) ? v : v + "\n  请按以下示例的颗粒度和风格输出：\n  （示例：……）";
    }
  },

  /* 导出：接入指引 */
  exportGuide: {
    workbuddy: "在 WorkBuddy 里新建一个任务，把整段提示词作为第一条消息粘贴发送，后续直接对话即可。",
    claude: "在 Claude Projects 的 Custom Instructions 中粘贴，或在对话开头作为系统提示词发送。",
    api: "作为请求体的 system 字段内容发送，user 字段放具体任务输入。"
  }
};
