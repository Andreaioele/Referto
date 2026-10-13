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
    if (name === "performance") loadBenchmarks();
    if (name === "glossary") loadGlossary();
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

const datasetForm = document.querySelector("#dataset-form");
const datasetStatus = document.querySelector("#dataset-status");
const datasetDashboard = document.querySelector("#dataset-dashboard");
const datasetRadios = document.querySelectorAll('input[name="dataset_selector"]');
const selectedDatasetNameInput = document.querySelector("#selected-dataset-name");
const datasetUploadContainer = document.querySelector("#dataset-upload-container");
const datasetFileInput = document.querySelector("#dataset-file-input");

datasetRadios.forEach((radio) => {
  radio.addEventListener("change", () => {
    if (selectedDatasetNameInput) selectedDatasetNameInput.value = radio.value;
    document.querySelectorAll("#dataset-cards-grid .dataset-card").forEach((card) => {
      card.classList.toggle("active", card.contains(radio));
    });
    const isCustom = radio.value === "custom";
    if (datasetUploadContainer) datasetUploadContainer.hidden = !isCustom;
    if (datasetFileInput) {
      datasetFileInput.required = isCustom;
      datasetFileInput.disabled = !isCustom;
      if (!isCustom) datasetFileInput.value = "";
    }
  });
});

if (datasetFileInput) {
  const currentVal = document.querySelector('input[name="dataset_selector"]:checked')?.value || "mtsamples_radiology.jsonl";
  datasetFileInput.disabled = currentVal !== "custom";
  datasetFileInput.required = currentVal === "custom";
}



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

function glossaryTermName(term) {
  return term.name_it || term.it || term.en;
}

function glossaryDetail(term, position, total, onMove, showHistory) {
  const card = document.createElement("article");
  card.className = "glossary-detail";

  const header = document.createElement("div");
  header.className = "glossary-detail-header";
  const counter = document.createElement("span");
  counter.className = "glossary-counter";
  counter.textContent = `${position + 1} di ${total}`;
  const nav = document.createElement("div");
  nav.className = "glossary-nav";
  [["‹ Precedente", -1], ["Successiva ›", 1]].forEach(([label, step]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary";
    button.textContent = label;
    button.disabled = position + step < 0 || position + step >= total;
    button.addEventListener("click", () => onMove(position + step));
    nav.append(button);
  });
  header.append(counter, nav);

  const title = document.createElement("h4");
  title.textContent = glossaryTermName(term);
  const english = document.createElement("p");
  english.className = "glossary-english";
  english.textContent = `In inglese: ${term.en}`;
  card.append(header, title, english);

  const block = (label, text, className = "") => {
    if (!text) return;
    const section = document.createElement("section");
    section.className = `glossary-block ${className}`.trim();
    const heading = document.createElement("h5");
    heading.textContent = label;
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    section.append(heading, paragraph);
    card.append(section);
  };
  if (term.simple_it) {
    block("In parole semplici", term.simple_it, "simple");
    const note = document.createElement("p");
    note.className = "glossary-note";
    note.textContent = `Riformulazione scritta da ${term.simple_model || "il modello"} a partire dalla definizione HPO qui sotto. In caso di dubbio chiedi al tuo medico.`;
    card.append(note);
  } else {
    block("In parole semplici", "Spiegazione semplice non ancora disponibile: qui sotto trovi la definizione di riferimento.", "simple pending");
  }
  block("Parole comuni (inglese)", (term.lay_en || []).join(" · "));
  block("Definizione di riferimento (HPO, inglese)", term.definition_en);

  const footer = document.createElement("p");
  footer.className = "glossary-meta";
  if (showHistory && term.count) {
    footer.append(`Trovata in ${term.count} analisi · ultima volta ${formatTraceDate(term.last_seen)} · `);
  }
  const link = document.createElement("a");
  link.href = term.source_url;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = `Scheda ${term.id} su HPO ↗`;
  footer.append(link);
  card.append(footer);
  return card;
}

function renderGlossaryViewer(terms, { showHistory = false } = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = "glossary-viewer";
  const chips = document.createElement("div");
  chips.className = "glossary-chips";
  const detailSlot = document.createElement("div");
  let current = 0;

  const select = (index) => {
    current = index;
    [...chips.children].forEach((chip, i) => chip.classList.toggle("active", i === index));
    detailSlot.replaceChildren(glossaryDetail(terms[index], index, terms.length, select, showHistory));
  };
  terms.forEach((term, index) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "glossary-chip";
    chip.textContent = glossaryTermName(term);
    chip.addEventListener("click", () => select(index));
    chips.append(chip);
  });
  wrapper.append(chips, detailSlot);
  if (terms.length) select(current);
  return wrapper;
}

function renderResultGlossary(terms) {
  const section = document.createElement("section");
  section.className = "result-glossary";
  const heading = document.createElement("h3");
  heading.textContent = "Le parole mediche di questo referto";
  const intro = document.createElement("p");
  intro.className = "glossary-intro";
  intro.textContent = "Tocca una parola per leggerne il significato. Restano salvate nella sezione Glossario. Una parola in questo elenco non significa che tu abbia quella condizione: il referto può nominarla anche per escluderla.";
  section.append(heading, intro, renderGlossaryViewer(terms));
  return section;
}

const glossarySaved = document.querySelector("#glossary-saved");
const glossarySearch = document.querySelector("#glossary-search");
let glossaryTerms = [];

