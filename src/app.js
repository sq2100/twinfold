import {
  FORMAT,
  hashBlob,
  compareSnapshots,
  summarize,
  validateSnapshot,
  csvReport,
  validPath,
} from "./core.js";
const $ = (id) => document.getElementById(id);
const english = Object.fromEntries(
  [...document.querySelectorAll("[data-i18n]")].map((el) => [
    el.dataset.i18n,
    el.innerHTML,
  ]),
);
const chinese = {
  local: "● 文件始终留在你的设备上",
  eyebrow: "给重要文件，一份确定的答案",
  headline: "真的都复制好了吗？<br>核对一下，才放心。",
  intro:
    '按内容比较两个文件夹。找出哪些文件变了、<br class="desktop">移了位置，或根本没有复制过去。',
  note: "你的文件，你的浏览器。<br>无需上传，无需注册。",
  workspace: "01 / 选择两个文件夹",
  demo: "试用演示 ↗",
  original: "原始文件 / 之前",
  backup: "备份文件 / 之后",
  chooseOriginal: "原始文件夹",
  chooseBackup: "需要核对的文件夹",
  dropHint: "把文件夹拖到这里，或点击下方选择。",
  chooseFolder: "选择文件夹",
  loadSnapshot: "载入快照",
  method: "SHA-256 内容核验",
  methodHint: "读取每一个字节，原文件不会被修改。",
  clear: "清空",
  cancel: "取消",
  compare: "比较文件夹 →",
  resultsEyebrow: "02 / 核验结果",
  exportReport: "导出报告 ↓",
  status: "状态",
  file: "文件 / 相对路径",
  size: "A → B 大小",
  noMatches: "没有匹配的文件。",
  showMore: "再显示 200 项",
  saveTitle: "为下一次核对，留一份凭据。",
  saveHint:
    "保存文件名、大小和内容哈希，日后与新备份核对。快照不包含文件正文。",
  saveA: "保存 A 快照 ↓",
  saveB: "保存 B 快照 ↓",
  step1: "选择两个文件夹",
  step1p: "原件和备份，昨天和今天，任意两个版本都可以。",
  step2: "不只看文件名",
  step2p: "即使文件名、大小相同，内容哈希也能识别变化。",
  step3: "把核验结果带走",
  step3p: "导出报告或快照，下次需要时随时回来核对。",
  limitsTitle: "会检查什么，以及有哪些限制",
  limits:
    "检查文件内容和区分大小写的相对路径；不检查空文件夹、权限、时间戳、符号链接，以及浏览器无法读取的云端文件。快照匹配表示内容与记录一致，不能证明备份时间或存储地点。只有唯一匹配的同内容文件会标记为移动；重复内容的歧义项仍显示新增或缺失。按 4 MiB 分块顺序读取；扫描期间请不要改动文件。导出的报告和快照包含文件名，分享前请留意。",
  footer: "少一点猜测，多一份放心。",
  footerRight: "开源 · MIT · 可离线使用",
};
let lang = navigator.language.startsWith("zh") ? "zh" : "en";
let sources = { left: null, right: null },
  rows = [],
  resultSources = null,
  controller = null,
  busy = false,
  filter = "all",
  limit = 200,
  generation = 0;
const messageTranslations = new Map();
const t = (en, zh) => {
  const pair = { en, zh };
  messageTranslations.set(en, pair);
  messageTranslations.set(zh, pair);
  return pair[lang];
};
const statuses = () => ({
  same: t("Unchanged", "内容一致"),
  changed: t("Changed", "内容变化"),
  added: t("Added in B", "B 中新增"),
  removed: t("Missing in B", "B 中缺失"),
  moved: t("Moved / renamed", "移动 / 改名"),
  unreadable: t("Not verified", "未能核验"),
});
const bytes = (n) =>
  n == null
    ? "—"
    : n < 1024
      ? `${n} B`
      : n < 1048576
        ? `${(n / 1024).toFixed(1)} KiB`
        : n < 1073741824
          ? `${(n / 1048576).toFixed(1)} MiB`
          : `${(n / 1073741824).toFixed(2)} GiB`;
