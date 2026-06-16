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
  sourceText: "",
  extraSections: []
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
    reader.readAsText(file);
  });
}

function decodeXmlText(value) {
  const holder = document.createElement("textarea");
  holder.innerHTML = value;
  return holder.value;
}

async function inflateRaw(bytes) {
  if (!("DecompressionStream" in window)) return "";
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return await new Response(stream).arrayBuffer();
}

async function inflateZlib(bytes) {
  if (!("DecompressionStream" in window)) return "";
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
  return await new Response(stream).arrayBuffer();
}

async function unzipEntries(buffer) {
  const view = new DataView(buffer);
  const entries = new Map();
  let eocd = -1;
  for (let index = view.byteLength - 22; index >= Math.max(0, view.byteLength - 66000); index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd === -1) return entries;
  const centralDirectorySize = view.getUint32(eocd + 12, true);
  const centralDirectoryOffset = view.getUint32(eocd + 16, true);
  let offset = centralDirectoryOffset;
  const end = centralDirectoryOffset + centralDirectorySize;
  while (offset + 46 <= end && view.getUint32(offset, true) === 0x02014b50) {
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(buffer, offset + 46, fileNameLength));
    if (compressedSize && !name.endsWith("/") && view.getUint32(localHeaderOffset, true) === 0x04034b50) {
      const localFileNameLength = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const compressed = new Uint8Array(buffer, dataStart, compressedSize);
      let content = "";
      if (method === 0) content = new TextDecoder().decode(compressed);
      if (method === 8) content = new TextDecoder().decode(await inflateRaw(compressed));
      if (content) entries.set(name, content);
    }
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

async function extractDocxText(file) {
  const entries = await unzipEntries(await file.arrayBuffer());
  const documentParts = ["word/document.xml", "word/footnotes.xml", "word/endnotes.xml"]
    .map((name) => entries.get(name))
    .filter(Boolean);
  if (!documentParts.length) return "";
  return documentParts.map((xml) => {
    return xml
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .split("\n")
      .map((line) => decodeXmlText(line).replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
  }).join("\n\n");
}

function stripMarkup(value) {
  return decodeXmlText(value)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractFdxText(xml) {
  const paragraphs = [...xml.matchAll(/<Paragraph\b([^>]*)>([\s\S]*?)<\/Paragraph>/gi)];
  if (!paragraphs.length) return stripMarkup(xml);
  return paragraphs.map(([, attrs, body]) => {
    const type = (attrs.match(/\bType="([^"]+)"/i)?.[1] || "").toLowerCase();
    const text = [...body.matchAll(/<Text[^>]*>([\s\S]*?)<\/Text>/gi)]
      .map((match) => decodeXmlText(match[1]).trim())
      .filter(Boolean)
      .join(" ");
    if (!text) return "";
    if (type.includes("scene")) return `\nSCENE - ${text.toUpperCase()}`;
    if (type.includes("character")) return `\n${text.toUpperCase()}:`;
    if (type.includes("dialogue")) return text;
    if (type.includes("transition")) return `\n${text.toUpperCase()}`;
    return text;
  }).filter(Boolean).join("\n");
}

function bytesToBinaryString(bytes) {
  let output = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    output += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return output;
}

function pdfStringToText(value) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\[0-7]{1,3}/g, " ")
    .trim();
}

function extractPdfOperators(source) {
  const textRuns = [];
  const literalPattern = /\((?:\\.|[^\\)]){2,}\)\s*(?:Tj|'|"|TJ)/g;
  const arrayPattern = /\[((?:\s*\((?:\\.|[^\\)])*\)\s*-?\d*)+)\]\s*TJ/g;
  let match;
  while ((match = literalPattern.exec(source))) {
    textRuns.push(pdfStringToText(match[0].replace(/\)\s*(?:Tj|'|"|TJ)$/, "").slice(1)));
  }
  while ((match = arrayPattern.exec(source))) {
    const pieces = [...match[1].matchAll(/\((?:\\.|[^\\)])*\)/g)]
      .map((piece) => pdfStringToText(piece[0].slice(1, -1)))
      .filter(Boolean);
    if (pieces.length) textRuns.push(pieces.join(""));
  }
  return textRuns.join("\n");
}

async function extractPdfText(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const binary = bytesToBinaryString(bytes);
  const parts = [extractPdfOperators(binary)];
  const streamPattern = /<<(.*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = streamPattern.exec(binary))) {
    const dict = match[1];
    if (!/FlateDecode/i.test(dict)) continue;
    const streamBytes = Uint8Array.from(match[2], (char) => char.charCodeAt(0) & 255);
    try {
      const inflated = await inflateZlib(streamBytes);
      if (inflated) parts.push(extractPdfOperators(bytesToBinaryString(new Uint8Array(inflated))));
    } catch {
      try {
        const inflatedRaw = await inflateRaw(streamBytes);
        if (inflatedRaw) parts.push(extractPdfOperators(bytesToBinaryString(new Uint8Array(inflatedRaw))));
      } catch {
        // Some PDFs use encodings that cannot be read in-browser without a full PDF parser.
      }
    }
  }
  return parts
    .join("\n")
    .replace(/[^\x09\x0A\x0D\x20-\x7EÀ-ž]/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractIWorkText(file, label) {
  try {
    const entries = await unzipEntries(await file.arrayBuffer());
    const readable = [];
    entries.forEach((content, name) => {
      if (/\.(xml|html?|txt|json|plist)$/i.test(name)) readable.push(stripMarkup(content));
    });
    const text = readable
      .join("\n\n")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 2 && !/^[{}[\],":0-9.\s-]+$/.test(line))
      .join("\n");
    return text.length > 250 ? text : "";
  } catch {
    return "";
  }
}

async function readUploadedDocument(file) {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".fdx")) {
    const text = extractFdxText(await readFileAsText(file));
    return { text, status: text.trim() ? "fdx extracted" : "fdx unreadable" };
  }
  if (/\.(txt|md|csv|rtf|html?|json|fountain)$/i.test(file.name) || /^text\//.test(file.type)) {
    const text = await readFileAsText(file);
    return { text, status: text.trim() ? "read" : "empty" };
  }
  if (lowerName.endsWith(".docx")) {
    try {
      const text = await extractDocxText(file);
      return { text, status: text.trim() ? "docx extracted" : "docx unreadable" };
    } catch {
      return { text: "", status: "docx unreadable" };
    }
  }
  if (lowerName.endsWith(".pdf")) {
    const readable = await extractPdfText(file);
    const likelyUseful = readable.length > 300;
    return {
      text: likelyUseful ? readable : "",
      status: likelyUseful ? "pdf text detected" : "pdf text needs conversion"
    };
  }
  if (lowerName.endsWith(".pages") || lowerName.endsWith(".numbers")) {
    const label = lowerName.endsWith(".pages") ? "pages" : "numbers";
    const text = await extractIWorkText(file, label);
    return {
      text,
      status: text.trim() ? `${label} text extracted` : `${label} needs export`
    };
  }
  return { text: "", status: "unsupported format" };
}

async function handleFiles(files) {
  const fileArray = Array.from(files);
  const results = await Promise.all(fileArray.map(readUploadedDocument));
  const incomingFiles = fileArray.map((file, index) => ({
    name: file.name,
    size: file.size,
    type: file.type || "unknown",
    status: results[index].status,
    text: results[index].text.trim()
  }));
  state.files = [...state.files, ...incomingFiles];
  rebuildSourceText();
  renderFileList();
  $("#fileInput").value = "";
  saveState();
}

function rebuildSourceText() {
  state.sourceText = state.files
    .map((file) => file.text ? `SOURCE FILE: ${file.name}\n${file.text}` : "")
    .filter(Boolean)
    .join("\n\n--- FILE BREAK ---\n\n");
}

function deleteUploadedFile(index) {
  state.files.splice(index, 1);
  rebuildSourceText();
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
    .map((file, index) => `
      <span class="file-pill">
        <span>${escapeHtml(file.name)} · ${Math.ceil(file.size / 1024)} KB · ${escapeHtml(file.status || "loaded")}</span>
        <button type="button" class="delete-file" data-delete-file="${index}" title="Delete ${escapeHtml(file.name)}">Delete</button>
      </span>
    `)
    .join("");
}

function splitScenes(text) {
  const normalized = text.replace(/\r/g, "\n");
  const headingPattern = /(?:ACT|SCENE|CHAPTER|PART)\s+[A-Z0-9IVX-]+|(?:INT\.|EXT\.|I\/E\.)\s+[^\n]+|[0-9]+\.\s+[^\n]+/i;
  const candidates = normalized
    .split(new RegExp(`\\n(?=${headingPattern.source})`, "i"))
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 120);
  if (candidates.length >= 2) return candidates.slice(0, 24);
  const paragraphs = normalized.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 80);
  if (paragraphs.length > 6) {
    const groupSize = Math.max(2, Math.ceil(paragraphs.length / 12));
    const groups = [];
    for (let index = 0; index < paragraphs.length; index += groupSize) {
      groups.push(paragraphs.slice(index, index + groupSize).join("\n\n"));
    }
    return groups.slice(0, 16);
  }
  return paragraphs.slice(0, 12);
}