function renderSavedGlossary() {
  if (!glossarySaved) return;
  const query = (glossarySearch?.value || "").trim().toLowerCase();
  const terms = glossaryTerms.filter((term) => !query
    || [glossaryTermName(term), term.en, term.it || ""].some((name) => name.toLowerCase().includes(query)));
  if (!glossaryTerms.length) {
    glossarySaved.innerHTML = '<p class="empty-state">Non ci sono ancora parole salvate. Analizza un referto per iniziare.</p>';
    return;
  }
  if (!terms.length) {
    glossarySaved.innerHTML = '<p class="empty-state">Nessuna parola corrisponde alla ricerca.</p>';
    return;
  }
  glossarySaved.replaceChildren(renderGlossaryViewer(terms, { showHistory: true }));
}

async function loadGlossary() {
  if (!glossarySaved) return;
  try {
    const response = await fetch("/api/glossary");
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Errore inatteso del server.");
    glossaryTerms = data.terms || [];
    const source = document.querySelector("#glossary-source");
    if (source && data.source) {
      source.textContent = `Termini e definizioni: ${data.source.source}${data.source.hpo_version ? `, versione ${data.source.hpo_version.split("/").slice(-2, -1)[0]}` : ""}. Le spiegazioni semplici sono riformulazioni automatiche delle definizioni HPO.`;
    }
    renderSavedGlossary();
  } catch (error) {
    glossarySaved.innerHTML = "";
    const message = document.createElement("p");
    message.className = "empty-state";
    message.textContent = error.message || "Impossibile caricare il glossario.";
    glossarySaved.append(message);
  }
}

glossarySearch?.addEventListener("input", renderSavedGlossary);
document.querySelector("#refresh-glossary")?.addEventListener("click", loadGlossary);

function showSingleResult(target, result, traceId, glossary) {
  target.hidden = false;
  target.className = "result";
  target.replaceChildren();
  const title = document.createElement("h3");
  title.textContent = "Spiegazione del referto";
  target.append(title, renderExplanation(result));
  if (glossary?.length) target.append(renderResultGlossary(glossary));
  const shortcut = traceShortcut(traceId);
  if (shortcut) target.append(shortcut);
}

function renderDatasetProgress(job) {
  if (!datasetStatus) return;
  datasetStatus.hidden = false;
  datasetStatus.className = "benchmark-status running benchmark-progress";
  const completed = job.completed_executions || 0;
  const total = Math.max(job.total_executions || 1, 1);
  const percent = Math.min(100, Math.round((completed / total) * 100));
  datasetStatus.innerHTML = "";
  const row = document.createElement("div");
  const label = document.createElement("strong");
  label.textContent =
    job.status === "queued"
      ? "In attesa del modello locale…"
      : `Elaborazione referto ${job.current_report || 1} di ${job.records_total}`;
  const count = document.createElement("span");
  count.textContent = `${completed} / ${job.total_executions} completati`;
  row.append(label, count);
  const track = document.createElement("div");
  track.className = "progress-track";
  const fill = document.createElement("i");
  fill.style.width = `${percent}%`;
  track.append(fill);
  datasetStatus.append(row, track);
}

async function waitForDatasetJob(job) {
  let current = job;
  while (current.status === "queued" || current.status === "running") {
    renderDatasetProgress(current);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const response = await fetch(`/api/analyze/jobs/${encodeURIComponent(current.id)}`);
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Impossibile leggere l'avanzamento.");
    current = data.job;
  }
  if (current.status === "error") throw new Error(current.error || "Elaborazione non completata.");
  return current;
}

