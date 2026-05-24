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
node node_modules/@neteasecloudmusicapienhanced/api/main.js
# 默认监听 http://localhost:3000

# 4. 启动后端
cd backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# 5. 启动前端
cd frontend && npm run dev
# 访问 http://localhost:5173
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

## 当前版本

V2.1 — 4 种 DJ 人设、音乐画像、字幕面板、反馈系统、睡眠定时、稳定性修复

## 演进路线图

参见记忆系统：`project_upgrade_roadmap.md` — 向 Claudio 级个性化演进的三阶段规划

## 环境要求

- Python 3.11+（路径：`C:/Users/31397/AppData/Local/Programs/Python/Python311/python.exe`）
- Node.js 18+（路径：`E:/nodejs/node.exe`）
- 网易云音乐账号（扫码登录）
- DeepSeek API Key（配置在 `backend/.env`）
