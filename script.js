const STORAGE_KEYS = {
  attendance: "attendance_records_v2",
  originalAttendance: "attendance_original_records_v2",
};

function readRecords(key = STORAGE_KEYS.attendance) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch {
    return [];
  }
}

function writeRecords(records, key = STORAGE_KEYS.attendance) {
  localStorage.setItem(key, JSON.stringify(records));
}

function hasAttendanceData() {
  return readRecords().length > 0;
}

function calculatePercentage(attended, total) {
  if (!total) return 0;
  return Number(((attended / total) * 100).toFixed(2));
}

function calculateRiskLevel(percentage) {
  if (percentage < 65) return "RED";
  if (percentage < 75) return "YELLOW";
  return "GREEN";
}

function calculateSafeMiss(attended, total) {
  const minimum = 75;
  const classes = Math.floor((100 * attended - minimum * total) / minimum);
  return Math.max(0, classes);
}

function normalizeRecord(record) {
  const percentage = calculatePercentage(record.attended, record.total);

  return {
    id: record.id || crypto.randomUUID(),
    subjectCode: record.subjectCode || "",
    subjectName: record.subjectName || "Unknown Subject",
    subjectType: record.subjectType || "",
    attended: Number(record.attended) || 0,
    total: Number(record.total) || 0,
    percentage,
    riskLevel: calculateRiskLevel(percentage),
  };
}

function parseAttendanceText(rawText) {
  const raw = rawText.trim();
  const lines = raw.replace(/\r/g, "").split("\n");

  const headerIndex = lines.findIndex(
    (line) =>
      line.includes("Subject Code") &&
      line.includes("Present") &&
      line.includes("Absent"),
  );

  if (headerIndex === -1) {
    throw new Error("Invalid ERP attendance format.");
  }

  const parsed = lines
    .slice(headerIndex + 1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split("\t"))
    .filter((columns) => columns.length >= 8)
    .map((columns) => {
      const attended =
        Number(columns[4] || 0) +
        Number(columns[5] || 0) +
        Number(columns[6] || 0);
      const total = attended + Number(columns[7] || 0);

      return normalizeRecord({
        subjectCode: columns[1],
        subjectName: columns[2],
        subjectType: columns[3],
        attended,
        total,
      });
    })
    .filter((record) => record.subjectName && record.total > 0);

  if (!parsed.length) {
    throw new Error("No valid attendance rows were found.");
  }

  return parsed;
}

function getSortedRecords() {
  const priority = { RED: 1, YELLOW: 2, GREEN: 3 };

  return readRecords().sort((a, b) => {
    if (priority[a.riskLevel] !== priority[b.riskLevel]) {
      return priority[a.riskLevel] - priority[b.riskLevel];
    }
    return a.percentage - b.percentage;
  });
}

function getAggregate(records = readRecords()) {
  const attended = records.reduce((sum, record) => sum + record.attended, 0);
  const total = records.reduce((sum, record) => sum + record.total, 0);
  const percentage = calculatePercentage(attended, total);

  return {
    attended,
    total,
    percentage,
    riskLevel: calculateRiskLevel(percentage),
  };
}

function saveAllRecords(records) {
  writeRecords(records.map(normalizeRecord));
}

function updateAggregateUI(aggregate) {
  const attendedEl = document.getElementById("aggAttended");
  const totalEl = document.getElementById("aggTotal");
  const percentEl = document.getElementById("aggPercent");
  const section = document.querySelector(".aggregate-section");
  const circle = document.getElementById("aggCircle");
  const badge = document.getElementById("aggBadge");

  if (!attendedEl || !totalEl || !percentEl || !section || !circle) return;

  attendedEl.innerText = aggregate.attended;
  totalEl.innerText = aggregate.total;
  percentEl.innerText = aggregate.percentage;

  section.className = "aggregate-section";
  circle.className = "circle";

  if (aggregate.riskLevel === "RED") {
    section.classList.add("agg-red");
    circle.classList.add("red");
  } else if (aggregate.riskLevel === "YELLOW") {
    section.classList.add("agg-yellow");
    circle.classList.add("yellow");
  } else {
    section.classList.add("agg-green");
    circle.classList.add("green");
  }

  if (badge) {
    badge.innerText = `${aggregate.riskLevel} zone`;
    badge.className = `agg-badge ${aggregate.riskLevel.toLowerCase()}`;
  }

  updateMaintain75(aggregate);
}

