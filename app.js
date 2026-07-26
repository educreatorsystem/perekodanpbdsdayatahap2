const DATA_SHEET_ID = "1uAvOSepHtxFeTW8nUaVkPjkfU8QvTm_60IIJ7GgUqfo";
const TP_SHEET_GID = "1046552407";

const SHEET_URLS = {
  students:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ0hXNuFumWhCtsAikPobWmLMc-eoj7DzqW7OJf85rcoxcabY8KE8fIon91XPcPvrGCzCHHVU8lQ1zU/pub?gid=1626540029&single=true&output=csv",
  standards:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ0hXNuFumWhCtsAikPobWmLMc-eoj7DzqW7OJf85rcoxcabY8KE8fIon91XPcPvrGCzCHHVU8lQ1zU/pub?gid=0&single=true&output=csv",
  skills:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ0hXNuFumWhCtsAikPobWmLMc-eoj7DzqW7OJf85rcoxcabY8KE8fIon91XPcPvrGCzCHHVU8lQ1zU/pub?gid=429299684&single=true&output=csv",
  records:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ0hXNuFumWhCtsAikPobWmLMc-eoj7DzqW7OJf85rcoxcabY8KE8fIon91XPcPvrGCzCHHVU8lQ1zU/pub?gid=1046552407&single=true&output=csv",
};

// URL pertama ialah URL CSV Data TP yang diberikan. URL lain hanya digunakan
// sebagai laluan terus alternatif ke tab Google Sheet yang sama jika Google
// menolak salah satu bentuk URL eksport.
const TP_CSV_URLS = [
  SHEET_URLS.records,
  `https://docs.google.com/spreadsheets/d/${DATA_SHEET_ID}/gviz/tq?tqx=out:csv&gid=${TP_SHEET_GID}`,
  `https://docs.google.com/spreadsheets/d/${DATA_SHEET_ID}/export?format=csv&gid=${TP_SHEET_GID}`,
];

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzxsdpYvK5gZdmivhBBbVGARD9VF_sr9T8VELespPTVTV8Y2dZ3y8KGnzVTTJEeugIpfQ/exec";
const STORAGE_KEY = "perekodan-pbd-records";
let records = [];
let currentSelections = {};
let appData = {
  classes: {},
  subjects: [],
  skills: [],
};

const el = {
  saveStatus: document.querySelector("#saveStatus"),
  tabs: document.querySelectorAll(".tab-button"),
  recordTab: document.querySelector("#recordTab"),
  dashboardTab: document.querySelector("#dashboardTab"),
  recordForm: document.querySelector("#recordForm"),
  recordDate: document.querySelector("#recordDate"),
  subjectSelect: document.querySelector("#subjectSelect"),
  contentSelect: document.querySelector("#contentSelect"),
  skillSelect: document.querySelector("#skillSelect"),
  classSelect: document.querySelector("#classSelect"),
  learningCheckboxes: document.querySelector("#learningCheckboxes"),
  studentRows: document.querySelector("#studentRows"),
  recordSummary: document.querySelector("#recordSummary"),
  filterClass: document.querySelector("#filterClass"),
  filterSubject: document.querySelector("#filterSubject"),
  filterContent: document.querySelector("#filterContent"),
  filterLearning: document.querySelector("#filterLearning"),
  filterStart: document.querySelector("#filterStart"),
  filterEnd: document.querySelector("#filterEnd"),
  resetFilters: document.querySelector("#resetFilters"),
  analysisHead: document.querySelector("#analysisHead"),
  analysisBody: document.querySelector("#analysisBody"),
  statusModal: document.querySelector("#statusModal"),
  statusLoader: document.querySelector("#statusLoader"),
  statusTitle: document.querySelector("#statusTitle"),
  statusMessage: document.querySelector("#statusMessage"),
  statusClose: document.querySelector("#statusClose"),
};

async function init() {
  el.recordDate.value = getTodayMalaysia();
  bindEvents();
  setStatus("Memuat naik data daripada Google Sheet...", false);
  await loadSheetData();
  await loadRecordData();
  populateSubjectOptions();
  populateClassOptions();
  syncDependentFields();
  renderStudents();
  renderFilters();
  renderDashboard();
}

