// ---------------------- Utilities ----------------------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function normalizeText(s) {
  return s.toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();
}

async function loadText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  return (await res.text()).normalize("NFC");
}

// ---------------------- Parser ----------------------
// Định dạng hỗ trợ (giống bạn gửi):
// ### **Câu N**
// <mô tả/câu hỏi có thể có ______ là chỗ trống>
// a. Lựa chọn 1
// b. Lựa chọn 2
// ...
// ➡️ **Đáp án đúng:** a
// hoặc: c, d, e
// hoặc: (tự luận) một chuỗi, có thể có nhiều phương án: "phương án 1 || phương án 2"
//
// Gợi ý điền chỗ trống có lựa chọn: câu chứa "______" và có options; đáp án: "a, c" theo thứ tự các ô trống.

// Accept headings like: "### **Câu N**" or "### Câu N" (with or without bold **)
// Also handle blocks ending with --- or other content
const BLOCK_RE =
  /^###\s*(?:\*\*)?Câu\s*(\d+)\s*(?:\*\*)?[\s\S]*?(?=^###\s*(?:\*\*)?Câu|^---+\s*$|\Z)/gim;
const OPT_RE = /^[ \t]*([a-z])\.\s*(.+)$/gim;

function parseQuizFromMarkdown(md) {
  const items = [];
  let m;
  while ((m = BLOCK_RE.exec(md)) !== null) {
    const raw = m[0].trim();
    // remove the heading line (supports with or without **)
    const noTitle = raw.replace(/^###\s*(?:\*\*)?Câu[^\n]*\n*/i, "");
    // Match answer line with optional ** bold formatting around ➡️
    const ansMatch = noTitle.match(
      /^[^\S\r\n]*\*{0,2}➡️[^\n]*:\s*(.+?)\*{0,2}$/im
    );
    let answerRaw = ansMatch ? ansMatch[1].trim() : "";

    // options
    const options = [];
    let om;
    while ((om = OPT_RE.exec(noTitle)) !== null) {
      options.push({ key: om[1].toLowerCase(), text: om[2].trim() });
    }

    // question text: phần trước dòng a./b./c. đầu tiên hoặc trước dòng đáp án
    let questionPart = noTitle;
    if (options.length) {
      // cắt trước lựa chọn đầu tiên
      const firstOptIdx = noTitle.search(OPT_RE);
      if (firstOptIdx > -1) questionPart = noTitle.slice(0, firstOptIdx);
    } else if (ansMatch) {
      // cắt phần trước "Đáp án đúng"
      questionPart = noTitle.slice(0, ansMatch.index);
    }

    const question = questionPart
      .replace(/^-{3,}\s*$/gim, "")
      .replace(/\*\*/g, "")
      .trim();

    const blanksCount = (question.match(/_{4,}/g) || []).length; // '____' trở lên
    const letters = answerRaw.toLowerCase().match(/\b[a-z]\b/g) || [];
    const isLetterAnswer =
      letters.length > 0 && letters.join("").length === letters.length;

    let type, correct;
    if (blanksCount > 0 && options.length && isLetterAnswer) {
      // fill-in-with-options (theo thứ tự ô trống)
      type = "gap-options";
      correct = letters; // theo thứ tự
    } else if (options.length && isLetterAnswer) {
      const unique = [...new Set(letters)];
      type = unique.length > 1 ? "multiple" : "single";
      correct = unique;
    } else if (!options.length) {
      type = "text";
      correct = answerRaw.replace(/\*\*/g, "").trim(); // có thể chứa " || "
    } else {
      // fallback: nếu có options nhưng đáp án không phải chữ cái, cho là text
      type = "text";
      correct = answerRaw.replace(/\*\*/g, "").trim();
    }

    items.push({
      question,
      options,
      correct,
      type,
      blanksCount,
    });
  }
  return items;
}

// ---------------------- State ----------------------
let ALL_QUESTIONS = [];
let FILTERED_INDEXES = []; // index map sau search
let CURRENT = 0;

const PAGE_SIZE = 20;
let PAGE = 1;

// ---------------------- Rendering ----------------------
function setMeta() {
  const total = FILTERED_INDEXES.length;
  const pos = total ? FILTERED_INDEXES.indexOf(CURRENT) + 1 : 0;
  $("#meta").textContent = total ? `Câu ${pos}/${total}` : "0 câu";
}

function clear(el) {
  el.innerHTML = "";
}

function renderQuestion(q) {
  const wrap = $("#question");
  clear(wrap);
  $("#feedback").textContent = "";

  const h = document.createElement("h3");
  h.textContent = "Câu hỏi";
  wrap.appendChild(h);

  // Replace blanks with placeholders
  let renderedText = q.question;
  const blanks = [];
  if (q.blanksCount > 0) {
    renderedText = renderedText.replace(/_{4,}/g, () => {
      const i = blanks.length;
      const span = `<span class="blank" data-blank="${i}">______</span>`;
      blanks.push(null);
      return span;
    });
  }

  const p = document.createElement("p");
  p.innerHTML = renderedText;
  wrap.appendChild(p);

  // For options or inputs
  let inputs = [];

  if (q.type === "single") {
    q.options.forEach((opt) => {
      const id = `opt_${CURRENT}_${opt.key}`;
      const label = document.createElement("label");
      label.className = "option";
      label.setAttribute("for", id);

      const input = document.createElement("input");
      input.type = "radio";
      input.name = `q_${CURRENT}`;
      input.id = id;
      input.value = opt.key;

      inputs.push(input);
      label.appendChild(input);
      label.append(` ${opt.key}. ${opt.text}`);
      wrap.appendChild(label);
    });
  } else if (q.type === "multiple") {
    q.options.forEach((opt) => {
      const id = `opt_${CURRENT}_${opt.key}`;
      const label = document.createElement("label");
      label.className = "option";
      label.setAttribute("for", id);

      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = `q_${CURRENT}`;
      input.id = id;
      input.value = opt.key;

      inputs.push(input);
      label.appendChild(input);
      label.append(` ${opt.key}. ${opt.text}`);
      wrap.appendChild(label);
    });
  } else if (q.type === "gap-options") {
    // Chips to fill blanks
    const blanksEls = $$("#question .blank");
    const chosen = []; // store letters by blank index

    const chips = document.createElement("div");
    chips.className = "chips";

    q.options.forEach((opt) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = `${opt.key}. ${opt.text}`;
      chip.dataset.key = opt.key;

      chip.addEventListener("click", () => {
        // fill next empty blank
        const idx = chosen.findIndex((v) => v === undefined || v === null);
        const target =
          idx === -1
            ? blanksEls.findIndex((el) => !el.classList.contains("filled"))
            : idx;

        const blankEl =
          blanksEls[target] ??
          blanksEls.find((el) => !el.classList.contains("filled"));
        if (!blankEl) return;

        // place key (or text)
        blankEl.textContent = `${opt.key}`;
        blankEl.classList.add("filled");
        chosen[target] = opt.key;

        // toggle selected state
        chip.classList.add("sel");
      });

      chips.appendChild(chip);
    });

    wrap.appendChild(chips);

    // expose reading of chosen for submission
    inputs = [
      {
        getChosen: () => {
          const blanks = $$("#question .blank");
          return blanks.map((el) => el.textContent.trim().toLowerCase());
        },
      },
    ];
  } else {
    // 'text'
    const input = document.createElement("textarea");
    input.rows = 3;
    input.placeholder = "Nhập đáp án...";
    input.style.width = "100%";
    inputs.push(input);
    wrap.appendChild(input);
  }

  // attach submit & retry handlers
  $("#submit").onclick = () => {
    const fb = $("#feedback");
    fb.className = "";
    let correct = false;
    let detail = "";

    if (q.type === "single") {
      const chosen = inputs.find((i) => i.checked)?.value;
      correct = !!chosen && q.correct?.[0] === chosen;
      detail = `Đáp án đúng: ${q.correct?.[0]?.toUpperCase?.()}`;
    } else if (q.type === "multiple") {
      const chosen = inputs
        .filter((i) => i.checked)
        .map((i) => i.value)
        .sort();
      const gold = [...(q.correct || [])].sort();
      correct = JSON.stringify(chosen) === JSON.stringify(gold);
      detail = `Đáp án đúng: ${
        gold.map((x) => x.toUpperCase()).join(", ") || "(trống)"
      }`;
    } else if (q.type === "gap-options") {
      const chosen = inputs[0].getChosen();
      const gold = q.correct || [];
      // so khớp theo thứ tự ô trống
      correct =
        chosen.length === gold.length && chosen.every((v, i) => v === gold[i]);
      detail = `Đáp án đúng theo thứ tự: ${gold
        .map((x) => x.toUpperCase())
        .join(", ")}`;
    } else {
      // text
      const ans = normalizeText(inputs[0].value || "");
      const goldRaw = (q.correct || "").toString();
      const goldList = goldRaw.split("||").map((s) => normalizeText(s));
      correct = ans && goldList.some((g) => g && ans === g);
      detail = `Đáp án đúng: ${goldRaw}`;
    }

    fb.textContent = (correct ? "✔️ Đúng. " : "✘ Sai. ") + detail;
    fb.classList.add(correct ? "ok" : "no");
  };

  $("#retry").onclick = () => {
    renderQuestion(q);
  };
}

