const fileInput = document.getElementById("fileInput");
const pickButton = document.getElementById("pickButton");
const refreshButton = document.getElementById("refreshButton");
const docsButton = document.getElementById("docsButton");
const dropzone = document.getElementById("dropzone");
const gallery = document.getElementById("gallery");
const statusText = document.getElementById("statusText");
const countBadge = document.getElementById("countBadge");
const cardTemplate = document.getElementById("cardTemplate");

// 接口文档模态框相关元素
const docsModal = document.getElementById("docsModal");
const docsContent = document.getElementById("docsContent");
const DOCS_REPO_OWNER = "tu065833-dotcom";
const DOCS_REPO_NAME = "image-bed";
const DOCS_BRANCH = "main";
const DOCS_URL = `https://raw.githubusercontent.com/${DOCS_REPO_OWNER}/${DOCS_REPO_NAME}/${DOCS_BRANCH}/README.md`;
// 运行时自动检测当前部署域名（避免硬编码 localhost）
function getCurrentBaseUrl() {
  // 优先使用环境变量（如有），否则用当前页面的 origin
  if (typeof window !== "undefined" && window.location && window.location.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }
  return "http://localhost:3000";
}
let docsLoaded = false;

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function copyText(text, successMessage) {
  await navigator.clipboard.writeText(text);
  setStatus(successMessage);
}

async function loadImages() {
  setStatus("正在加载图片列表...");
  const response = await fetch("/api/images");
  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.error || "加载失败");
  }

  renderGallery(data.images);
  setStatus("图片列表已更新");
}

function renderGallery(images) {
  countBadge.textContent = `${images.length} 张`;

  if (!images.length) {
    gallery.className = "gallery empty";
    gallery.innerHTML = '<p class="empty-state">还没有图片，先上传一张试试。</p>';
    return;
  }

  gallery.className = "gallery";
  gallery.innerHTML = "";

  for (const image of images) {
    const node = cardTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".preview").src = image.url;
    node.querySelector(".preview").alt = image.fileName;
    node.querySelector(".name").textContent = image.fileName;
    node.querySelector(".size").textContent = `${formatSize(image.size)} · ${new Date(image.uploadedAt).toLocaleString()}`;
    node.querySelector(".link-input").value = image.url;

    node.querySelector(".copy-url").addEventListener("click", () => {
      copyText(image.url, "已复制图片直链");
    });

    node.querySelector(".copy-md").addEventListener("click", () => {
      copyText(image.markdown, "已复制 Markdown 链接");
    });

    node.querySelector(".copy-html").addEventListener("click", () => {
      copyText(image.html, "已复制 HTML 代码");
    });

    node.querySelector(".remove").addEventListener("click", async () => {
      if (!window.confirm(`确认删除 ${image.fileName} 吗？`)) {
        return;
      }

      setStatus(`正在删除 ${image.fileName}...`);
      const response = await fetch(`/api/images/${encodeURIComponent(image.fileName)}`, {
        method: "DELETE"
      });
      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.error || "删除失败");
      }

      await loadImages();
      setStatus(`${image.fileName} 已删除`);
    });

    gallery.appendChild(node);
  }
}

async function uploadFile(file) {
  const formData = new FormData();
  formData.append("image", file);

  setStatus(`正在上传 ${file.name}...`);

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData
  });
  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.error || "上传失败");
  }

  await loadImages();
  setStatus(`${file.name} 上传成功`);
}

async function handleFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) {
    return;
  }

  try {
    for (const file of files) {
      await uploadFile(file);
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "操作失败", true);
  } finally {
    fileInput.value = "";
  }
}

pickButton.addEventListener("click", () => fileInput.click());
refreshButton.addEventListener("click", () => {
  loadImages().catch((error) => {
    setStatus(error instanceof Error ? error.message : "刷新失败", true);
  });
});
fileInput.addEventListener("change", () => handleFiles(fileInput.files));

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("dragging");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragging");
});

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("dragging");
  handleFiles(event.dataTransfer.files);
});

window.addEventListener("DOMContentLoaded", () => {
  loadImages().catch((error) => {
    setStatus(error instanceof Error ? error.message : "初始化失败", true);
  });
});

/* ============================================================
   接口文档模态框
   ============================================================ */

