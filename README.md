# Siilas

[Siilas](https://siilas.com/) 专注于机场节点在真实使用中的表现，持续记录速度、稳定性、ChatGPT 与流媒体体验，并公开原始测速证据和自动评分方法。

## 测试环境

- 测试者：siilas
- 本地网络：中国大陆联通电信移动1000M带宽
- 设备：MacBook
- 客户端：机场专属客户端和 FlClash
- 方法：[机场测速与评分规则](https://siilas.com/methodology/)
- 数据：[机场测速记录](https://siilas.com/test/)

## 开发

```sh
pnpm install
pnpm astro dev --background
```

后台开发服务器可通过以下命令管理：

```sh
pnpm astro dev status
pnpm astro dev logs
pnpm astro dev stop
```

## 验证

```sh
pnpm data:audit
pnpm validate
```

`pnpm data:audit` 会列出实测机场的商业资料复核日期、两个月后的下次复核日期、最新测速、有效记录数和参评样本缺口，也会统计来源资料页并提醒两个月后需要复核。它检查跨库重复 slug、重复测试 ID、重复 Speedtest 链接和缺失证据文件。它只读取数据，不会修改文件；发现数据错误时返回失败状态，复核到期仅显示提醒。

需要供其他工具读取时可运行 `pnpm data:audit -- --json`。`pnpm build` 和 `pnpm validate` 都会依次执行日期边界回归检查、数据审计、已接收商业资料清单校验、Astro 类型检查和正式构建；生产构建无需相邻的 yp7.net 项目。GitHub 在推送 main 或提交 PR 后执行同一套验证，只有 main 的验证与 Cloudflare Pages 部署都成功后才通知 IndexNow。保存本地修改不会自动提交或发布。

机场基础资料和原始测速记录统一位于 `src/data/airports.json`，构建时由 `src/data/airport-data.ts` 校验并生成页面统计。

评分仅使用 `tests` 中保留 Speedtest 结果链接或截图的已验证记录。

机场商业资料使用 `commercialReviewedAt` 单独记录复核日期，最新测速日期由构建过程自动生成。每家机场通过 `scoringPlan` 明确指定性价比计分套餐。

## 机场资料页

数据流程：两站由同一站长运营。机场官网、套餐、试用、客户端与服务规则以 yp7.net 的对应资料为准；Siilas 接收商业资料后完成实测、公开原始记录与评分；yp7.net 再结合商业资料和 Siilas 实测结果作出推荐。商业资料共享不能改写实测记录，也不能把同一站长的两个网站表述成第三方背书。

`src/data/airport-profiles.json` 收录从 yp7.net 项目整理、但尚无 Siilas 独立测速的机场。每条资料保留来源页、来源核对日期、文章编辑日期、套餐与客户端条件及购买前风险；网页将两种日期分开显示。资料页沿用实测页的基本信息、套餐表、使用方式和购买前核对结构，但不生成测速数据、综合评分，也不进入实测排行榜。已停止推荐的机场只保留风险记录，不展示历史套餐作为现售价格。

逐档套餐与客户端表存于 `src/data/airport-profile-details.json`，各机场的专属资料要点存于 `src/data/airport-profile-highlights.json`。前者由 `scripts/sync-airport-profile-details.mjs` 从相邻的 yp7.net 项目评测 Markdown 生成。该脚本只同步表格，不会猜测官网、摘要、试用或其他人工商业字段。

`src/data/airport-source-handoff.json` 是提交到仓库的交接清单，覆盖资料页、风险页及原有实测机场的商业资料。每家机场记录商业来源 SHA256（`sourceCommercialSha256`），同时保留人工接收时的完整文章 SHA256（`sourceSha256`）、来源编辑日期、接收日期与说明用于追溯；逐项保存已接收商业字段、表格和专属要点的指纹。测速记录、体验状态、本站编辑日期和首次发布日期不参与本地商业指纹。

来源正文只有存在唯一、完整、顺序正确的 `<!-- siilas-testing:start -->` / `<!-- siilas-testing:end -->` 自动测速块时，商业来源指纹才排除该块及 frontmatter 的 `dateModified` 行。其余正文、商业核对日期、来源路径和 URL 的变化仍需复核；没有自动块的文章继续按全文检查，包括编辑日期。重复、不完整、顺序错误或非独立行的块标记会被拒绝。完整文章 SHA 与编辑日期保留接收时的版本，不会因通过检查而自动刷新。

旧清单没有 `sourceCommercialSha256` 时，仍严格比较完整文章 SHA 和来源编辑日期；只有人工复核后执行接收命令才迁移到商业来源指纹，不能直接把旧全文 SHA 当作商业来源 SHA。完成迁移后，单独更新合法测速块及自动文章编辑日期无需重新接收商业资料。

yp7.net 更新资料后的交接步骤：

1. 运行 `pnpm data:handoff:source`，列出商业来源或接收字段的变化。官网、价格摘要、试用和原有 9 家实测机场资料的变化都会触发提醒；尚未迁移的旧清单仍检查完整文章。
2. 运行 `node scripts/sync-airport-profile-details.mjs` 同步资料页表格，再人工对照原文更新官网、摘要、套餐、试用、有效期、客户端、商业复核日期、来源编辑日期、风险和专属要点。资料更新不能改写独立测速记录。
3. 确认该机场全部商业字段后运行 `pnpm data:handoff:accept -- --slug <slug> --note '本次人工复核说明'`。此命令会先检查所选资料页表格与来源一致，再记录商业来源指纹、完整文章审计版本和本地字段指纹；实测机场和风险页不检查资料页表格。写入前拒绝无效或未来的来源编辑日期。它本身不证明字段与原文语义一致，不能代替上一步人工核对。多家都已完成复核时可用 `--all` 代替 `--slug <slug>`，此时检查全部资料页表格。
4. 运行 `node scripts/sync-airport-profile-details.mjs --check`。它同时检查表格、所有已接收商业字段及商业来源指纹（旧清单检查完整来源版本），只有全部一致才通过。只核对一张资料页时可加 `--slug <slug>`，不会被其他机场的待接收更新阻挡；生成表格时不能使用 `--slug`，避免覆盖其他机场数据。最后运行 `pnpm validate`。

若两个项目不在相邻目录，设置 `YP7_REVIEW_DIR` 指向 yp7.net 的 `docs/机场评测` 目录。来源比对和确认交接需要该目录；普通生产构建只确认当前商业数据与已接收清单一致，不能声称 yp7.net 没有后续更新。

补充首次实测时，先按下方模板取得可复查的原始记录，再把机场从 `airport-profiles.json` 迁入 `airports.json`。同步移除 `airport-profile-details.json` 和 `airport-profile-highlights.json` 中的旧 slug，将要保留的商业资料迁入实测数据；两份机场库不能使用同一 slug。迁移后重新确认该 slug 的商业资料交接，避免旧资料类型和指纹残留。

资料页的 `publishedAt` 在本地尚未首次上线时为 `null`；首次发布后填写真实首次上线日期，后续编辑保留该值，只更新 `editorialUpdatedAt`。

Sitemap 的 `lastmod` 使用机场页面编辑日期及相关测速、商业资料日期；普通页面的真实编辑日期存于 `src/data/page-updates.json`，内容发生实质变化时更新。没有可靠日期的页面不填写 `lastmod`，不使用构建当天日期代替内容修改日期。

## 测速结果交回 yp7.net

在 yp7.net 项目运行 `pnpm docs:receive-siilas` 接收 Siilas 的原始测速、地区最新记录与当前计算结果，再运行 `pnpm docs:check-siilas` 比对来源。接收时使用 Siilas 自身的校验与评分规则，不另写一套评分公式；快照保存于 yp7.net 仓库，后续生产构建不依赖相邻项目。

接收日期、实际测试日期与商业资料核对日期各自保留。yp7.net 的历史测速和推荐顺序独立保存，不能通过导入脚本直接覆盖。来自尚未发布工作区的测速必须明确标记为待发布；正式上线后先核对 Siilas 的记录页和证据地址，再更新接收状态与摘要。

yp7.net 按机场 slug、原始记录 ID、完整记录和截图文件内容指纹保存逐条发布状态；补录旧日期、更正原字段或同地址更换图片都不能继承旧版的已发布状态。旧快照没有截图内容指纹时保守保留待核对。两站构建或重复接收不会清除待发布标记；只有确认当前 Siilas 页面和全部证据实际上线后，才在 yp7.net 使用 `docs:receive-siilas -- --source-published` 确认版本。

对读者公开的两站分工见 `/about/` 与 `/methodology/`；机场页末尾保留商业资料来源与日期，实测文章的结构化数据分别引用商业来源和本站实测数据集。

## 添加测速记录

以后统一使用以下模板提交，并附上对应的 Speedtest 截图：

```text
机场名：
节点名称：
ChatGPT：
流媒体：
Speedtest 链接：
```

日期、时间、下载速度、上传速度、延迟、测速出口 ISP 和服务器信息从截图读取。截图中的 GMT 时间换算为北京时间，并据此自动确定测试时段。

精确的北京时间统一划分为：00:00–05:59 凌晨、06:00–17:59 日间、18:00–19:59 和 23:00–23:59 晚间、20:00–22:59 晚高峰。约时间或未知时间不自动推断；记录 ID 和证据文件名作为稳定标识，不随时间纠错改名。

默认测试环境如下，提交时无需重复填写：

- 本地网络：中国大陆联通电信移动1000M带宽
- 连接方式：Wi-Fi
- 测试设备：MacBook
- 测试客户端：按机场实际支持情况选择；xxyun 和边缘节点使用官方专属客户端

如果某次测试环境发生变化，在模板后单独注明。

每条记录的 `client` 保存连接客户端；`measurementTool` 保存测速工具，Speedtest Desktop 不能用来推断连接客户端。历史记录缺少可靠客户端证据时保留为未记录，原字段纠错说明存入 `evidenceNote`。`evidenceImage` 是主要测速截图；需要补充应用状态截图时，使用 `evidenceImages` 的 `{ label, path }` 数组，分别标明证据内容。

现有 ChatGPT 和流媒体状态是提交者的定性体验判断，Speedtest 链接和截图用于复查测速数值。没有保存的响应秒数、缓冲秒数或操作过程不能事后补造，也不要求用户在上述五字段模板之外追加计时字段。
