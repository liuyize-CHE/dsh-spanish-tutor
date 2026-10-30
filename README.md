# dsh-spanish-tutor · 西语练习

DeepSeek Harness（dsh）的西语学习插件。**六类本地判分的练习**，外加一类模型批改的情景造句，
覆盖「认词 → 变形 → 用句 → 表达」：

| 题型 | 练什么 | 判分 |
|---|---|---|
| **动词变位** | 11 个时态 × 6 人称 | 本地引擎 |
| **名词阴阳性** | 阳性/阴性（含 mano、día 这类特例） | 本地引擎 |
| **名词复数** | 含 luz→luces、joven→jóvenes | 本地引擎 |
| **认词** | 词义选择（西→中、中→西） | 本地引擎 |
| **句子填空** | 挖变位/冠词/介词/形容词的整句 | 本地引擎 |
| **语法专项** | ser/estar、虚拟式、por/para | 本地引擎 + 自带规则说明 |
| **情景造句** | 给场景写一句西语 | 模型批改 |

> 规则层是为西语写的，不是套用英语词库改几个词：11 个时态（含虚拟式、命令式、
> 四种完成时）、`ser/estar/ir` 这类完全不规则动词、`mano`（阴性却是 -o 结尾）、
> `el agua`（阴性却用 el）、`luz → luces` 这类坑都在引擎里处理。

## 设计：混合引擎

职责分工是刻意划的：

| 部分 | 由谁做 | 为什么 |
|---|---|---|
| **机械练习**：变位、阴阳性、复数、认词、填空、语法辨析 | **本地规则引擎**（词库） | 答案唯一、可离线、毫秒出题、零 token |
| **自由表达**：情景造句 | **模型** | 没有唯一答案，只能靠理解判断 |
| **教学**：讲规则、给例句、指出易错点 | **模型** | 需要理解与表达，规则引擎做不了 |
| **讲解**：为什么错 | **模型** | 同上 |
| **判分** | **本地引擎**（host 端） | 不烧 token；且服务端重算答案，改前端作弊无效 |

**词库只服务基础练习，不做它做不了的事。** 真正需要「教你」的部分全交给模型。

### 一个刻意的设计：语法题自带规则

`ser/estar`、`虚拟式` 这类题的每道题都带一句 `rule`（如「来源/国籍用 ser」）。
答错时**本地规则先显示**，不管模型是否可用 —— 不让学习完全押在模型上。

### 「学」和「练」是两条路

这是关键设计：**不是只有做题**。

- **先学**：点「先学一下」，模型讲清这个知识点 + 2 个例句 + 易错点，然后你再作答
- **看答案**：卡住时点「看答案」，直接揭晓（不烧 token）
- **先练**：直接作答，答错时模型讲为什么错

三种力度在设置里可切：`先学后练` / `只给最短答案` / `关闭讲解`。选「关闭」后完全不调模型（情景造句也随之不可用）。

## 模型选择

**默认跟随你在 DSH 里选的模型**，不用额外配置。

也可以指定别的 —— 比如主对话用大模型、讲解用便宜的小模型：

设置 → 进度页 → 「讲解用哪个模型」→ 选 `指定模型` → 选 provider 和 model。

模型不可用时（没配置/超时/报错）一律**降级**：照样给答案，只是没有讲解，不影响练习。

## 能力

### 动词变位
- 11 个时态：现在时、简单过去时、过去未完成时、将来时、条件式、虚拟式现在时、
  现在完成时、过去完成时、将来完成时、条件完成时、命令式
- 处理了这些规则：
  - **词干变化**（pensar→pienso、poder→puedo、pedir→pido、dormir→duermo）
  - **正字法变化**（llegar→llegué、buscar→busqué、empezar→empecé）
  - **完全不规则**（ser、estar、ir、haber、tener、hacer、decir、saber、caber、valer、oír…）
  - **元音词干**（leer→leyó、construir→construyó、reír→río）
- 命令式的 tú / vosotros / usted / nosotros / ustedes 五种形式

### 名词
- **阴阳性**：词尾规则 + 例外表（`mano`/`foto` 是阴性，`día`/`mapa`/`problema` 是阳性）
- **复数**：含 `-z→-ces`（luz→luces）、重音位移（canción→canciones、joven→jóvenes）
- **冠词**：`el agua` / `un agua`（重读 a 开头的阴性名词单数用 el，但仍是阴性）
- **形容词一致**：性别 + 数

### 间隔重复
8 级 SRS。答对升级、答错退两级、**只差重音不升不降**（重音错≠不会这个词）。
到期的卡片优先出题，其次才是新词。

## 安装

从 GitHub 装：

