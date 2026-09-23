# Siilas

[Siilas](https://siilas.com/) 专注于机场节点在真实使用中的表现，持续记录速度、稳定性、ChatGPT 与流媒体体验，并公开原始测速证据和自动评分方法。

## 测试环境

- 测试者：siilas
- 本地网络：中国北方联通 1000M 宽带
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

`pnpm data:audit` 会列出每家机场的商业资料复核日期、两个月后的下次复核日期、最新测速、有效记录数和参评样本缺口，同时检查重复 slug、重复测试 ID、重复 Speedtest 链接和缺失证据文件。它只读取数据，不会修改文件；发现数据错误时返回失败状态，复核到期仅显示提醒。

需要供其他工具读取时可运行 `pnpm data:audit -- --json`。`pnpm validate` 会依次执行数据审计、Astro 类型检查和正式构建。

机场基础资料和原始测速记录统一位于 `src/data/airports.json`，构建时由 `src/data/airport-data.ts` 校验并生成页面统计。

评分仅使用 `tests` 中保留 Speedtest 结果链接或截图的已验证记录。

机场商业资料使用 `commercialReviewedAt` 单独记录复核日期，最新测速日期由构建过程自动生成。每家机场通过 `scoringPlan` 明确指定性价比计分套餐。

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

- 本地网络：中国南方电信 1000M 家庭宽带
- 连接方式：Wi-Fi
- 测试设备：MacBook
- 测试客户端：FlClash

如果某次测试环境发生变化，在模板后单独注明。