function findCharacterNames(text) {
  const dialogueNames = [...text.matchAll(/(?:^|\n)\s*([A-Z][A-Z0-9 .'-]{2,32})(?:\s*:|\n|\s+\([^)]+\)\s*\n)/g)]
    .map((match) => match[1].trim())
    .filter((name) => !/^(ACT|SCENE|INT|EXT|LIGHTS|BLACKOUT|CURTAIN|SONG|MUSIC|CHORUS|ENSEMBLE|SOURCE FILE|PAGE|END)$/.test(name))
    .filter((name) => name.length < 34 && !/\d{2,}/.test(name));
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

function getStorySlices(text, scenes) {
  const units = scenes.length >= 6 ? scenes : text.split(/\n{2,}/).map((line) => line.trim()).filter((line) => line.length > 80);
  const fallback = text || "No readable uploaded document text was found.";
  const at = (ratio) => {
    if (!units.length) return fallback;
    const index = Math.min(units.length - 1, Math.max(0, Math.round((units.length - 1) * ratio)));
    return units[index];
  };
  return {
    opening: at(0),
    theme: at(0.08),
    setup: at(0.14),
    catalyst: at(0.2),
    debate: at(0.28),
    breakTwo: at(0.34),
    bStory: at(0.42),
    fun: at(0.5),
    midpoint: at(0.56),
    pressure: at(0.68),
    allLost: at(0.76),
    darkNight: at(0.82),
    breakThree: at(0.88),
    finale: at(0.95),
    finalImage: at(1)
  };
}

function beatParagraph(label, evidence, instruction) {
  return `
    <h3>${label}</h3>
    <p><strong>Script evidence:</strong> ${escapeHtml(summarize(evidence, 320))}</p>
    <p><strong>Production reading:</strong> ${escapeHtml(instruction)}</p>
  `;
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

function setAnalysisStatus(message, tone = "neutral") {
  const status = $("#analysisStatus");
  status.textContent = message;
  status.dataset.tone = tone;
}

function sectionItemsToHtml(items = []) {
  if (!Array.isArray(items) || !items.length) return "<p>No generated notes yet.</p>";
  return items.map((item) => {
    if (typeof item === "string") return `<p>${escapeHtml(item)}</p>`;
    const title = item.title || item.name || item.beat || item.scene || item.day || "Note";
    const body = item.body || item.description || item.explanation || item.notes || item.scriptEvidence || "";
    const extras = Object.entries(item)
      .filter(([key]) => !["title", "name", "beat", "scene", "day", "body", "description", "explanation", "notes", "scriptEvidence"].includes(key))
      .map(([key, value]) => `<p><strong>${escapeHtml(titleCase(key.replace(/_/g, " ")))}:</strong> ${escapeHtml(Array.isArray(value) ? value.join(", ") : value)}</p>`)
      .join("");
    return `<h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p>${extras}`;
  }).join("");
}

function renderExtraSections(sections = state.extraSections) {
  state.extraSections = Array.isArray(sections) ? sections : [];
  const panel = $("#chatgpt-additions");
  const container = $("#extraSectionsContent");
  if (!state.extraSections.length) {
    container.innerHTML = "";
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");
  container.innerHTML = state.extraSections.map((section, index) => `
    <article class="extra-section">
      <div class="extra-section-heading">
        <h3>${escapeHtml(section.title || `Generated section ${index + 1}`)}</h3>
      </div>
      <div class="editable compact" contenteditable="true" data-extra-index="${index}">${section.html || sectionItemsToHtml(section.items || [section.content || section.body || ""])}</div>
    </article>
  `).join("");
}

function syncExtraSectionsFromDom() {
  $$("#extraSectionsContent [data-extra-index]").forEach((node) => {
    const index = Number(node.dataset.extraIndex);
    if (state.extraSections[index]) state.extraSections[index].html = node.innerHTML;
  });
}

function buildChatGPTPrompt() {
  const title = state.production.title || "Untitled production";
  const source = state.sourceText.slice(0, 90000);
  return `breakdown like Blake Snyder's Save the cat beat sheet

Production title: ${title}

Use the uploaded script/libretto/article text below. Return only valid JSON that matches the requested structure. Fill every related section. If you need a section that does not map to an existing box, put it in extraSections with a clear title.

Required output:
- beatSheet: 15 Blake Snyder Save the Cat beats. Each item needs title, scriptEvidence, and productionReading.
- characters: character list with explanation, function, actorNotes.
- scenes: scene descriptions with global explanation.
- costume: costume design notes.
- lighting: lighting design notes.
- choreography: choreography suggestions.
- schedule: rehearsal calendar for 6 work days, 10:00-17:00, including scene breakdown, songs, choreography, sitzprobe, tech, and dress rehearsal.
- checklists: attendance, scenes, musical numbers worked on.
- safety: technical safety warnings and checkout items.
- blocking: blocking sheet rows.
- extraSections: any extra boxes with necessary titles.

Uploaded text:
${source}`;
}

function chatGPTResponseSchema() {
  const noteArray = {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string" },
        body: { type: "string" },
        scriptEvidence: { type: "string" },
        productionReading: { type: "string" },
        explanation: { type: "string" },
        notes: { type: "string" }
      },
      required: ["title", "body", "scriptEvidence", "productionReading", "explanation", "notes"]
    }
  };
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      beatSheet: { type: "array", items: { type: "object", additionalProperties: false, properties: { title: { type: "string" }, scriptEvidence: { type: "string" }, productionReading: { type: "string" } }, required: ["title", "scriptEvidence", "productionReading"] } },
      characters: noteArray,
      scenes: noteArray,
      costume: noteArray,
      lighting: noteArray,
      choreography: noteArray,
      schedule: noteArray,
      checklists: noteArray,
      safety: noteArray,
      blocking: noteArray,
      extraSections: { type: "array", items: { type: "object", additionalProperties: false, properties: { title: { type: "string" }, content: { type: "string" }, body: { type: "string" } }, required: ["title", "content", "body"] } }
    },
    required: ["beatSheet", "characters", "scenes", "costume", "lighting", "choreography", "schedule", "checklists", "safety", "blocking", "extraSections"]
  };
}

function extractResponseText(responseJson) {
  if (responseJson.output_text) return responseJson.output_text;
  const content = responseJson.output?.flatMap((item) => item.content || []) || [];
  const textParts = content.map((part) => part.text || part.output_text || "").filter(Boolean);
  return textParts.join("\n");
}

async function callChatGPTAnalysis() {
  const apiKey = $("#openaiApiKey").value.trim();
  const model = $("#openaiModel").value.trim() || "gpt-5.5";
  if (!apiKey) throw new Error("Add an OpenAI API key to use ChatGPT analysis.");
  if (!state.sourceText.trim()) throw new Error("Upload a readable file before analysis.");
  sessionStorage.setItem("genius-openai-model", model);
  sessionStorage.setItem("genius-openai-key", apiKey);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: "You are an expert theatre dramaturg, director, choreographer, designer, and stage manager. Return production-ready structured JSON only."
        },
        {
          role: "user",
          content: buildChatGPTPrompt()
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "production_breakdown",
          strict: true,
          schema: chatGPTResponseSchema()
        }
      }
    })
  });
  const responseJson = await response.json();
  if (!response.ok) {
    const detail = responseJson.error?.message || `OpenAI request failed with status ${response.status}`;
    throw new Error(detail);
  }
  const text = extractResponseText(responseJson);
  return JSON.parse(text);
}