function bindEvents() {
  el.tabs.forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  el.subjectSelect.addEventListener("change", () => {
    syncDependentFields();
    currentSelections = {};
    renderStudents();
  });

  el.contentSelect.addEventListener("change", () => {
    syncDependentFields();
    currentSelections = {};
    renderStudents();
  });

  el.classSelect.addEventListener("change", () => {
    currentSelections = {};
    renderStudents();
  });

  document.querySelectorAll("[data-bulk-tp]").forEach((button) => {
    button.addEventListener("click", () => applyBulkTp(button.dataset.bulkTp));
  });

  el.recordForm.addEventListener("submit", saveRecordBatch);

  [el.filterClass, el.filterSubject, el.filterContent, el.filterLearning, el.filterStart, el.filterEnd].forEach((field) => {
    field.addEventListener("input", renderDashboard);
  });

  el.resetFilters.addEventListener("click", () => {
    el.filterClass.value = "all";
    el.filterSubject.value = "all";
    el.filterContent.value = "all";
    el.filterLearning.value = "all";
    el.filterStart.value = "";
    el.filterEnd.value = "";
    renderDashboard();
  });

  el.statusClose.addEventListener("click", hideStatusPopup);
}

async function loadSheetData() {
  try {
    const [studentCsv, standardCsv, skillCsv] = await Promise.all([
      fetchCsv(SHEET_URLS.students),
      fetchCsv(SHEET_URLS.standards),
      fetchCsv(SHEET_URLS.skills),
    ]);

    appData = {
      classes: buildClasses(studentCsv),
      subjects: buildSubjects(standardCsv),
      skills: buildSkills(skillCsv),
    };

    if (!Object.keys(appData.classes).length || !appData.subjects.length || !appData.skills.length) {
      throw new Error("Data Google Sheet tidak lengkap.");
    }

    setStatus("Data Google Sheet berjaya dimuat naik.", false);
  } catch (error) {
    console.error(error);
    appData = { classes: {}, subjects: [], skills: [] };
    setStatus("Data Google Sheet gagal dimuat naik. Semak pautan publish CSV.", true);
  }
}

async function loadRecordData() {
  setStatus("Memuat data TP terus daripada Google Sheet...", false);

  try {
    const { rows, sourceUrl } = await fetchFirstAvailableCsv(TP_CSV_URLS);
    records = buildRecordsFromCsv(rows);

    // Salinan setempat masih dikemas kini untuk tujuan pemulihan, tetapi
    // Dashboard tidak akan membacanya apabila CSV gagal. Sumber Dashboard
    // kekal Google Sheet.
    saveLocalRecords();

    setStatus(
      records.length
        ? `${records.length} rekod TP berjaya dimuat terus daripada Google Sheet.`
        : "CSV Data TP berjaya dibuka, tetapi tiada rekod TP ditemui.",
      false,
    );
    console.info("Data TP dimuat daripada:", sourceUrl);
  } catch (error) {
    console.error("Data TP Google Sheet gagal dimuat:", error);
    records = [];
    setStatus(`Data TP Google Sheet gagal dimuat: ${getErrorMessage(error)}`, true);
  }
}

async function fetchFirstAvailableCsv(urls) {
  const errors = [];

  for (const url of urls) {
    try {
      const rows = await fetchCsv(url);
      if (!rows.length) throw new Error("Fail CSV kosong.");
      return { rows, sourceUrl: url };
    } catch (error) {
      errors.push(`${url}: ${getErrorMessage(error)}`);
      console.warn("Cubaan CSV gagal:", url, error);
    }
  }

  // Laluan terakhir masih membaca terus tab Google Sheet yang sama. Kaedah
  // JSONP digunakan hanya apabila pelayar menyekat semua permintaan CSV CORS.
  try {
    const rows = await fetchGoogleSheetJsonp(DATA_SHEET_ID, TP_SHEET_GID);
    if (!rows.length) throw new Error("Respons Google Sheet kosong.");
    return { rows, sourceUrl: `Google Visualization (${TP_SHEET_GID})` };
  } catch (error) {
    errors.push(`Google Visualization: ${getErrorMessage(error)}`);
  }

  throw new Error(errors.join(" | "));
}

