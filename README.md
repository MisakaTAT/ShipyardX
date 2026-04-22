# ShipyardX

基于 Tauri v2 + React 19 + Vite + TypeScript 的桌面端 Docker 管理工具。

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## 前端架构

前端采用 **feature-first** 目录结构，数据层统一走 **TanStack Query**，样式层以 **Tailwind + shadcn/ui + CVA 变体** 收敛。

### 目录布局

```
src/
├── app/                        # 入口层
│   ├── providers.tsx           # ThemeProvider + QueryClientProvider + Toaster
│   ├── theme-provider.tsx
│   └── styles/
│       ├── index.css           # Tailwind + 字体 + token 入口
│       └── tokens.css          # 设计 token (颜色/间距/半径/阴影)
│
├── shared/                     # 跨 feature 的共享层
│   ├── ui/                     # shadcn 原语 (button/dialog/input/...)
│   ├── components/             # 业务无关组件 (DataTable / PanelHeader /
│   │                           #   PanelShell / SearchInput / ConfirmDialog /
│   │                           #   StatusBadge / EmptyState / InlineCode /
│   │                           #   KeepAlive)
│   ├── hooks/                  # 通用 hooks (use-search-hotkey …)
│   ├── lib/                    # cn / format / datetime / docker-image-ref /
│   │                           #   app-router
│   ├── api/                    # query-client / query-keys / events/*
│   └── styles/variants.ts      # 跨 feature 复用的 CVA 变体
│
├── features/                   # 特性纵切片
│   ├── servers/                # 服务器连接配置
│   ├── docker-containers/      # 容器（含 run-container dialog 的分解）
│   ├── docker-images/
│   ├── docker-networks/
│   ├── docker-volumes/
│   ├── docker-engine/          # ServerOverview + DockerManagePanel + SudoPwd
│   ├── docker-events/
│   ├── docker-terminal/        # xterm + SSH 流
│   ├── docker-shared/          # Resource Inspect 等通用 docker 组件
│   ├── port-forward/
│   └── app-store/
│   每个 feature 内部统一使用：
│     api/    —— TanStack Query hooks
│     model/  —— zod schema 与类型
│     ui/     —— React 组件
│     lib/    —— 特性内工具函数
│
├── pages/                      # 路由页面（薄壳，仅做编排）
│   ├── connections-page.tsx
│   ├── workspace-page.tsx
│   ├── port-forward-page.tsx
│   └── app-store-page.tsx
│
└── layouts/
    ├── root-layout.tsx         # 路由分派 + 会话状态
    ├── sider/                  # 左侧主导航 (CVA + nav-config)
    └── workspace/              # Workspace tabs 与 docker 权限引导
```

### 三条核心约束

1. **业务文件禁止出现视觉 if/else 拼 className** —— 所有状态徽章/按钮激活态/tone 统一进 CVA（见 `src/shared/styles/variants.ts`）。
2. **列表视图必须使用 `<DataTable> + <PanelHeader>`** —— 不再直接写 `<Table>` 和 toolbar 骨架，`ColumnDef<T>` 集中定义于 feature 的 `*-columns.tsx`。
3. **数据层统一走 TanStack Query + 事件驱动 invalidate** —— Docker 引擎事件（资源变更）通过 `useDockerEventInvalidation` 按 `qk.*` 映射失效查询，不再使用 `refreshTick` prop drilling。

### 开发命令

```bash
yarn dev            # Vite 前端开发服务
yarn tauri dev      # 启动 Tauri 桌面端
yarn typecheck      # tsc --noEmit
yarn build          # 前端打包
yarn tauri build    # 桌面端打包
```