function applyChatGPTBreakdown(data) {
  $("#beatsContent").innerHTML = (data.beatSheet || []).map((item, index) => `
    <h3>${escapeHtml(item.title || `${index + 1}. Beat`)}</h3>
    <p><strong>Script evidence:</strong> ${escapeHtml(item.scriptEvidence || "")}</p>
    <p><strong>Production reading:</strong> ${escapeHtml(item.productionReading || "")}</p>
  `).join("");
  $("#charactersContent").innerHTML = sectionItemsToHtml(data.characters);
  $("#scenesContent").innerHTML = sectionItemsToHtml(data.scenes);
  $("#costumeContent").innerHTML = sectionItemsToHtml(data.costume);
  $("#lightingContent").innerHTML = sectionItemsToHtml(data.lighting);
  $("#choreoContent").innerHTML = sectionItemsToHtml(data.choreography);
  $("#scheduleContent").innerHTML = sectionItemsToHtml(data.schedule);
  $("#checklistContent").innerHTML = sectionItemsToHtml(data.checklists);
  $("#safetyContent").innerHTML = sectionItemsToHtml(data.safety);
  $("#blockingContent").innerHTML = sectionItemsToHtml(data.blocking);
  $("#safetyChecks").innerHTML = (data.safety || []).map((item) => `
    <label class="safety-item">
      <input type="checkbox">
      <span>${escapeHtml(item.title || item.body || "Safety item")} checked out</span>
    </label>
  `).join("");
  renderExtraSections(data.extraSections || []);
}