function buildRecordsFromCsv(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];

  const columns = [
    "id",
    "timestamp",
    "date",
    "student",
    "subject",
    "theme",
    "contentCode",
    "contentTitle",
    "contentRaw",
    "learningCode",
    "learningTitle",
    "learningRaw",
    "skill",
    "className",
    "tp",
  ];

  const aliases = {
    id: ["id", "recordid", "rekodid"],
    timestamp: ["timestamp", "datetime", "tarikhmasa", "masarekod"],
    date: ["date", "tarikh"],
    student: ["student", "studentname", "namamurid", "murid"],
    subject: ["subject", "subjek"],
    theme: ["theme", "tema"],
    contentCode: ["contentcode", "skcode", "kodsk", "kodstandardkandungan"],
    contentTitle: ["contenttitle", "tajuksk", "tajukstandardkandungan"],
    contentRaw: ["contentraw", "sk", "standardkandungan"],
    learningCode: ["learningcode", "spcode", "kodsp", "kodstandardpembelajaran"],
    learningTitle: ["learningtitle", "tajuksp", "tajukstandardpembelajaran"],
    learningRaw: ["learningraw", "sp", "standardpembelajaran"],
    skill: ["skill", "kemahiran"],
    className: ["classname", "class", "kelas", "namakelas"],
    tp: ["tp", "tahappenguasaan", "tahap"],
  };

  const cleanedRows = rows
    .map((row) => (Array.isArray(row) ? row.map((value) => String(value ?? "").replace(/^\uFEFF/, "").trim()) : []))
    .filter((row) => row.some(Boolean));
  if (!cleanedRows.length) return [];

  const firstRow = cleanedRows[0];
  const normalizedHeaders = firstRow.map(normalizeHeader);
  const headerIndexes = {};

  columns.forEach((column) => {
    const accepted = new Set((aliases[column] || [column]).map(normalizeHeader));
    headerIndexes[column] = normalizedHeaders.findIndex((header) => accepted.has(header));
  });

  const recognisedHeaders = Object.values(headerIndexes).filter((index) => index >= 0).length;
  const requiredHeadersFound = ["student", "className", "tp"].every((column) => headerIndexes[column] >= 0);
  const useNamedHeaders = requiredHeadersFound && recognisedHeaders >= 5;
  const looksLikeHeader = recognisedHeaders >= 3 || (
    normalizeHeader(firstRow[0]) === "id" && normalizeHeader(firstRow[14]) === "tp"
  );
  const dataRows = looksLikeHeader ? cleanedRows.slice(1) : cleanedRows;

  const parsed = dataRows
    .map((row) => {
      const record = {};
      columns.forEach((column, position) => {
        const index = useNamedHeaders && headerIndexes[column] >= 0 ? headerIndexes[column] : position;
        record[column] = row[index] ?? "";
      });

      const contentParts = splitStandardText(record.contentRaw || `${record.contentCode} ${record.contentTitle}`.trim());
      const learningParts = splitStandardText(record.learningRaw || `${record.learningCode} ${record.learningTitle}`.trim());

      record.subject = record.subject || record.theme;
      record.theme = record.theme || record.subject;
      record.contentCode = record.contentCode || contentParts.code;
      record.contentTitle = record.contentTitle || contentParts.title;
      record.contentRaw = record.contentRaw || `${record.contentCode} ${record.contentTitle}`.trim();
      record.learningCode = record.learningCode || learningParts.code;
      record.learningTitle = record.learningTitle || learningParts.title;
      record.learningRaw = record.learningRaw || `${record.learningCode} ${record.learningTitle}`.trim();
      record.tp = normalizeTpValue(record.tp);
      record.id = record.id || [
        record.className,
        record.student,
        record.subject,
        record.contentRaw,
        record.learningRaw,
      ].join("|");

      return record;
    })
    .filter((record) => record.student && record.className && record.tp);

  return deduplicateRecords(normalizeRecords(parsed));
}

function normalizeHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeTpValue(value) {
  const cleaned = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/^TP\s*/, "");
  if (cleaned === "TD") return "TD";
  return ["1", "2", "3", "4", "5", "6"].includes(cleaned) ? cleaned : "";
}

function deduplicateRecords(source) {
  const byId = new Map();
  source.forEach((record, index) => {
    const key = record.id || [
      record.className,
      record.student,
      getRecordSubject(record),
      record.contentRaw || record.contentCode,
      record.learningRaw || record.learningCode,
    ].join("|");

    const previous = byId.get(key);
    const previousTime = previous ? new Date(previous.record.timestamp || previous.record.date || 0).getTime() : -Infinity;
    const nextTime = new Date(record.timestamp || record.date || 0).getTime();
    if (!previous || nextTime >= previousTime || Number.isNaN(previousTime)) {
      byId.set(key, { index, record });
    }
  });
  return [...byId.values()]
    .sort((a, b) => a.index - b.index)
    .map((item) => item.record);
}

async function fetchCsv(url) {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "omit",
    method: "GET",
    redirect: "follow",
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Respons CSV kosong.");
  if (/^<!doctype\s+html|^<html/i.test(trimmed)) {
    throw new Error("Google memulangkan halaman HTML, bukan fail CSV. Pastikan tab Data TP diterbitkan kepada web.");
  }

  const rows = parseCsv(text);
  if (!rows.length) throw new Error("CSV tidak mempunyai baris data.");
  return rows;
}

