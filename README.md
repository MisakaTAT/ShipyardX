# ShipyardX

基于 Rust 和 Tauri 的桌面端 Docker 管理工具。

## 技术栈

- 前端：`React 19`、`TypeScript`、`Vite`、`Tailwind CSS v4`
- 桌面：`Tauri v2`
- 后端：`Rust`、`Tokio`

## 环境要求

- `Node.js >= 20`
- `pnpm 11`
- `Rust stable`
- Tauri 对应平台依赖

项目在 [package.json](/Users/zero/Desktop/ShipyardX/package.json:5) 中声明 `pnpm@11.3.0`。

```bash
node -v
pnpm -v
rustc -V
cargo -V
```

安装 `pnpm`：

```bash
npm install -g pnpm
```

安装 Rust：

```bash
rustup toolchain install stable
rustup default stable
```

macOS 需要安装 Xcode Command Line Tools：

```bash
xcode-select --install
```

## 安装依赖

```bash
pnpm install
```

## 开发

### 前端开发

```bash
pnpm dev
```

- 开发地址：`http://localhost:1420`
- HMR 端口：`1421`
- Vite 配置见 [vite.config.ts](/Users/zero/Desktop/ShipyardX/vite.config.ts:1)

### 桌面应用开发

```bash
pnpm tauri dev
```

Tauri 开发配置见 [src-tauri/tauri.conf.json](/Users/zero/Desktop/ShipyardX/src-tauri/tauri.conf.json:1)。该命令会先执行 `pnpm dev`，再启动 Tauri 开发进程。

涉及以下功能时，应使用 `pnpm tauri dev`：

- Docker 连接
- SSH 连接
- 容器终端
- 日志流和事件流
- 文件导入导出
- 应用安装流程

## 常用命令

```bash
pnpm dev
pnpm tauri dev
pnpm build
pnpm tauri build
pnpm lint
pnpm typecheck
pnpm test
pnpm format
```

## 构建

前端构建：

```bash
pnpm build
```

构建产物输出到 `dist/`。

桌面应用构建：

```bash
pnpm tauri build
```

安装包产物通常位于 `src-tauri/target/`。

## 目录结构

```text
ShipyardX/
├─ src/                    # React 前端
│  ├─ app/                 # provider、主题、全局设置
│  ├─ features/            # 功能模块
│  ├─ layouts/             # 布局
│  ├─ pages/               # 页面入口
│  ├─ shared/              # 通用组件和工具
│  └─ types/               # 前端类型与绑定输出
├─ src-tauri/              # Tauri + Rust
│  ├─ src/commands/        # Tauri command
│  ├─ src/services/        # 业务逻辑
│  ├─ src/docker/          # Docker 通信与映射
│  ├─ src/ssh/             # SSH 能力
│  └─ tauri.conf.json      # Tauri 配置
├─ public/
├─ dist/
└─ README.md
```

## 调试

前端入口：

- [src/main.tsx](/Users/zero/Desktop/ShipyardX/src/main.tsx:1)
- [src/App.tsx](/Users/zero/Desktop/ShipyardX/src/App.tsx:1)

Rust 入口：

- [src-tauri/src/main.rs](/Users/zero/Desktop/ShipyardX/src-tauri/src/main.rs:1)
- [src-tauri/src/lib.rs](/Users/zero/Desktop/ShipyardX/src-tauri/src/lib.rs:1)

后端代码结构：

- `src-tauri/src/commands`：Tauri command 定义
- `src-tauri/src/services`：核心业务逻辑
- `src-tauri/src/docker`：Docker 连接与数据映射
- `src-tauri/src/ssh`：SSH 连接与执行

## 类型绑定

前后端共享类型通过 `tauri-specta` 生成，输出文件位于 [src/types/app-bindings.ts](/Users/zero/Desktop/ShipyardX/src/types/app-bindings.ts:1)。

开发模式下执行：

```bash
pnpm tauri dev
```

即可触发绑定文件更新。

## 本地数据

应用数据目录中包含以下文件：

- `servers.json`
- `encryption.key`

相关实现见 [src-tauri/src/config/store.rs](/Users/zero/Desktop/ShipyardX/src-tauri/src/config/store.rs:1)。

运行日志由 `tauri-plugin-log` 写入应用日志目录。

## License

本项目采用 `GNU GPL-3.0` 许可证，详见根目录 [LICENSE](/Users/zero/Desktop/ShipyardX/LICENSE:1)。

## 推荐开发环境

- [VS Code](https://code.visualstudio.com/)
- [Tauri VS Code Extension](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