function renderList() {
  const list = $("#list");
  clear(list);

  const total = FILTERED_INDEXES.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  PAGE = Math.min(PAGE, totalPages);

  const start = (PAGE - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, total);

  for (let i = start; i < end; i++) {
    const idx = FILTERED_INDEXES[i];
    const q = ALL_QUESTIONS[idx];
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `<strong>Câu ${i + 1}.</strong> <small>${q.question
      .replace(/\n/g, " ")
      .slice(0, 120)}...</small>`;
    div.addEventListener("click", () => {
      CURRENT = idx;
      setMeta();
      renderQuestion(ALL_QUESTIONS[CURRENT]);
      // scroll lên đầu panel câu hỏi
      $(".question-panel").scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    list.appendChild(div);
  }

  $("#pg-info").textContent = `Trang ${PAGE}/${totalPages}`;
  $("#pg-prev").disabled = PAGE <= 1;
  $("#pg-next").disabled = PAGE >= totalPages;
}

// ---------------------- Navigation & Search ----------------------
function jumpToVisible(n1Based) {
  const pos = Math.max(1, Math.min(n1Based, FILTERED_INDEXES.length));
  const idx = FILTERED_INDEXES[pos - 1];
  if (typeof idx === "number") {
    CURRENT = idx;
    setMeta();
    renderQuestion(ALL_QUESTIONS[CURRENT]);
  }
}

function applySearch() {
  const kw = normalizeText($("#search").value || "");
  FILTERED_INDEXES = ALL_QUESTIONS.map((q, i) => ({ q, i }))
    .filter(({ q }) => {
      if (!kw) return true;
      const hay = normalizeText(
        [
          q.question,
          ...(q.options || []).map((o) => `${o.key}. ${o.text}`),
          (q.correct || "").toString(),
        ].join(" ")
      );
      return hay.includes(kw);
    })
    .map((x) => x.i);

  // reset paging & current
  PAGE = 1;
  const first = FILTERED_INDEXES[0] ?? 0;
  CURRENT = first;
  setMeta();
  renderList();
  if (typeof CURRENT === "number") renderQuestion(ALL_QUESTIONS[CURRENT]);
}

// ---------------------- Boot ----------------------
async function fetchJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } catch (err) {
    return null;
  }
}

