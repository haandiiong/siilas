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

数据流程：yp7.net 负责收集、核对并更新机场商业资料；Siilas 接收资料后独立测速，公开原始记录与评分；yp7.net 再结合商业资料和 Siilas 实测结果作出推荐。

`src/data/airport-profiles.json` 收录从 yp7.net 项目整理、但尚无 Siilas 独立测速的机场。每条资料保留来源页、来源核对日期、文章编辑日期、套餐与客户端条件及购买前风险；网页将两种日期分开显示。资料页沿用实测页的基本信息、套餐表、使用方式和购买前核对结构，但不生成测速数据、综合评分，也不进入实测排行榜。已停止推荐的机场只保留风险记录，不展示历史套餐作为现售价格。

逐档套餐与客户端表存于 `src/data/airport-profile-details.json`，各机场的专属资料要点存于 `src/data/airport-profile-highlights.json`。前者由 `scripts/sync-airport-profile-details.mjs` 从相邻的 yp7.net 项目评测 Markdown 生成。该脚本只同步表格，不会猜测官网、摘要、试用或其他人工商业字段。

`src/data/airport-source-handoff.json` 是提交到仓库的交接清单，覆盖资料页、风险页及原有实测机场的商业资料。每家机场记录完整来源文章的 SHA256、来源编辑日期、人工接收日期与说明，同时逐项保存已接收商业字段、表格和专属要点的指纹。测速记录、体验状态、本站编辑日期和首次发布日期不参与商业指纹；新增测速无需重新确认商业资料。

yp7.net 更新资料后的交接步骤：

1. 运行 `pnpm data:handoff:source`，列出来源文章或接收字段的变化。完整文章的变化都需复核，官网、价格摘要、试用和原有 9 家实测机场资料的变化也会触发提醒。
2. 运行 `node scripts/sync-airport-profile-details.mjs` 同步资料页表格，再人工对照原文更新官网、摘要、套餐、试用、有效期、客户端、商业复核日期、来源编辑日期、风险和专属要点。资料更新不能改写独立测速记录。
3. 确认该机场全部商业字段后运行 `pnpm data:handoff:accept -- --slug <slug> --note '本次人工复核说明'`。此命令会先检查所选资料页表格与来源一致，再记录新的来源版本和本地字段指纹；实测机场和风险页不检查资料页表格。写入前拒绝无效或未来的来源编辑日期。它本身不证明字段与原文语义一致，不能代替上一步人工核对。多家都已完成复核时可用 `--all` 代替 `--slug <slug>`，此时检查全部资料页表格。
4. 运行 `node scripts/sync-airport-profile-details.mjs --check`。它同时检查表格、所有已接收商业字段及完整来源版本，只有全部一致才通过。只核对一张资料页时可加 `--slug <slug>`，不会被其他机场的待接收更新阻挡；生成表格时不能使用 `--slug`，避免覆盖其他机场数据。最后运行 `pnpm validate`。

若两个项目不在相邻目录，设置 `YP7_REVIEW_DIR` 指向 yp7.net 的 `docs/机场评测` 目录。来源比对和确认交接需要该目录；普通生产构建只确认当前商业数据与已接收清单一致，不能声称 yp7.net 没有后续更新。

补充首次实测时，先按下方模板取得可复查的原始记录，再把机场从 `airport-profiles.json` 迁入 `airports.json`。同步移除 `airport-profile-details.json` 和 `airport-profile-highlights.json` 中的旧 slug，将要保留的商业资料迁入实测数据；两份机场库不能使用同一 slug。迁移后重新确认该 slug 的商业资料交接，避免旧资料类型和指纹残留。

资料页的 `publishedAt` 在本地尚未首次上线时为 `null`；首次发布后填写真实首次上线日期，后续编辑保留该值，只更新 `editorialUpdatedAt`。

Sitemap 的 `lastmod` 使用机场页面编辑日期及相关测速、商业资料日期；普通页面的真实编辑日期存于 `src/data/page-updates.json`，内容发生实质变化时更新。没有可靠日期的页面不填写 `lastmod`，不使用构建当天日期代替内容修改日期。

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

默认测试环境如下，提交时无需重复填写：

- 本地网络：中国大陆联通电信移动1000M带宽
- 连接方式：Wi-Fi
- 测试设备：MacBook
- 测试客户端：按机场实际支持情况选择；xxyun 和边缘节点使用官方专属客户端

如果某次测试环境发生变化，在模板后单独注明。

现有 ChatGPT 和流媒体状态是提交者的定性体验判断，Speedtest 链接和截图用于复查测速数值。没有保存的响应秒数、缓冲秒数或操作过程不能事后补造，也不要求用户在上述五字段模板之外追加计时字段。