function updateMaintain75(aggregate) {
  const box = document.getElementById("maintainText");
  if (!box) return;

  if (!aggregate.total) {
    box.innerText = "Paste attendance data to see your overview.";
    return;
  }

  if (aggregate.percentage < 75) {
    const needed = Math.ceil(
      (75 * aggregate.total - 100 * aggregate.attended) / 25,
    );
    box.innerText = `Attend ${needed} more classes to reach 75%.`;
    return;
  }

  const canMiss = calculateSafeMiss(aggregate.attended, aggregate.total);
  box.innerText = `You can safely miss ${canMiss} classes and stay at 75% or above.`;
}

function updateSubjectRow(record) {
  const row = document.querySelector(`tr[data-id="${record.id}"]`);
  if (!row) return;

  row.children[1].innerText = `${record.percentage}%`;
  row.children[2].innerText = record.attended;
  row.children[3].innerText = record.total - record.attended;
  row.children[4].innerText = record.total;
  row.children[5].innerHTML = `
    ${calculateSafeMiss(record.attended, record.total)}
    <span class="safe-miss-note">classes</span>
  `;

  row.className = "";
  row.classList.add(record.riskLevel.toLowerCase());
}

function createRecordRow(record) {
  const row = document.createElement("tr");
  row.dataset.id = record.id;
  row.classList.add(record.riskLevel.toLowerCase());

  row.innerHTML = `
    <td data-label="Subject" class="SubjectRow">${record.subjectName}</td>
    <td data-label="%" class="SpecialRow">${record.percentage}%</td>
    <td data-label="Attended" class="SpecialRow">${record.attended}</td>
    <td data-label="Absent" class="SpecialRow">${record.total - record.attended}</td>
    <td data-label="Total" class="SpecialRow">${record.total}</td>
    <td data-label="Target" class="target-cell" class="TargetRow">
      <div class="target-input-small">
        <input type="number" id="target-${record.id}" placeholder="%" />
        <button class="calc-btn" onclick="calculateTarget('${record.id}')">Calc</button>
      </div>
      <div class="target-result" id="result-${record.id}"></div>
    </td>
  `;

  return row;
}

function renderTable(records) {
  const subjectTbody = document.getElementById("subjectTableBody");
  const labTbody = document.getElementById("labTableBody");
  const emptyState = document.getElementById("emptyState");
  if (!subjectTbody || !labTbody) return;

  subjectTbody.innerHTML = "";
  labTbody.innerHTML = "";

  if (!records.length) {
    if (emptyState) emptyState.hidden = false;
    return;
  }

  if (emptyState) emptyState.hidden = true;

  const subjectRecords = records.filter(
    (record) => !/lab/i.test(record.subjectName),
  );
  const labRecords = records.filter((record) => /lab/i.test(record.subjectName));

  subjectRecords.forEach((record) => {
    subjectTbody.appendChild(createRecordRow(record));
  });

  labRecords.forEach((record) => {
    labTbody.appendChild(createRecordRow(record));
  });
}

function refreshDashboard() {
  const records = getSortedRecords();
  renderTable(records);
  updateAggregateUI(getAggregate(records));
}

async function pasteAndSubmit() {
  const button = document.querySelector(".paste-btn");
  const loader = document.getElementById("fullscreenLoader");

  try {
    const raw = await navigator.clipboard.readText();
    const text = raw.trim();

    if (!text || text.length < 50) {
      alert("Clipboard does not contain valid attendance data.");
      return;
    }

    if (button) {
      button.disabled = true;
      button.innerText = "Processing...";
    }

    if (loader) loader.classList.remove("hidden");

    const records = parseAttendanceText(text);
    writeRecords(records, STORAGE_KEYS.originalAttendance);
    saveAllRecords(records);

    window.location.href = "dashboard.html";
  } catch (error) {
    console.error("Paste failed:", error);
    alert(
      error instanceof Error
        ? error.message
        : "Unable to read clipboard. Please allow clipboard access and try again.",
    );

    if (loader) loader.classList.add("hidden");

    if (button) {
      button.disabled = false;
      button.innerText = "Paste Attendance & Calculate";
    }
  }
}

