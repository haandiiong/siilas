# Siilas 项目审查 · 2026-10-04

审查对象为当前本地工作区，包括尚未提交的页面、数据及维护脚本。核对了 yp7.net 来源 Markdown、正式构建结果及浏览器表现，并抽查线上版本。以下为修复前的审查结论；用户随后授权修改，修复状态记录在本文末尾。

## 已确认正常

- 数据审计、Astro 类型检查、正式构建均通过，类型检查没有错误或警告。
- 正式构建生成 63 页：53 个机场页，另有首页、数据库、排行榜、测速中心等页面。机场页包括 9 家实测、43 家在用资料、1 家停止推荐风险记录；62 个正常 URL 在 sitemap 中，404 页为 noindex。
- 每页 title、description 唯一，每页只有一个 H1 和 canonical；JSON-LD 可解析；本地内部链接和锚点未发现断链。当前详情页在 416px 窄屏下没有页面横向溢出，宽表格在独立容器内滚动。
- 118 条测速均有结果链接或截图，未发现规范化 Speedtest 结果 ID 重复，数据引用的证据文件全部存在。
- 7 家参评机场独立复算与页面一致：Flybit 6.9、拼好连 6.4、光年梯 6.3、cocoduck 5.9、网际快车 5.8、全球云 5.6、XSUS 5.4。xxyun 和边缘节点因地区日期样本不足而未生成综合分，符合公开规则。
- 43 个资料页的套餐表同步检查通过，33 家有独立客户端表。当前价格、试用、通用订阅和不限时条件未发现可证实的表内冲突；44 个来源文章编辑日期与 yp7.net 源文件一致。
- 保存本地修改不会自动提交。仓库工作流在推送 main 后等待 Cloudflare 发布成功，再发送 IndexNow。

## 优先修正的问题

### 1. P2：顶部体验摘要与原始记录矛盾

[airports.json](/Users/aaaaa/Documents/Codex/2026-09-16/con/outputs/projects/siilas/src/data/airports.json:713) 写光年梯“日本节点第 2 天轻微缓冲”，但其 12 条记录全部为“流畅”。拼好连的 2547 行仍写新加坡、日本“第 4 天”缓冲，而当前每地区最多 3 个测试日期；美国“第 2 天缓冲严重”的描述也与现存记录不符。XSUS 的 3952–3954 行仍使用 8 月 12 日的摘要，已有 9 月 23 日的新记录。

[TestedAirportPage.astro](/Users/aaaaa/Documents/Codex/2026-09-16/con/outputs/projects/siilas/src/components/TestedAirportPage.astro:233) 直接在顶部实测卡展示手填摘要，流媒体摘要没有单独日期。因此读者会同时看到互相矛盾的摘要、体验分和原始记录。

建议：按每地区最新有效记录生成带日期摘要，历史情况保留在原始记录中。无法从现有记录支持的旧摘要应移除。

### 2. P2：公开计时方法与实际采集字段不一致

[methodology.astro](/Users/aaaaa/Documents/Codex/2026-09-16/con/outputs/projects/siilas/src/pages/methodology.astro:58) 描述固定账户、模型和短问题，ChatGPT 连续测 3 次取首字时间中位数；59 行描述固定 4K 视频、多个位置拖动及至少播放 60 秒；61 行要求新记录遵守计时方法。

但 [README.md](/Users/aaaaa/Documents/Codex/2026-09-16/con/outputs/projects/siilas/README.md:58) 的提交标准只有机场、节点、两个体验状态和 Speedtest 链接。[测试数据结构](/Users/aaaaa/Documents/Codex/2026-09-16/con/outputs/projects/siilas/src/data/airport-data.ts:24) 以及全部 118 条记录均没有响应秒数、缓冲秒数、方法版本或对应执行记录。

这不能证明没有做过这些操作，但目前无法复查精确计时过程，也无法区分历史定性体验与新计时结果。建议先让方法页准确说明现有证据的范围；未来确实执行计时方法时保存方法版本和计时结果。用户已确定的五字段提交模板应继续保留，不能给旧记录补造秒数。

### 3. P2：实测库的未来日期可以通过审计

[audit-data.mjs](/Users/aaaaa/Documents/Codex/2026-09-16/con/outputs/projects/siilas/scripts/audit-data.mjs:29) 检查资料页来源日期，但测试循环和实测机场循环未检查 testedAt、commercialReviewedAt 等是否晚于当前日期。数据结构也只检查日期字符串格式。

已在内存复现：将全球云一条测速日期及商业复核日期改为 2099-12-31，以 2026-10-04 审计，仍得到 errors=[]、warnings=[]，商业状态“正常”，最新测速为 2099-12-31。实际数据文件未改动。

建议：统一校验真实日历日期和未来日期，覆盖实测、观察、商业资料、来源及编辑日期。防止误录日期影响排序、复核提醒和搜索元数据。

### 4. P2：双站资料接收只同步表格，无法校验整页更新

