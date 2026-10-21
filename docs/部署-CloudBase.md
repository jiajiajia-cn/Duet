# 部署到腾讯云 CloudBase（云托管）

面向「两个人自己用」的部署说明。整套东西跑在一个容器里：Next.js + PostgreSQL + 图片文件。

## 一、需要准备什么

| 项目 | 说明 |
| --- | --- |
| 腾讯云账号 | 实名认证后开通「云开发 CloudBase」 |
| 云托管环境 | 控制台 → 云开发 → 云托管，按量计费，两人用基本在免费额度内 |
| 持久存储 | 挂载 CFS 到 `/data`（数据库和图片都在这里），否则重启会丢数据 |

## 二、两种数据库模式

**A. 数据库也在容器里（推荐，省事）**

环境变量设 `LOCAL_PG=1`，容器启动时会自动初始化 PostgreSQL、建库、跑迁移。
数据落在 `/data/pg`，只要 CFS 挂载着就不会丢。

**B. 用外部数据库**

不设 `LOCAL_PG`，把 `DATABASE_URL` 指向 Neon / Supabase / 腾讯云 PostgreSQL 即可。
容器只跑应用，镜像可以更小。

## 三、部署步骤

1. **推代码到 Git**（GitHub / Gitee / 腾讯工蜂都行），云托管支持关联仓库自动构建。
2. 云托管 → 新建服务 → 选择代码仓库 → Dockerfile 构建。
3. **服务配置**
   - 端口：`8080`（容器内应用监听这个端口，Dockerfile 已设好）
   - 健康检查：HTTP `/` ，返回 200 即可
   - 实例数：1
   - 规格：0.5 核 1G 足够
4. **环境变量**（复制粘贴）

```
AUTH_SECRET=<用下面命令生成>
LOCAL_PG=1
UPLOAD_DIR=/data/uploads
DATA_DIR=/data
NEXT_PUBLIC_APP_URL=https://你的域名
```

生成密钥：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

5. **挂载存储**：云托管 → 服务设置 → 文件存储 → 挂载 CFS 到 `/data`。
6. 部署完成后访问分配的默认域名，注册第一个账号。
7. 第二个账号：把「设置 → 圈子」里的邀请链接发给对方，注册时自动进圈。

## 四、自定义域名

- 用平台默认域名：**不需要备案**，直接能用。
- 绑自己的域名：域名要**备案**（国内节点强制）。

## 五、备份

数据都在 `/data`：

```bash
# 进容器执行
pg_dump -h 127.0.0.1 -U postgres checkin > /data/backup/checkin-$(date +%F).sql
```

建议在云托管里加一个定时任务每天跑一次，或者直接给 CFS 配快照。

## 六、本地验证镜像

```bash
docker build -t checkin .
docker run -p 8080:8080 -v checkin-data:/data \
  -e AUTH_SECRET=dev-secret-for-local-test \
  -e LOCAL_PG=1 checkin
# 打开 http://localhost:8080
```

## 七、常见问题

**启动日志里迁移失败**：检查 `DATABASE_URL` 是否指向容器内的 `127.0.0.1:5432`，或者云数据库是否放通了访问。

**重启后数据没了**：没挂 CFS，`/data` 在容器重启后会被重置。

**图片 404**：确认 `UPLOAD_DIR` 指向挂载目录，并且旧图片是从 `public/uploads` 迁过来的话要一起拷贝到 `/data/uploads`。
