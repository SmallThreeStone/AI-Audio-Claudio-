# AI Radio - Claudio FM

Windows Web 版 AI 私人电台 DJ。受 `@slicenfer/claudio` 启发，用自然语言描述心情，AI DJ 从网易云歌单中选歌、生成串词、TTS 合成语音播报。

## 技术栈

- **前端**: React 19 + TypeScript + Vite + Tailwind CSS 4 + Howler.js + Zustand
- **后端**: Python FastAPI + SQLAlchemy (async/SQLite) + edge-tts + OpenAI SDK
- **AI**: DeepSeek API (deepseek-chat, OpenAI 兼容接口)
- **侧车**: Node.js `@neteasecloudmusicapienhanced/api`（网易云 API）

## 快速启动

```bash
# 1. 安装依赖
cd backend && pip install -r requirements.txt
cd ../frontend && npm install

# 2. 配置 API Key（在 backend/.env 中）
# DEEPSEEK_API_KEY=sk-...

# 3. 启动侧车（网易云 API）
node node_modules/@neteasecloudmusicapienhanced/api/app.js
# 默认监听 http://localhost:3000

# 4. 启动后端（监听所有网络接口，支持局域网访问）
cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 5. 启动前端（监听所有网络接口，支持局域网访问）
cd frontend && npm run dev
# 本机访问: http://localhost:5173
# 局域网访问: http://<本机IP>:5173
```

## 项目结构

- `backend/` — Python FastAPI 后端
  - `app/models/` — SQLAlchemy 模型 (User, Playlist, Song, DJSession, QueueItem)
  - `app/routers/` — REST API + WebSocket 路由
  - `app/services/` — 核心服务层 (网易云客户端、DJ引擎、TTS引擎、队列管理、音频代理)
  - `data/` — 运行时数据 (radio.db, tts_cache/)
- `frontend/` — React SPA
  - `src/components/` — UI 组件
  - `src/hooks/` — 自定义 hooks (WebSocket, 音频播放, 键盘快捷键)
  - `src/store/` — Zustand 全局状态
  - `src/api/` — API 客户端层

## 开发规范

### Git 工作流

- **新功能开发必须在 `feature/` 分支上进行**，禁止直接在 `master` 上改动
  - 分支命名: `feature/<功能简述>`，如 `feature/demo-mode`、`feature/share-card`
  - 开发完成后合并回 `master`
- **每次推送代码时**:
  1. 按需更新 `README.md`（版本号、功能列表、版本历史等）
  2. 将 feature 分支合并到 `master`
  3. 推送到远程仓库
- Commit 风格: `V<版本号> — <简短描述>`，如 `V4.4.0 — 产品体验升级`

### 编码规范

- **默认不写注释**，只在 WHY 不明显时加一行简短注释
- 不写多行 docstring，不写 "used by X" / "added for Y" 类注释
- 优先编辑现有文件，避免新建文件
- 不做过度抽象：3 行相似代码好过 1 个过早的 helper
- 不引入 feature flag 或向后兼容 shim，直接改
- 不加不可能触发的错误处理、fallback 或验证
- TypeScript 编译零错误才能提交

### 任务执行

- 多步骤任务使用 TaskCreate/TaskUpdate 追踪进度
- 独立工作并行执行（同时启动多个 agent 或 tool call）
- 每轮完成后简要汇报改动内容和下一步

## 当前版本

V4.4.0 — 产品体验升级：Demo模式 + 新手引导 + 个性化 + 画像电台 + 换心情 + 分享 + 埋点

## 环境要求

- Python 3.11+（路径：`C:/Users/31397/AppData/Local/Programs/Python/Python311/python.exe`）
- Node.js 18+（路径：`E:/nodejs/node.exe`）
- 网易云音乐账号（扫码登录）
- DeepSeek API Key（配置在 `backend/.env`）