function renderDatasetDashboard(result, traceId) {
  if (!datasetDashboard) return;
  datasetDashboard.hidden = false;
  datasetDashboard.replaceChildren();

  const aggregates = result.aggregates || {};

  // Header
  const header = document.createElement("div");
  header.className = "dashboard-header";
  const copy = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = result.source_name || "Dataset elaborato";
  const subtitle = document.createElement("p");
  subtitle.textContent = `${formatTraceDate(new Date().toISOString())} · ${result.processed} referti elaborati · ${result.successes} riusciti · ${result.errors} errori`;
  copy.append(title, subtitle);
  const model = document.createElement("span");
  model.className = "model-chip";
  model.textContent = aggregates.decision_model || "Decision model attivo";
  header.append(copy, model);

  // Metric cards
  const cards = document.createElement("div");
  cards.className = "metric-grid";
  cards.append(
    metricCard("Tempo Mediano", formatDuration(aggregates.median_duration_ms), "per referto"),
    metricCard("Tempo Totale", formatDuration(aggregates.total_duration_ms), `${result.processed} referti`),
    metricCard("Audit Evitati", `${aggregates.audit_skipped_count} su ${result.processed} (${aggregates.audit_skipped_percent}%)`, "audit generativo evitato"),
    metricCard("Chiamate MedGemma", `${aggregates.mean_medgemma_calls} medie`, "rispetto alle 2 ordinarie")
  );

  // Action links
  const actionRow = document.createElement("div");
  actionRow.style.cssText = "display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin: 18px 0 14px;";
  if (result.download_url) {
    const dl = document.createElement("a");
    dl.className = "download";
    dl.href = result.download_url;
    dl.textContent = "Scarica il risultato JSONL";
    actionRow.append(dl);
  }
  const shortcut = traceShortcut(traceId);
  if (shortcut) actionRow.append(shortcut);

  // Performance Table of Every Execution
  const tableWrap = document.createElement("div");
  tableWrap.className = "benchmark-table-wrap";
  const table = document.createElement("table");
  table.className = "benchmark-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["#", "ID Referto", "Tempo", "MedGemma", "Decision Model / Audit", "Token", "Esito", "Spiegazione"].forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    headRow.append(th);
  });
  thead.append(headRow);

  const tbody = document.createElement("tbody");
  (result.items || []).forEach((item) => {
    const row = document.createElement("tr");

    const tdIndex = document.createElement("td");
    tdIndex.textContent = String(item.index);
    const tdId = document.createElement("td");
    tdId.textContent = item.doc_key || `#${item.index}`;
    const tdTime = document.createElement("td");
    tdTime.textContent = formatDuration(item.duration_ms);
    const tdCalls = document.createElement("td");
    tdCalls.textContent = `${item.medgemma_calls} ${item.medgemma_calls === 1 ? "chiamata" : "chiamate"}`;

    const tdAudit = document.createElement("td");
    const badge = document.createElement("span");
    const scoreStr = item.decision_score !== null && item.decision_score !== undefined
      ? ` (${Number(item.decision_score).toFixed(2)})`
      : "";
    if (item.audit_skipped) {
      badge.className = "badge-audit-skipped";
      badge.textContent = `Evitato · ${item.decision_route || "fast"}${scoreStr}`;
    } else {
      badge.className = "badge-audit-executed";
      badge.textContent = `Eseguito · ${item.decision_route || "standard"}${scoreStr}`;
    }
    tdAudit.append(badge);

    const tdTokens = document.createElement("td");
    tdTokens.textContent = `${(item.generated_tokens || 0).toLocaleString("it-IT")} gen`;

    const tdStatus = document.createElement("td");
    tdStatus.textContent = item.status === "ok" ? "Controlli OK" : "Errore";

    const tdAction = document.createElement("td");
    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "view-explanation-btn";
    toggleBtn.textContent = "Mostra";
    tdAction.append(toggleBtn);

    row.append(tdIndex, tdId, tdTime, tdCalls, tdAudit, tdTokens, tdStatus, tdAction);
    tbody.append(row);

    // Expandable explanation row
    const expRow = document.createElement("tr");
    expRow.className = "explanation-row";
    expRow.hidden = true;
    const expCell = document.createElement("td");
    expCell.colSpan = 8;
    const expBox = document.createElement("div");
    expBox.className = "explanation-box";
    if (item.explanation) {
      expBox.append(renderExplanation(item.explanation));
    } else {
      expBox.textContent = item.error || "Nessuna spiegazione generata";
    }
    expCell.append(expBox);
    expRow.append(expCell);
    tbody.append(expRow);

    toggleBtn.addEventListener("click", () => {
      const willShow = expRow.hidden;
      expRow.hidden = !willShow;
      toggleBtn.textContent = willShow ? "Nascondi" : "Mostra";
    });
  });

  table.append(thead, tbody);
  tableWrap.append(table);

  datasetDashboard.append(header, cards, actionRow, tableWrap);
}

datasetForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = datasetForm.querySelector('button[type="submit"]');
  button.disabled = true;
  if (datasetDashboard) datasetDashboard.hidden = true;
  const resultDataset = document.querySelector("#result-dataset");
  if (resultDataset) resultDataset.hidden = true;

  if (datasetStatus) {
    datasetStatus.hidden = false;
    datasetStatus.className = "benchmark-status running";
    datasetStatus.textContent = "Caricamento del dataset e preparazione del modello locale…";
  }
  try {
    const response = await fetch("/api/analyze/dataset", { method: "POST", body: new FormData(datasetForm) });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Impossibile avviare l'elaborazione del dataset.");
    const completed = await waitForDatasetJob(data.job);
    renderDatasetDashboard(completed.result, completed.trace_id);
    if (datasetStatus) datasetStatus.hidden = true;
  } catch (error) {
    if (datasetStatus) {
      datasetStatus.className = "benchmark-status error";
      datasetStatus.textContent = error.message || "Errore durante l'elaborazione del dataset.";
    }
  } finally {
    button.disabled = false;
  }
});

document.querySelectorAll(".analysis-form").forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const target = document.getElementById(form.dataset.result);
    const button = form.querySelector('button[type="submit"]');
    showLoading(target, false);
    button.disabled = true;

    try {
      const response = await fetch(form.dataset.endpoint, { method: "POST", body: new FormData(form) });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        const requestError = new Error(data.error || "Errore inatteso del server.");
        requestError.traceId = data.trace_id;
        throw requestError;
      }
      showSingleResult(target, data.result, data.trace_id, data.glossary);
    } catch (error) {
      showError(target, error.message || "Errore di connessione.", error.traceId);
    } finally {
      button.disabled = false;
    }
  });
});

const traceList = document.querySelector("#trace-list");
const traceDetail = document.querySelector("#trace-detail");
const sourceNames = { pdf: "PDF", image: "Immagine", text: "Testo", dataset: "Dataset", benchmark: "Benchmark" };

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

const benchmarkForm = document.querySelector("#benchmark-form");
const benchmarkStatus = document.querySelector("#benchmark-status");
const benchmarkDashboard = document.querySelector("#benchmark-dashboard");
const benchmarkHistory = document.querySelector("#benchmark-history");
const benchmarkSingleInputs = document.querySelector("#benchmark-single-inputs");
const benchmarkDatasetInputs = document.querySelector("#benchmark-dataset-inputs");
const benchmarkDatasetFile = document.querySelector("#benchmark-dataset-file");
const benchmarkEstimate = document.querySelector("#benchmark-estimate");
const benchmarkRepeats = document.querySelector("#benchmark-repeats");
const benchmarkRepeatsHelp = document.querySelector("#benchmark-repeats-help");
const benchmarkSelectedDatasetName = document.querySelector("#benchmark-selected-dataset-name");
const benchmarkCustomFileContainer = document.querySelector("#benchmark-custom-file-container");
const benchmarkDatasetRadios = document.querySelectorAll('input[name="benchmark_dataset_selector"]');
const benchmarkSampleSize = document.querySelector("#benchmark-sample-size");
const benchmarkSamplePills = document.querySelectorAll(".benchmark-sample-pills .sample-pill");
const benchmarkModeRadios = document.querySelectorAll('input[name="test_mode"]');
const benchmarkSubmitBtn = document.querySelector("#benchmark-submit-btn");

