const tabs = [...document.querySelectorAll(".tab")];
const panels = [...document.querySelectorAll(".panel")];

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const name = tab.dataset.tab;
    tabs.forEach((item) => item.classList.toggle("active", item === tab));
    panels.forEach((panel) => {
      const selected = panel.dataset.panel === name;
      panel.hidden = !selected;
      panel.classList.toggle("active", selected);
    });
    if (name === "traces") loadTraces();
  });
});

document.querySelectorAll('input[type="file"]').forEach((input) => {
  input.addEventListener("change", () => {
    const label = input.closest(".dropzone")?.querySelector(".file-name");
    if (label && input.files?.length) label.textContent = input.files[0].name;
  });
});

document.querySelectorAll(".dropzone").forEach((dropzone) => {
  const input = dropzone.querySelector('input[type="file"]');
  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add("dragging");
    });
  });
  ["dragleave", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove("dragging");
    });
  });
  dropzone.addEventListener("drop", (event) => {
    if (!input || !event.dataTransfer?.files?.length) return;
    input.files = event.dataTransfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
});

const reportText = document.querySelector("#report-text");
const textCount = document.querySelector("#text-count");
reportText?.addEventListener("input", () => {
  textCount.textContent = `${reportText.value.length.toLocaleString("it-IT")} caratteri`;
});

function showLoading(target, datasetMode) {
  target.hidden = false;
  target.className = "result loading";
  target.innerHTML = `<h3>Elaborazione in corso</h3><p>${datasetMode ? "Il dataset può richiedere diversi minuti. Non chiudere questa pagina." : "MedGemma sta leggendo e verificando il referto…"}</p>`;
}

function traceShortcut(traceId) {
  if (!traceId) return null;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "trace-shortcut";
  button.textContent = "Apri la trace di questa esecuzione";
  button.addEventListener("click", async () => {
    activateTracePanel();
    await showTraceDetail(traceId);
  });
  return button;
}

function showError(target, message, traceId) {
  target.hidden = false;
  target.className = "result error";
  target.replaceChildren();
  const title = document.createElement("h3");
  title.textContent = "Non è stato possibile completare l’analisi";
  const text = document.createElement("p");
  text.textContent = message;
  target.append(title, text);
  const shortcut = traceShortcut(traceId);
  if (shortcut) target.append(shortcut);
}

const explanationHeadings = new Set([
  "SINTESI",
  "SPIEGAZIONE IN PAROLE SEMPLICI",
  "INCERTEZZE O LIMITI DEL REFERTO",
  "INDICAZIONI RIPORTATE NEL DOCUMENTO",
  "NOTA INFORMATIVA",
]);

function renderExplanation(result) {
  const article = document.createElement("article");
  article.className = "explanation";
  const sections = [];
  let current = { heading: "", lines: [] };

  result.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
    if (explanationHeadings.has(line.toUpperCase())) {
      if (current.heading || current.lines.length) sections.push(current);
      current = { heading: line.toUpperCase(), lines: [] };
    } else {
      current.lines.push(line.replace(/^\s*(?:[*•-]|\d+[.)])\s*/, ""));
    }
  });
  if (current.heading || current.lines.length) sections.push(current);

  sections.forEach((section) => {
    const block = document.createElement("section");
    const sectionType = section.heading === "NOTA INFORMATIVA"
      ? " note"
      : section.heading === "INDICAZIONI RIPORTATE NEL DOCUMENTO" ? " documented-advice" : "";
    block.className = `explanation-section${sectionType}`;
    if (section.heading) {
      const heading = document.createElement("h3");
      heading.textContent = section.heading;
      block.append(heading);
    }
    const paragraph = document.createElement("p");
    paragraph.textContent = section.lines.join(" ");
    block.append(paragraph);
    article.append(block);
  });
  return article;
}

function showSingleResult(target, result, traceId) {
  target.hidden = false;
  target.className = "result";
  target.replaceChildren();
  const title = document.createElement("h3");
  title.textContent = "Spiegazione del referto";
  target.append(title, renderExplanation(result));
  const shortcut = traceShortcut(traceId);
  if (shortcut) target.append(shortcut);
}

