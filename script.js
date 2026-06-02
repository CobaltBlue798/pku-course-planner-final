let allCourses = [];
let selectedCourses = JSON.parse(localStorage.getItem("selectedCourses") || "[]");

const dayOrder = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"];
const dayShort = {
  "星期一": "周一",
  "星期二": "周二",
  "星期三": "周三",
  "星期四": "周四",
  "星期五": "周五",
  "星期六": "周六",
  "星期日": "周日",
};

const periods = Array.from({ length: 13 }, (_, i) => i + 1);

const PAGE_SIZE = 30;
let currentPage = 1;

const courseColors = [
  "#F8D7DA", "#D8EAFE", "#DFF3E3", "#FFF0B8", "#E7DCF8",
  "#FFDCC8", "#D7F2F0", "#F6D7EA", "#E9E3D5", "#DDE7C7",
  "#FAD7A0", "#D6DBF5", "#CFE8D5", "#F5D5CB"
];

async function init() {
  try {
    const res = await fetch("courses.json");
    if (!res.ok) {
      throw new Error(`无法加载 courses.json：${res.status}`);
    }

    allCourses = await res.json();
    console.log("课程总数：", allCourses.length);

    normalizeCourses();
    initFilters();
    bindEvents();
    renderCourseList();
    renderSelectedCourses();
    renderTimetable();
  } catch (err) {
    document.getElementById("courseList").innerHTML = `
      <div class="course-card">
        <div class="course-title">数据加载失败</div>
        <p>请确认 courses.json 与 index.html 在同一个文件夹中，并且使用本地服务器打开页面。</p>
        <p><code>python -m http.server 8000</code></p>
        <p>${escapeHtml(err.message)}</p>
      </div>
    `;
    console.error(err);
  }
}

function normalizeCourses() {
  allCourses = allCourses.map((course, index) => {
    if (!course["记录ID"]) {
      course["记录ID"] = [
        course["课程号"] || "",
        course["班号"] || "",
        course["执行计划编号"] || index
      ].join("_");
    }

    return {
      "序号": course["序号"] || "",
      "课程号": course["课程号"] || "",
      "课程名称": course["课程名称"] || "",
      "课程类型": course["课程类型"] || "",
      "开课单位": course["开课单位"] || "",
      "班号": course["班号"] || "",
      "学分": course["学分"] || "",
      "起止周": course["起止周"] || "",
      "上课时间": course["上课时间"] || "",
      "教师": course["教师"] || "",
      "备注": course["备注"] || "",
      "执行计划编号": course["执行计划编号"] || "",
      "记录ID": course["记录ID"],
      "显示课程名": course["显示课程名"] || course["课程名称"] || "未命名课程",
      "显示教师": course["显示教师"] || course["教师"] || "教师未列出",
      "课表颜色": course["课表颜色"] || "",
    };
  });

  selectedCourses = selectedCourses.map(course => ({
    ...course,
    "显示课程名": course["显示课程名"] || course["课程名称"] || "未命名课程",
    "显示教师": course["显示教师"] || course["教师"] || "教师未列出",
    "课表颜色": course["课表颜色"] || "",
  }));
}

function initFilters() {
  const departments = [
    ...new Set(allCourses.map(c => c["开课单位"]).filter(Boolean))
  ].sort();

  const types = [
    ...new Set(allCourses.map(c => c["课程类型"]).filter(Boolean))
  ].sort();

  fillSelect("departmentSelect", ["全部", ...departments]);
  fillSelect("typeSelect", ["全部", ...types]);

  document.getElementById("departmentSelect").value = "全部";
  document.getElementById("typeSelect").value = "全部";
}

function fillSelect(id, values) {
  const select = document.getElementById(id);
  select.innerHTML = "";

  values.forEach(v => {
    const option = document.createElement("option");
    option.value = v;
    option.textContent = v;
    select.appendChild(option);
  });
}

function runSearch() {
  currentPage = 1;
  renderCourseList();
}

