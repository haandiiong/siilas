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
pnpm check
pnpm build
```

机场基础资料和原始测速记录位于 `src/data/airports.json`，构建时由 `src/data/airport-data.ts` 校验并生成页面统计。