const PREDEFINED_DATASET_META = {
  "radgraph_it_50.jsonl": { count: 50, title: "RadGraph-IT (50 referti)" },
  "mtsamples_radiology.jsonl": { count: 273, title: "MTSamples · Radiologia (273 referti)" },
  "mtsamples_cardio_pulmonary.jsonl": { count: 371, title: "MTSamples · Cardio & Polmoni (371 referti)" },
  "mtsamples_all.jsonl": { count: 4966, title: "MTSamples · Completo (4.966 referti)" },
  "all_datasets_merged.jsonl": { count: 5016, title: "Tutti i Dataset Uniti (5.016 referti)" },
};

function benchmarkSource() {
  return benchmarkForm?.querySelector('input[name="benchmark_source"]:checked')?.value || "single";
}

function benchmarkDatasetSelectorValue() {
  return benchmarkForm?.querySelector('input[name="benchmark_dataset_selector"]:checked')?.value || "radgraph_it_50.jsonl";
}

function benchmarkTestMode() {
  return benchmarkForm?.querySelector('input[name="test_mode"]:checked')?.value || "decision";
}

function benchmarkTestModeLabel(mode) {
  if (mode === "decision") return "Con Decision Model BGE";
  if (mode === "baseline") return "Senza Decision Model (Standard)";
  return "Confronto A/B (Entrambi)";
}

function updateBenchmarkSubmitButton() {
  if (!benchmarkSubmitBtn) return;
  const mode = benchmarkTestMode();
  if (mode === "decision") {
    benchmarkSubmitBtn.textContent = "Avvia test con Decision Model BGE";
  } else if (mode === "baseline") {
    benchmarkSubmitBtn.textContent = "Avvia test senza Decision Model (Standard)";
  } else {
    benchmarkSubmitBtn.textContent = "Avvia confronto A/B";
  }
}

async function updateBenchmarkEstimate() {
  updateBenchmarkSubmitButton();
  if (!benchmarkEstimate || benchmarkSource() !== "dataset") return;
  const selected = benchmarkDatasetSelectorValue();
  const repeats = Math.max(1, Number(benchmarkRepeats?.value || 1));
  const testMode = benchmarkTestMode();
  const modeMultiplier = testMode === "ab" ? 2 : 1;
  const modeName = testMode === "ab" ? "2 modalità (Standard e BGE)" : (testMode === "decision" ? "1 modalità (Decision Model BGE)" : "1 modalità (Standard)");

  let totalRecords = 50;
  let datasetTitle = "Dataset";

  if (selected !== "custom") {
    const meta = PREDEFINED_DATASET_META[selected] || { count: 50, title: selected };
    totalRecords = meta.count;
    datasetTitle = meta.title;
  } else {
    const file = benchmarkDatasetFile?.files?.[0];
    if (!file) {
      benchmarkEstimate.textContent = "Seleziona un file JSONL dal computer per calcolare il numero di elaborazioni.";
      return;
    }
    try {
      const text = await file.text();
      totalRecords = text.split(/\r?\n/).filter((line) => line.trim()).length;
      datasetTitle = `File personalizzato (${totalRecords.toLocaleString("it-IT")} referti)`;
    } catch (_) {
      benchmarkEstimate.textContent = "Il conteggio verrà verificato prima di avviare il test.";
      return;
    }
  }

  const sampleVal = benchmarkSampleSize?.value?.trim();
  const sampleNum = sampleVal ? parseInt(sampleVal, 10) : null;
  const isSampled = sampleNum !== null && !isNaN(sampleNum) && sampleNum > 0 && sampleNum < totalRecords;
  const effectiveRecords = isSampled ? sampleNum : totalRecords;
  const executions = effectiveRecords * repeats * modeMultiplier;

  if (isSampled) {
    benchmarkEstimate.innerHTML = `<strong>${datasetTitle}</strong>: campione casuale di <strong>${effectiveRecords.toLocaleString("it-IT")} referti</strong> (estratti da ${totalRecords.toLocaleString("it-IT")}) × ${repeats} ${repeats === 1 ? "ripetizione" : "ripetizioni"} × ${modeName} = <strong>${executions.toLocaleString("it-IT")} elaborazioni</strong>.`;
  } else {
    benchmarkEstimate.innerHTML = `<strong>${datasetTitle}</strong>: tutti i <strong>${effectiveRecords.toLocaleString("it-IT")} referti</strong> × ${repeats} ${repeats === 1 ? "ripetizione" : "ripetizioni"} × ${modeName} = <strong>${executions.toLocaleString("it-IT")} elaborazioni</strong>.`;
  }
}

function setBenchmarkSource(source) {
  const dataset = source === "dataset";
  if (benchmarkSingleInputs) benchmarkSingleInputs.hidden = dataset;
  if (benchmarkDatasetInputs) benchmarkDatasetInputs.hidden = !dataset;
  const isCustom = benchmarkDatasetSelectorValue() === "custom";
  if (benchmarkDatasetFile) benchmarkDatasetFile.required = dataset && isCustom;
  if (benchmarkRepeats) {
    benchmarkRepeats.max = dataset ? "3" : "5";
    benchmarkRepeats.value = dataset ? "1" : "2";
  }
  if (benchmarkRepeatsHelp) {
    benchmarkRepeatsHelp.textContent = dataset
      ? "Per un dataset inizia da 1; ogni ripetizione moltiplica le elaborazioni per referto."
      : "2 è un buon compromesso tra stabilità e tempo.";
  }
  updateBenchmarkEstimate();
}