function load() {
  if (!hasAttendanceData()) {
    const aggregateSection = document.querySelector(".aggregate-section");
    if (aggregateSection) aggregateSection.classList.add("is-empty");
    renderTable([]);
    updateAggregateUI(getAggregate([]));
    return;
  }

  refreshDashboard();
}

function resetAttendance() {
  const confirmed = confirm(
    "This will reset attendance to the original pasted data. Continue?",
  );

  if (!confirmed) return;

  const originalRecords = readRecords(STORAGE_KEYS.originalAttendance);

  if (!originalRecords.length) {
    alert("No original attendance data is available to restore.");
    return;
  }

  saveAllRecords(originalRecords);
  refreshDashboard();

  const result = document.getElementById("whatIfResult");
  if (result) result.innerText = "";
}

function calculateTarget(id) {
  const input = document.getElementById(`target-${id}`);
  const resultBox = document.getElementById(`result-${id}`);
  const record = readRecords().find((item) => item.id === id);

  if (!input || !resultBox || !record) return;

  const target = Number(input.value);
  if (!target || target <= 0) {
    resultBox.innerText = "Enter valid %";
    return;
  }

  if (target >= 100) {
    resultBox.innerText = "Not achievable";
    return;
  }

  const currentPercent = calculatePercentage(record.attended, record.total);

  if (target > currentPercent) {
    const needed = Math.ceil(
      (target * record.total - 100 * record.attended) / (100 - target),
    );
    resultBox.innerText =
      needed <= 0 ? "Already safe" : `Attend ${needed} more classes`;
    return;
  }

  if (target < currentPercent) {
    const missable = Math.max(
      0,
      Math.floor((100 * record.attended - target * record.total) / target),
    );
    resultBox.innerText =
      missable === 0 ? "Do not miss further" : `Can miss ${missable} classes`;
    return;
  }

  resultBox.innerText = "Exactly at target";
}

function calculateAggregateTarget() {
  const input = document.getElementById("aggTarget");
  const resultBox = document.getElementById("aggTargetResult");
  const aggregate = getAggregate();

  if (!input || !resultBox) return;

  const target = Number(input.value);
  if (!target || target <= 0) {
    resultBox.innerText = "Enter target percentage.";
    resultBox.style.color = "#b91c1c";
    return;
  }

  if (target >= 100) {
    resultBox.innerText = "Not achievable.";
    resultBox.style.color = "#b91c1c";
    return;
  }

  if (aggregate.total === 0) {
    resultBox.innerText = "Paste attendance data first.";
    resultBox.style.color = "#b91c1c";
    return;
  }

  if (aggregate.percentage < target) {
    const needed = Math.ceil(
      (target * aggregate.total - 100 * aggregate.attended) / (100 - target),
    );
    resultBox.innerText = `Attend ${needed} more classes to reach ${target}%.`;
    resultBox.style.color = "#1d4ed8";
    return;
  }

  const missable = Math.max(
    0,
    Math.floor((100 * aggregate.attended - target * aggregate.total) / target),
  );
  resultBox.innerText = `You can safely miss ${missable} classes and stay above ${target}%.`;
  resultBox.style.color = "#166534";
}

function calculateWhatIf() {
  const count = Number(document.getElementById("whatIfCount")?.value);
  const type = document.getElementById("whatIfType")?.value;
  const result = document.getElementById("whatIfResult");

  if (!result) return;

  if (!count || count <= 0) {
    result.innerText = "Enter a valid number of classes.";
    result.style.color = "#b91c1c";
    return;
  }

  const base = getAggregate();
  if (!base.total) {
    result.innerText = "Paste attendance data first.";
    result.style.color = "#b91c1c";
    return;
  }

  const preview = {
    attended: type === "attend" ? base.attended + count : base.attended,
    total: base.total + count,
  };

  preview.percentage = calculatePercentage(preview.attended, preview.total);
  preview.riskLevel = calculateRiskLevel(preview.percentage);

  updateAggregateUI(preview);

  result.innerText =
    type === "attend"
      ? `If you attend ${count} more classes, your overall attendance becomes ${preview.percentage}%.`
      : `If you miss ${count} classes, your overall attendance becomes ${preview.percentage}%.`;
  result.style.color =
    preview.riskLevel === "GREEN"
      ? "#166534"
      : preview.riskLevel === "YELLOW"
        ? "#a16207"
        : "#b91c1c";
}