// 极简 Markdown 渲染器（支持标题、段落、代码块、行内代码、列表、链接、引用、分隔线、表格）
// 在 fetch README 失败时使用，保证始终有内容可显示
function renderMarkdown(md) {
  const escapeHtml = (s) => s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;

  const inline = (text) => {
    let t = escapeHtml(text);
    // 行内代码
    t = t.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
    // 加粗
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    // 斜体
    t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    t = t.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");
    // 链接
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
      const safeUrl = url.replace(/"/g, "&quot;");
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });
    return t;
  };

  const isTableDivider = (line) => /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("|");

  while (i < lines.length) {
    const line = lines[i];

    // 代码块
    if (/^```/.test(line)) {
      const lang = line.replace(/^```/, "").trim();
      const buf = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1; // 跳过结束 ```
      const langClass = lang ? ` class="language-${lang.replace(/"/g, "")}"` : "";
      out.push(`<pre><code${langClass}>${escapeHtml(buf.join("\n"))}</code></pre>`);
      continue;
    }

    // 标题
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i += 1;
      continue;
    }

    // 表格
    if (line.includes("|") && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      const headerCells = line.split("|").map((c) => c.trim()).filter((c) => c.length);
      i += 2; // 跳过分隔行
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        const cells = lines[i].split("|").map((c) => c.trim()).filter((c) => c.length);
        if (cells.length) rows.push(cells);
        i += 1;
      }
      const thead = `<thead><tr>${headerCells.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>`;
      const tbody = `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody>`;
      out.push(`<table>${thead}${tbody}</table>`);
      continue;
    }

    // 分隔线
    if (/^\s*([-*_])\s*\1\s*\1[\s\1]*$/.test(line)) {
      out.push("<hr />");
      i += 1;
      continue;
    }

    // 引用
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      out.push(`<blockquote><p>${inline(buf.join("<br />"))}</p></blockquote>`);
      continue;
    }

    // 无序列表
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i += 1;
      }
      out.push(`<ul>${items.map((it) => `<li>${inline(it)}</li>`).join("")}</ul>`);
      continue;
    }

    // 有序列表
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      out.push(`<ol>${items.map((it) => `<li>${inline(it)}</li>`).join("")}</ol>`);
      continue;
    }

    // 空行
    if (line.trim() === "") {
      i += 1;
      continue;
    }

    // 段落（合并连续非空行）
    const para = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^(#{1,4}\s|```|>\s?|\s*[-*+]\s|\s*\d+\.\s)/.test(lines[i]) && !(lines[i].includes("|") && i + 1 < lines.length && isTableDivider(lines[i + 1]))) {
      para.push(lines[i]);
      i += 1;
    }
    if (para.length) {
      out.push(`<p>${inline(para.join(" "))}</p>`);
    }
  }

  return out.join("\n");
}

