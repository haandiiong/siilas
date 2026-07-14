# Siilas

面向中国大陆用户的机场节点长期评测与稳定性数据平台。

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