benchmarkDatasetRadios.forEach((radio) => {
  radio.addEventListener("change", () => {
    if (benchmarkSelectedDatasetName) benchmarkSelectedDatasetName.value = radio.value;
    document.querySelectorAll("#benchmark-dataset-cards-grid .dataset-card").forEach((card) => {
      card.classList.toggle("active", card.contains(radio));
    });
    const isCustom = radio.value === "custom";
    if (benchmarkCustomFileContainer) benchmarkCustomFileContainer.hidden = !isCustom;
    if (benchmarkDatasetFile) {
      benchmarkDatasetFile.required = isCustom && benchmarkSource() === "dataset";
      if (!isCustom) benchmarkDatasetFile.value = "";
    }
    updateBenchmarkEstimate();
  });
});

benchmarkSamplePills.forEach((pill) => {
  pill.addEventListener("click", () => {
    benchmarkSamplePills.forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    const val = pill.getAttribute("data-sample");
    if (val === "all") {
      if (benchmarkSampleSize) benchmarkSampleSize.value = "";
    } else {
      if (benchmarkSampleSize) benchmarkSampleSize.value = val;
    }
    updateBenchmarkEstimate();
  });
});

benchmarkSampleSize?.addEventListener("input", () => {
  const currentVal = benchmarkSampleSize.value.trim();
  benchmarkSamplePills.forEach((p) => {
    const pVal = p.getAttribute("data-sample");
    if (pVal === "all") {
      p.classList.toggle("active", !currentVal);
    } else {
      p.classList.toggle("active", pVal === currentVal);
    }
  });
  updateBenchmarkEstimate();
});

benchmarkModeRadios.forEach((radio) => {
  radio.addEventListener("change", updateBenchmarkEstimate);
});

benchmarkForm?.querySelectorAll('input[name="benchmark_source"]').forEach((input) => {
  input.addEventListener("change", () => setBenchmarkSource(input.value));
});
benchmarkDatasetFile?.addEventListener("change", updateBenchmarkEstimate);
benchmarkRepeats?.addEventListener("input", updateBenchmarkEstimate);

function metricCard(label, value, detail) {
  const card = document.createElement("article");
  card.className = "metric-card";
  const name = document.createElement("span");
  name.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = value;
  const small = document.createElement("small");
  small.textContent = detail;
  card.append(name, strong, small);
  return card;
}

function comparisonBar(label, baselineValue, decisionValue, formatter) {
  const maxValue = Math.max(baselineValue, decisionValue, 1);
  const row = document.createElement("div");
  row.className = "comparison-row";
  const heading = document.createElement("strong");
  heading.textContent = label;
  const bars = document.createElement("div");
  bars.className = "comparison-bars";
  [["Standard", baselineValue, "baseline"], ["Decision model", decisionValue, "decision"]].forEach(([name, value, kind]) => {
    const item = document.createElement("div");
    item.className = "comparison-bar-item";
    const nameNode = document.createElement("span");
    nameNode.textContent = name;
    const track = document.createElement("div");
    track.className = "bar-track";
    const fill = document.createElement("i");
    fill.className = `bar-fill ${kind}`;
    fill.style.width = `${Math.max(3, value / maxValue * 100)}%`;
    track.append(fill);
    const valueNode = document.createElement("b");
    valueNode.textContent = formatter(value);
    item.append(nameNode, track, valueNode);
    bars.append(item);
  });
  row.append(heading, bars);
  return row;
}

