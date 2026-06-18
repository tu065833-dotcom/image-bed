const fileInput = document.getElementById("fileInput");
const pickButton = document.getElementById("pickButton");
const refreshButton = document.getElementById("refreshButton");
const dropzone = document.getElementById("dropzone");
const gallery = document.getElementById("gallery");
const statusText = document.getElementById("statusText");
const countBadge = document.getElementById("countBadge");
const cardTemplate = document.getElementById("cardTemplate");

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