// sets manifest and selection
let SETS = [];
const STORAGE_KEY = "quiz.selectedSet";

async function loadAndInit(file) {
  try {
    const raw = await loadText(file);
    ALL_QUESTIONS = parseQuizFromMarkdown(raw);

    // default filtered = all
    FILTERED_INDEXES = ALL_QUESTIONS.map((_, i) => i);
    CURRENT = FILTERED_INDEXES[0] ?? 0;

    PAGE = 1;
    setMeta();
    renderQuestion(ALL_QUESTIONS[CURRENT]);
    renderList();
  } catch (err) {
    console.error("Failed to load questions file", file, err);
    const qEl = $("#question");
    if (qEl)
      qEl.innerHTML = `<p class="error">Không thể tải bộ câu hỏi: ${file}</p>`;
    FILTERED_INDEXES = [];
    setMeta();
    renderList();
  }
}

(async function main() {
  // Try to load sets manifest
  const manifest = await fetchJson("./data/sets.json");
  if (manifest && Array.isArray(manifest) && manifest.length) {
    SETS = manifest.map((s, i) => ({
      id: s.id || `set${i + 1}`,
      label: s.label || s.file,
      file: s.file,
    }));
  } else {
    // fallback: single default set
    SETS = [{ id: "default", label: "Default", file: "./data/questions.txt" }];
  }

  // populate select if present
  const sel = $("#set-select");
  if (sel) {
    sel.innerHTML = "";
    SETS.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.file;
      opt.textContent = s.label;
      sel.appendChild(opt);
    });

    // restore selection
    const prev = localStorage.getItem(STORAGE_KEY);
    if (prev) {
      const match = SETS.find((s) => s.id === prev || s.file === prev);
      if (match) sel.value = match.file;
    }

    sel.addEventListener("change", async (ev) => {
      const file = ev.target.value;
      // save selected id/file
      const s = SETS.find((x) => x.file === file);
      if (s) localStorage.setItem(STORAGE_KEY, s.id || s.file);
      await loadAndInit(file);
    });
  }

  // Allow loading arbitrary file path via text input + button
  const fileInput = $("#set-file");
  const loadBtn = $("#btn-load");
  const loadStatus = $("#load-status");
  if (fileInput && loadBtn) {
    loadBtn.addEventListener("click", async () => {
      const raw = fileInput.value && fileInput.value.trim();
      if (!raw) {
        if (loadStatus) loadStatus.textContent = "Vui lòng nhập tên file.";
        return;
      }

      if (loadStatus) {
        loadStatus.textContent = "Đang kiểm tra file...";
      }

      // build candidate paths to try (support bare filename or path)
      const candidates = [];
      const asIs = raw;
      // if user gave path starting with ./ or / or data/, keep as-is
      if (/^(\.\/|\/|data\/)/.test(raw)) {
        candidates.push(asIs);
      } else {
        candidates.push(asIs);
        candidates.push(`./data/${asIs}`);
      }
      // if no extension, try adding .txt
      if (!/\.[a-z0-9]+$/i.test(raw)) {
        candidates.push(`./data/${raw}.txt`);
        candidates.push(`${raw}.txt`);
      }

      // dedupe
      const seen = new Set();
      const uniq = candidates.filter((c) => {
        if (seen.has(c)) return false;
        seen.add(c);
        return true;
      });

      let found = null;
      for (const cand of uniq) {
        try {
          const res = await fetch(cand, { method: "GET", cache: "no-store" });
          if (res && res.ok) {
            found = cand;
            break;
          }
        } catch (e) {
          // ignore and try next
        }
      }

      if (!found) {
        if (loadStatus)
          loadStatus.textContent = `Không tìm thấy file "${raw}". Hãy kiểm tra đường dẫn hoặc đặt file trong thư mục data/.`;
        return;
      }

      // try set select to match if exists
      if (sel) {
        const match = [...sel.options].find((o) => o.value === found);
        if (match) sel.value = found;
      }

      if (loadStatus) loadStatus.textContent = `Đã tìm: ${found}. Đang tải...`;
      await loadAndInit(found);
      if (loadStatus) loadStatus.textContent = `Đã tải: ${found}`;
      setTimeout(() => {
        if (loadStatus) loadStatus.textContent = "";
      }, 4000);
    });
  }

  // load initial file (selected or first)
  const initialFile = (sel && sel.value) || SETS[0].file;
  await loadAndInit(initialFile);

  // events
  $("#prev").addEventListener("click", () => {
    const pos = FILTERED_INDEXES.indexOf(CURRENT);
    if (pos > 0) {
      CURRENT = FILTERED_INDEXES[pos - 1];
      setMeta();
      renderQuestion(ALL_QUESTIONS[CURRENT]);
    }
  });

  $("#next").addEventListener("click", () => {
    const pos = FILTERED_INDEXES.indexOf(CURRENT);
    if (pos < FILTERED_INDEXES.length - 1) {
      CURRENT = FILTERED_INDEXES[pos + 1];
      setMeta();
      renderQuestion(ALL_QUESTIONS[CURRENT]);
    }
  });

  $("#btn-go").addEventListener("click", () => {
    const n = parseInt($("#jump").value, 10);
    if (Number.isFinite(n)) jumpToVisible(n);
  });

  $("#search").addEventListener("input", () => {
    applySearch();
  });

  $("#pg-prev").addEventListener("click", () => {
    if (PAGE > 1) {
      PAGE--;
      renderList();
    }
  });
  $("#pg-next").addEventListener("click", () => {
    PAGE++;
    renderList();
  });
})();