function renderBenchmark(benchmark) {
  if (!benchmarkDashboard) return;
  benchmarkDashboard.hidden = false;
  benchmarkDashboard.replaceChildren();
  const baseline = benchmark.aggregates.baseline;
  const decision = benchmark.aggregates.decision;
  const comparison = benchmark.comparison;
  const testMode = benchmark.configuration?.test_mode || "ab";
  const isDataset = benchmark.kind === "dataset" || Boolean(benchmark.dataset);

  const header = document.createElement("div");
  header.className = "dashboard-header";
  const copy = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = benchmark.source_name;
  const subtitle = document.createElement("p");

  let modeText = "Confronto A/B";
  if (testMode === "decision") modeText = "Con Decision Model BGE";
  else if (testMode === "baseline") modeText = "Senza Decision Model (Standard)";

  if (isDataset) {
    const recordsText = benchmark.dataset.sampled
      ? `Campione di ${benchmark.dataset.records} referti casuali (su ${benchmark.dataset.total_available})`
      : `${benchmark.dataset.records} referti`;
    subtitle.textContent = `${formatTraceDate(benchmark.started_at)} · ${recordsText} · ${modeText} · ${benchmark.configuration.total_executions} elaborazioni`;
  } else {
    subtitle.textContent = `${formatTraceDate(benchmark.started_at)} · Singolo referto · ${modeText} · ${benchmark.configuration.repeats} ripetizioni`;
  }
  copy.append(title, subtitle);

  const modelChipContainer = document.createElement("div");
  modelChipContainer.style.display = "flex";
  modelChipContainer.style.gap = "6px";
  modelChipContainer.style.alignItems = "center";

  const medgemmaChip = document.createElement("span");
  medgemmaChip.className = "model-chip";
  medgemmaChip.textContent = benchmark.configuration.model || "medgemma";
  modelChipContainer.append(medgemmaChip);

  if (testMode !== "baseline") {
    const bgeChip = document.createElement("span");
    bgeChip.className = "model-chip";
    bgeChip.style.background = "var(--warm)";
    bgeChip.style.color = "#6d5929";
    bgeChip.textContent = benchmark.configuration.decision_model || "bge-m3:latest";
    modelChipContainer.append(bgeChip);
  }
  header.append(copy, modelChipContainer);

  const cards = document.createElement("div");
  cards.className = "metric-grid";

  if (testMode === "ab") {
    const speedLabel = comparison.speedup_percent >= 0
      ? `${comparison.speedup_percent.toFixed(1)}%`
      : `${Math.abs(comparison.speedup_percent).toFixed(1)}% più lento`;
    cards.append(
      metricCard("Standard", formatDuration(baseline.median_duration_ms), "mediana end-to-end"),
      metricCard("Decision model", formatDuration(decision.median_duration_ms), "mediana end-to-end"),
      metricCard("Variazione", speedLabel, `${formatDuration(Math.abs(comparison.median_saved_ms))} di differenza`),
      metricCard("Chiamate MedGemma", `${comparison.mean_medgemma_calls_saved.toFixed(1)} risparmiate`, "media per esecuzione")
    );
    if (isDataset) {
      cards.classList.add("dataset-metrics");
      cards.append(
        metricCard("Referti più veloci", `${comparison.reports_faster} su ${benchmark.dataset.records}`, "decision model più rapido"),
        metricCard("Audit evitato", `${comparison.reports_with_audit_skipped} su ${benchmark.dataset.records}`, "almeno una volta per referto")
      );
    }
  } else if (testMode === "decision") {
    const auditSkippedCount = isDataset ? comparison.reports_with_audit_skipped : (decision.audit_skip_rate > 0 ? 1 : 0);
    const totalReports = isDataset ? benchmark.dataset.records : 1;
    cards.classList.add("dataset-metrics");
    cards.append(
      metricCard("Decision Model BGE", formatDuration(decision.median_duration_ms), "mediana end-to-end"),
      metricCard("Audit evitato", `${(decision.audit_skip_rate * 100).toFixed(0)}%`, `${auditSkippedCount} su ${totalReports} referti`),
      metricCard("Chiamate MedGemma", `${decision.mean_medgemma_calls.toFixed(1)} / ref`, "chiamate al modello"),
      metricCard("Token generati", `${Math.round(decision.mean_generated_tokens).toLocaleString("it-IT")}`, "media per referto"),
      metricCard("Controlli conformità", `${(decision.success_rate * 100).toFixed(0)}% OK`, "regole cliniche rispettate"),
      metricCard("Referti analizzati", `${totalReports}`, benchmark.dataset?.sampled ? `campione casuale su ${benchmark.dataset.total_available}` : "completati con successo")
    );
  } else {
    const totalReports = isDataset ? benchmark.dataset.records : 1;
    cards.classList.add("dataset-metrics");
    cards.append(
      metricCard("Standard (Senza BGE)", formatDuration(baseline.median_duration_ms), "mediana end-to-end"),
      metricCard("Audit di sicurezza", "100%", "eseguito su tutti i referti"),
      metricCard("Chiamate MedGemma", `${baseline.mean_medgemma_calls.toFixed(1)} / ref`, "draft + audit"),
      metricCard("Token generati", `${Math.round(baseline.mean_generated_tokens).toLocaleString("it-IT")}`, "media per referto"),
      metricCard("Controlli conformità", `${(baseline.success_rate * 100).toFixed(0)}% OK`, "regole cliniche rispettate"),
      metricCard("Referti analizzati", `${totalReports}`, benchmark.dataset?.sampled ? `campione casuale su ${benchmark.dataset.total_available}` : "completati con successo")
    );
  }

  const chart = document.createElement("section");
  chart.className = "comparison-chart";
  const chartTitle = document.createElement("h4");

  if (testMode === "ab") {
    chartTitle.textContent = "Confronto aggregato (Standard vs Decision Model)";
    chart.append(
      chartTitle,
      comparisonBar("Tempo mediano", baseline.median_duration_ms, decision.median_duration_ms, formatDuration),
      comparisonBar("Chiamate MedGemma", baseline.mean_medgemma_calls, decision.mean_medgemma_calls, (value) => value.toFixed(1)),
      comparisonBar("Token generati", baseline.mean_generated_tokens, decision.mean_generated_tokens, (value) => Math.round(value).toLocaleString("it-IT"))
    );
  } else {
    const activeAgg = testMode === "decision" ? decision : baseline;
    const modeName = testMode === "decision" ? "Decision Model BGE" : "Standard (Baseline)";
    chartTitle.textContent = `Metriche di prestazione · ${modeName}`;
    const row = document.createElement("div");
    row.style.display = "grid";
    row.style.gridTemplateColumns = "repeat(auto-fit, minmax(200px, 1fr))";
    row.style.gap = "14px";
    row.style.marginTop = "12px";

    const makeStat = (t, val, desc) => {
      const box = document.createElement("div");
      box.style.padding = "10px 14px";
      box.style.background = "#ffffff";
      box.style.borderRadius = "9px";
      box.style.border = "1px solid var(--line)";
      box.innerHTML = `<span style="font-size:10px;color:var(--muted);text-transform:uppercase;font-weight:700;">${t}</span><strong style="display:block;font-size:16px;margin:4px 0 2px;">${val}</strong><small style="color:var(--muted);font-size:10px;">${desc}</small>`;
      return box;
    };

    row.append(
      makeStat("Range latenza", `${formatDuration(activeAgg.min_duration_ms)} – ${formatDuration(activeAgg.max_duration_ms)}`, `Media: ${formatDuration(activeAgg.mean_duration_ms)}`),
      makeStat("Prompt Tokens", `${Math.round(activeAgg.mean_prompt_tokens).toLocaleString("it-IT")}`, "Token di contesto medi"),
      makeStat("Generated Tokens", `${Math.round(activeAgg.mean_generated_tokens).toLocaleString("it-IT")}`, "Token di risposta medi"),
      makeStat("Audit di sicurezza", testMode === "decision" ? `${(activeAgg.audit_skip_rate * 100).toFixed(0)}% skippati` : "100% eseguiti", testMode === "decision" ? `${(activeAgg.audit_rate * 100).toFixed(0)}% verificati` : "Pipeline standard")
    );
    chart.append(chartTitle, row);
  }

  const tableWrap = document.createElement("div");
  tableWrap.className = "benchmark-table-wrap";
  const table = document.createElement("table");
  table.className = "benchmark-table";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");

  let headings = [];
  if (testMode === "ab") {
    headings = isDataset
      ? ["Referto", "ID", "Standard", "Decision", "Variazione", "Audit evitato", "Esito"]
      : ["Prova", "Modalità", "Tempo", "MedGemma", "Audit", "Esito"];
  } else if (testMode === "decision") {
    headings = isDataset
      ? ["Referto", "ID", "Tempo", "MedGemma", "Decisione / Audit", "Token", "Esito"]
      : ["Ripetizione", "Tempo", "MedGemma", "Decisione / Audit", "Token", "Esito"];
  } else {
    headings = isDataset
      ? ["Referto", "ID", "Tempo", "MedGemma", "Audit", "Token", "Esito"]
      : ["Ripetizione", "Tempo", "MedGemma", "Audit", "Token", "Esito"];
  }

  headings.forEach((label) => {
    const th = document.createElement("th"); th.textContent = label; headRow.append(th);
  });
  thead.append(headRow);
  const tbody = document.createElement("tbody");

  if (isDataset) {
    benchmark.items.forEach((item) => {
      const row = document.createElement("tr");
      const itemSpeed = item.comparison.speedup_percent;
      const auditSkipped = item.runs.some((run) => run.mode === "decision" && run.audit_skipped);
      const success = item.runs.every((run) => run.success);

      let cells = [];
      if (testMode === "ab") {
        cells = [
          String(item.index),
          item.record_id || `#${item.index}`,
          formatDuration(item.aggregates.baseline.median_duration_ms),
          formatDuration(item.aggregates.decision.median_duration_ms),
          `${itemSpeed >= 0 ? "+" : ""}${itemSpeed.toFixed(1)}%`,
          auditSkipped ? "Sì" : "No",
          success ? "Controlli OK" : "Errore",
        ];
      } else if (testMode === "decision") {
        cells = [
          String(item.index),
          item.record_id || `#${item.index}`,
          formatDuration(item.aggregates.decision.median_duration_ms),
          item.aggregates.decision.mean_medgemma_calls.toFixed(1),
          auditSkipped ? "Evitato (Fast route)" : "Eseguito (Standard)",
          Math.round(item.aggregates.decision.mean_generated_tokens).toLocaleString("it-IT"),
          success ? "Controlli OK" : "Errore",
        ];
      } else {
        cells = [
          String(item.index),
          item.record_id || `#${item.index}`,
          formatDuration(item.aggregates.baseline.median_duration_ms),
          item.aggregates.baseline.mean_medgemma_calls.toFixed(1),
          "Eseguito (Standard)",
          Math.round(item.aggregates.baseline.mean_generated_tokens).toLocaleString("it-IT"),
          success ? "Controlli OK" : "Errore",
        ];
      }
      cells.forEach((value) => { const cell = document.createElement("td"); cell.textContent = value; row.append(cell); });
      tbody.append(row);
    });
  } else {
    benchmark.runs.forEach((run) => {
      const row = document.createElement("tr");
      let cells = [];
      if (testMode === "ab") {
        cells = [
          `${run.repeat}.${run.order}`,
          run.mode === "baseline" ? "Standard" : "Decision model",
          formatDuration(run.duration_ms),
          String(run.medgemma_calls),
          run.audit_called ? "Eseguito" : "Evitato",
          run.success ? "Controlli OK" : "Errore",
        ];
      } else if (testMode === "decision") {
        cells = [
          `${run.repeat}`,
          formatDuration(run.duration_ms),
          String(run.medgemma_calls),
          run.audit_skipped ? "Evitato (Fast route)" : "Eseguito (Standard)",
          String(run.generated_tokens),
          run.success ? "Controlli OK" : "Errore",
        ];
      } else {
        cells = [
          `${run.repeat}`,
          formatDuration(run.duration_ms),
          String(run.medgemma_calls),
          "Eseguito (Standard)",
          String(run.generated_tokens),
          run.success ? "Controlli OK" : "Errore",
        ];
      }
      cells.forEach((value) => { const cell = document.createElement("td"); cell.textContent = value; row.append(cell); });
      tbody.append(row);
    });
  }
  table.append(thead, tbody);
  tableWrap.append(table);
  benchmarkDashboard.append(header, cards, chart, tableWrap);
}

