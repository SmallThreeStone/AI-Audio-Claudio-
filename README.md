# 🎵 AI Radio — Claudio FM

Windows Web 版 AI 私人电台 DJ。用自然语言描述心情，AI DJ 从网易云歌单中选歌、生成串词、TTS 合成语音播报。受 [Claudio](https://github.com/slicenfer/claudio) 启发。

## ✨ 功能

- **AI DJ 电台** — 4 种 DJ 人设（温暖小雨、摇滚老王、优雅乔希、潮流小艾），DeepSeek 驱动选歌 + 串词
- **多用户数据隔离** — `X-Client-Id` 请求头机制，每个浏览器独立身份，扫码登录/歌单/会话/画像全链路隔离
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
- **PWA 支持** — 可安装到手机/桌面，离线使用，原生应用体验
- **移动端优化** — 底部导航栏、触摸反馈、键盘自动避让、安全区适配
- **管理后台** — 数据趋势图表、异常告警（版权失效/高跳过率）、用户管理
- **Docker 部署** — 一键部署到任意平台（Railway、VPS 等）
- **音频可视化** — 环形频谱波纹随音乐律动，Canvas 实时渲染
- **水纹进度条** — SVG 波浪进度条，振幅随低频能量变化
- **滚动歌词** — LRC 歌词解析 + 自动滚动高亮，桌面/移动端自适应
- **呼吸感动效** — 环境渐变背景、毛玻璃面板、歌曲切换弹动过渡
- **多种登录方式** — 手机验证码登录、密码登录、二维码扫码登录

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
| V2.8 | 管理后台图表（趋势/时段/用户活跃）、设备隔离播放、天气组件、移动端底部导航、触摸体验优化、进度条点击跳转、暂停/恢复、会话过期自动清理、PWA 安全区适配 |
| V2.9 | 移动端键盘避让、TTS 失败兜底、歌曲 URL 2h 缓存、管理后台异常告警、Owner 权限增强、Docker 部署、后端 serve 前端静态文件 |
| V3.0 | Bug 修复（fallback 重复播放/WS 多用户隔离/skip 连点保护/N+1 查询/TTS 缓存）、优化（速率限制/WS 心跳/recharts 按需加载/prompt token 缩减）、上一首 & 播放历史、歌单风格筛选、设置面板（TTS/日历） |
| V3.1 | 收尾修复（历史模式/skip 混用/retry_after/速率限制卸载）、URL 缓存预刷新、CLAUDE.md 同步、泛化 user_filter、PWA 移动端增强（横屏提示/下拉刷新/滑动切 Tab/离线提示）、Fish Audio 运行时切换、日历连接状态、语音输入 |
| V3.2 | 多用户数据隔离 — AuthMiddleware (X-Client-Id)、全链路 session 隔离、WebSocket 按用户推送、修复会话接管 Bug、前端 axios 拦截器注入身份、QR 登录/歌单/队列/画像/日历/TTS 全链路用户隔离、cookie_store 废弃 |
| V4.0 | 视觉与体验大版本"呼吸" — 环形频谱波纹 (AudioContext + AnalyserNode)、SVG 水纹波浪进度条、LRC 滚动歌词面板 (解析+自动滚动)、环境呼吸背景+毛玻璃面板+切歌弹动过渡、手机验证码/密码/扫码三种登录方式 |

## 📄 License

MIT