function getFallbackDocsMarkdown(baseUrl) {
  // 离线兜底：保证 fetch 失败时也有文档可看
  return `# 本地图床 · 接口文档

> 本文档同时维护在仓库根目录的 [README.md](https://github.com/${DOCS_REPO_OWNER}/${DOCS_REPO_NAME})，下面是与接口相关的部分摘要。

## 1. 健康检查

\`\`\`http
GET /api/health
\`\`\`

返回示例：

\`\`\`json
{
  "ok": true,
  "service": "local-image-bed",
  "version": "v1",
  "authEnabled": false
}
\`\`\`

## 2. 上传图片

兼容路径：

- \`POST /api/upload\`
- \`POST /api/v1/upload\`

请求方式：\`multipart/form-data\`

表单字段：

- \`image\`: 图片文件

\`curl\` 示例：

\`\`\`bash
curl -X POST ${baseUrl}/api/v1/upload \\
  -F "image=@demo.png"
\`\`\`

开启鉴权后的示例：

\`\`\`bash
curl -X POST ${baseUrl}/api/v1/upload \\
  -H "Authorization: Bearer demo-key" \\
  -F "image=@demo.png"
\`\`\`

返回示例：

\`\`\`json
{
  "ok": true,
  "image": {
    "fileName": "1781749221249-fb956b4a-demo.png",
    "size": 68,
    "uploadedAt": "2026-06-18T02:20:21.300Z",
    "url": "${baseUrl}/uploads/1781749221249-fb956b4a-demo.png",
    "markdown": "![demo.png](${baseUrl}/uploads/1781749221249-fb956b4a-demo.png)",
    "html": "<img src=\\"${baseUrl}/uploads/1781749221249-fb956b4a-demo.png\\" alt=\\"demo.png\\" />"
  }
}
\`\`\`

## 3. 获取图片列表

兼容路径：

- \`GET /api/images\`
- \`GET /api/v1/images\`

\`\`\`bash
curl ${baseUrl}/api/v1/images
\`\`\`

返回示例：

\`\`\`json
{
  "ok": true,
  "images": [
    {
      "fileName": "demo.png",
      "size": 68,
      "uploadedAt": "2026-06-18T02:20:21.300Z",
      "url": "${baseUrl}/uploads/demo.png",
      "markdown": "![demo.png](${baseUrl}/uploads/demo.png)",
      "html": "<img src=\\"${baseUrl}/uploads/demo.png\\" alt=\\"demo.png\\" />"
    }
  ]
}
\`\`\`

## 4. 删除图片

兼容路径：

- \`DELETE /api/images/:fileName\`
- \`DELETE /api/v1/images/:fileName\`

\`\`\`bash
curl -X DELETE ${baseUrl}/api/v1/images/your-file-name.png
\`\`\`

## 5. 鉴权（可选）

设置环境变量 \`IMAGE_BED_API_KEY\` 后，所有 \`/api/*\` 接口都需要在请求头携带：

\`\`\`
Authorization: Bearer <你的密钥>
\`\`\`

## 6. 错误码

| 状态码 | 含义 |
| ------ | ---- |
| 200    | 请求成功 |
| 201    | 上传成功 |
| 400    | 请求参数错误 |
| 401    | 未授权（鉴权失败或缺失 Token） |
| 404    | 资源不存在 |
| 405    | 方法不允许 |
| 500    | 服务器内部错误 |

## 7. 限制

- 单张图片最大 **10MB**
- 仅接受 \`image/*\` MIME 类型
`;
}

async function loadDocsMarkdown() {
  if (docsLoaded) {
    return;
  }
  const baseUrl = getCurrentBaseUrl();
  docsContent.innerHTML = '<p class="docs-loading">正在加载接口文档...</p>';
  try {
    const response = await fetch(DOCS_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    let md = await response.text();
    // 把 README 中可能存在的 localhost 示例 URL 替换为当前部署域名
    md = replaceDocsBaseUrl(md, baseUrl);
    docsContent.innerHTML = renderMarkdown(md);
    docsLoaded = true;
  } catch (error) {
    // 拉取失败时使用本地兜底内容
    const fallback = replaceDocsBaseUrl(getFallbackDocsMarkdown(baseUrl), baseUrl);
    docsContent.innerHTML =
      `<p class="status error">无法从 GitHub 拉取最新文档（${error instanceof Error ? error.message : "未知错误"}），已显示本地缓存版本。</p>` +
      renderMarkdown(fallback);
    docsLoaded = true;
  }
}

// 把文档中所有形如 http://localhost:3000 或 https://localhost:3000 的 URL
// 统一替换为当前部署域名，避免硬编码
function replaceDocsBaseUrl(md, baseUrl) {
  if (!baseUrl) return md;
  // 匹配 http(s)://localhost(:port)?
  const escaped = baseUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return md
    .replace(/https?:\/\/localhost(:\d+)?/g, baseUrl)
    .replace(new RegExp(escaped, "g"), baseUrl);
}

function openDocsModal() {
  if (!docsModal) return;
  docsModal.hidden = false;
  docsModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  loadDocsMarkdown();
}

function closeDocsModal() {
  if (!docsModal) return;
  docsModal.hidden = true;
  docsModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

if (docsButton) {
  docsButton.addEventListener("click", openDocsModal);
}

if (docsModal) {
  // 点击遮罩或关闭按钮关闭
  docsModal.querySelectorAll("[data-docs-close]").forEach((el) => {
    el.addEventListener("click", closeDocsModal);
  });
  // 按 Esc 关闭
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !docsModal.hidden) {
      closeDocsModal();
    }
  });
}