function renderBenchmarkProgress(job) {
  if (!benchmarkStatus) return;
  benchmarkStatus.hidden = false;
  benchmarkStatus.className = "benchmark-status running benchmark-progress";
  const completed = job.completed_executions || 0;
  const total = Math.max(job.total_executions || 1, 1);
  const percent = Math.min(100, Math.round(completed / total * 100));
  benchmarkStatus.innerHTML = "";
  const row = document.createElement("div");
  const label = document.createElement("strong");
  const modeBadge = job.current_mode === "decision" ? " (BGE)" : (job.current_mode === "baseline" ? " (Standard)" : "");
  label.textContent = job.status === "queued" ? "In attesa del modello locale" : `Referto ${job.current_report || 1} di ${job.records_total}${modeBadge}`;
  const count = document.createElement("span");
  count.textContent = `${completed} / ${job.total_executions} elaborazioni`;
  row.append(label, count);
  const track = document.createElement("div");
  track.className = "progress-track";
  const fill = document.createElement("i");
  fill.style.width = `${percent}%`;
  track.append(fill);
  benchmarkStatus.append(row, track);
}

async function waitForBenchmarkJob(job) {
  let current = job;
  while (current.status === "queued" || current.status === "running") {
    renderBenchmarkProgress(current);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const response = await fetch(`/api/benchmark/jobs/${encodeURIComponent(current.id)}`);
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Impossibile leggere l’avanzamento.");
    current = data.job;
  }
  if (current.status === "error") throw new Error(current.error || "Benchmark non completato.");
  return current;
}