```bash
dsh plugin --profile web add github:liuyize-CHE/dsh-spanish-tutor
```

或者用插件管理面板「浏览更多插件」搜索 `spanish`，一条命令装好。

> ⚠️ 如果你的 DSH 只有 `desktop` 一个 profile，**不要**用 `--profile desktop`——
> CLI 会拒绝（`profile "desktop" is managed exclusively by the Electron application`）。
> 用插件管理面板安装。

**装完必须完全退出 DSH 再打开**：客户端模块清单在启动时扫描并缓存，刷新页面不生效。

## 用法

### 界面
- **左侧栏的「西语」一行**：点这一行任意位置（图标或文字）在中间栏打开练习面板
- **输入框右侧的旗标胶囊**：打开同一个面板（有到期卡片时显示数字角标）
- 面板右上角的 ✕ 回到会话

面板是宿主 root 作用域 `main` keyed slot 里的一页，不是浮窗。这决定了两个细节：

- `sidebar.panellist` 的注册项**只提供图标**——那一整行按钮（图标 + 文字 + 选中态 +
  收起时的 tooltip）都是宿主画的，点行由宿主调 `layout.selectPanel(id)`。
- 所以 `panellist` 的 `id` 必须与 `main` 的 `key` 完全相同（`dsh-spanish`）。
  不一致时宿主找不到面板、抛错并保留原选中态，表现就是「只有我们能画的那一小块能点」。
  `test/client.test.mjs` 里有断言守着这一条。

- 面板四个页签：
  - **练习**：出题、作答、看讲解
  - **情景造句**：给场景，写一句，模型批改
  - **查表**：查任意动词的变位全表，或名词的阴阳性/复数/冠词
  - **进度**：掌握度统计、难度/题型/时态设置、清空进度

### 对话里
四个模型工具：
- `spanish_conjugate` — 查变位表
- `spanish_noun` — 查阴阳性、复数、冠词
- `spanish_quiz` — 出一组题
- `spanish_progress` — 看学习进度

直接说「考考我西语」「tener 的虚拟式怎么变」「mano 是阳性还是阴性」就行。

## 数据

学习进度存在 `~/.dsh/spanish-tutor/progress.json`（或 `$DSH_HOME/spanish-tutor/`），
和插件目录分离，更新插件不丢进度。写入用「临时文件 + 改名」的原子写。

## HTTP 接口

host 半身在 `/dsh-spanish` 前缀下提供：

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/state` | 进度 + 设置 + 统计 |
| POST | `/settings` | 改设置 |
| POST | `/session` | 出一局题（**下发时剥掉答案**） |
| POST | `/answer` | 交一题，判分（**服务端重算答案**） |
| POST | `/teach` | **「学」**：讲知识点 / 给例句 / 指易错点 |
| POST | `/reveal` | **「看答案」**：直接揭晓 |
| GET | `/models` | 可用模型列表（供设置页选择） |
| GET | `/scenarios` | 情景造句的场景列表 |
| POST | `/scenario` | **情景造句出题**（参考答案不下发，只给 `refToken`） |
| POST | `/scenario/grade` | **批改**（按 `refToken` 取回参考答案） |
| POST | `/reset` | 清空进度（需 `confirm: true`） |
| GET | `/table?verb=` | 变位全表 |
| GET | `/noun?word=` | 名词信息 |
| GET | `/bank?level=` | 词库 |
| GET | `/meta` | 时态/人称/题型/学习方式等元信息 |

### 防作弊

`/session` 下发的题目**不含 `answer` 字段**。`/answer` 判分时按题目里的
动词/时态/人称/名词**在服务端重新算一遍答案**，词库标注优先于词尾规则
（所以 `mano` 永远不会被规则误判成阳性）。

情景造句的参考答案也**不下发**：出题时存进服务端暂存区（TTL 30 分钟），
只给客户端一个随机 `refToken`；批改时按 token 取回，且场景必须对上。
伪造 token、跨场景用 token 都会被拒（有测试守着）。

## 开发

```bash
# 离线：不需要 DSH 在跑
node test/all.mjs                  # 1530 条断言（10 个套件）
node test/standalone-server.mjs    # 75 条：六类题型走真实 HTTP（也不用重启 DSH）