function message(text) {
  $("message").textContent = text;
}
function invalidate() {
  rows = [];
  resultSources = null;
  $("results").hidden = true;
  $("empty-guide").hidden = false;
  $("compare").disabled = busy || !sources.left || !sources.right;
}
function renderSource(side) {
  const s = sources[side];
  $(`name-${side}`).textContent =
    s?.name ||
    t(
      side === "left" ? "Your original folder" : "The folder to check",
      side === "left" ? "原始文件夹" : "需要核对的文件夹",
    );
  $(`meta-${side}`).textContent = s
    ? `${s.files.length.toLocaleString()} ${t("files", "个文件")} · ${bytes(s.files.reduce((n, f) => n + f.size, 0))}${s.snapshot ? t(" · saved snapshot", " · 已保存快照") : ""}`
    : t(
        "Drop a folder here, or choose one below.",
        "把文件夹拖到这里，或点击下方选择。",
      );
}
function setSource(side, source) {
  ++generation;
  sources[side] = source;
  invalidate();
  renderSource(side);
  message("");
}
function setBusy(value) {
  busy = value;
  for (const id of [
    "pick-left",
    "pick-right",
    "import-left",
    "import-right",
    "demo",
    "clear",
    "save-left",
    "save-right",
    "report",
    "language",
  ])
    $(id).disabled = value;
  $("compare").disabled = value || !sources.left || !sources.right;
  $("cancel").hidden = !value;
  $("progress-area").hidden = !value;
}
function applyLanguage() {
  document.documentElement.lang = lang;
  document.body.classList.toggle("zh", lang === "zh");
  for (const el of document.querySelectorAll("[data-i18n]"))
    el.innerHTML = (lang === "zh" ? chinese : english)[el.dataset.i18n];
  $("language").textContent = lang === "zh" ? "English" : "中文";
  $("search").placeholder = t("Find a file…", "搜索文件路径…");
  $("search").setAttribute(
    "aria-label",
    t("Search file paths", "搜索文件路径"),
  );
  const translatedMessage = messageTranslations.get($("message").textContent);
  if (translatedMessage) message(translatedMessage[lang]);
  ["left", "right"].forEach(renderSource);
  if (resultSources) renderResults();
}
function acceptFiles(side, files) {
  if (!files.length) {
    message(
      t(
        "This folder contains no readable files. Empty folders are not included.",
        "此文件夹没有可读取的文件；空文件夹不会纳入检查。",
      ),
    );
    return;
  }
  const root =
    files[0].webkitRelativePath?.split("/")[0] ||
    t("Selected files", "所选文件");
  const records = files.map((file) => ({
    path: file.webkitRelativePath?.split("/").slice(1).join("/") || file.name,
    size: file.size,
    file,
  }));
  const seen = new Set();
  for (const r of records) {
    if (!validPath(r.path) || seen.has(r.path))
      throw new Error(
        t(
          "Unsupported or duplicate file path.",
          "存在不支持或重复的文件路径。",
        ),
      );
    seen.add(r.path);
  }
  setSource(side, { name: root, files: records });
}
async function readEntry(entry, prefix = "", signal) {
  signal?.throwIfAborted();
  if (entry.isFile) {
    const file = await new Promise((resolve, reject) =>
      entry.file(resolve, reject),
    );
    return [{ path: prefix + entry.name, size: file.size, file }];
  }
  const reader = entry.createReader();
  let all = [];
  while (true) {
    signal?.throwIfAborted();
    const batch = await new Promise((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (!batch.length) break;
    all.push(...batch);
  }
  const out = [];
  for (const child of all) {
    const items = await readEntry(child, prefix + entry.name + "/", signal);
    for (const item of items) out.push(item);
  }
  return out;
}
for (const side of ["left", "right"]) {
  $(`pick-${side}`).onclick = () => {
    $(`files-${side}`).value = "";
    $(`files-${side}`).click();
  };
  $(`import-${side}`).onclick = () => {
    $(`snapshot-${side}`).value = "";
    $(`snapshot-${side}`).click();
  };
  $(`files-${side}`).onchange = (event) => {
    if (busy) return;
    try {
      acceptFiles(side, [...event.target.files]);
    } catch (error) {
      message(error.message);
    }
  };
  $(`snapshot-${side}`).onchange = async (event) => {
    if (busy) return;
    const file = event.target.files[0];
    if (!file) return;
    const stamp = ++generation;
    try {
      if (file.size > 40 * 1024 * 1024)
        throw new Error(
          t("Snapshot exceeds the 40 MiB limit.", "快照超过 40 MiB 上限。"),
        );
      const value = validateSnapshot(JSON.parse(await file.text()));
      if (stamp !== generation) return;
      setSource(side, { ...value, snapshot: true });
    } catch {
      if (stamp === generation)
        message(
          t(
            "Could not load this snapshot. Choose a valid Twinfold JSON snapshot (up to 40 MiB / 100,000 files).",
            "快照载入失败。请选择有效的 Twinfold JSON 快照（不超过 40 MiB / 100,000 个文件）。",
          ),
        );
    }
  };
  const drop = $(`drop-${side}`);
  drop.ondragover = (event) => {
    event.preventDefault();
    if (!busy) drop.classList.add("drag");
  };
  drop.ondragleave = () => drop.classList.remove("drag");
  drop.ondrop = async (event) => {
    event.preventDefault();
    drop.classList.remove("drag");
    if (busy) return;
    const entries = [...event.dataTransfer.items]
      .map((item) => item.webkitGetAsEntry?.())
      .filter(Boolean);
    if (entries.length !== 1 || !entries[0].isDirectory) {
      message(
        t(
          "Please drop one folder per side, or use Choose folder.",
          "每侧请拖入一个文件夹，或使用“选择文件夹”。",
        ),
      );
      return;
    }
    controller = new AbortController();
    setBusy(true);
    invalidate();
    try {
      message(t("Reading folder entries…", "正在读取文件列表…"));
      const items = await readEntry(entries[0], "", controller.signal);
      controller.signal.throwIfAborted();
      const files = items.map((f) => ({
        ...f,
        path: f.path.slice(entries[0].name.length + 1),
      }));
      if (files.some((f) => !validPath(f.path)))
        throw new Error(t("Unsupported file path.", "文件路径不受支持。"));
      setSource(side, { name: entries[0].name, files });
    } catch (error) {
      message(
        error.name === "AbortError"
          ? t("Cancelled.", "已取消。")
          : t(
              "Unable to read this folder. Try the folder picker.",
              "无法读取此文件夹，请尝试“选择文件夹”。",
            ),
      );
    } finally {
      setBusy(false);
      controller = null;
    }
  };
}
async function scan(source, signal, onBytes) {
  if (source.snapshot) return source;
  const files = [];
  for (const record of source.files) {
    signal.throwIfAborted();
    try {
      const hash = await hashBlob(record.file, { signal, onBytes });
      files.push({ path: record.path, size: record.size, hash });
    } catch (error) {
      if (signal.aborted) throw error;
      files.push({
        path: record.path,
        size: record.size,
        error: "Could not read file",
      });
    }
    if (files.length % 32 === 0)
      await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return { format: FORMAT, name: source.name, files };
}
$("compare").onclick = async () => {
  if (busy || !sources.left || !sources.right) return;
  ++generation;
  controller = new AbortController();
  setBusy(true);
  invalidate();
  const total = Object.values(sources)
    .filter((s) => !s.snapshot)
    .flatMap((s) => s.files)
    .reduce((n, f) => n + f.size, 0);
  let done = 0,
    last = 0;
  const update = (amount) => {
    done += amount;
    if (performance.now() - last < 100) return;
    last = performance.now();
    $("progress").value = total ? Math.min(100, (done / total) * 100) : 0;
    message(
      `${t("Checking contents", "正在核验内容")} · ${bytes(done)} / ${bytes(total)}`,
    );
  };
  $("progress").value = 0;
  message(t("Checking file contents…", "正在核验文件内容…"));
  try {
    const a = await scan(sources.left, controller.signal, update);
    const b = await scan(sources.right, controller.signal, update);
    controller.signal.throwIfAborted();
    rows = compareSnapshots(a, b);
    resultSources = { left: a, right: b };
    filter = "all";
    limit = 200;
    $("search").value = "";
    renderResults();
    message(
      t(
        "Check complete. Results cover the files your browser could enumerate; see limitations below.",
        "核验完成。结果覆盖浏览器列出的文件；适用范围见页面底部。",
      ),
    );
  } catch (error) {
    message(
      controller.signal.aborted
        ? t(
            "Cancelled. No incomplete result is shown.",
            "已取消，不展示未完成的结果。",
          )
        : t(
            "The check could not finish. Try selecting the folders again.",
            "核验未完成，请重新选择文件夹后重试。",
          ),
    );
  } finally {
    controller = null;
    setBusy(false);
    if (resultSources) updateSnapshotButtons();
  }
};
function renderResults() {
  const counts = summarize(rows),
    labels = statuses();
  $("results").hidden = false;
  $("empty-guide").hidden = true;
  const clean = counts.same === rows.length;
  $("verdict").textContent = !rows.length
    ? t("No files to compare.", "没有可比对的文件。")
    : counts.unreadable
      ? t("Some files could not be verified.", "部分文件未能完成核验。")
      : clean
        ? t("Same files. Same contents.", "文件相同，内容一致。")
        : !counts.removed && !counts.changed && !counts.added
          ? t("Same contents. A few new places.", "内容一致，部分位置变了。")
          : t("Here’s what changed.", "这些文件有差异。");
  $("verdict-note").textContent =
    `${rows.length.toLocaleString()} ${t("file comparisons", "个比对结果")} · ${t("A is the original. B is the backup / newer version.", "A 为原始文件，B 为备份或较新版本。")}`;
  $("stats").replaceChildren();
  for (const key of [
    "same",
    "changed",
    "removed",
    "added",
    "moved",
    "unreadable",
  ]) {
    const card = document.createElement("div");
    card.className = "stat";
    const num = document.createElement("strong");
    num.textContent = counts[key];
    const label = document.createElement("span");
    label.textContent = labels[key];
    card.append(num, label);
    $("stats").append(card);
  }
  $("filters").replaceChildren();
  for (const [key, label] of [
    ["all", t("All files", "全部")],
    ["differences", t("Differences", "差异")],
    ["removed", labels.removed],
    ["changed", labels.changed],
    ["moved", labels.moved],
  ]) {
    const button = document.createElement("button");
    button.textContent = label;
    button.className = filter === key ? "active" : "";
    button.setAttribute("aria-pressed", String(filter === key));
    button.onclick = () => {
      filter = key;
      limit = 200;
      renderResults();
    };
    $("filters").append(button);
  }
  renderRows();
  updateSnapshotButtons();
}
function renderRows() {
  const search = $("search").value.toLowerCase(),
    labels = statuses();
  const visible = rows.filter(
    (row) =>
      (filter === "all" ||
        (filter === "differences" && row.status !== "same") ||
        row.status === filter) &&
      `${row.path} ${row.previousPath || ""}`.toLowerCase().includes(search),
  );
  $("rows").replaceChildren();
  for (const row of visible.slice(0, limit)) {
    const tr = document.createElement("tr"),
      status = document.createElement("td"),
      tag = document.createElement("span"),
      path = document.createElement("td"),
      size = document.createElement("td");
    tag.className = `status-tag status-${row.status}`;
    tag.textContent = labels[row.status];
    status.append(tag);
    path.className = "path";
    if (row.previousPath) {
      const prev = document.createElement("span");
      prev.className = "previous";
      prev.textContent = `${row.previousPath} →`;
      path.append(prev);
    }
    path.append(document.createTextNode(row.path));
    size.textContent = `${bytes(row.left?.size)} → ${bytes(row.right?.size)}`;
    tr.append(status, path, size);
    $("rows").append(tr);
  }
  $("empty").hidden = visible.length !== 0;
  $("more").hidden = visible.length <= limit;
}
function download(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function updateSnapshotButtons() {
  for (const side of ["left", "right"])
    $(`save-${side}`).disabled =
      busy ||
      resultSources[side].files.some((f) => f.error) ||
      resultSources[side].files.length > 100000;
}
for (const side of ["left", "right"])
  $(`save-${side}`).onclick = () => {
    const snapshot = resultSources?.[side];
    if (!snapshot || snapshot.files.some((f) => f.error)) return;
    download(
      JSON.stringify(
        { ...snapshot, createdAt: new Date().toISOString() },
        null,
        2,
      ),
      `twinfold-${side}-snapshot.json`,
      "application/json",
    );
  };
$("report").onclick = () =>
  download(
    csvReport(rows),
    "twinfold-comparison.csv",
    "text/csv;charset=utf-8",
  );
$("search").oninput = () => {
  limit = 200;
  renderRows();
};
$("more").onclick = () => {
  limit += 200;
  renderRows();
};
$("cancel").onclick = () => controller?.abort();
$("clear").onclick = () => {
  ++generation;
  sources = { left: null, right: null };
  invalidate();
  ["left", "right"].forEach(renderSource);
  message("");
};
$("language").onclick = () => {
  lang = lang === "en" ? "zh" : "en";
  applyLanguage();
};
$("demo").onclick = async () => {
  if (busy) return;
  const records = (entries) =>
    entries.map(([path, content]) => {
      const file = new File([content], path.split("/").at(-1));
      return { path, size: file.size, file };
    });
  sources = {
    left: {
      name: "weekend-project",
      files: records([
        ["README.md", "# A little weekend project\n"],
        ["photos/sunrise.txt", "Sunrise over the sea.\n"],
        ["notes/ideas.md", "Build something useful.\n"],
        ["src/settings.json", '{"theme":"light"}\n'],
        ["docs/checklist.md", "Remember to check the backup.\n"],
        ["assets/palette.txt", "#294b37\n#f6f7f2\n"],
      ]),
    },
    right: {
      name: "weekend-project-backup",
      files: records([
        ["README.md", "# A little weekend project\n"],
        ["archive/sunrise.txt", "Sunrise over the sea.\n"],
        ["src/settings.json", '{"theme":"night"}\n'],
        ["docs/checklist.md", "Remember to check the backup.\n"],
        ["assets/palette.txt", "#294b37\n#f6f7f2\n"],
        ["notes/new-plan.md", "Ship the first version.\n"],
      ]),
    },
  };
  ++generation;
  ["left", "right"].forEach(renderSource);
  invalidate();
  await $("compare").onclick();
  message(
    t(
      "Example files only — nothing from your device was read.",
      "当前为演示文件，没有读取你设备上的文件。",
    ),
  );
};
// Prevent the browser navigating away when files are dropped outside a card.
window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => event.preventDefault());
applyLanguage();
