const http = require("node:http");
const fs = require("node:fs/promises");
const fssync = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Readable } = require("node:stream");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const API_KEY = process.env.IMAGE_BED_API_KEY || "";
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "";
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(ROOT_DIR, "uploads");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".gif": "image/gif"
};

async function ensureDirectories() {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

function applyCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(message)
  });
  res.end(message);
}

function isApiRequest(pathname) {
  return pathname.startsWith("/api/");
}

function isAuthorized(req) {
  if (!API_KEY) {
    return true;
  }

  const authHeader = req.headers.authorization || "";
  const expectedValue = `Bearer ${API_KEY}`;
  return authHeader === expectedValue;
}

function detectOrigin(req) {
  if (PUBLIC_BASE_URL) {
    return PUBLIC_BASE_URL.replace(/\/+$/, "");
  }

  const forwardedProtoHeader = req.headers["x-forwarded-proto"];
  const forwardedHostHeader = req.headers["x-forwarded-host"];
  const proto = Array.isArray(forwardedProtoHeader)
    ? forwardedProtoHeader[0]
    : (forwardedProtoHeader || "http").split(",")[0].trim();
  const host = Array.isArray(forwardedHostHeader)
    ? forwardedHostHeader[0]
    : (forwardedHostHeader || req.headers.host || `localhost:${PORT}`).split(",")[0].trim();

  return `${proto}://${host}`;
}

async function sendFile(res, filePath) {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      sendText(res, 404, "Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Content-Length": stat.size
    });

    const stream = fssync.createReadStream(filePath);
    stream.on("error", () => sendText(res, 500, "Failed to read file"));
    stream.pipe(res);
  } catch {
    sendText(res, 404, "Not found");
  }
}

function safeUploadsPath(fileName) {
  const resolvedPath = path.resolve(UPLOADS_DIR, fileName);
  if (!resolvedPath.startsWith(UPLOADS_DIR)) {
    return null;
  }
  return resolvedPath;
}

function buildImageRecord(fileName, stats, origin) {
  const encodedName = encodeURIComponent(fileName);
  const url = `${origin}/uploads/${encodedName}`;

  return {
    fileName,
    size: stats.size,
    uploadedAt: stats.birthtime.toISOString(),
    url,
    markdown: `![${fileName}](${url})`,
    html: `<img src="${url}" alt="${fileName}" />`
  };
}

async function listImages(origin) {
  const entries = await fs.readdir(UPLOADS_DIR, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const filePath = path.join(UPLOADS_DIR, entry.name);
        const stats = await fs.stat(filePath);
        return buildImageRecord(entry.name, stats, origin);
      })
  );

  return files.sort(
    (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  );
}

function sanitizeBaseName(name) {
  return name
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function extensionFromFile(file) {
  const originalExt = path.extname(file.name || "").toLowerCase();
  if (originalExt) {
    return originalExt;
  }

  const mimeExt = {
    "image/gif": ".gif",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/svg+xml": ".svg",
    "image/webp": ".webp"
  };

  return mimeExt[file.type] || ".bin";
}

async function parseUpload(req) {
  const request = new Request("http://localhost/upload", {
    method: req.method,
    headers: req.headers,
    body: Readable.toWeb(req),
    duplex: "half"
  });

  const formData = await request.formData();
  const file = formData.get("image");

  if (!file || typeof file === "string") {
    throw new Error("Missing image file");
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Only image uploads are supported");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("Image exceeds the 10MB size limit");
  }

  return file;
}

async function handleUpload(req, res, origin) {
  try {
    const file = await parseUpload(req);
    const ext = extensionFromFile(file);
    const baseName = sanitizeBaseName(path.basename(file.name, path.extname(file.name)) || "image");
    const uniqueName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${baseName}${ext}`;
    const filePath = path.join(UPLOADS_DIR, uniqueName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    const stats = await fs.stat(filePath);
    sendJson(res, 201, {
      ok: true,
      image: buildImageRecord(uniqueName, stats, origin)
    });
  } catch (error) {
    sendJson(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : "Upload failed"
    });
  }
}

async function handleDelete(res, fileName) {
  const decodedName = decodeURIComponent(fileName);
  const filePath = safeUploadsPath(decodedName);
  if (!filePath) {
    sendJson(res, 400, { ok: false, error: "Invalid file name" });
    return;
  }

  try {
    await fs.unlink(filePath);
    sendJson(res, 200, { ok: true });
  } catch {
    sendJson(res, 404, { ok: false, error: "Image not found" });
  }
}

async function requestHandler(req, res) {
  const origin = detectOrigin(req);
  const url = new URL(req.url || "/", origin);
  const apiPath = url.pathname.startsWith("/api/v1/") ? url.pathname.slice(7) : url.pathname;

  if (applyCors(req, res)) {
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      service: "local-image-bed",
      version: "v1",
      authEnabled: Boolean(API_KEY)
    });
    return;
  }

  if (isApiRequest(url.pathname) && !isAuthorized(req)) {
    sendJson(res, 401, {
      ok: false,
      error: "Unauthorized"
    });
    return;
  }

  if (req.method === "GET" && (url.pathname === "/api/images" || apiPath === "/images")) {
    const images = await listImages(origin);
    sendJson(res, 200, { ok: true, images });
    return;
  }

  if (req.method === "POST" && (url.pathname === "/api/upload" || apiPath === "/upload")) {
    await handleUpload(req, res, origin);
    return;
  }

  if (
    req.method === "DELETE" &&
    (url.pathname.startsWith("/api/images/") || apiPath.startsWith("/images/"))
  ) {
    const fileName = url.pathname.startsWith("/api/v1/")
      ? apiPath.replace("/images/", "")
      : url.pathname.replace("/api/images/", "");
    await handleDelete(res, fileName);
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/uploads/")) {
    const fileName = url.pathname.replace("/uploads/", "");
    const filePath = safeUploadsPath(decodeURIComponent(fileName));
    if (!filePath) {
      sendText(res, 400, "Invalid file path");
      return;
    }

    await sendFile(res, filePath);
    return;
  }

  if (req.method === "GET") {
    const relativePath = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const filePath = path.resolve(PUBLIC_DIR, relativePath);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      sendText(res, 400, "Invalid file path");
      return;
    }

    await sendFile(res, filePath);
    return;
  }

  sendText(res, 405, "Method not allowed");
}

async function start() {
  await ensureDirectories();

  const server = http.createServer((req, res) => {
    requestHandler(req, res).catch((error) => {
      console.error(error);
      sendJson(res, 500, { ok: false, error: "Internal server error" });
    });
  });

  server.listen(PORT, HOST, () => {
    console.log(`Image bed is running at http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