async function loadBenchmarkDetail(id) {
  if (benchmarkStatus) {
    benchmarkStatus.hidden = false;
    benchmarkStatus.className = "benchmark-status";
    benchmarkStatus.textContent = "Caricamento del confronto…";
  }
  try {
    const response = await fetch(`/api/benchmarks/${encodeURIComponent(id)}`);
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Confronto non disponibile.");
    renderBenchmark(data.benchmark);
    if (benchmarkStatus) benchmarkStatus.hidden = true;
  } catch (error) {
    if (benchmarkStatus) {
      benchmarkStatus.className = "benchmark-status error";
      benchmarkStatus.textContent = error.message;
    }
  }
}

async function loadBenchmarks() {
  if (!benchmarkHistory) return;
  benchmarkHistory.innerHTML = '<p class="empty-state">Caricamento dei confronti…</p>';
  try {
    const response = await fetch("/api/benchmarks");
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Cronologia non disponibile.");
    benchmarkHistory.replaceChildren();
    if (!data.benchmarks.length) {
      benchmarkHistory.innerHTML = '<p class="empty-state">Avvia il primo confronto per vedere i dati.</p>';
      return;
    }
    data.benchmarks.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "benchmark-history-item";
      const copy = document.createElement("span");
      const title = document.createElement("strong"); title.textContent = item.source_name;
      const meta = document.createElement("small");
      const repeatLabel = item.repeats === 1 ? "ripetizione" : "ripetizioni";
      const testMode = item.test_mode || (item.speedup_percent !== 0 ? "ab" : "single");
      let modeTag = "A/B";
      if (testMode === "decision") modeTag = "BGE";
      else if (testMode === "baseline") modeTag = "Standard";

      meta.textContent = item.kind === "dataset"
        ? `${formatTraceDate(item.started_at)} · ${item.records} referti · ${modeTag} · ${item.repeats} ${repeatLabel}`
        : `${formatTraceDate(item.started_at)} · ${modeTag} · ${item.repeats} ${repeatLabel}`;
      copy.append(title, meta);
      const delta = document.createElement("b");
      if (testMode === "decision") {
        delta.className = "mode-badge decision";
        delta.textContent = `BGE · ${formatDuration(item.decision_median_ms)}`;
      } else if (testMode === "baseline") {
        delta.className = "mode-badge baseline";
        delta.textContent = `Std · ${formatDuration(item.baseline_median_ms)}`;
      } else {
        delta.className = item.speedup_percent >= 0 ? "positive" : "negative";
        delta.textContent = `${item.speedup_percent >= 0 ? "+" : ""}${item.speedup_percent.toFixed(1)}%`;
      }
      button.append(copy, delta);
      button.addEventListener("click", () => loadBenchmarkDetail(item.id));
      benchmarkHistory.append(button);
    });
    if (benchmarkDashboard?.hidden) await loadBenchmarkDetail(data.benchmarks[0].id);
  } catch (error) {
    benchmarkHistory.innerHTML = "";
    const message = document.createElement("p");
    message.className = "empty-state error-text";
    message.textContent = error.message;
    benchmarkHistory.append(message);
  }
}

benchmarkForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = benchmarkSubmitBtn || benchmarkForm.querySelector('button[type="submit"]');
  button.disabled = true;
  const testMode = benchmarkTestMode();
  if (benchmarkStatus) {
    benchmarkStatus.hidden = false;
    benchmarkStatus.className = "benchmark-status running";
    if (benchmarkSource() === "dataset") {
      benchmarkStatus.textContent = "Caricamento del dataset, estrazione campione casuale e avvio elaborazione…";
    } else {
      benchmarkStatus.textContent = testMode === "ab"
        ? "Confronto in corso: entrambe le modalità stanno elaborando lo stesso referto…"
        : `Test in corso (${benchmarkTestModeLabel(testMode)})…`;
    }
  }
  try {
    const datasetMode = benchmarkSource() === "dataset";
    const endpoint = datasetMode ? "/api/benchmark/dataset" : "/api/benchmark";
    const response = await fetch(endpoint, { method: "POST", body: new FormData(benchmarkForm) });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Benchmark non completato.");
    const completed = datasetMode ? await waitForBenchmarkJob(data.job) : data;
    renderBenchmark(completed.benchmark);
    const shortcut = traceShortcut(datasetMode ? completed.trace_id : data.trace_id);
    if (shortcut) benchmarkDashboard.append(shortcut);
    if (benchmarkStatus) benchmarkStatus.hidden = true;
    await loadBenchmarks();
  } catch (error) {
    if (benchmarkStatus) {
      benchmarkStatus.className = "benchmark-status error";
      benchmarkStatus.textContent = error.message || "Errore di connessione.";
    }
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#refresh-benchmarks")?.addEventListener("click", loadBenchmarks);
updateBenchmarkEstimate();