# 实机：DSH 得在跑，且必须已加载最新代码
node test/live-all.mjs [baseUrl]   # 一条命令跑完所有端到端检查
```

### 三层验证，各管一段

| 层 | 命令 | 验什么 | 要重启 DSH？ |
|---|---|---|---|
| 引擎 | `test/all.mjs` | 变位/名词/出题/判分的纯逻辑 | 不用 |
| 路由 | `test/standalone-server.mjs` | **真实 HTTP** 下六类题型的出题+判分 | 不用 |
| 宿主 | `test/live-all.mjs` | 装进真 DSH 后的集成、client 加载、真模型 | **要** |

中间的 `standalone-server` 是后来补的，因为踩过一个坑：
只测引擎函数（直接调 `judge()`）会**绕开 HTTP 路由**，
于是 `resolveAnswer()` 漏了新题型的分支、判分全 400 也没被发现。
现在它起一个真的 `node:http` 服务，跑完整请求。

`live-all.mjs` 会**先检查进程有没有加载最新代码**：

- 版本不一致 → 直接告诉你去重启，不用猜后面那些失败是不是真 bug
- 版本一致但还失败 → 那才是真的代码问题

单独跑某个实机套件：

```bash
node test/version-check.mjs [baseUrl]   # 版本一致性（指纹比对）
node test/live.mjs [baseUrl]            # 练习 + 判分
node test/live-learn.mjs [baseUrl]      # 学 + 模型
node test/live-kinds.mjs [baseUrl]      # 六类题型 + 情景造句
```

> ⚠️ **改了 host 代码（`lib/index.js`）必须重启 DSH**，刷新页面没用 ——
> host 半身跑在 DSH 进程里。`version-check` 通过 `/meta` 的 `fingerprint`
> 比对「进程加载时的文件 mtime」和「磁盘当前 mtime」，
> 连「只改函数逻辑、题型没变」这种更新也能识别（这个坑踩过）。

**离线套件**（不需要 DSH 在跑）：

| 套件 | 断言 | 守什么 |
|---|---|---|
| `conjugator.test.mjs` | 409 | 变位是否正确 |
| `nouns.test.mjs` | 90 | 阴阳性/复数/冠词 |
| `session.test.mjs` | 280 | SRS 调度、出题、判分 |
| `vocab.test.mjs` | 78 | 认词：干扰项质量、同义词去重 |
| `cloze.test.mjs` | 179 | 填空：**例句答案与变位引擎交叉验证** |
| `grammar.test.mjs` | 198 | 语法专项：答案必在选项里、规则正确 |
| `scenario.test.mjs` | 43 | 情景造句：JSON 解析健壮性、token 防篡改 |
| `host.test.mjs` | 131 | 路由、工具、落盘、防作弊、**降级** |
| `host-llm.test.mjs` | 38 | **模型集成**：跟随/覆盖/不烧 token/报错降级 |
| `client.test.mjs` | 84 | 客户端能否被宿主激活、面板接线是否正确 |

**实机套件** `live.mjs` 需要 DSH 正在运行，验证的是「装进去之后真的能用」：
路由可达、出题判分、防作弊、设置持久化等。

> ⚠️ 两个 live 套件**都必须单独运行**。它们不能和离线套件同进程混跑：
> `host.test.mjs` 会改 `DSH_HOME`，`client.test.mjs` 会改全局 `window`/`process.exit`，
> 都会污染紧接着跑的 live 测试。
>
> ⚠️ 改过 host 端代码（`lib/index.js`）后，**必须重启 DSH** 才会生效 ——
> 客户端 bundle 刷新页面能重载，但 host 半身跑在 DSH 进程里，不重启就还是旧代码。

测试用真实西语答案断言，不是「跑出来什么就记什么」。已做过**变异测试**：
故意把「-z 结尾是阴性」改成阳性、把 `flor` 从阴性例外表移除，测试都会红并指出具体词。

```
lib/
  engine/
    conjugator.js   变位引擎（规则 + 不规则表）
    nouns.js        阴阳性 / 复数 / 冠词 / 形容词一致
    bank.js         种子词库（人工核对性别）
    session.js      SRS + 出题 + 判分
  index.js          host 半身（路由 / 工具 / LLM 讲解 / 落盘）
  client.js         浏览器半身（__ModuleLoader__ + React）
test/
  *.test.mjs        五个离线套件
  all.mjs           统一入口
  live.mjs          实机端到端验证
```

## 已知边界

- 词库是**种子库**（约 60 个动词、60 个名词、16 个形容词），覆盖 A1–B1 高频词，
  不是完整西语词库。查表功能对任意标准动词都有效（规则引擎按需推导）。
- 部分时态（将来完成时、条件完成时）只在查表里出现，默认练习设置不含它们。
- 命令式的人称语义与陈述式不同（`tú` 的命令式和 `usted` 的），界面按「人称槽位」展示。
- 不处理 vosotros 的地区差异（拉美不用 vosotros），但引擎会算，练习时可在设置里避开。
- 讲解质量取决于当前会话模型；模型不可用时讲解降级为 `null`，不影响判分。

## 许可

MIT