function showDatasetResult(target, data) {
  target.hidden = false;
  target.className = "result";
  target.replaceChildren();

  const title = document.createElement("h3");
  title.textContent = "Elaborazione completata";
  const summary = document.createElement("div");
  summary.className = "result-summary";
  [["Elaborati", data.processed], ["Riusciti", data.successes], ["Errori", data.errors]].forEach(([label, value]) => {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = `${label}: ${value}`;
    summary.append(badge);
  });
  const download = document.createElement("a");
  download.className = "download";
  download.href = data.download_url;
  download.textContent = "Scarica il risultato JSONL";
  target.append(title, summary, download);
  const shortcut = traceShortcut(data.trace_id);
  if (shortcut) target.append(shortcut);

  data.preview?.forEach((item) => {
    const card = document.createElement("div");
    card.className = "preview-item";
    const heading = document.createElement("strong");
    heading.textContent = `Referto ${item.index}${item.doc_key !== null && item.doc_key !== undefined ? ` · ID ${item.doc_key}` : ""} · ${item.status}`;
    const content = document.createElement("p");
    content.textContent = item.error || item.explanation || "Nessuna anteprima disponibile";
    card.append(heading, content);
    target.append(card);
  });
}

document.querySelectorAll(".analysis-form").forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const target = document.getElementById(form.dataset.result);
    const button = form.querySelector('button[type="submit"]');
    const datasetMode = form.dataset.dataset === "true";
    showLoading(target, datasetMode);
    button.disabled = true;

    try {
      const response = await fetch(form.dataset.endpoint, { method: "POST", body: new FormData(form) });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        const requestError = new Error(data.error || "Errore inatteso del server.");
        requestError.traceId = data.trace_id;
        throw requestError;
      }
      if (datasetMode) showDatasetResult(target, data);
      else showSingleResult(target, data.result, data.trace_id);
    } catch (error) {
      showError(target, error.message || "Errore di connessione.", error.traceId);
    } finally {
      button.disabled = false;
    }
  });
});

const traceList = document.querySelector("#trace-list");
const traceDetail = document.querySelector("#trace-detail");
const sourceNames = { pdf: "PDF", image: "Immagine", text: "Testo", dataset: "Dataset" };

function formatTraceDate(value, options = {}) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: options.dateOnly ? "long" : "medium",
    ...(options.dateOnly ? {} : { timeStyle: "medium" }),
  }).format(new Date(value));
}

function formatDuration(milliseconds) {
  if (milliseconds === null || milliseconds === undefined) return "in corso";
  if (milliseconds < 1000) return `${milliseconds} ms`;
  if (milliseconds < 60000) return `${(milliseconds / 1000).toFixed(1)} s`;
  const minutes = Math.floor(milliseconds / 60000);
  const seconds = Math.round((milliseconds % 60000) / 1000);
  return `${minutes} min ${seconds} s`;
}

function activateTracePanel() {
  const traceTab = document.querySelector('.tab[data-tab="traces"]');
  tabs.forEach((item) => item.classList.toggle("active", item === traceTab));
  panels.forEach((panel) => {
    const selected = panel.dataset.panel === "traces";
    panel.hidden = !selected;
    panel.classList.toggle("active", selected);
  });
}

async function loadTraces() {
  if (!traceList) return;
  traceDetail.hidden = true;
  traceList.hidden = false;
  traceList.innerHTML = '<p class="empty-state">Caricamento della cronologia…</p>';
  try {
    const response = await fetch("/api/traces?limit=200");
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Cronologia non disponibile.");
    renderTraceList(data.traces);
  } catch (error) {
    traceList.innerHTML = "";
    const message = document.createElement("p");
    message.className = "empty-state error-text";
    message.textContent = error.message || "Cronologia non disponibile.";
    traceList.append(message);
  }
}

