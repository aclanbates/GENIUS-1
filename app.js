const productionFields = [
  ["workType", "Work type", "WT"],
  ["title", "Title", "T"],
  ["writtenBy", "Written by", "W"],
  ["bookBy", "Book / libretto by", "B"],
  ["adaptationBy", "Adaptation by", "A"],
  ["translatedBy", "Translation by", "TR"],
  ["musicBy", "Music by", "M"],
  ["lyricsBy", "Lyrics by", "LY"],
  ["composedBy", "Composed by", "C"],
  ["arrangementsBy", "Orchestrations / arrangements by", "OR"],
  ["directedBy", "Directed by", "D"],
  ["musicDirectionBy", "Music direction by", "MD"],
  ["choreographyBy", "Choreography by", "CH"],
  ["dramaturgyBy", "Dramaturgy by", "DG"],
  ["setDesignBy", "Set design by", "SD"],
  ["costumeBy", "Costume design by", "CO"],
  ["lightingBy", "Lighting design by", "LX"],
  ["soundBy", "Sound design by", "SX"],
  ["propsBy", "Props by", "PR"],
  ["stageManager", "Stage manager", "SM"],
  ["producer", "Producer / company", "P"],
  ["venue", "Venue", "V"],
  ["rights", "Rights / licensing", "R"],
  ["dates", "Production dates", "DT"],
  ["notes", "Production notes", "N"]
];

const editableIds = [
  "beatsContent",
  "charactersContent",
  "scenesContent",
  "costumeContent",
  "lightingContent",
  "choreoContent",
  "scheduleContent",
  "checklistContent",
  "safetyContent",
  "blockingContent"
];

const state = {
  production: {},
  files: [],
  sourceText: ""
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function titleCase(value) {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function getProductionFormData() {
  return Object.fromEntries(new FormData($("#productionForm")).entries());
}

function setProductionFormData(data) {
  const form = $("#productionForm");
  productionFields.forEach(([key]) => {
    const input = form.elements[key];
    if (input) input.value = data[key] || "";
  });
}

function renderProductionIcons() {
  const grid = $("#productionIconGrid");
  const data = state.production;
  $("#committedTitle").textContent = data.title || "Untitled production";
  grid.innerHTML = productionFields
    .map(([key, label, icon]) => {
      const value = data[key] || "Not set";
      return `
        <div class="icon-card" data-field="${key}">
          <span class="icon-mark">${icon}</span>
          <div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>
          <button type="button" class="edit-symbol" title="Edit ${escapeHtml(label)}" data-edit="${key}">✎</button>
        </div>
      `;
    })
    .join("");
}

function commitProduction() {
  state.production = getProductionFormData();
  renderProductionIcons();
  $("#productionForm").classList.add("hidden");
  $("#committedProduction").classList.remove("hidden");
  saveState();
}

function openInlineEditor(key) {
  const card = $(`.icon-card[data-field="${key}"]`);
  const existing = card.querySelector(".inline-editor");
  if (existing) {
    existing.remove();
    return;
  }
  $$(".inline-editor").forEach((node) => node.remove());
  const fieldMeta = productionFields.find(([field]) => field === key);
  const current = state.production[key] || "";
  const editor = document.createElement("div");
  editor.className = "inline-editor";
  editor.innerHTML = `
    <input aria-label="${escapeHtml(fieldMeta[1])}" value="${escapeHtml(current)}">
    <button type="button" class="primary-button">Done</button>
  `;
  editor.querySelector("button").addEventListener("click", () => {
    state.production[key] = editor.querySelector("input").value.trim();
    setProductionFormData(state.production);
    renderProductionIcons();
    saveState();
  });
  card.appendChild(editor);
  editor.querySelector("input").focus();
}

function readFileAsText(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => resolve("");
    if (/\.(txt|md|csv|rtf|html?|json)$/i.test(file.name) || /^text\//.test(file.type)) {
      reader.readAsText(file);
    } else {
      resolve("");
    }
  });
}