function fetchGoogleSheetJsonp(sheetId, gid) {
  return new Promise((resolve, reject) => {
    const callbackName = `__pbdSheetCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Google Sheet tidak memberi respons dalam tempoh yang ditetapkan."));
    }, 15000);

    function cleanup() {
      window.clearTimeout(timeout);
      script.remove();
      try {
        delete window[callbackName];
      } catch {
        window[callbackName] = undefined;
      }
    }

    window[callbackName] = (response) => {
      try {
        if (!response || response.status === "error" || !response.table) {
          const message = response?.errors?.map((item) => item.detailed_message || item.message).filter(Boolean).join("; ");
          throw new Error(message || "Respons Google Visualization tidak sah.");
        }

        const header = response.table.cols.map((column) => column.label || column.id || "");
        const body = response.table.rows.map((row) =>
          row.c.map((cell) => {
            if (!cell) return "";
            if (cell.f !== undefined && cell.f !== null) return String(cell.f);
            return cell.v === undefined || cell.v === null ? "" : String(cell.v);
          }),
        );
        cleanup();
        resolve([header, ...body]);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };

    const params = new URLSearchParams({
      gid,
      headers: "1",
      tqx: `out:json;responseHandler:${callbackName}`,
      _: String(Date.now()),
    });
    script.src = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?${params.toString()}`;
    script.onerror = () => {
      cleanup();
      reject(new Error("Skrip Google Visualization gagal dimuat."));
    };
    document.head.appendChild(script);
  });
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error || "Ralat tidak diketahui");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(value.trim());
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function withoutHeader(rows, headerLabels) {
  const first = rows[0] || [];
  const hasHeader = headerLabels.every((label, index) => normalize(first[index]) === normalize(label));
  return hasHeader ? rows.slice(1) : rows;
}

function buildClasses(rows) {
  const classes = {};
  withoutHeader(rows, ["KELAS", "NAMA MURID"]).forEach(([className, student]) => {
    if (!className || !student) return;
    if (!classes[className]) classes[className] = [];
    if (!classes[className].includes(student)) classes[className].push(student);
  });
  return classes;
}

function buildSubjects(rows) {
  const subjects = new Map();
  withoutHeader(rows, ["SUBJEK", "STANDARD KANDUNGAN", "STANDARD PEMBELAJARAN"]).forEach(
    ([subjectName, contentText, learningText]) => {
      if (!subjectName || !contentText || !learningText) return;
      if (!subjects.has(subjectName)) {
        subjects.set(subjectName, { name: subjectName, contents: new Map() });
      }

      const subject = subjects.get(subjectName);
      if (!subject.contents.has(contentText)) {
        const contentParts = splitStandardText(contentText);
        subject.contents.set(contentText, {
          id: `${subjectName}|${contentText}`,
          raw: contentText,
          code: contentParts.code,
          title: contentParts.title,
          learning: new Map(),
        });
      }

      const learningParts = splitStandardText(learningText);
      subject.contents.get(contentText).learning.set(learningText, {
        raw: learningText,
        code: learningParts.code,
        title: learningParts.title,
      });
    },
  );

  return [...subjects.values()].map((subject) => ({
    ...subject,
    contents: [...subject.contents.values()].map((content) => ({
      ...content,
      learning: [...content.learning.values()],
    })),
  }));
}

function buildSkills(rows) {
  return unique(withoutHeader(rows, ["KEMAHIRAN"]).map(([skill]) => skill).filter(Boolean));
}

function populateSubjectOptions() {
  el.subjectSelect.innerHTML = appData.subjects.length
    ? appData.subjects.map((subject) => `<option value="${escapeAttr(subject.name)}">${escapeHtml(subject.name)}</option>`).join("")
    : '<option value="">Tiada data subjek</option>';
}

function populateClassOptions() {
  el.classSelect.innerHTML =
    '<option value="">Pilih kelas</option>' +
    Object.keys(appData.classes)
      .map((className) => `<option value="${escapeAttr(className)}">${escapeHtml(className)}</option>`)
      .join("");
}

function syncDependentFields() {
  const previousContent = el.contentSelect.value;
  const contents = getSubjectContents();
  el.contentSelect.innerHTML = contents.length
    ? contents.map((content) => `<option value="${escapeAttr(content.id)}">${escapeHtml(content.raw)}</option>`).join("")
    : '<option value="">Tiada Standard Kandungan</option>';
  if (previousContent && contents.some((content) => content.id === previousContent)) {
    el.contentSelect.value = previousContent;
  }

  const content = getSelectedContent();
  el.skillSelect.innerHTML = appData.skills.length
    ? appData.skills.map((skill) => `<option value="${escapeAttr(skill)}">${escapeHtml(skill)}</option>`).join("")
    : '<option value="">Tiada kemahiran</option>';

  el.learningCheckboxes.innerHTML = content?.learning?.length
    ? content.learning
    .map(
      (item, index) => `
        <label class="check-card">
          <input type="checkbox" value="${escapeAttr(item.raw)}" ${index === 0 ? "checked" : ""} />
          <span><strong>${escapeHtml(item.code)}</strong><small>${escapeHtml(item.title)}</small></span>
        </label>
      `,
    )
    .join("")
    : '<p class="empty-state">Tiada Standard Pembelajaran untuk pilihan ini.</p>';
}