function renderTraceList(traces) {
  traceList.replaceChildren();
  if (!traces.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Non ci sono ancora esecuzioni salvate.";
    traceList.append(empty);
    return;
  }

  let previousDay = "";
  traces.forEach((trace) => {
    const day = trace.started_at?.slice(0, 10) || "Senza data";
    if (day !== previousDay) {
      const dateHeading = document.createElement("h3");
      dateHeading.className = "trace-date";
      dateHeading.textContent = formatTraceDate(trace.started_at, { dateOnly: true });
      traceList.append(dateHeading);
      previousDay = day;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "trace-entry";
    button.addEventListener("click", () => showTraceDetail(trace.id));

    const status = document.createElement("span");
    status.className = `trace-status ${trace.status}`;
    status.textContent = trace.status === "ok" ? "Completata" : trace.status === "error" ? "Errore" : "In corso";
    const title = document.createElement("strong");
    title.textContent = trace.source_name || sourceNames[trace.source_type] || "Esecuzione";
    const time = document.createElement("time");
    time.dateTime = trace.started_at || "";
    time.textContent = formatTraceDate(trace.started_at);
    const meta = document.createElement("span");
    meta.className = "trace-meta";
    const stepLabel = trace.step_count === 1 ? "passaggio" : "passaggi";
    meta.textContent = `${sourceNames[trace.source_type] || trace.source_type} · ${trace.step_count} ${stepLabel} · ${formatDuration(trace.duration_ms)}`;

    const top = document.createElement("span");
    top.className = "trace-entry-top";
    top.append(title, status);
    const copy = document.createElement("span");
    copy.className = "trace-entry-copy";
    copy.append(top, time, meta);
    const arrow = document.createElement("span");
    arrow.className = "trace-arrow";
    arrow.textContent = "›";
    button.append(copy, arrow);
    traceList.append(button);
  });
}

function appendDataBlock(parent, titleText, value) {
  if (value === null || value === undefined || value === "") return;
  const details = document.createElement("details");
  details.className = "trace-data";
  const summary = document.createElement("summary");
  summary.textContent = titleText;
  const pre = document.createElement("pre");
  pre.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  details.append(summary, pre);
  parent.append(details);
}

async function showTraceDetail(traceId) {
  if (!traceDetail || !traceList) return;
  traceList.hidden = true;
  traceDetail.hidden = false;
  traceDetail.innerHTML = '<p class="empty-state">Caricamento della trace…</p>';
  try {
    const response = await fetch(`/api/traces/${encodeURIComponent(traceId)}`);
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Trace non disponibile.");
    renderTraceDetail(data.trace);
  } catch (error) {
    traceDetail.replaceChildren();
    const back = document.createElement("button");
    back.className = "back-button";
    back.textContent = "← Torna alla cronologia";
    back.addEventListener("click", loadTraces);
    const message = document.createElement("p");
    message.className = "empty-state error-text";
    message.textContent = error.message || "Trace non disponibile.";
    traceDetail.append(back, message);
  }
}

function renderTraceDetail(trace) {
  traceDetail.replaceChildren();
  const back = document.createElement("button");
  back.className = "back-button";
  back.type = "button";
  back.textContent = "← Torna alla cronologia";
  back.addEventListener("click", loadTraces);

  const header = document.createElement("div");
  header.className = "trace-detail-header";
  const heading = document.createElement("h3");
  heading.textContent = trace.source_name || "Dettaglio esecuzione";
  const subtitle = document.createElement("p");
  const detailStepLabel = trace.steps.length === 1 ? "passaggio" : "passaggi";
  subtitle.textContent = `${formatTraceDate(trace.started_at)} · ${formatDuration(trace.duration_ms)} · ${trace.steps.length} ${detailStepLabel}`;
  const status = document.createElement("span");
  status.className = `trace-status ${trace.status}`;
  status.textContent = trace.status === "ok" ? "Completata" : trace.status === "error" ? "Errore" : "In corso";
  const headingCopy = document.createElement("div");
  headingCopy.append(heading, subtitle);
  header.append(headingCopy, status);
  traceDetail.append(back, header);

  if (trace.error) {
    const error = document.createElement("p");
    error.className = "trace-error";
    error.textContent = trace.error;
    traceDetail.append(error);
  }

  const timeline = document.createElement("div");
  timeline.className = "trace-timeline";
  trace.steps.forEach((step) => {
    const item = document.createElement("article");
    item.className = `trace-step ${step.status}`;
    const number = document.createElement("span");
    number.className = "trace-step-number";
    number.textContent = step.number;
    const body = document.createElement("div");
    const row = document.createElement("div");
    row.className = "trace-step-row";
    const name = document.createElement("h4");
    name.textContent = step.name;
    const duration = document.createElement("span");
    duration.textContent = formatDuration(step.duration_ms);
    row.append(name, duration);
    const timing = document.createElement("p");
    timing.textContent = formatTraceDate(step.started_at);
    body.append(row, timing);
    if (step.error) {
      const error = document.createElement("p");
      error.className = "trace-error compact";
      error.textContent = step.error;
      body.append(error);
    }
    appendDataBlock(body, "Mostra dati del passaggio", step.details);
    item.append(number, body);
    timeline.append(item);
  });
  traceDetail.append(timeline);
  appendDataBlock(traceDetail, "Dati e testi salvati", trace.artifacts);
  appendDataBlock(traceDetail, "Risultato finale", trace.output);
}

document.querySelector("#refresh-traces")?.addEventListener("click", loadTraces);
