# V3.2 — 多用户隔离 & 独立会话（完整版）

## 审计结果

后端发现 **41 处**单用户假设，前端发现 **14 处**。以下是完整变更清单。

---

## 后端变更（3 个 Phase，30 项）

### Phase 1：核心基础设施（8 项）

| # | 文件 | 行 | 改动 | 严重度 |
|---|------|-----|------|--------|
| 1.1 | `models/user.py` | 新增 | `client_id VARCHAR(64) UNIQUE` 字段 | 🔴 |
| 1.2 | `utils/auth.py` | 新建 | `AuthMiddleware`：读取 `X-Client-Id` 头 → 查 `User.client_id` → 注入 `request.state.user_id`；无匹配则创建 `User(client_id=x, status="pending")`；白名单 `/api/health` | 🔴 |
| 1.3 | `database.py` | 迁移 | `ALTER TABLE users ADD COLUMN client_id`；为已有 User 回填随机 UUID | 🔴 |
| 1.4 | `utils/cookie_store.py` | 全文件 | **废弃**。cookies 改为直接读写 `User.cookies_json` DB 字段 | 🔴 |
| 1.5 | `routers/auth.py` | 25,70,100,102,109 | `/qr/start`、`/qr/status`、`/status`、`/logout`：全部改为 `select(User).where(User.id == request.state.user_id)`，不再 `limit(1)` | 🔴 |
| 1.6 | `main.py` | 48-82,88 | `restore_session()`：遍历所有 `cookies_json IS NOT NULL` 的用户逐一恢复，而非单个 `limit(1)` | 🔴 |
| 1.7 | `main.py` | 行 122-128 | `RateLimitMiddleware`：优先用 `X-Client-Id` 计数，fallback IP | 🟡 |
| 1.8 | `routers/ws.py` | 10 | WebSocket 连接拒绝 `user_id=0` 默认值，前端必须传有效 id | 🟡 |

### Phase 2：全链路数据隔离（14 项）

**radio.py — 核心电台路由（8 项）**

| # | 行 | 端点/函数 | 问题 | 改造 |
|---|-----|-----------|------|------|
| 2.1 | 25-29 | `_get_current_user_id()` | 全局 `login_status == "logged_in"` | **删除此函数**，改用 `request.state.user_id` |
| 2.2 | 51 | `request_radio()` | 同上 | 改用 `request.state.user_id` |
| 2.3 | 57-63 | `request_radio()` | 查活跃 session **未加 user_id 过滤** → 用户 A 的 session 会被用户 B 停掉 | 加 `where(DJSession.user_id == request.state.user_id)` |
| 2.4 | 67,100,103,125,248 | 5 处 `ws_manager.broadcast()` | **全局广播**泄漏给所有 WebSocket 客户端 | 改为 `ws_manager.broadcast_to_user(user_id, ...)` |
| 2.5 | 260 | `_broadcast_queue()` | `user_id = s.user_id if s.user_id else 0` | 改为无 fallback，直接用 `s.user_id` |
| 2.6 | 171-172 | `get_queue()` | 依赖 `_get_current_user_id()` | 改用 `request.state.user_id` |
| 2.7 | 388 | `record_listen_event()` | `login_status == "logged_in"` | 改用 `request.state.user_id` |
| 2.8 | 419,620 | `music_profile()` / `get_distillation()` | `login_status == "logged_in"` | 改用 `request.state.user_id` |

**其他路由（6 项）**

| # | 文件 | 行 | 端点 | 改造 |
|---|------|-----|------|------|
| 2.9 | `playlists.py` | 15,39 | `list_playlists` / `sync_playlists` | 改用 `request.state.user_id` |
| 2.10 | `admin.py` | 21,30 | `verify_admin` / `verify_owner` | 改用 `request.state.user_id`；Owner 可查看所有用户 |
| 2.11 | `audio_proxy.py` | 28,56 | `_refresh_url_background` / `get_song_url` | 接受 `user_id` 参数，用对应用户 cookies 请求歌曲 |
| 2.12 | `calendar_service.py` | 65,76 | `handle_callback` / `_get_credentials` | 改用 `request.state.user_id` |
| 2.13 | `calendar.py` | 22,66 | `calendar_status` / `_is_connected` | 改用 `request.state.user_id` |
| 2.14 | `netease_import_service.py` | 26 | `import_netease_history` | 改用 `request.state.user_id` |

### Phase 3：设置 & TTS（3 项）

| # | 文件 | 行 | 改动 |
|---|------|-----|------|
| 3.1 | `main.py` | 171,184 | `get_tts_provider` / `set_tts_provider`：改用 `request.state.user_id` |
| 3.2 | `main.py` | 93 | `lifespan`：`restore_session()` 改为多用户版本 |
| 3.3 | `routers/auth.py` | 10,64,114 | 删除 `from cookie_store import save_cookies, clear_cookies`；改为直接写 DB |

### Phase 4：边角补全（5 项）

| # | 文件 | 改动 |
|---|------|------|
| 4.1 | `services/greeting_service.py` | 已完工——所有函数接受 `user_id` 参数 ✅ |
| 4.2 | `services/dj_engine.py` | 已完工——所有函数接受 `user_id` 参数 ✅ |
| 4.3 | `routers/dlna.py` | 无需改动——DLNA 是设备层，不管用户 ✅ |
| 4.4 | 清理脚本 | 定期删除 `login_status == "pending"` 且 7 天未更新的匿名 User |
| 4.5 | `routers/calendar.py` | Google OAuth callback 用 `state` 参数传递 user_id |