function getSelectedSubject() {
  return appData.subjects.find((subject) => subject.name === el.subjectSelect.value) || appData.subjects[0];
}

function getSubjectContents() {
  return getSelectedSubject()?.contents || [];
}

function getSelectedContent() {
  return getSubjectContents().find((content) => content.id === el.contentSelect.value) || getSubjectContents()[0];
}

function getSelectedLearning() {
  const content = getSelectedContent();
  const checked = [...el.learningCheckboxes.querySelectorAll("input:checked")].map((input) => input.value);
  return content?.learning?.filter((item) => checked.includes(item.raw)) || [];
}

function renderStudents() {
  const className = el.classSelect.value;
  const students = appData.classes[className] || [];

  if (!students.length) {
    el.studentRows.innerHTML = '<tr><td colspan="9" class="empty-state">Pilih kelas untuk memaparkan senarai murid.</td></tr>';
    updateRecordSummary();
    return;
  }

  el.studentRows.innerHTML = students
    .map(
      (name, index) => `
        <tr>
          <td>${index + 1}</td>
          <td class="student-name">${escapeHtml(name)}</td>
          <td colspan="7">
            <div class="tp-options" data-student="${escapeAttr(name)}">
              ${["1", "2", "3", "4", "5", "6", "TD"]
                .map((tp) => `<button type="button" class="tp-button ${tp === "TD" ? "td" : ""}" data-tp="${tp}">${tp === "TD" ? "TD" : `TP ${tp}`}</button>`)
                .join("")}
            </div>
          </td>
        </tr>
      `,
    )
    .join("");

  el.studentRows.querySelectorAll(".tp-button").forEach((button) => {
    button.addEventListener("click", () => {
      const student = button.closest(".tp-options").dataset.student;
      currentSelections[student] = button.dataset.tp;
      renderTpSelection(student);
      updateRecordSummary();
    });
  });

  updateRecordSummary();
}

function renderTpSelection(student) {
  const row = el.studentRows.querySelector(`[data-student="${CSS.escape(student)}"]`);
  row.querySelectorAll(".tp-button").forEach((button) => {
    button.classList.toggle("selected", button.dataset.tp === currentSelections[student]);
  });
}

function applyBulkTp(tp) {
  const students = appData.classes[el.classSelect.value] || [];
  students.forEach((student) => {
    currentSelections[student] = tp;
    renderTpSelection(student);
  });
  updateRecordSummary();
}

function updateRecordSummary() {
  const students = appData.classes[el.classSelect.value] || [];
  const selected = students.filter((student) => currentSelections[student]).length;
  el.recordSummary.textContent = students.length
    ? `${selected}/${students.length} murid telah ditetapkan TP.`
    : "Tiada murid dipilih.";
}

async function saveRecordBatch(event) {
  event.preventDefault();
  const learning = getSelectedLearning();
  const students = appData.classes[el.classSelect.value] || [];

  if (!students.length || !learning.length) {
    setStatus("Sila pilih kelas dan sekurang-kurangnya satu Standard Pembelajaran.", true);
    showStatusPopup("error", "Tidak Dapat Menyimpan", "Sila pilih kelas dan sekurang-kurangnya satu Standard Pembelajaran.");
    return;
  }

  const missing = students.filter((student) => !currentSelections[student]);
  if (missing.length) {
    setStatus("Lengkapkan TP atau TD untuk semua murid sebelum menyimpan.", true);
    showStatusPopup("error", "Tidak Dapat Menyimpan", "Lengkapkan TP atau TD untuk semua murid sebelum menyimpan.");
    return;
  }

  const content = getSelectedContent();
  const timestamp = new Date().toISOString();
  const nextRecords = [];

  students.forEach((student) => {
    learning.forEach((standard) => {
      nextRecords.push({
        id: `${el.classSelect.value}|${student}|${el.subjectSelect.value}|${content.raw}|${standard.raw}`,
        timestamp,
        date: el.recordDate.value,
        student,
        subject: el.subjectSelect.value,
        theme: el.subjectSelect.value,
        contentCode: content.code,
        contentTitle: content.title,
        contentRaw: content.raw,
        learningCode: standard.code,
        learningTitle: standard.title,
        learningRaw: standard.raw,
        skill: el.skillSelect.value,
        className: el.classSelect.value,
        tp: currentSelections[student],
      });
    });
  });

  setStatus("Menyimpan rekod...", false);
  showStatusPopup("loading", "Menyimpan Rekod", `${nextRecords.length} rekod sedang dihantar ke Google Sheet.`);
  const saved = await saveRecordBatchToStore(nextRecords);
  if (!saved) {
    showStatusPopup("error", "Simpanan Gagal", "Rekod gagal disimpan ke Google Sheet. Semak sambungan dan akses Apps Script.");
    return;
  }

  currentSelections = {};
  renderStudents();
  renderFilters();
  renderDashboard();
  setStatus("Rekod berjaya dihantar ke Google Sheet.", false);
  showStatusPopup(
    "success",
    "Rekod Berjaya Dihantar",
    `${nextRecords.length} rekod telah dihantar. Dashboard akan membaca semula data daripada CSV Google Sheet apabila tab Dashboard Analisis dibuka.`,
  );
}

