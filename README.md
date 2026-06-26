# 本地图床

一个无需额外依赖的轻量图床，适合本地部署或放到自己的服务器上。

## 功能

- 上传图片并自动生成唯一文件名
- 返回图片直链、Markdown 链接、HTML 嵌入代码
- 页面内预览、刷新和删除图片
- 提供可给脚本或第三方工具调用的 HTTP API
- 可选 `Bearer Token` 鉴权
- 无第三方依赖，直接使用 Node.js 运行

## 启动

```powershell
cd image-bed
npm start
```

默认地址：

```text
http://localhost:3000
```

## 可选环境变量

- `PORT`: 服务端口，默认 `3000`
- `HOST`: 监听地址，默认 `0.0.0.0`
- `IMAGE_BED_API_KEY`: 设置后，所有 `/api/*` 接口都需要 `Authorization: Bearer <你的密钥>`
- `PUBLIC_BASE_URL`: 可选，强制生成对外访问域名，适合 `ngrok`、反向代理或 CDN

示例：

```powershell
$env:IMAGE_BED_API_KEY="demo-key"
$env:PUBLIC_BASE_URL="https://your-domain.example.com"
npm start
```

如果你当前对外域名是 `https://jenae-artier-virgilio.ngrok-free.dev/`，可以这样启动：

```powershell
$env:IMAGE_BED_API_KEY="demo-key"
$env:PUBLIC_BASE_URL="https://jenae-artier-virgilio.ngrok-free.dev"
npm start
```

## API 接口

> **示例 URL** 默认使用线上部署域名 `https://image-bed.onrender.com`，如需在本地调试请替换为 `http://localhost:3000`。

### 1. 健康检查

```http
GET /api/health
```

返回示例：

```json
{
  "ok": true,
  "service": "local-image-bed",
  "version": "v1",
  "authEnabled": false
}
```

### 2. 上传图片

兼容路径：

- `POST /api/upload`
- `POST /api/v1/upload`

请求方式：`multipart/form-data`

表单字段：

- `image`: 图片文件

`curl` 示例：

```bash
curl -X POST https://image-bed.onrender.com/api/v1/upload \
  -F "image=@demo.png"
```

开启鉴权后的示例：

```bash
curl -X POST https://image-bed.onrender.com/api/v1/upload \
  -H "Authorization: Bearer demo-key" \
  -F "image=@demo.png"
```

公网域名示例（Render 部署）：

```bash
curl -X POST https://image-bed.onrender.com/api/v1/upload \
  -H "Authorization: Bearer demo-key" \
  -F "image=@demo.png"
```

返回示例：

```json
{
  "ok": true,
  "image": {
    "fileName": "1781749221249-fb956b4a-demo.png",
    "size": 68,
    "uploadedAt": "2026-06-18T02:20:21.300Z",
    "url": "https://image-bed.onrender.com/uploads/1781749221249-fb956b4a-demo.png",
    "markdown": "![1781749221249-fb956b4a-demo.png](https://image-bed.onrender.com/uploads/1781749221249-fb956b4a-demo.png)",
    "html": "<img src=\"https://image-bed.onrender.com/uploads/1781749221249-fb956b4a-demo.png\" alt=\"1781749221249-fb956b4a-demo.png\" />"
  }
}
```

### 3. 获取图片列表

兼容路径：

- `GET /api/images`
- `GET /api/v1/images`

```bash
curl https://image-bed.onrender.com/api/v1/images
```

### 4. 删除图片

兼容路径：

- `DELETE /api/images/:fileName`
- `DELETE /api/v1/images/:fileName`

```bash
curl -X DELETE https://image-bed.onrender.com/api/v1/images/your-file-name.png
```

## 目录结构

```text
image-bed/
  public/     # 前端页面
  uploads/    # 上传后的图片
  server.js   # 服务端
```

## 部署到 Render

这套图床可以直接部署到 Render 的 `Web Service`。

### 1. 先把代码推到 GitHub

建议把 `image-bed` 目录单独放进一个仓库，或者在 Render 里把 `Root Directory` 指向 `image-bed`。

### 2. 在 Render 创建服务

- 进入 Render 控制台
- 点击 `New +`
- 选择 `Web Service`
- 连接你的 GitHub 仓库

### 3. 基础配置

- `Environment`: `Node`
- `Build Command`: `npm install`
- `Start Command`: `npm start`
- `Root Directory`: 如果仓库根目录就是本项目，就留空；如果项目在子目录里，就填 `image-bed`

### 4. 环境变量

建议设置这些环境变量：

- `IMAGE_BED_API_KEY`: 你的接口密钥
- `UPLOADS_DIR`: 建议填 `/var/data/uploads`

可选：

- `PUBLIC_BASE_URL`: 如果你想强制返回固定域名，可以填 Render 分配给你的公网地址，例如 `https://your-app.onrender.com`

### 5. 一定要挂 Persistent Disk

如果不挂磁盘，Render 重启或重新部署后，上传的图片会丢失。

建议配置：

- `Mount Path`: `/var/data`

然后把环境变量设置成：

```text
UPLOADS_DIR=/var/data/uploads
```

### 6. 部署完成后可用地址

假设你的服务域名是：

```text
https://your-app.onrender.com
```

那可用接口就是：

- `GET https://your-app.onrender.com/api/health`
- `POST https://your-app.onrender.com/api/v1/upload`
- `GET https://your-app.onrender.com/api/v1/images`

上传示例：

```bash
curl -X POST https://your-app.onrender.com/api/v1/upload \
  -H "Authorization: Bearer your-api-key" \
  -F "image=@demo.png"
```