async function handleFiles(files) {
  state.files = Array.from(files).map((file) => ({
    name: file.name,
    size: file.size,
    type: file.type || "unknown"
  }));
  const texts = await Promise.all(Array.from(files).map(readFileAsText));
  state.sourceText = texts.filter(Boolean).join("\n\n--- FILE BREAK ---\n\n");
  renderFileList();
  saveState();
}

function renderFileList() {
  const list = $("#fileList");
  if (!state.files.length) {
    list.innerHTML = "";
    return;
  }
  list.innerHTML = state.files
    .map((file) => `<span class="file-pill">${escapeHtml(file.name)} · ${Math.ceil(file.size / 1024)} KB</span>`)
    .join("");
}

function splitScenes(text) {
  const normalized = text.replace(/\r/g, "\n");
  const candidates = normalized
    .split(/\n(?=(?:ACT|SCENE|CHAPTER|PART)\s+[A-Z0-9IVX-]+|[0-9]+\.\s+)/i)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 80);
  if (candidates.length >= 3) return candidates.slice(0, 16);
  const paragraphs = normalized.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 80);
  return paragraphs.slice(0, 12);
}

function findCharacterNames(text) {
  const dialogueNames = [...text.matchAll(/(?:^|\n)\s*([A-Z][A-Z .'-]{2,28})(?:\s*:|\n)/g)]
    .map((match) => match[1].trim())
    .filter((name) => !/^(ACT|SCENE|INT|EXT|LIGHTS|BLACKOUT|CURTAIN|SONG|MUSIC|CHORUS|ENSEMBLE)$/.test(name));
  const counts = dialogueNames.reduce((acc, name) => {
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});
  const names = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => titleCase(name.replace(/\s+/g, " ")))
    .slice(0, 14);
  return names.length ? names : ["Protagonist", "Antagonist / opposing force", "Confidant", "Family or community figure", "Ensemble"];
}

function findSongs(text) {
  const matches = [
    ...text.matchAll(/(?:song|number|music|cue)\s*[:\-]\s*["“]?([^"\n”]{3,60})/gi),
    ...text.matchAll(/["“]([^"\n”]{3,60})["”]\s*(?:\((?:song|number|reprise)\))/gi)
  ];
  const songs = [...new Set(matches.map((match) => match[1].trim()))].slice(0, 10);
  return songs.length ? songs : ["Opening number", "Character solo", "Company transition", "Finale"];
}

function summarize(chunk, max = 220) {
  const clean = chunk.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max).replace(/\s+\S*$/, "")}...` : clean;
}

function inferSafety(text) {
  const checks = [
    ["Platforms and stairs", /platform|stair|ladder|balcony|level|ramp/i],
    ["Weapons and stage combat", /knife|gun|sword|fight|slap|punch|combat|blood/i],
    ["Fire, smoke, haze", /fire|flame|candle|smoke|haze|fog|pyro/i],
    ["Water, food, or liquids", /water|rain|drink|spill|blood|wine|food/i],
    ["Dance and movement load", /dance|choreograph|lift|fall|run|jump/i],
    ["Intimacy or sensitive staging", /kiss|intimacy|bed|assault|violence|nudity/i],
    ["Electrical and practicals", /lamp|practical|cable|microphone|amp|electric/i],
    ["Quick changes and wardrobe hazards", /quick change|costume|mask|heel|cloak|train/i]
  ];
  return checks.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

function htmlList(items) {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function generateBeatSheet(text, scenes) {
  const title = state.production.title || "the piece";
  const source = text || "No readable source text was loaded. Use this as a starter template.";
  const beats = [
    ["Opening Image", summarize(scenes[0] || source)],
    ["Theme Stated", "Identify the moral, social, or emotional argument that the production must make visible early."],
    ["Set-Up", "Establish the central world, its rules, the ensemble relationships, and the ordinary pressure around the lead character."],
    ["Catalyst", summarize(scenes[1] || source)],
    ["Debate", "Track the hesitation: what price will the central character pay if they act, and what price if they refuse?"],
    ["Break into Two", "Mark the first irreversible theatrical turn: a journey, decision, revelation, public vow, or rupture."],
    ["B Story", "Name the relationship, community, or idea that teaches the lead how to change."],
    ["Fun and Games", "Stage the promise of the premise: the sequences audiences came to see, hear, and feel."],
    ["Midpoint", summarize(scenes[Math.floor(scenes.length / 2)] || source)],
    ["Bad Guys Close In", "External obstacles and private contradictions tighten together. Design should make the world feel less forgiving."],
    ["All Is Lost", "Find the lowest theatrical image: isolation, failed performance, public humiliation, death, or total silence."],
    ["Dark Night of the Soul", "Let the character understand what the story has been asking of them."],
    ["Break into Three", "The solution arrives by combining plot action with the lesson of the B story."],
    ["Finale", summarize(scenes.at(-1) || source)],
    ["Final Image", `Define the visual opposite of the opening image for ${title}.`]
  ];
  return beats.map(([beat, note]) => `<h3>${beat}</h3><p>${escapeHtml(note)}</p>`).join("");
}

function generateCharacters(text) {
  return findCharacterNames(text).map((name, index) => `
    <h3>${escapeHtml(name)}</h3>
    <p><strong>Function:</strong> ${index === 0 ? "Likely central lens for the audience." : "Supports, challenges, mirrors, or pressures the central action."}</p>
    <p><strong>Actor notes:</strong> Track objective, obstacle, status, vocal/movement signature, and relationship shifts scene by scene.</p>
  `).join("");
}

function generateScenes(scenes) {
  if (!scenes.length) {
    return "<p>No readable scene text was found yet. Add scene headings, script text, or a libretto and analyze again.</p>";
  }
  return scenes.map((scene, index) => `
    <h3>Scene ${index + 1}</h3>
    <p><strong>Description:</strong> ${escapeHtml(summarize(scene, 280))}</p>
    <p><strong>Global explanation:</strong> Clarify who wants control, what changes by the end, and how the scene advances the production's central question.</p>
  `).join("");
}

function generateDesign(text, songs) {
  const period = /king|queen|war|village|palace|court|revolution|empire/i.test(text) ? "heightened historical or period-aware" : "world-specific";
  $("#costumeContent").innerHTML = `
    <p>Build a ${period} costume bible with silhouette, palette, social status, and transformation notes for every character.</p>
    <ul>
      <li>Track quick changes, dance range, footwear, masks, distressing, and practical pockets.</li>
      <li>Use costume shifts to mark status reversals, moral compromise, disguise, celebration, and final image.</li>
      <li>Create fittings checklist by performer, look number, and scene.</li>
    </ul>`;
  $("#lightingContent").innerHTML = `
    <p>Design a cue vocabulary that separates public space, private confession, memory, danger, song world, and transitions.</p>
    <ul>
      <li>Prepare specials for solos, discovery moments, thresholds, entrances, and final tableau.</li>
      <li>Flag practicals, haze, strobes, blackouts, followspot needs, and actor-safe low-light movement.</li>
      <li>Use warm/cool contrast to show belonging, threat, seduction, ritual, and aftermath.</li>
    </ul>`;
  $("#choreoContent").innerHTML = `
    <p>Movement should clarify story pressure before it decorates the stage.</p>
    <ul>
      <li>Assign motif families for community, pursuit, romance, conflict, and release.</li>
      <li>Rehearse musical numbers: ${escapeHtml(songs.join(", "))}.</li>
      <li>Include traffic patterns, lifts/falls, weapon-safe spacing, and breath points for singing.</li>
    </ul>`;
}

function generateSchedule(scenes, songs) {
  const sceneNames = scenes.length ? scenes.map((_, index) => `Scene ${index + 1}`) : ["Scene 1", "Scene 2", "Scene 3", "Scene 4"];
  const rows = [
    ["Day 1", "10:00-11:00", "Company read, table work, safety orientation"],
    ["Day 1", "11:15-13:00", `${sceneNames.slice(0, 2).join(", ")} blocking`],
    ["Day 1", "14:00-17:00", `${songs[0] || "Opening number"} music and movement`],
    ["Day 2", "10:00-13:00", `${sceneNames.slice(2, 5).join(", ")} staging and character work`],
    ["Day 2", "14:00-17:00", `${songs[1] || "Character solo"} vocal coaching and choreography`],
    ["Day 3", "10:00-12:00", "Scene transitions, props traffic, ensemble spacing"],
    ["Day 3", "12:30-17:00", "Choreography cleanup and fight/intimacy calls if needed"],
    ["Day 4", "10:00-13:00", "Sitzprobe: principals, ensemble, conductor/music director"],
    ["Day 4", "14:00-17:00", "Designer run with scene notes and cue spotting"],
    ["Day 5", "10:00-13:00", "Technical rehearsal: scenery, lights, sound, microphones"],
    ["Day 5", "14:00-17:00", "Dress rehearsal with stop-and-fix holds"],
    ["Day 6", "10:00-12:00", "Notes, brush-up, difficult scenes and musical numbers"],
    ["Day 6", "12:30-15:30", "Final dress / invited run"],
    ["Day 6", "15:30-17:00", "Safety checkout, notes, performance readiness sign-off"]
  ];
  return `<table><thead><tr><th>Work day</th><th>Time</th><th>Call / task</th></tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function generateChecklists(scenes, songs) {
  const sceneItems = (scenes.length ? scenes : ["Scene 1", "Scene 2", "Scene 3"]).map((_, index) => `☐ Scene ${index + 1} worked / notes entered / ready for run`);
  const songItems = songs.map((song) => `☐ ${song} rehearsed / cleaned / music notes complete`);
  return `
    <h3>Attendance</h3>
    <table><thead><tr><th>Name</th><th>Day 1</th><th>Day 2</th><th>Day 3</th><th>Day 4</th><th>Day 5</th><th>Day 6</th><th>Notes</th></tr></thead>
    <tbody>${findCharacterNames(state.sourceText).map((name) => `<tr><td>${escapeHtml(name)}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join("")}</tbody></table>
    <h3>Scenes</h3>${htmlList(sceneItems)}
    <h3>Musical numbers</h3>${htmlList(songItems)}
  `;
}

function generateSafety(text) {
  const found = inferSafety(text);
  const warnings = found.length ? found : ["General rehearsal room safety", "Clear traffic paths", "Props preset confirmation", "Emergency exits visible"];
  $("#safetyContent").innerHTML = `
    <p>Safety warnings are inferred from loaded text and must be confirmed by the stage manager, technical director, director, and designers.</p>
    ${htmlList(warnings.map((item) => `${item}: document risk, responsible person, rehearsal protocol, and performance checkout.`))}
  `;
  $("#safetyChecks").innerHTML = warnings.map((warning) => `
    <label class="safety-item">
      <input type="checkbox">
      <span>${escapeHtml(warning)} checked out</span>
    </label>
  `).join("");
}

function generateBlocking(scenes) {
  const rows = (scenes.length ? scenes : ["Scene 1", "Scene 2", "Scene 3", "Scene 4"]).map((_, index) => `
    <tr>
      <td>Scene ${index + 1}</td>
      <td>Entrance / starting position</td>
      <td>Crosses, levels, focus, exits</td>
      <td>Props, music, light, safety notes</td>
    </tr>
  `).join("");
  return `<table><thead><tr><th>Scene</th><th>Start</th><th>Blocking</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function analyze() {
  const text = state.sourceText.trim();
  const scenes = splitScenes(text);
  const songs = findSongs(text);
  $("#beatsContent").innerHTML = generateBeatSheet(text, scenes);
  $("#charactersContent").innerHTML = generateCharacters(text);
  $("#scenesContent").innerHTML = generateScenes(scenes);
  generateDesign(text, songs);
  $("#scheduleContent").innerHTML = generateSchedule(scenes, songs);
  $("#checklistContent").innerHTML = generateChecklists(scenes, songs);
  generateSafety(text);
  $("#blockingContent").innerHTML = generateBlocking(scenes);
  saveState();
  $("#beats").scrollIntoView({ behavior: "smooth", block: "start" });
}

function printSection(sectionId) {
  $$(".panel").forEach((panel) => panel.classList.toggle("print-hidden", panel.id !== sectionId));
  window.print();
  $$(".panel").forEach((panel) => panel.classList.remove("print-hidden"));
}

function sectionHtml() {
  return $$(".panel").map((panel) => {
    const title = panel.dataset.printTitle || panel.querySelector("h2")?.textContent || panel.id;
    const clone = panel.cloneNode(true);
    clone.querySelectorAll("button,input[type='file']").forEach((node) => node.remove());
    return `<section><h1>${escapeHtml(title)}</h1>${clone.innerHTML}</section>`;
  }).join("<hr>");
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportPacket(format) {
  const title = (state.production.title || "production-dossier").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(state.production.title || "Production Dossier")}</title><style>body{font-family:Arial,sans-serif;line-height:1.4}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:6px;text-align:left}section{page-break-after:always}</style></head><body>${sectionHtml()}</body></html>`;
  if (format === "doc") download(`${title || "production-dossier"}.doc`, html, "application/msword");
  if (format === "xls") download(`${title || "production-dossier"}.xls`, html, "application/vnd.ms-excel");
  if (format === "ppt") download(`${title || "production-dossier"}.ppt`, html, "application/vnd.ms-powerpoint");
  if (format === "json") {
    const payload = {
      production: state.production,
      files: state.files,
      sections: Object.fromEntries(editableIds.map((id) => [id, $(`#${id}`).innerHTML]))
    };
    download(`${title || "production-dossier"}.json`, JSON.stringify(payload, null, 2), "application/json");
  }
}