async function saveRecordBatchToStore(nextRecords) {
  if (!APPS_SCRIPT_URL) {
    mergeRecords(nextRecords);
    saveLocalRecords();
    return true;
  }

  try {
    await fetch(APPS_SCRIPT_URL, {
      body: JSON.stringify({
        action: "saveRecords",
        records: nextRecords,
      }),
      method: "POST",
      mode: "no-cors",
    });
    mergeRecords(nextRecords);
    saveLocalRecords();
    return true;
  } catch (error) {
    console.error(error);
    setStatus("Rekod gagal disimpan ke Google Sheet. Semak URL Apps Script dan akses Web App.", true);
    return false;
  }
}

function mergeRecords(nextRecords) {
  normalizeRecords(nextRecords).forEach((nextRecord) => {
    const existingIndex = records.findIndex((record) => record.id === nextRecord.id);
    if (existingIndex >= 0) {
      records[existingIndex] = nextRecord;
    } else {
      records.push(nextRecord);
    }
  });
}

function setStatus(message, isError) {
  el.saveStatus.textContent = message;
  el.saveStatus.style.borderColor = isError ? "#fecdd3" : "#b9d6de";
  el.saveStatus.style.background = isError ? "#fff1f2" : "#e8f3f6";
  el.saveStatus.style.color = isError ? "#9f1239" : "#0f4657";
}

function showStatusPopup(type, title, message) {
  el.statusModal.hidden = false;
  el.statusModal.dataset.type = type;
  el.statusTitle.textContent = title;
  el.statusMessage.textContent = message;
  el.statusLoader.hidden = type !== "loading";
  el.statusClose.hidden = type === "loading";
}

function hideStatusPopup() {
  el.statusModal.hidden = true;
}

function switchTab(tab) {
  el.tabs.forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  el.recordTab.classList.toggle("active", tab === "record");
  el.dashboardTab.classList.toggle("active", tab === "dashboard");
  if (tab === "dashboard") {
    loadRecordData().then(() => {
      renderFilters();
      renderDashboard();
    });
  }
}

function renderFilters() {
  const selected = {
    className: el.filterClass.value || "all",
    subject: el.filterSubject.value || "all",
    content: el.filterContent.value || "all",
    learning: el.filterLearning.value || "all",
  };
  const classes = unique(records.map((record) => record.className)).sort(naturalSort);
  const subjects = unique(records.map(getRecordSubject)).sort(naturalSort);
  const contents = unique(
    records.map((record) => `${getRecordSubject(record)}|${record.contentRaw || `${record.contentCode} ${record.contentTitle}`}`),
  ).sort(naturalSort);
  const learning = unique(records.map((record) => `${record.learningCode}|${record.learningTitle}`));

  el.filterClass.innerHTML = buildOptionHtml("Semua Kelas", classes.map((className) => [className, className]));
  el.filterSubject.innerHTML = buildOptionHtml("Semua Subjek", subjects.map((subject) => [subject, subject]));
  el.filterContent.innerHTML = buildOptionHtml(
    "Semua Standard Kandungan",
    contents.map((value) => {
      const [subject, content] = value.split("|");
      return [value, `${content} (${subject})`];
    }),
  );
  el.filterLearning.innerHTML =
    '<option value="all">Semua Standard Pembelajaran</option>' +
    learning
      .map((value) => {
        const [code, title] = value.split("|");
        return `<option value="${code}">${code} ${title}</option>`;
      })
      .join("");

  restoreFilterValue(el.filterClass, selected.className);
  restoreFilterValue(el.filterSubject, selected.subject);
  restoreFilterValue(el.filterContent, selected.content);
  restoreFilterValue(el.filterLearning, selected.learning);
}