function bindEvents() {
  document.getElementById("searchBtn").addEventListener("click", runSearch);

  document.getElementById("keywordInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runSearch();
    }
  });

  document.getElementById("departmentSelect").addEventListener("change", runSearch);
  document.getElementById("typeSelect").addEventListener("change", runSearch);
  document.getElementById("onlyWithTime").addEventListener("change", runSearch);

  document.getElementById("prevPageBtn").addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage -= 1;
      renderCourseList();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  document.getElementById("nextPageBtn").addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(filterCourses().length / PAGE_SIZE));
    if (currentPage < totalPages) {
      currentPage += 1;
      renderCourseList();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  document.getElementById("clearSelectedBtn").addEventListener("click", () => {
    const ok = confirm("确定要清空当前课表吗？这个操作不能撤销。");
    if (!ok) return;

    selectedCourses = [];
    saveSelected();
    renderCourseList();
    renderSelectedCourses();
    renderTimetable();
  });

  document.getElementById("downloadCsvBtn").addEventListener("click", downloadTimetableCsv);

  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

function filterCourses() {
  const keyword = document.getElementById("keywordInput").value.trim().toLowerCase();
  const department = document.getElementById("departmentSelect").value;
  const type = document.getElementById("typeSelect").value;
  const onlyWithTime = document.getElementById("onlyWithTime").checked;

  return allCourses.filter(c => {
    const text = [
      c["课程名称"],
      c["课程号"],
      c["教师"],
      c["开课单位"],
      c["课程类型"],
      c["备注"],
    ].join(" ").toLowerCase();

    if (keyword && !text.includes(keyword)) return false;
    if (department !== "全部" && c["开课单位"] !== department) return false;
    if (type !== "全部" && c["课程类型"] !== type) return false;
    if (onlyWithTime && !String(c["上课时间"]).trim()) return false;

    return true;
  });
}

function renderCourseList() {
  const list = document.getElementById("courseList");
  const filtered = filterCourses();

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  if (currentPage > totalPages) {
    currentPage = totalPages;
  }

  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const pageCourses = filtered.slice(startIndex, endIndex);

  document.getElementById("resultCount").textContent = `查询结果：${filtered.length}`;
  document.getElementById("selectedCount").textContent = `已选：${selectedCourses.length}`;

  const pageInfo = document.getElementById("pageInfo");
  const prevBtn = document.getElementById("prevPageBtn");
  const nextBtn = document.getElementById("nextPageBtn");

  if (pageInfo && prevBtn && nextBtn) {
    pageInfo.textContent = `第 ${currentPage} / ${totalPages} 页`;
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;
  }

  list.innerHTML = "";

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="course-card">
        <div class="course-title">没有找到符合条件的课程</div>
        <p>可以尝试减少关键词，或调整开课单位/课程类型筛选。</p>
      </div>
    `;
    return;
  }

  pageCourses.forEach(course => {
    const isSelected = selectedCourses.some(c => c["记录ID"] === course["记录ID"]);

    const card = document.createElement("div");
    card.className = "course-card";

    card.innerHTML = `
      <div class="course-title">${escapeHtml(course["课程名称"] || "未命名课程")}</div>

      <div>
        <span class="pill">${escapeHtml(course["课程类型"] || "课程类型未列出")}</span>
        <span class="pill">${escapeHtml(course["开课单位"] || "开课单位未列出")}</span>
        <span class="pill">${escapeHtml(course["学分"] || "?")} 学分</span>
      </div>

      <div class="course-grid">
        <div><b>教师：</b>${escapeHtml(course["教师"] || "教师未列出")}</div>
        <div><b>周次：</b>${escapeHtml(course["起止周"] || "未列出")}</div>
        <div><b>课程号/班号：</b>${escapeHtml(course["课程号"] || "")} / ${escapeHtml(course["班号"] || "")}</div>
        <div><b>备注：</b>${escapeHtml(course["备注"] || "无")}</div>
        <div><b>时间：</b>${escapeHtml(course["上课时间"] || "时间未列出")}</div>
      </div>

      <button class="add-course-btn">${isSelected ? "已加入" : "＋ 加入课表"}</button>
    `;

    const btn = card.querySelector(".add-course-btn");
    btn.disabled = isSelected;

    if (!isSelected) {
      btn.addEventListener("click", () => addCourse(course));
    }

    list.appendChild(card);
  });
}

function addCourse(course) {
  const alreadySelected = selectedCourses.some(c => c["记录ID"] === course["记录ID"]);
  if (alreadySelected) {
    alert("这门课已经在你的课表里了。");
    return;
  }

  // 课号互斥：同一课程号不能重复选择不同班号
  const sameCourseCode = selectedCourses.find(c =>
    String(c["课程号"] || "").trim() !== "" &&
    String(c["课程号"] || "").trim() === String(course["课程号"] || "").trim()
  );

  if (sameCourseCode) {
    alert(
      `课号互斥：你已经选择了同一课程号的课程。\n\n` +
      `已选课程：${sameCourseCode["课程名称"] || "未命名课程"} ` +
      `（课程号：${sameCourseCode["课程号"] || "未列出"}，班号：${sameCourseCode["班号"] || "未列出"}）\n\n` +
      `当前课程：${course["课程名称"] || "未命名课程"} ` +
      `（课程号：${course["课程号"] || "未列出"}，班号：${course["班号"] || "未列出"}）\n\n` +
      `如果想换班，请先在“我的课表”中删除已选的同课程号课程。`
    );
    return;
  }

  const newCourse = {
    ...course,
    "课表颜色": "",
  };

  const allowConflict = document.getElementById("allowConflict").checked;
  const conflict = findConflict(newCourse);

  if (conflict && !allowConflict) {
    alert(`时间冲突：与《${conflict.course["课程名称"]}》冲突。\n冲突时段：${conflict.detail}`);
    return;
  }

  if (conflict && allowConflict) {
    alert(`已添加，但存在冲突：与《${conflict.course["课程名称"]}》冲突。`);
  }

  selectedCourses.push(newCourse);
  saveSelected();
  renderCourseList();
  renderSelectedCourses();
  renderTimetable();
}

function saveSelected() {
  localStorage.setItem("selectedCourses", JSON.stringify(selectedCourses));
}

function renderSelectedCourses() {
  const container = document.getElementById("selectedList");
  container.innerHTML = "";

  document.getElementById("selectedCount").textContent = `已选：${selectedCourses.length}`;

  if (selectedCourses.length === 0) {
    container.innerHTML = `
      <div class="course-card">
        <div class="course-title">还没有添加课程</div>
        <p>请先在“课程查询”中添加课程。</p>
      </div>
    `;
    return;
  }

  const summary = document.createElement("div");
  summary.className = "course-card";
  summary.innerHTML = `
    <div class="course-title">当前方案</div>
    <p>已选 ${selectedCourses.length} 门课程，共 ${getTotalCredit()} 学分。</p>
  `;
  container.appendChild(summary);

  selectedCourses.forEach((course, index) => {
    const card = document.createElement("div");
    card.className = "course-card";

    card.innerHTML = `
      <div class="course-title">${escapeHtml(course["课程名称"] || "未命名课程")}</div>

      <div>
        <span class="pill">${escapeHtml(course["课程类型"] || "课程类型未列出")}</span>
        <span class="pill">${escapeHtml(course["开课单位"] || "开课单位未列出")}</span>
        <span class="pill">${escapeHtml(course["学分"] || "?")} 学分</span>
      </div>

      <div class="course-grid">
        <div><b>教师：</b>${escapeHtml(course["教师"] || "教师未列出")}</div>
        <div><b>周次：</b>${escapeHtml(course["起止周"] || "未列出")}</div>
        <div><b>课程号/班号：</b>${escapeHtml(course["课程号"] || "")} / ${escapeHtml(course["班号"] || "")}</div>
        <div><b>备注：</b>${escapeHtml(course["备注"] || "无")}</div>
        <div><b>时间：</b>${escapeHtml(course["上课时间"] || "时间未列出")}</div>
      </div>

      <button class="delete-course-btn">删除</button>
    `;

    card.querySelector(".delete-course-btn").addEventListener("click", () => {
      selectedCourses.splice(index, 1);
      saveSelected();
      renderCourseList();
      renderSelectedCourses();
      renderTimetable();
    });

    container.appendChild(card);
  });
}

function renderTimetable() {
  const container = document.getElementById("timetable");
  const slots = buildSlots();
  const widths = calculateColumnWidths(slots);

  let html = `
    <div class="timetable-wrap">
      <table class="timetable-table">
        <colgroup>
          <col style="width: ${widths.periodWidth}%;">
          ${widths.dayWidths.map(w => `<col style="width: ${w}%;">`).join("")}
        </colgroup>
        <thead>
          <tr>
            <th class="period-head">节次</th>
            ${dayOrder.map(day => `<th>${dayShort[day]}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
  `;

  periods.forEach(period => {
    html += `<tr><th class="period-cell">第${period}节</th>`;

    dayOrder.forEach(day => {
      const items = slots[period][day];

      if (items.length === 0) {
        html += `<td class="empty-cell"></td>`;
      } else {
        html += `<td>`;
        items.forEach(item => {
          html += `
            <div class="course-block" style="background:${escapeAttr(item.color)}" title="${escapeAttr(item.name)}${item.weekLabel ? "｜" + escapeAttr(item.weekLabel) : ""}｜${escapeAttr(item.teacher)}">
              <div class="course-name">
                ${escapeHtml(item.name)}
                ${item.weekLabel ? `<span class="week-label name-week-label">${escapeHtml(item.weekLabel)}</span>` : ""}
              </div>
              <div class="teacher">${escapeHtml(item.teacher)}</div>
            </div>
          `;
        });
        html += `</td>`;
      }
    });

    html += `</tr>`;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;
}

function calculateColumnWidths(slots) {
  const periodWidth = 6;

  const dayStats = dayOrder.map(day => {
    let maxTextLength = 0;
    let itemCount = 0;

    periods.forEach(period => {
      slots[period][day].forEach(item => {
        const name = String(item.name || "");
        const teacher = String(item.teacher || "");
        const weekLabel = String(item.weekLabel || "");

        // 同时考虑课程名、教师名、单双周标签
        const combinedText = `${name}${teacher}${weekLabel}`;

        maxTextLength = Math.max(
          maxTextLength,
          name.length,
          teacher.length,
          combinedText.length * 0.72
        );

        itemCount += 1;
      });
    });

    return {
      day,
      maxTextLength,
      itemCount,
      isEmpty: itemCount === 0,
    };
  });

  const dayScores = dayStats.map(stat => {
    // 完全没课的日期给更低基础分，明显变窄
    if (stat.isEmpty) {
      return 0.55;
    }

    // 有课日期：基础分 + 文本长度权重 + 课程数量权重
    return (
      1.0 +
      Math.min(stat.maxTextLength, 24) * 0.06 +
      Math.min(stat.itemCount, 14) * 0.035
    );
  });

  const totalScore = dayScores.reduce((a, b) => a + b, 0);
  const remainingWidth = 100 - periodWidth;

  let dayWidths = dayScores.map((score, index) => {
    const stat = dayStats[index];
    const width = (score / totalScore) * remainingWidth;

    // 空日期更窄；有课日期保底宽一点
    if (stat.isEmpty) {
      return Math.max(6.5, Math.min(9.5, width));
    }

    return Math.max(10.5, Math.min(19.5, width));
  });

  // 重新缩放，保证总宽度刚好等于 remainingWidth
  const adjustedTotal = dayWidths.reduce((a, b) => a + b, 0);
  const scale = remainingWidth / adjustedTotal;

  dayWidths = dayWidths.map(w => w * scale);

  return {
    periodWidth,
    dayWidths,
  };
}

function buildSlots() {
  const slots = {};

  periods.forEach(period => {
    slots[period] = {};
    dayOrder.forEach(day => {
      slots[period][day] = [];
    });
  });

  selectedCourses.forEach((course, index) => {
    const times = parseTime(course["上课时间"] || "", course["起止周"] || "");
    const name = course["课程名称"] || "未命名课程";
const teacher = course["教师"] || "教师未列出";
    const color = validColor(course["课表颜色"]) ? course["课表颜色"] : courseColors[index % courseColors.length];

    times.forEach(t => {
      if (!dayOrder.includes(t.day)) return;

      for (let p = t.start; p <= t.end; p++) {
        if (slots[p] && slots[p][t.day]) {
          slots[p][t.day].push({
            name,
            teacher,
            color,
            weekLabel: getWeekLabel(t),
          });
        }
      }
    });
  });

  return slots;
}

function parseWeeks(qzz) {
  if (!qzz) return new Set();

  const weeks = new Set();
  const parts = String(qzz).split(/[，,、;；]\s*/);

  parts.forEach(part => {
    part = part.trim();
    if (!part) return;

    const rangeMatch = part.match(/(\d+)\s*-\s*(\d+)/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      for (let i = start; i <= end; i++) weeks.add(i);
      return;
    }

    const singleMatch = part.match(/^\d+$/);
    if (singleMatch) {
      weeks.add(Number(part));
    }
  });

  return weeks;
}

function parseTime(timeText, qzz = "") {
  const results = [];
  if (!timeText) return results;

  const baseWeeks = parseWeeks(qzz);
  const parts = String(timeText).split(/[；;]\s*/);

  parts.forEach(part => {
    const dayMatch = part.match(/星期[一二三四五六日天]/);
    const periodMatch = part.match(/第\s*(\d+)\s*节\s*-\s*第\s*(\d+)\s*节/);

    if (!dayMatch || !periodMatch) return;

    let day = dayMatch[0];
    if (day === "星期天") day = "星期日";

    const start = Number(periodMatch[1]);
    const end = Number(periodMatch[2]);

    let weeks = new Set(baseWeeks);

    if (part.includes("单") && weeks.size > 0) {
      weeks = new Set([...weeks].filter(w => w % 2 === 1));
    } else if (part.includes("双") && weeks.size > 0) {
      weeks = new Set([...weeks].filter(w => w % 2 === 0));
    }

    results.push({
      day,
      start,
      end,
      weeks,
      raw: part.trim(),
    });
  });

  return results;
}

function getWeekLabel(slot) {
  const raw = String(slot.raw || "");

  if (raw.includes("单")) {
    return "单周";
  }

  if (raw.includes("双")) {
    return "双周";
  }

  return "";
}

function findConflict(newCourse) {
  const newTimes = parseTime(newCourse["上课时间"] || "", newCourse["起止周"] || "");

  for (const oldCourse of selectedCourses) {
    const oldTimes = parseTime(oldCourse["上课时间"] || "", oldCourse["起止周"] || "");

    for (const oldT of oldTimes) {
      for (const newT of newTimes) {
        if (oldT.day !== newT.day) continue;

        const periodOverlap = !(newT.end < oldT.start || newT.start > oldT.end);
        if (!periodOverlap) continue;

        if (oldT.weeks.size > 0 && newT.weeks.size > 0) {
          const weekOverlap = [...oldT.weeks].some(w => newT.weeks.has(w));
          if (!weekOverlap) continue;
        }

        return {
          course: oldCourse,
          detail: `${oldT.raw} ↔ ${newT.raw}`,
        };
      }
    }
  }

  return null;
}

function getTotalCredit() {
  const total = selectedCourses.reduce((sum, course) => {
    const credit = parseFloat(course["学分"] || "0");
    return sum + (Number.isFinite(credit) ? credit : 0);
  }, 0);

  return Number.isInteger(total) ? String(total) : total.toFixed(1);
}

function downloadTimetableCsv() {
  const slots = buildSlots();

  const rows = [];
  rows.push(["节次", "周一", "周二", "周三", "周四", "周五", "周六", "周日"]);

  periods.forEach(period => {
    const row = [`第${period}节`];

    dayOrder.forEach(day => {
      const cell = slots[period][day]
        .map(item => `${item.name}\n${item.teacher}${item.weekLabel ? "｜" + item.weekLabel : ""}`)
        .join("\n---\n");

      row.push(cell);
    });

    rows.push(row);
  });

  const csv = rows.map(row => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "my_weekly_timetable.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function switchTab(tabName) {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });

  document.getElementById("searchTab").classList.toggle("active", tabName === "search");
  document.getElementById("scheduleTab").classList.toggle("active", tabName === "schedule");
}

function validColor(value) {
  return /^#[0-9a-fA-F]{3}$/.test(value) || /^#[0-9a-fA-F]{6}$/.test(value);
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

init();