---

## 前端变更（10 项）

### Phase 5：API & 身份层（5 项）

| # | 文件 | 行 | 问题 | 改造 |
|---|------|-----|------|------|
| 5.1 | `api/client.ts` | 1-8 | 裸 axios，无请求拦截器，无 `X-Client-Id` 头 | 添加拦截器：自动从 `getClientId()` 读取并附加到所有请求 |
| 5.2 | `api/radio.ts` | 9-103 | 17/18 个 API 函数无 client_id 参数 | 不再需要逐个加——5.1 的拦截器统一处理请求头 |
| 5.3 | `api/playlists.ts` | 4-12 | 无用户标识 | 同上，拦截器自动处理 |
| 5.4 | `api/auth.ts` | 3-20 | 无用户标识 | 同上 |
| 5.5 | `hooks/useWebSocket.ts` | 35 | `radioWS.connect()` 无 userId 参数，默认连接为 user 0 | 从 store 读 user.id 或从 `getClientId()` 读 clientId 传入 |

### Phase 6：状态 & UI 层（5 项）

| # | 文件 | 行 | 问题 | 改造 |
|---|------|-----|------|------|
| 6.1 | `App.tsx` | 93-94 | `getAuthStatus()` 返回值缺少 `id`，前端硬编码 `id: 0` | 后端 `/auth/status` 新增返回 `user_id` 和 `client_id`；前端使用真实值 |
| 6.2 | `LoginModal.tsx` | 54-60 | 登录成功硬编码 `id: 0`；无 `user_id` 和 `client_id` 回传 | 后端 `/qr/status` 新增返回 `user_id` 和 `client_id`；前端正确存储 |
| 6.3 | `LoginModal.tsx` | 22-30,41-43 | QR 状态（qrKey/qrUrl）是全局单例，不支持并发扫码 | 多用户各自扫码互不影响——各自 clientId 有独立 qr_key（后端 1.5 已修） |
| 6.4 | `store/index.ts` | 80-155 | 全局 store 无 `userId` 概念 | 添加 `userId` 和 `clientId` 字段；`setUser` 时同步写入 |
| 6.5 | `Layout/Header.tsx` | 24,88 | 绑定全局单例 user 状态 | 已有 user 对象，改造后自然隔离，无需额外改动 |

### 已完成（无需改动）

| 文件 | 说明 |
|------|------|
| `utils/clientId.ts` | 已正确实现 UUID 生成和 localStorage 持久化 ✅ |
| `hooks/useRadioPlayer.ts` | recorder/skip 等调用后端 API——后端按 `X-Client-Id` 头区分用户，前端无需改 ✅ |
| `components/Player/FeedbackButtons.tsx` | 同上 ✅ |
| `components/Library/MusicProfile.tsx` | 同上 ✅ |

---

## 审计发现的关键遗漏

相比初版规划，审计额外发现了：

| 遗漏项 | 严重度 | 说明 |
|--------|--------|------|
| **session 接管漏洞** | 🔴 | `request_radio()` 查活跃 session 时无 `user_id` 过滤 → A 发请求会停掉 B 的电台 |
| **5 处全局 WebSocket 广播** | 🔴 | `ws_manager.broadcast()` 泄漏进度/状态给所有客户端 |
| **前端 `id: 0` 硬编码** | 🔴 | `App.tsx` 和 `LoginModal.tsx` 两处 `setUser({ id: 0 })` |
| **WebSocket 始终连 user 0** | 🔴 | `radioWS.connect()` 从没传过 userId |
| **前端 `api/client.ts` 裸 axios** | 🔴 | 无拦截器，所有请求无身份头——这是后端的"入口缺失" |
| **`_get_current_user_id()` 中心依赖** | 🟡 | 8 个端点依赖此函数查全局唯一用户，是最需要消灭的调用 |
| **cookie_store.py 全文件废弃** | 🟡 | 3 个函数 `save/load/clear_cookies` 操作全局 `cookies.json`，单文件无法存多用户 |
| **`restore_session` 单用户启动** | 🟡 | 启动只恢复一个用户的 NetEase cookies |

---

## 总计

| 类别 | 数量 |
|------|------|
| 后端 MUST FIX (🔴) | 17 项 |
| 后端 HIGH/MEDIUM | 13 项 |
| 前端变更 | 10 项 |
| 已完工（无需改） | 6 项 |
| **合计需改动** | **40 项** |

## 工时

| 阶段 | 估计 |
|------|------|
| Phase 1-2 后端核心 | 4-5 小时 |
| Phase 3-4 边角 | 1-2 小时 |
| Phase 5-6 前端 | 2-3 小时 |
| 联调测试 | 1-2 小时 |
| **合计** | **8-12 小时** |

## 验收标准（8 条）

1. 三个浏览器打开同一地址 → 三个独立扫码页
2. A 登录后只有 A 看到自己的主页；B/C 保持扫码页
3. A 和 B 各自听歌，数据互不污染
4. A 发 `request_radio` 不会把 B 的电台停掉
5. WebSocket 进度推送只到对应用户，不广播给所有人
6. 刷新页面身份不丢失
7. A 退出登录不影响 B
8. Owner 管理后台可看所有用户统计