function renderDashboard() {
  const filtered = getFilteredRecords();
  const learningColumns = getLearningColumns(filtered);
  const rows = groupByStudentAndContent(filtered);

  if (!filtered.length) {
    el.analysisHead.innerHTML = "";
    el.analysisBody.innerHTML = '<tr><td class="empty-state">Belum ada rekod untuk tapisan semasa.</td></tr>';
    return;
  }

  el.analysisHead.innerHTML = `
    <tr>
      <th>Nama Murid</th>
      <th>Kelas</th>
      <th>Standard Kandungan</th>
      ${learningColumns
        .map((column) => `<th class="sp-header">${column.code}<small>${column.skill}</small></th>`)
        .join("")}
      <th>Purata TP</th>
    </tr>
  `;

  el.analysisBody.innerHTML = rows
    .map(({ student, className, contentLabel, standardsByCode }) => {
      const numericTp = learningColumns
        .map((column) => standardsByCode[column.code]?.tp)
        .filter((tp) => tp && tp !== "TD")
        .map(Number);
      return `
        <tr>
          <td><strong>${student}</strong></td>
          <td>${className}</td>
          <td class="standard-cell">${contentLabel}</td>
          ${learningColumns.map((column) => renderTpCell(standardsByCode[column.code])).join("")}
          <td class="average-cell">${formatAverage(average(numericTp))}</td>
        </tr>
      `;
    })
    .join("");
}

function getFilteredRecords() {
  return records.filter((record) => {
    const recordSubject = getRecordSubject(record);
    const recordContent = `${recordSubject}|${record.contentRaw || `${record.contentCode} ${record.contentTitle}`}`;
    if (el.filterClass.value !== "all" && record.className !== el.filterClass.value) return false;
    if (el.filterSubject.value !== "all" && recordSubject !== el.filterSubject.value) return false;
    if (el.filterContent.value !== "all" && recordContent !== el.filterContent.value) return false;
    if (el.filterLearning.value !== "all" && record.learningCode !== el.filterLearning.value) return false;
    if (el.filterStart.value && record.date < el.filterStart.value) return false;
    if (el.filterEnd.value && record.date > el.filterEnd.value) return false;
    return true;
  });
}