function generateBeatSheet(text, scenes) {
  const title = state.production.title || "the piece";
  const slices = getStorySlices(text, scenes);
  const countLine = text
    ? `<p><strong>Source used:</strong> ${state.files.map((file) => `${escapeHtml(file.name)} (${escapeHtml(file.status || "loaded")})`).join(", ")}. ${scenes.length} scene/sequence chunks detected.</p>`
    : "<p><strong>Source used:</strong> No readable uploaded text yet. Upload TXT, MD, Fountain, FDX, DOCX, readable PDF, Pages, or Numbers files for a document-based beat sheet. Scanned or binary-only files may need export to text first.</p>";
  return `
    ${countLine}
    ${beatParagraph("1. Opening Image", slices.opening, `Find the first theatrical picture of ${title}: world, tone, social order, and what feels incomplete before the story begins.`)}
    ${beatParagraph("2. Theme Stated", slices.theme, "Listen for a line, argument, song idea, or stage image that tells the audience what emotional question the production will test.")}
    ${beatParagraph("3. Set-Up", slices.setup, "Name the central world, primary relationships, rules of behavior, pressure points, and the character whose change matters most.")}
    ${beatParagraph("4. Catalyst", slices.catalyst, "Identify the interruption that makes the old world impossible to continue: arrival, invitation, death, discovery, accusation, desire, or public event.")}
    ${beatParagraph("5. Debate", slices.debate, "Track the hesitation and cost. What keeps the protagonist from acting, and what does the ensemble fear will happen?")}
    ${beatParagraph("6. Break into Two", slices.breakTwo, "Mark the first irreversible move into a new plan, location, relationship, lie, rehearsal of identity, or open conflict.")}
    ${beatParagraph("7. B Story", slices.bStory, "Find the relationship or secondary musical/dramatic line that teaches the central lesson and gives the audience emotional access.")}
    ${beatParagraph("8. Fun and Games", slices.fun, "Stage the promise of the premise: the section where genre, theatricality, songs, rituals, comedy, romance, danger, or spectacle should be most legible.")}
    ${beatParagraph("9. Midpoint", slices.midpoint, "Locate the false victory or false defeat. The production should feel as if the stakes have changed size here.")}
    ${beatParagraph("10. Bad Guys Close In", slices.pressure, "External opposition and internal contradiction should tighten at the same time. Design, rhythm, and spacing should become less forgiving.")}
    ${beatParagraph("11. All Is Lost", slices.allLost, "Find the lowest image: silence, separation, failed performance, public shame, literal death, emotional death, or total loss of control.")}
    ${beatParagraph("12. Dark Night of the Soul", slices.darkNight, "Give the character and audience room to understand what has been lost and what truth must be accepted before the final action.")}
    ${beatParagraph("13. Break into Three", slices.breakThree, "The solution should combine plot action with the lesson from the B story. This is where staging should reveal new clarity.")}
    ${beatParagraph("14. Finale", slices.finale, "Track how the story resolves its central argument through action, song, confrontation, sacrifice, reunion, or transformation.")}
    ${beatParagraph("15. Final Image", slices.finalImage, `Define the final stage picture as the visual answer to the opening image of ${title}.`)}
  `;
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

function runLocalAnalysis() {
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
  renderExtraSections([]);
  saveState();
  $("#beats").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function analyze() {
  const useChatGPT = $("#useChatGPT").checked;
  const hasApiKey = $("#openaiApiKey").value.trim();
  $("#analyzeButton").disabled = true;
  setAnalysisStatus(useChatGPT && hasApiKey ? "Sending uploaded text to ChatGPT for Save the Cat breakdown..." : "Running local Save the Cat breakdown...", "neutral");
  try {
    if (useChatGPT && hasApiKey) {
      const breakdown = await callChatGPTAnalysis();
      applyChatGPTBreakdown(breakdown);
      saveState();
      setAnalysisStatus("ChatGPT breakdown inserted into the related editable boxes.", "success");
      $("#beats").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    runLocalAnalysis();
    setAnalysisStatus(useChatGPT ? "No API key entered, so the local analyzer ran instead." : "Local analyzer complete.", useChatGPT ? "warning" : "success");
  } catch (error) {
    runLocalAnalysis();
    setAnalysisStatus(`ChatGPT analysis could not complete: ${error.message}. Local analyzer results were inserted instead.`, "warning");
  } finally {
    $("#analyzeButton").disabled = false;
  }
}

function resetPage() {
  state.production = {};
  state.files = [];
  state.sourceText = "";
  state.extraSections = [];
  $("#productionForm").reset();
  $("#productionForm").classList.remove("hidden");
  $("#committedProduction").classList.add("hidden");
  $("#productionIconGrid").innerHTML = "";
  $("#fileInput").value = "";
  renderFileList();
  editableIds.forEach((id) => {
    $(`#${id}`).innerHTML = "";
  });
  $("#safetyChecks").innerHTML = "";
  $("#analysisStatus").textContent = "";
  $("#openaiApiKey").value = "";
  $("#openaiModel").value = "gpt-5.5";
  sessionStorage.removeItem("genius-openai-key");
  sessionStorage.removeItem("genius-openai-model");
  renderExtraSections([]);
  localStorage.removeItem("production-dossier");
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
    syncExtraSectionsFromDom();
    const payload = {
      production: state.production,
      files: state.files,
      extraSections: state.extraSections,
      sections: Object.fromEntries(editableIds.map((id) => [id, $(`#${id}`).innerHTML]))
    };
    download(`${title || "production-dossier"}.json`, JSON.stringify(payload, null, 2), "application/json");
  }
}

function saveState() {
  syncExtraSectionsFromDom();
  const payload = {
    production: state.production,
    files: state.files,
    sourceText: state.sourceText,
    extraSections: state.extraSections,
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
    state.extraSections = payload.extraSections || [];
    if (state.sourceText && state.files.length === 1 && !state.files[0].text) {
      state.files[0].text = state.sourceText;
    }
    if (state.files.some((file) => file.text)) rebuildSourceText();
    setProductionFormData(state.production);
    renderFileList();
    editableIds.forEach((id) => {
      if (payload.sections?.[id]) $(`#${id}`).innerHTML = payload.sections[id];
    });
    renderExtraSections(state.extraSections);
    if (payload.committed) {
      renderProductionIcons();
      $("#productionForm").classList.add("hidden");
      $("#committedProduction").classList.remove("hidden");
    }
  } catch {
    localStorage.removeItem("production-dossier");
  }
  const sessionKey = sessionStorage.getItem("genius-openai-key");
  const sessionModel = sessionStorage.getItem("genius-openai-model");
  if (sessionKey) $("#openaiApiKey").value = sessionKey;
  if (sessionModel) $("#openaiModel").value = sessionModel;
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
  $("#fileList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-file]");
    if (button) deleteUploadedFile(Number(button.dataset.deleteFile));
  });
  $("#analyzeButton").addEventListener("click", analyze);
  $("#resetButton").addEventListener("click", () => {
    if (confirm("Reset the page and clear uploaded files, generated sections, and production form data?")) resetPage();
  });
  $("#extraSectionsContent").addEventListener("input", () => {
    syncExtraSectionsFromDom();
    saveState();
  });
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
