# 🎵 AI Radio — Claudio FM

Windows Web 版 AI 私人电台 DJ。用自然语言描述心情，AI DJ 从网易云歌单中选歌、生成串词、TTS 合成语音播报。受 [Claudio](https://github.com/slicenfer/claudio) 启发。

## ✨ 功能

- **AI DJ 电台** — 4 种 DJ 人设（温暖小雨、摇滚老王、优雅乔希、潮流小艾），DeepSeek 驱动选歌 + 串词
- **网易云音乐** — 扫码登录，导入歌单，完整播放支持
- **TTS 语音播报** — Edge TTS 免费合成，支持 Fish Audio 情感语音（可选）
- **听歌行为追踪** — 自动记录播放/跳过/完播，隐式反馈学习
- **深度个人画像** — 最爱艺人、易跳过艺人、时段偏好、高频歌曲
- **主动智能问候** — 打开电台即展示场景化问候（时间 + 天气 + 最近在听）
- **时间感知** — DJ 根据实际时段调整问候语和选歌氛围，不再永远"深夜"
- **天气感知** — IP 自动定位城市 → 实时天气注入 DJ prompt → 雨天推荐氛围音乐
- **日历感知** — Google Calendar OAuth 集成，即将到来的日程注入 DJ prompt（可选）
- **DLNA 推流** — 局域网自动发现音箱（小爱等），一键推送到全屋音响
- **睡眠定时** — 定时停止播放

## 🛠 技术栈

| 层 | 技术 |
|---|------|
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS 4 + Howler.js + Zustand |
| 后端 | Python FastAPI + SQLAlchemy (async/SQLite) + edge-tts |
| AI | DeepSeek API (deepseek-chat, OpenAI 兼容) |
| 侧车 | Node.js NeteaseCloudMusicApi |
| 协议 | WebSocket（实时推送）、SSDP/DLNA（音箱推流） |

## 🚀 快速启动

### 环境要求

- Python 3.11+
- Node.js 18+
- 网易云音乐账号
- DeepSeek API Key

### 一键启动（Windows）

双击项目根目录的 `start.bat`，自动启动后端 + 前端 + 网易云侧车，并打开浏览器。

### 手动安装运行

```bash
# 1. 克隆仓库
git clone https://github.com/SmallThreeStone/AI-Audio-Claudio-.git
cd AI-Audio-Claudio-

# 2. 安装依赖
cd backend && pip install -r requirements.txt
cd ../frontend && npm install
cd ..

# 3. 配置 API Key
# 编辑 backend/.env，填入：
#   DEEPSEEK_API_KEY=sk-...
#   OPENWEATHER_API_KEY=...（可选，天气感知）

# 4. 启动侧车（网易云 API）
cd frontend && node node_modules/@neteasecloudmusicapienhanced/api/main.js &
# 监听 http://localhost:3000

# 5. 启动后端
cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 6. 启动前端
cd frontend && npm run dev
```

浏览器打开 http://localhost:5173，扫码登录网易云即可使用。

### 可选配置

```bash
# Google Calendar 集成（需在 Google Cloud Console 创建 OAuth 应用）
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
CALENDAR_ENABLED=true

# Fish Audio 情感 TTS（需购买 API Key）
TTS_PROVIDER=fish
FISH_AUDIO_API_KEY=your_key

# 局域网访问
# 服务已绑定 0.0.0.0，手机浏览器打开 http://<本机IP>:5173
```

## 📁 项目结构

```
├── backend/                    # Python FastAPI 后端
│   ├── app/
│   │   ├── models/             # SQLAlchemy 模型
│   │   ├── routers/            # REST API + WebSocket
│   │   ├── services/           # 核心服务
│   │   │   ├── dj_engine.py        # DJ 引擎（DeepSeek + prompt）
│   │   │   ├── tts_engine.py       # TTS 合成（Edge / Fish Audio）
│   │   │   ├── greeting_service.py # 主动问候
│   │   │   ├── weather_service.py  # 天气感知
│   │   │   ├── calendar_service.py # 日历感知
│   │   │   ├── dlna_service.py     # DLNA 推流
│   │   │   ├── queue_manager.py    # 播放队列
│   │   │   └── audio_proxy.py      # 音频代理
│   │   └── config.py
│   └── data/                   # SQLite + TTS 缓存
├── frontend/                   # React SPA
│   └── src/
│       ├── components/         # UI 组件
│       ├── hooks/              # 自定义 hooks
│       ├── store/              # Zustand 状态
│       └── api/                # API 客户端
└── README.md
```

## 🧠 DJ 人设

| ID | 名称 | 风格 | 情感标签 |
|----|------|------|----------|
| `xiaoyu` | 小雨 🌙 | 温暖治愈 · 知性陪伴 | `[gentle]` |
| `laowang` | 老王 🎸 | 摇滚老炮 · 激情澎湃 | `[super happy]` |
| `josie` | 乔希 🎷 | 爵士鉴赏 · 优雅格调 | `[calm]` |
| `xiaoai` | 小艾 ⚡ | 电音玩家 · 前卫潮流 | `[energetic]` |

## 📋 版本历史

| 版本 | 内容 |
|------|------|
| V1.0 | 基础电台功能 |
| V2.0 | 4 种 DJ 人设、音乐画像、字幕面板、反馈系统、睡眠定时 |
| V2.1 | 稳定性修复 & 播放控制优化 |
| V2.2 | 听歌行为追踪 & 深度个人画像 |
| V2.3 | 环境感知（TTS 情感 + 天气 + DLNA 推流 + 局域网访问） |
| V2.4 | 主动智能（场景问候 + 时间感知 + 日历接口 + 会话管理） |
| V2.5 | 体验优化（页面刷新恢复、错误降级、队列可视化、移动端适配、一键启动、生成进度细化） |
| V2.6 | 音乐蒸馏（网易云听歌记录导入 + 跨维度洞察融合 + AI 画像注入） |
| V2.7 | 多用户数据隔离（蒸馏/会话/队列/歌单/问候全链路按用户过滤） |
| V2.8 | 管理后台（用户概览/会话监控/播放记录）+ PWA 移动端支持 |

## 📄 License

MIT