function groupByStudentAndContent(source) {
  const grouped = new Map();
  source.forEach((record) => {
    const key = `${record.student}|${record.className}|${record.contentCode}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        student: record.student,
        className: record.className,
        contentLabel: `<strong>${record.contentCode} ${record.contentTitle}</strong><small>${record.skill}</small>`,
        standardsByCode: {},
      });
    }
    grouped.get(key).standardsByCode[record.learningCode] = record;
  });
  return [...grouped.values()].sort(
    (a, b) => a.student.localeCompare(b.student) || a.contentLabel.localeCompare(b.contentLabel),
  );
}

function getLearningColumns(source) {
  const columns = new Map();
  source.forEach((record) => {
    if (!columns.has(record.learningCode)) {
      columns.set(record.learningCode, {
        code: record.learningCode,
        skill: record.skill,
      });
    }
  });
  return [...columns.values()].sort((a, b) => naturalSort(a.code, b.code));
}

function renderTpCell(record) {
  if (!record) return '<td class="tp-cell">-</td>';
  const markClass = record.tp === "TD" ? "td-mark" : "";
  return `
    <td class="tp-cell ${markClass}">
      ${record.tp === "TD" ? "TD" : `TP ${record.tp}`}
      <span class="tp-date">${formatShortDate(record.date)}</span>
    </td>
  `;
}

function printReport() {
  const source = document.querySelector(".print-content");
  const table = source?.querySelector(".analysis-table");
  const rowCount = table?.querySelectorAll("tbody tr")?.length || 0;
  const columnCount = table?.querySelectorAll("thead th")?.length || 0;
  const densityClass = columnCount >= 10 || rowCount >= 28 ? "ultra-compact" : columnCount >= 7 || rowCount >= 18 ? "compact" : "normal";
  const pageOrientation = columnCount >= 8 ? "landscape" : "portrait";
  const printedAt = new Intl.DateTimeFormat("ms-MY", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
  }).format(new Date());

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Popup cetakan disekat. Sila benarkan popup untuk mencetak laporan.");
    return;
  }

  printWindow.document.write(`
    <!doctype html>
    <html lang="ms">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Laporan PEREKODAN PBD</title>
        <style>
          * { box-sizing: border-box; }
          html { background: #ffffff; }
          body {
            margin: 0;
            background: #ffffff;
            color: #18212f;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 10px;
            line-height: 1.25;
          }
          .print-page {
            width: ${pageOrientation === "landscape" ? "297mm" : "210mm"};
            min-height: ${pageOrientation === "landscape" ? "210mm" : "297mm"};
            margin: 0 auto;
            background: #ffffff;
            padding: 8mm;
          }
          .print-title {
            align-items: center;
            border-bottom: 1px solid #cbd5e1;
            display: flex;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 6px;
            padding-bottom: 6px;
          }
          .print-title h2 { font-size: 13px; line-height: 1.1; margin: 0; text-transform: uppercase; }
          .print-title p { color: #64748b; font-size: 8px; margin: 0; text-align: right; }
          .table-wrap, .report-table-wrap { border: 0; border-radius: 0; overflow: visible; }
          table { border-collapse: collapse; table-layout: fixed; width: 100%; }
          th, td {
            border: 0.6px solid #cbd5e1;
            font-size: 8.2px;
            line-height: 1.15;
            overflow-wrap: anywhere;
            padding: 3px 4px;
            text-align: left;
            vertical-align: top;
          }
          th {
            background: #edf2f5;
            color: #111827;
            font-size: 7.8px;
            font-weight: 800;
            text-transform: uppercase;
          }
          th:first-child, td:first-child { width: 18%; }
          th:nth-child(2), td:nth-child(2) { width: 8%; }
          th:nth-child(3), td:nth-child(3) { width: 22%; }
          th:last-child, td:last-child { width: 7%; }
          small, .tp-date {
            color: #64748b;
            display: block;
            font-size: 6.8px;
            line-height: 1.1;
            margin-top: 1px;
          }
          .standard-cell strong { display: inline; font-size: 8px; }
          .standard-cell small { display: block; }
          .tp-cell, .average-cell { font-weight: 800; text-align: center; white-space: nowrap; }
          .td-mark { color: #be123c; }
          .empty-state { color: #64748b; padding: 10px; text-align: center; }
          .compact th, .compact td { font-size: 7.2px; padding: 2.4px 3px; }
          .compact th { font-size: 6.8px; }
          .compact small, .compact .tp-date { font-size: 5.8px; }
          .compact .standard-cell strong { font-size: 7px; }
          .ultra-compact th, .ultra-compact td { font-size: 6.4px; line-height: 1.08; padding: 1.8px 2.4px; }
          .ultra-compact th { font-size: 6px; }
          .ultra-compact small, .ultra-compact .tp-date { font-size: 5.2px; }
          .ultra-compact .standard-cell strong { font-size: 6.2px; }
          .ultra-compact th:first-child, .ultra-compact td:first-child { width: 16%; }
          .ultra-compact th:nth-child(2), .ultra-compact td:nth-child(2) { width: 7%; }
          .ultra-compact th:nth-child(3), .ultra-compact td:nth-child(3) { width: 20%; }
          .ultra-compact th:last-child, .ultra-compact td:last-child { width: 6%; }
          @media print {
            @page { size: A4 ${pageOrientation}; margin: 6mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .print-page { margin: 0; padding: 0; width: auto; min-height: auto; }
            thead { display: table-header-group; }
            tr, td, th { break-inside: avoid; page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <main class="print-page ${densityClass}">
          <div class="print-title">
            <div>
              <h2>Laporan Analisis PBD</h2>
            </div>
            <p>Dicetak: ${printedAt}<br />Paparan: ${rowCount} baris, ${columnCount} lajur</p>
          </div>
          ${source.innerHTML}
        </main>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function saveLocalRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function loadLocalRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildOptionHtml(allLabel, options) {
  return (
    `<option value="all">${escapeHtml(allLabel)}</option>` +
    options.map(([value, label]) => `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`).join("")
  );
}

function restoreFilterValue(select, value) {
  select.value = [...select.options].some((option) => option.value === value) ? value : "all";
}

function getRecordSubject(record) {
  return record.subject || record.theme || "Tanpa Subjek";
}

function normalizeRecords(source) {
  return source.map((record) => ({
    ...record,
    contentCode: String(record.contentCode || ""),
    date: normalizeRecordDate(record.date),
    learningCode: String(record.learningCode || ""),
    tp: String(record.tp || ""),
  }));
}

function normalizeRecordDate(value) {
  if (!value) return "";
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const dayFirst = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (dayFirst) {
    const [, day, month, year] = dayFirst;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const googleDate = text.match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})/);
  if (googleDate) {
    const [, year, zeroBasedMonth, day] = googleDate;
    return `${year}-${String(Number(zeroBasedMonth) + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
  }).format(date);
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function splitStandardText(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d+(?:\.\d+)*)(?:\s+(.+))?$/);
  return {
    code: match ? match[1] : text,
    title: match && match[2] ? match[2] : text,
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatAverage(value) {
  return value ? value.toFixed(2) : "-";
}

function formatShortDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

function getTodayMalaysia() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
  })
    .formatToParts(new Date())
    .reduce((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function naturalSort(a, b) {
  return a.localeCompare(b, undefined, { numeric: true });
}

window.printReport = printReport;
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

