# AI Radio (Claudio FM) — 项目总结

## 是什么

Windows Web 版 AI 私人电台 DJ。用自然语言描述心情 → DeepSeek AI 从网易云歌单选歌 + 生成 DJ 串词 → Edge TTS 合成语音 → 连续播放（歌曲 + DJ 播报交织）。

## 当前版本：V4.2（已推送 master）

**仓库**: `git@github.com:SmallThreeStone/AI-Audio-Claudio-.git`

### 最近 5 次提交

```
c446b66 V4.1 + V4.2 — 桌面端两栏布局 & 全量优化
5455bb2 V4.0.1 — 管理后台密码保护
a81fde9 V4.0 "呼吸" — 视觉与体验大版本更新
622b14c V3.2 — 多用户数据隔离
f6f58ce V3.1 — 收尾修复 & 功能补全
```

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS 4 + Howler.js + Zustand |
| 后端 | Python FastAPI + SQLAlchemy (async/SQLite) + edge-tts |
| AI | DeepSeek API (deepseek-chat, OpenAI 兼容) |
| 侧车 | Node.js `@neteasecloudmusicapienhanced/api` (端口 3000) |

## 启动方式

```bash
# 侧车 → 后端 → 前端
cd frontend && node node_modules/@neteasecloudmusicapienhanced/api/main.js &
cd backend  && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
cd frontend && npm run dev
# 浏览器 → http://localhost:5173
```

或者直接双击项目根目录 `start.bat`。

- **Node 路径**: `E:/nodejs/node.exe`
- **Python 路径**: `C:/Users/31397/AppData/Local/Programs/Python/Python311/python.exe`

## 已完成的版本演进

| 版本 | 核心内容 |
|------|----------|
| V1.0 | 基础电台 |
| V2.0–V2.9 | DJ 人设(4)、音乐画像、天气/日历感知、DLNA 推流、睡眠定时、PWA、管理后台、Docker |
| V3.0–V3.2 | 多用户隔离(X-Client-Id)、全链路 session/WS 隔离、QR/验证码/密码登录 |
| V4.0 | 视觉重做 — 环形频谱、SVG 水纹进度条、LRC 滚动歌词、呼吸感动效、三种登录 |
| V4.1 | 桌面端两栏布局 — 左侧队列优先(歌单/画像可折叠)，右侧全宽播放器(max-w-xl) |
| V4.2 | 全量优化(见下) |

## V4.2 优化清单

### 后端（7 项）

- print → logging：8 处统一为结构化日志（main/radio/dj_engine/queue_manager/tts_engine）
- 限流内存清理：`_rate_limit_store` 过期 key 自动 `del`
- WS 频道安全：user_id 改为必填参数，删除 `broadcast()` 向后兼容别名
- 健康检查 DB 验证：`/api/health` 执行 `SELECT 1`，失败返回 503
- 队列响应 N+1 优化：`_build_queue_response` 改为批量 `WHERE Song.id IN (...)`
- Admin 用户列表 N+1 优化：`list_users` 用 `GROUP BY` 聚合查询，2N+1 → 3 次查询
- 删除废弃 `COOKIES_FILE` 配置

### 前端（11 项）

- `destroyHowl()` 抽取：7 处重复清理代码 → 1 个工具函数
- "上一首"修复：跳过当前歌曲，取 playHistory 第二项
- `useCallback` 空依赖修复：hydrate 改用 `useStore.getState()` 同步读取
- 通知持久化：3s → 8s 自动消失 + X 手动关闭按钮
- 横屏遮罩可关闭：加"知道了"按钮，不强制阻断
- 黑胶封面 onError fallback：裂图隐藏，露出 C 占位符
- 音量静音切换 + 百分比：图标可点击切换静音，滑块右侧显示百分比
- 歌词加载闪烁修复：`fetchedSongIdRef` 移到 fetch 成功后赋值 + `lyricLoading` 状态
- 工具行始终可见：去掉"更多工具"折叠，PlayHistory/SpeakerSelector/SleepTimer 直接渲染
- 静默 catch 加 `console.warn`：Auth/Admin/Header 共 4 处
- 音乐画像侧栏简化：hideHeader 模式下只显示统计摘要 + 情绪 + 艺人 top4 + 曲风 top5

## 核心架构

```
frontend/src/
  components/
    Player/   — RadioPlayer, VinylDisc, AudioWaveform, LyricPanel, PlayerControls, UpNext, PlayHistory, SleepTimer, SpeakerSelector
    Queue/    — QueuePanel (compact 模式用于桌面侧栏), QueueItem
    Chat/     — ChatInput (心情输入 + 语音输入)
    Login/    — LoginModal (QR/验证码/密码)
    Library/  — PlaylistBrowser (hideHeader 模式), MusicProfile (hideHeader 模式)
    Layout/   — Layout, MobileNav, Header
    Settings/ — SettingsPanel
    Admin/    — AdminDashboard (趋势图/热力图/用户管理/异常检测)
  hooks/
    useRadioPlayer.ts — 核心播放逻辑 (Howler.js, playItem/skip/previous/stop)
    useWebSocket.ts   — WS 连接 + 队列同步 + 会话状态
    useAudioVisualizer.ts — AudioContext 频谱分析
  store/   — Zustand 全局状态
  api/     — axios 客户端 + ws 实例

backend/app/
  routers/
    radio.py    — 电台生成/队列/画像 API
    auth.py     — 登录/扫码
    admin.py    — 管理后台
    ws.py       — WebSocket 端点
  services/
    dj_engine.py     — DeepSeek prompt + 4 种 DJ 人设
    tts_engine.py    — Edge TTS / Fish Audio 双轨
    audio_proxy.py   — 网易云歌曲 URL 获取(10min缓存+3min预刷新)
    queue_manager.py — 队列构建/续杯/完成检测
    weather_service.py    — IP 定位 + OpenWeather
    calendar_service.py   — Google Calendar OAuth
    greeting_service.py   — 智能问候
    distillation_service.py — 听歌画像蒸馏(5维度)
    profile_builder.py     — 个人画像构建
```

## 已知约束与注意事项

1. **网易云登录**：需扫码登录后才有完整歌曲可播性 — 无 cookies 时 VIP 歌曲 copyright restricted
2. **SQLite**：写操作串行化，多用户高并发时有瓶颈（非代码缺陷，是数据库选择）
3. **浏览器自动播放策略**：页面刷新后需用户点击才能开始播放
4. **Sidecar 路径**：`sidecar_manager.py` 硬编码了 Windows 路径 `E:\nodejs`，Linux/Mac 部署需修改
5. **无测试**：整个项目零单元测试/集成测试
6. **Google Calendar / Fish Audio**：代码完整但需外部 API Key/配置

## 可能的发展方向

- 单元测试 + E2E 测试
- SQLite → PostgreSQL 迁移（解决写锁争用）
- AI 情绪分类升级（当前仅关键词启发式）
- 移动端体验继续打磨
- 国际化 / 英文 DJ