[sync-airport-profile-details.mjs](/Users/aaaaa/Documents/Codex/2026-09-16/con/outputs/projects/siilas/scripts/sync-airport-profile-details.mjs:167) 只生成套餐和客户端表。价格摘要、试用、客户端支持、官网入口、来源日期、专属要点和原 9 家实测机场商业资料仍需在 Siilas 手工维护。

当前抽查未发现这些商业字段与来源文章的明确冲突，但下一次 yp7.net 更新后，即使 --check 通过，也只能证明表格一致，不能证明整个页面已经接收更新。这会增加同一页面摘要与表格漂移的机会。

建议：为 yp7.net 到 Siilas 的交接定义完整字段和来源版本，统一校验所有接收字段。保留现有职责：yp7.net 收集更新资料，Siilas 独立测速，yp7.net 结合结果作推荐；资料更新不得改写独立测速记录。

### 5. P2：仓库侧没有强制发布前验证

[package.json](/Users/aaaaa/Documents/Codex/2026-09-16/con/outputs/projects/siilas/package.json:10) 的 build 只运行 Astro 构建；重复测试、结果链接和证据文件检查在单独的手动 validate 中。[唯一工作流](/Users/aaaaa/Documents/Codex/2026-09-16/con/outputs/projects/siilas/.github/workflows/indexnow.yml:20) 等待发布完成后通知 IndexNow，没有运行这些验证。

因此仅运行 build 不会执行完整数据审计。尚未读取 Cloudflare 控制台中的实际构建命令，不能断言外部配置也没有验证。

建议：把完整验证纳入明确的发布构建或发布前检查。保留人工决定何时提交发布的方式。

### 6. P2：公开原始记录没有完整展示已有证据和环境

[测速中心](/Users/aaaaa/Documents/Codex/2026-09-16/con/outputs/projects/siilas/src/pages/test/index.astro:45) 只展示 Speedtest 结果链接。边缘节点 2026-07-17 20:31 新加坡记录只有截图，浏览器第 7 页显示“链接未记录”，没有截图入口；截图文件实际存在。

测速中心和 [机场原始记录表](/Users/aaaaa/Documents/Codex/2026-09-16/con/outputs/projects/siilas/src/components/TestedAirportPage.astro:290) 都没有展示已存的延迟、客户端、连接方式、本地运营商和测速服务器。118 条中有 64 条保存延迟、75 条保存客户端、9 条保存具体本地运营商及服务器信息，但这些字段在记录表中不可见。

建议：每条记录提供展开详情，显示已有环境字段及结果链接、截图两种证据入口；未保存的历史字段明确为“未记录”。这能让读者判断不同时间、服务器和网络下的结果是否适合比较。

## 较低优先级问题

1. **P3：两个月复核日期在月底会溢出。** [airport-data.ts](/Users/aaaaa/Documents/Codex/2026-09-16/con/outputs/projects/siilas/src/data/airport-data.ts:331)、[airport-profiles.ts](/Users/aaaaa/Documents/Codex/2026-09-16/con/outputs/projects/siilas/src/data/airport-profiles.ts:79) 和审计脚本直接使用 setUTCMonth。2026-12-31 加两个月会得到 2027-03-03。当前记录尚未触发；建议不足对应日号时取目标月末。

2. **P3：页码翻页会丢失键盘焦点。** [测速中心](/Users/aaaaa/Documents/Codex/2026-09-16/con/outputs/projects/siilas/src/pages/test/index.astro:71) 和 [实测页](/Users/aaaaa/Documents/Codex/2026-09-16/con/outputs/projects/siilas/src/components/TestedAirportPage.astro:323) 每次翻页清空并重建页码按钮。浏览器复现：用 Enter 激活第 2 页后，焦点变成 BODY。建议保留按钮或恢复当前页码焦点。

3. **P3：首次发布日期与编辑日期共用字段。** [AirportProfilePage.astro](/Users/aaaaa/Documents/Codex/2026-09-16/con/outputs/projects/siilas/src/components/AirportProfilePage.astro:50) 把 editorialUpdatedAt 同时作为 datePublished 和 dateModified。下一次编辑会改变首次发布日期。应分别保存发布日期与修改日期。

