# AI Radio - Claudio FM

Windows Web 版 AI 私人电台 DJ。受 `@slicenfer/claudio` 启发，用自然语言描述心情，AI DJ 从网易云歌单中选歌、生成串词、TTS 合成语音播报。

## 技术栈

- **前端**: React 19 + TypeScript + Vite + Tailwind CSS 4 + Howler.js + Zustand
- **后端**: Python FastAPI + SQLAlchemy (async/SQLite) + edge-tts + Anthropic SDK
- **侧车**: Node.js `@neteasecloudmusicapienhanced/api`（网易云 API）

## 快速启动

```bash
# 1. 安装依赖
cd backend && pip install -r requirements.txt
cd ../frontend && npm install

# 2. 设置 Claude API Key
set ANTHROPIC_API_KEY=sk-ant-...

# 3. 启动侧车（网易云 API）
npx @neteasecloudmusicapienhanced/api
# 默认监听 http://localhost:3000

# 4. 启动后端
cd backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# 5. 启动前端
cd frontend && npm run dev
# 访问 http://localhost:5173

# 或使用 start.bat 一键启动
cd scripts && start.bat
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

## 环境要求

- Python 3.11+
- Node.js 18+
- 网易云音乐账号（扫码登录）
- Anthropic API Key（Claude API）