function saveState() {
  const payload = {
    production: state.production,
    files: state.files,
    sourceText: state.sourceText,
    sections: Object.fromEntries(editableIds.map((id) => [id, $(`#${id}`).innerHTML])),
    committed: !$("#committedProduction").classList.contains("hidden")
  };
  localStorage.setItem("production-dossier", JSON.stringify(payload));
}

function loadState() {
  const raw = localStorage.getItem("production-dossier");
  if (!raw) return;
  try {
    const payload = JSON.parse(raw);
    state.production = payload.production || {};
    state.files = payload.files || [];
    state.sourceText = payload.sourceText || "";
    setProductionFormData(state.production);
    renderFileList();
    editableIds.forEach((id) => {
      if (payload.sections?.[id]) $(`#${id}`).innerHTML = payload.sections[id];
    });
    if (payload.committed) {
      renderProductionIcons();
      $("#productionForm").classList.add("hidden");
      $("#committedProduction").classList.remove("hidden");
    }
  } catch {
    localStorage.removeItem("production-dossier");
  }
}

function bindEvents() {
  $("#productionForm").addEventListener("submit", (event) => {
    event.preventDefault();
    commitProduction();
  });
  $("#clearProduction").addEventListener("click", () => {
    $("#productionForm").reset();
    state.production = {};
    saveState();
  });
  $("#expandProduction").addEventListener("click", () => {
    $("#productionForm").classList.remove("hidden");
    $("#committedProduction").classList.add("hidden");
    setProductionFormData(state.production);
    saveState();
  });
  $("#productionIconGrid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit]");
    if (button) openInlineEditor(button.dataset.edit);
  });
  $("#fileInput").addEventListener("change", (event) => handleFiles(event.target.files));
  $("#analyzeButton").addEventListener("click", analyze);
  $("#printAllButton").addEventListener("click", () => window.print());
  $$(".print-section").forEach((button) => button.addEventListener("click", () => printSection(button.dataset.print)));
  $$(".export-grid button").forEach((button) => button.addEventListener("click", () => exportPacket(button.dataset.export)));
  $("#saveButton").addEventListener("click", saveState);
  editableIds.forEach((id) => $(`#${id}`).addEventListener("input", saveState));
  $$(".section-nav button").forEach((button) => {
    button.addEventListener("click", () => {
      $(`#${button.dataset.target}`).scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  document.addEventListener("scroll", () => {
    const current = $$(".panel").findLast((panel) => panel.getBoundingClientRect().top < 160);
    if (!current) return;
    $$(".section-nav button").forEach((button) => button.classList.toggle("active", button.dataset.target === current.id));
  }, { passive: true });
}

bindEvents();
loadState();