4. **P3：Speedtest Ping 被命名为“节点延迟”。** [测速中心结构化数据](/Users/aaaaa/Documents/Codex/2026-09-16/con/outputs/projects/siilas/src/pages/test/index.astro:34) 和实测页 JSON-LD 使用这一名称。Speedtest 测量客户端至测速服务器的往返时间，建议称为“Speedtest 空闲延迟”，负载延迟分别标注下载、上传。[Speedtest 官方说明](https://speedtest.zendesk.com/hc/en-us/articles/203845400-How-does-the-test-itself-work-How-is-the-result-calculated)

5. **P3：资料页迁移说明遗漏配套清理。** [README.md](/Users/aaaaa/Documents/Codex/2026-09-16/con/outputs/projects/siilas/README.md:54) 只说明迁入 airports.json。还必须同步清理 details/highlights 中的旧 slug，否则 [资料校验](/Users/aaaaa/Documents/Codex/2026-09-16/con/outputs/projects/siilas/src/data/airport-profiles.ts:74) 会阻止构建。应补齐迁移步骤。

6. **低优先级 SEO 改进：sitemap 没有 lastmod。** 当前 sitemap 有效，可按真实修改日期补充，不应直接填每次构建日期。

## 当前需要补充的测速

截至 2026-10-04，商业资料均处于已设定的两个月复核窗口内；商业复核日期不能表示性能已经重测。

| 机场 | 最近测速 | 距今 | 新加坡日期数 | 香港 | 日本 | 美国 |
|---|---|---:|---:|---:|---:|---:|
| 全球云 | 2026-07-28 | 68 天 | 7 | 5 | 5 | 5 |
| 光年梯 | 2026-07-18 | 78 天 | 3 | 3 | 3 | 3 |
| 网际快车 | 2026-09-11 | 23 天 | 4 | 4 | 4 | 4 |
| xxyun | 2026-09-11 | 23 天 | 2 | 2 | 2 | 3 |
| Flybit | 2026-08-13 | 52 天 | 3 | 4 | 3 | 3 |
| 拼好连 | 2026-09-23 | 11 天 | 3 | 3 | 3 | 3 |
| cocoduck | 2026-08-13 | 52 天 | 3 | 3 | 3 | 3 |
| 边缘节点 | 2026-08-13 | 52 天 | 2 | 2 | 2 | 2 |
| XSUS | 2026-09-23 | 11 天 | 3 | 3 | 3 | 3 |

为达到现行参评条件，xxyun 需要在一个新的日期补新加坡、香港、日本各一条；边缘节点需要在一个新的日期补四地区各一条。新增日期必须与该地区已有日期不同。43 个在用资料页全部尚无 Siilas 独立测速。

118 条测速没有下载或上传为零的记录，但 xxyun 有一条 2026-07-15 无法测速、ChatGPT 和视频失败的服务观察，按公开方法不计入测速评分。因此这些统计不能解释为从未出现失败。

## SEO、发布状态及审查边界

SEO 的基础页面标记已齐全，当前更需要提高可复查内容的一致性。43 个资料页的商业内容主要来自 yp7.net，Siilas 后续最有价值的独特内容是独立测速及原始证据。仅因来源相同就认定受到重复内容惩罚，或一律给这些页面 noindex，没有足够依据。来源链接与 canonical 是不同信号，Google 会对重复或相近内容选择代表 URL。[Google canonical 文档](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)

结构化数据应准确反映用户可见、证据能支持的内容；补齐字段不能代替补充真实证据。[Google 结构化数据规范](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)

本地与线上仍有预期的发布差异：[线上首页](https://siilas.com/) 仍显示原来的“机场推荐”和旧网络说明；直接 HTTP 检查 /airport/jisucloud/ 返回 404。新页及定位修改尚在本地，未发布属于发布状态，不列为代码缺陷。

没有读取 Search Console，不能据此判断实际收录、搜索排名或自然流量。商业条件核对以 yp7.net 当前源文件为准，本次没有重新登录全部机场后台；所有外部结果页也没有逐个验证长期可达性。

建议修复顺序：先处理 1–3 项的数据可信度，再完善 4–5 项的资料交接与发布验证，随后完成第 6 项的逐条记录详情。独立测速补充可与这些维护工作并行。

## 修复记录 · 2026-10-04

本节记录本地修复验证结果。修复验证阶段未提交或发布，后续发布状态以 Git 提交与部署记录为准。

- 删除 9 家机场的旧手填体验摘要，按每地区最新有效记录自动展示日期与两项状态。
- 测试方法页改为现有五档定性体验规则，保留五字段提交标准；不再声称未保存的计时过程或统一 4K 播放条件。评分档位、公式和原始测速不变。
- 统一真实日历日期、中国标准时间非未来日期校验；两个月复核按目标月末截断。约时间和未知时间在结构化数据中只保留日期精度。
- 为全部 53 家机场建立完整来源版本与已接收商业字段清单；来源比对覆盖非表格内容。生产构建只依赖仓库内已确认清单，来源更新需要实际核对后接收。
- 正式构建与 GitHub 工作流纳入日期回归、数据审计、商业交接校验和类型检查；IndexNow 需验证及部署均成功。
- 两类原始记录表新增展开详情，显示已保存的环境、延迟、服务器和备注，缺失项显示“未记录”；仅截图记录也有入口。
- 分页保留键盘焦点；Ping 改称“Speedtest 空闲延迟”，负载延迟分别标注；商业来源移至文章末尾。
- 新资料页首次发布日期独立保存，尚未上线时为 null；迁移说明补齐表格、要点与交接清单清理。
- Sitemap 为有可靠修改日期的 60 个 URL 添加 lastmod，不使用构建时间填充。

验证结果：7 项日期边界回归通过，118 条数据审计通过，53 家来源交接比对通过；类型检查无错误或警告，构建生成 63 页。标题、description、H1、canonical 和结构化数据检查通过，7 家综合评分与修复前一致。浏览器确认最新体验表、展开详情、仅截图证据入口和键盘分页。

仍需实际补充的测速与商业信息沿用上文数据缺口，不以代码修复替代实测。线上未发布新页面的状态也需在用户要求发布后才能改变。
