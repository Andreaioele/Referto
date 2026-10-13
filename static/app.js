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
    if (name === "facilities") showFacilitiesPanel();
    if (name === "reports") loadReports();
    if (name !== "explain") stopCamera();
    else if (document.querySelector(".mode.active")?.dataset.mode === "photo") startCamera();
    if (name === "medications") loadMedications();
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
  target.innerHTML = `<h3>Sto leggendo il tuo referto…</h3><p>${datasetMode ? "Il dataset può richiedere diversi minuti. Non chiudere questa pagina." : "Può volerci qualche minuto. Non chiudere questa pagina: la spiegazione comparirà qui sotto."}</p>`;
}

function traceShortcut(traceId) {
  if (!traceId) return null;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "trace-shortcut advanced-only";
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
  title.textContent = "Non sono riuscito a spiegare il referto";
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

// Titoli più diretti per chi legge; il testo del modello resta invariato.
const explanationLabels = {
  "SINTESI": "In breve",
  "SPIEGAZIONE IN PAROLE SEMPLICI": "Cosa dice il referto",
  "INCERTEZZE O LIMITI DEL REFERTO": "Cosa non è sicuro",
  "INDICAZIONI RIPORTATE NEL DOCUMENTO": "Cosa scrive di fare il medico",
  "NOTA INFORMATIVA": "Da sapere",
};

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
      heading.textContent = explanationLabels[section.heading] || section.heading;
      block.append(heading);
    }
    const paragraph = document.createElement("p");
    paragraph.textContent = section.lines.join(" ");
    // Indicazioni copiate dal documento molto lunghe (spesso in inglese): a
    // scomparsa, per non sommergere chi legge.
    if (section.heading === "INDICAZIONI RIPORTATE NEL DOCUMENTO" && paragraph.textContent.length > 450) {
      const fold = document.createElement("details");
      fold.className = "long-advice";
      const summary = document.createElement("summary");
      summary.textContent = "Il documento contiene indicazioni lunghe: premi qui per leggerle così come sono scritte";
      fold.append(summary, paragraph);
      block.append(fold);
    } else {
      block.append(paragraph);
    }
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
  [["‹ Indietro", -1], ["Avanti ›", 1]].forEach(([label, step]) => {
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
  card.append(header, title);

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
    note.textContent = "In caso di dubbio chiedi al tuo medico.";
    card.append(note);
  } else {
    block("In parole semplici", "Spiegazione semplice non ancora disponibile: apri «Dettagli per chi vuole approfondire».", "simple pending");
  }
  const technical = document.createElement("details");
  technical.className = "glossary-technical";
  const technicalSummary = document.createElement("summary");
  technicalSummary.textContent = "Dettagli per chi vuole approfondire";
  technical.append(technicalSummary);
  [["Nome inglese", term.en !== glossaryTermName(term) ? term.en : ""], ["Parole comuni (inglese)", (term.lay_en || []).join(" · ")], ["Definizione di riferimento (HPO, inglese)", term.definition_en]].forEach(([label, text]) => {
    if (!text) return;
    const section = document.createElement("section");
    section.className = "glossary-block";
    const heading = document.createElement("h5");
    heading.textContent = label;
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    section.append(heading, paragraph);
    technical.append(section);
  });
  card.append(technical);

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
  technical.append(footer);
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
  const box = el("div", "more-body");
  box.append(el("p", "glossary-intro", "Premi su una parola per leggere cosa significa. Se una parola è nell’elenco non vuol dire che tu abbia quel problema: il referto può nominarla anche per escluderlo."));
  box.append(renderGlossaryViewer(terms));
  return box;
}

function moreItem(title, content, open = false) {
  const item = el("details", "more-item");
  item.open = open;
  item.append(el("summary", "", title), content);
  return item;
}

function renderMoreSections({ glossary, medications, branch }) {
  const section = el("section", "more");
  section.append(el("h3", "more-title", "Per saperne di più"));
  if (glossary?.length) {
    section.append(moreItem(`Terminologie (${glossary.length})`, renderResultGlossary(glossary)));
  }
  if (medications) {
    const count = medications.items?.length || 0;
    section.append(moreItem(count ? `Farmaci scritti nel referto (${count})` : "Farmaci scritti nel referto", renderReportMedications(medications)));
  }
  if (branch) {
    section.append(moreItem(`Chi se ne occupa: ${branch.label}`, renderResultBranch(branch)));
  }
  return section.children.length > 1 ? section : null;
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

const facilitiesBranch = document.querySelector("#facilities-branch");
const facilitiesStatus = document.querySelector("#facilities-status");
const facilitiesList = document.querySelector("#facilities-list");
const facilitiesMapElement = document.querySelector("#facilities-map");
const matchLabels = {
  specialita: "Si occupa di questa specialità",
  nome: "Si occupa di questa specialità",
  ospedale: "Ospedale",
};
const matchColors = { specialita: "#176b58", nome: "#3f8f7a", ospedale: "#8a8f8d" };
let facilitiesMap = null;
let facilitiesLayer = null;

async function loadBranches() {
  if (!facilitiesBranch) return;
  try {
    const response = await fetch("/api/branches");
    const data = await response.json();
    (data.branches || []).forEach((branch) => {
      const option = document.createElement("option");
      option.value = branch.id;
      option.textContent = branch.label;
      facilitiesBranch.append(option);
    });
    facilitiesBranch.value = "medicina-generale";
  } catch {
    facilitiesStatus.textContent = "Impossibile caricare l’elenco delle branche.";
  }
}
loadBranches();

function activatePanel(name) {
  const tab = document.querySelector(`.tab[data-tab="${name}"]`);
  tab?.click();
}

function renderResultBranch(branch) {
  const section = document.createElement("section");
  section.className = "result-branch";
  const label = document.createElement("p");
  label.className = "result-branch-label";
  label.textContent = "Specialità del referto";
  const name = document.createElement("strong");
  name.textContent = branch.label;
  const how = document.createElement("small");
  how.textContent = "È la specialità medica che si occupa di questo tipo di esame.";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary";
  button.textContent = "Cerca specialisti vicino a me";
  button.addEventListener("click", () => {
    facilitiesBranch.value = branch.id;
    document.querySelector("#facilities-branch-origin").textContent = "Scelta in base al tuo referto. Puoi cambiarla.";
    activatePanel("facilities");
    document.querySelector("#facilities-place")?.focus();
  });
  const text = document.createElement("div");
  text.append(label, name, how);
  section.append(text, button);
  return section;
}

function showFacilitiesPanel() {
  if (!facilitiesMap) return;
  setTimeout(() => facilitiesMap.invalidateSize(), 50);
}

function ensureFacilitiesMap() {
  if (facilitiesMap || !window.L) return facilitiesMap;
  facilitiesMapElement.hidden = false;
  facilitiesMap = L.map(facilitiesMapElement, { scrollWheelZoom: false });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; contributori di OpenStreetMap",
  }).addTo(facilitiesMap);
  facilitiesLayer = L.layerGroup().addTo(facilitiesMap);
  return facilitiesMap;
}

function facilityPopup(facility) {
  const box = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = facility.name;
  const detail = document.createElement("div");
  detail.textContent = `${matchLabels[facility.match]} · ${facility.distance_km} km`;
  box.append(name, detail);
  if (facility.address) {
    const address = document.createElement("div");
    address.textContent = facility.address;
    box.append(address);
  }
  return box;
}

function renderFacilities(data, placeLabel) {
  facilitiesList.replaceChildren();
  const map = ensureFacilitiesMap();
  const center = [data.center.lat, data.center.lon];
  const markers = {};
  if (map) {
    facilitiesLayer.clearLayers();
    L.circleMarker(center, { radius: 7, color: "#0f5143", fillColor: "#ffffff", fillOpacity: 1, weight: 3 })
      .bindPopup(placeLabel)
      .addTo(facilitiesLayer);
  }
  data.facilities.forEach((facility, index) => {
    if (map) {
      markers[index] = L.circleMarker([facility.lat, facility.lon], {
        radius: 8,
        color: "#ffffff",
        weight: 2,
        fillColor: matchColors[facility.match],
        fillOpacity: 0.95,
      }).bindPopup(facilityPopup(facility)).addTo(facilitiesLayer);
    }
    const item = document.createElement("li");
    item.className = `facility facility-${facility.match}`;
    const title = document.createElement("button");
    title.type = "button";
    title.className = "facility-name";
    title.textContent = facility.name;
    title.addEventListener("click", () => {
      if (!map) return;
      map.setView([facility.lat, facility.lon], 16);
      markers[index].openPopup();
      facilitiesMapElement.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const meta = document.createElement("p");
    meta.className = "facility-meta";
    meta.textContent = [matchLabels[facility.match], `${facility.distance_km} km`, facility.address].filter(Boolean).join(" · ");
    const links = document.createElement("p");
    links.className = "facility-links";
    const addLink = (href, text) => {
      const link = document.createElement("a");
      link.href = href;
      link.textContent = text;
      if (!href.startsWith("tel:")) {
        link.target = "_blank";
        link.rel = "noopener";
      }
      links.append(link);
    };
    if (facility.phone) addLink(`tel:${facility.phone.replace(/\s+/g, "")}`, facility.phone);
    if (facility.website) addLink(facility.website, "Sito web");
    addLink(`https://www.openstreetmap.org/directions?to=${facility.lat}%2C${facility.lon}`, "Come arrivare");
    addLink(facility.osm_url, "Scheda OpenStreetMap");
    links.lastChild.classList.add("advanced-only");
    item.append(title, meta, links);
    facilitiesList.append(item);
  });
  if (map) {
    const points = [center, ...data.facilities.map((facility) => [facility.lat, facility.lon])];
    if (points.length > 1) map.fitBounds(points, { padding: [30, 30], maxZoom: 15 });
    else map.setView(center, 13);
    setTimeout(() => map.invalidateSize(), 50);
  }
  const specific = data.facilities.filter((facility) => facility.match !== "ospedale").length;
  facilitiesStatus.className = "facilities-status";
  facilitiesStatus.textContent = data.facilities.length
    ? `Ho trovato ${data.facilities.length} posti entro ${data.radius_km} km da ${placeLabel}. ${specific ? `${specific === 1 ? "Il primo si occupa" : `I primi ${specific} si occupano`} di ${data.branch.label.toLowerCase()}, gli altri sono ospedali.` : `Sono ospedali: chiedi lì del reparto di ${data.branch.label.toLowerCase()}.`}`
    : `Non ho trovato posti entro ${data.radius_km} km. Prova a scegliere una distanza più grande.`;
}

async function searchFacilities(lat, lon, placeLabel) {
  const params = new URLSearchParams({
    lat,
    lon,
    branch: facilitiesBranch.value,
    radius: document.querySelector("#facilities-radius").value,
  });
  facilitiesStatus.className = "facilities-status loading";
  facilitiesStatus.textContent = "Sto cercando… può volerci un minuto.";
  const response = await fetch(`/api/facilities?${params}`);
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "Errore inatteso del server.");
  renderFacilities(data, placeLabel);
}

function facilitiesError(error) {
  facilitiesStatus.className = "facilities-status error";
  facilitiesStatus.textContent = error.message || "Errore di connessione.";
}

document.querySelector("#facilities-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = document.querySelector("#facilities-place").value.trim();
  if (!query) {
    facilitiesError(new Error("Scrivi la tua città, per esempio Milano. Oppure premi «Usa la mia posizione»."));
    return;
  }
  const button = event.submitter;
  if (button) button.disabled = true;
  try {
    facilitiesStatus.className = "facilities-status loading";
    facilitiesStatus.textContent = "Sto cercando la tua città…";
    const response = await fetch(`/api/geocode?${new URLSearchParams({ q: query })}`);
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Zona non trovata.");
    await searchFacilities(data.place.lat, data.place.lon, data.place.label.split(",")[0]);
  } catch (error) {
    facilitiesError(error);
  } finally {
    if (button) button.disabled = false;
  }
});

document.querySelector("#facilities-gps")?.addEventListener("click", () => {
  if (!navigator.geolocation) {
    facilitiesError(new Error("Il browser non permette di leggere la posizione: scrivi la tua città."));
    return;
  }
  facilitiesStatus.className = "facilities-status loading";
  facilitiesStatus.textContent = "Chiedo la posizione al browser…";
  navigator.geolocation.getCurrentPosition(
    (position) => searchFacilities(position.coords.latitude, position.coords.longitude, "la tua posizione").catch(facilitiesError),
    () => facilitiesError(new Error("Posizione non disponibile o permesso negato: scrivi la tua città.")),
    { timeout: 15000, maximumAge: 300000 },
  );
});


/* ---------- Foglietto illustrativo AIFA ---------- */
const leafletModal = document.querySelector("#leaflet-modal");
const leafletFrame = document.querySelector("#leaflet-frame");

function openLeaflet(product, type = "FI") {
  const url = type === "RCP" ? product.rcp_url : product.foglietto_url;
  document.querySelector("#leaflet-kind").textContent = type === "RCP" ? "RIASSUNTO DELLE CARATTERISTICHE DEL PRODOTTO" : "FOGLIETTO ILLUSTRATIVO";
  document.querySelector("#leaflet-title").textContent = `${product.nome} · ${product.ditta}`;
  document.querySelector("#leaflet-open").href = url;
  leafletFrame.src = url;
  leafletModal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeLeaflet() {
  leafletModal.hidden = true;
  leafletFrame.src = "about:blank";
  document.body.classList.remove("modal-open");
}
document.querySelector("#leaflet-close")?.addEventListener("click", closeLeaflet);
leafletModal?.addEventListener("click", (event) => { if (event.target === leafletModal) closeLeaflet(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !leafletModal.hidden) closeLeaflet(); });

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function renderProduct(product) {
  const row = el("li", "product");
  const info = el("div", "product-info");
  info.append(el("strong", "", product.nome), el("small", "", [product.ditta, product.forme.join(", "), product.fornitura].filter(Boolean).join(" · ")));
  const actions = el("div", "product-actions");
  const leaflet = el("button", "primary small", "Foglietto illustrativo");
  leaflet.type = "button";
  leaflet.addEventListener("click", () => openLeaflet(product, "FI"));
  const rcp = el("button", "secondary small", "RCP");
  rcp.type = "button";
  rcp.title = "Riassunto delle caratteristiche del prodotto (per i professionisti)";
  rcp.addEventListener("click", () => openLeaflet(product, "RCP"));
  actions.append(leaflet, rcp);
  row.append(info, actions);
  return row;
}

function renderAifa(aifa) {
  const box = el("div", "aifa-box");
  if (!aifa) {
    box.append(el("p", "aifa-missing", "Non trovato nel prontuario AIFA: potrebbe non essere in commercio in Italia o essere scritto con un nome diverso. Cercalo qui sotto nel prontuario."));
    return box;
  }
  box.append(el("p", "aifa-title", `Principio attivo: ${aifa.principio_attivo} · ATC ${aifa.atc}`));
  const list = el("ul", "product-list");
  aifa.prodotti.forEach((product, index) => {
    const row = renderProduct(product);
    row.hidden = index >= 3;
    list.append(row);
  });
  box.append(list);
  if (aifa.prodotti.length > 3) {
    const more = el("button", "link-button", `Mostra altri ${aifa.prodotti.length - 3} farmaci con questo principio attivo`);
    more.type = "button";
    more.addEventListener("click", () => {
      [...list.children].forEach((row) => { row.hidden = false; });
      more.remove();
    });
    box.append(more);
  }
  if (aifa.prodotti_totali > aifa.prodotti.length) {
    box.append(el("p", "aifa-more", `Altri ${aifa.prodotti_totali - aifa.prodotti.length} farmaci con lo stesso principio attivo: cercali nel prontuario qui sotto.`));
  }
  return box;
}

function medicationFacts(item) {
  const facts = el("dl", "med-facts");
  [["Quanto", [item.dose, item.frequenza, item.via].filter(Boolean).join(" · ")], ["Perché", item.motivo]].forEach(([label, value]) => {
    facts.append(el("dt", "", label), el("dd", value ? "" : "missing", value || "Non scritto nel referto"));
  });
  return facts;
}

function leafletButton(aifa) {
  if (!aifa?.prodotti?.length) return el("p", "aifa-missing", "Foglietto non trovato: questo farmaco potrebbe non essere in commercio in Italia con questo nome.");
  const button = el("button", "primary leaflet-button", "Leggi il foglietto illustrativo");
  button.type = "button";
  button.addEventListener("click", () => openLeaflet(aifa.prodotti[0], "FI"));
  return button;
}

function medicationDetails(item, aifa, extra) {
  const details = el("details", "med-details");
  details.append(el("summary", "", "Altre informazioni"));
  if (item?.citazione) details.append(el("p", "med-label", "Frase del referto"), el("blockquote", "med-quote", item.citazione));
  if (item?.uso) details.append(el("p", "med-written", `Nel referto risulta: ${item.uso}`));
  if (extra) details.append(extra);
  if (aifa) details.append(el("p", "med-label", "Farmaci in commercio con questo principio attivo"));
  details.append(renderAifa(aifa));
  return details;
}

function medicationTitle(item, aifa) {
  const name = aifa?.principio_attivo || item.nome;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function renderMedicationItem(item) {
  const card = el("article", "med-card");
  card.append(el("h4", "", medicationTitle(item, item.aifa)));
  if (item.aifa && normalizeName(item.nome) !== normalizeName(item.aifa.principio_attivo)) {
    card.append(el("p", "med-written", `Nel referto è scritto: ${item.nome}`));
  }
  card.append(medicationFacts(item), leafletButton(item.aifa), medicationDetails(item, item.aifa));
  return card;
}

function normalizeName(text) {
  return (text || "").toLowerCase().normalize("NFD").replace(/[^a-z]/g, "");
}

function renderReportMedications(medications) {
  const box = el("div", "more-body");
  if (!medications?.items?.length) {
    box.append(el("p", "glossary-intro", "Nel referto non sono scritti farmaci."));
    return box;
  }
  box.append(el("p", "glossary-intro", "Sono i farmaci scritti nel referto, non consigli di Referto."));
  medications.items.forEach((item) => box.append(renderMedicationItem(item)));
  return box;
}

/* ---------- Referti ---------- */
const reportsList = document.querySelector("#reports-list");
const reportDetail = document.querySelector("#report-detail");

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "Errore inatteso del server.");
  return data;
}

async function loadReports() {
  if (!reportsList) return;
  reportDetail.hidden = true;
  reportsList.hidden = false;
  try {
    const data = await fetchJson("/api/referti");
    reportsList.replaceChildren();
    if (!data.reports.length) {
      reportsList.append(el("p", "empty-state", "Non ci sono ancora referti. Scegli «File PDF», «Foto» o «Testo» a sinistra per spiegarne uno."));
      return;
    }
    data.reports.forEach((report) => {
      const card = el("button", "report-card");
      card.type = "button";
      const top = el("div", "report-card-top");
      top.append(el("span", "report-date", formatTraceDate(report.started_at, { dateOnly: true })));
      if (report.branch) top.append(el("span", "report-branch", report.branch.label));
      card.append(top, el("strong", "", report.title));
      card.append(el("p", "report-summary", report.summary || report.excerpt));
      const counts = [`${report.glossary_count} ${report.glossary_count === 1 ? "parola spiegata" : "parole spiegate"}`];
      if (report.medications_count) counts.push(`${report.medications_count} ${report.medications_count === 1 ? "farmaco" : "farmaci"}`);
      card.append(el("small", "report-counts", counts.join(" · ")));
      card.addEventListener("click", () => showReportDetail(report.id));
      reportsList.append(card);
    });
  } catch (error) {
    reportsList.replaceChildren(el("p", "empty-state", error.message));
  }
}

async function showReportDetail(id) {
  try {
    const { report } = await fetchJson(`/api/referti/${id}`);
    reportsList.hidden = true;
    reportDetail.hidden = false;
    reportDetail.replaceChildren();
    const back = el("button", "back-button", "← Torna a tutti i referti");
    back.type = "button";
    back.addEventListener("click", loadReports);
    const header = el("div", "report-detail-header");
    header.append(el("p", "section-label", `${report.source_label.toUpperCase()} · ${formatTraceDate(report.started_at)}`), el("h3", "", report.title));
    reportDetail.append(back, header);
    reportDetail.append(renderExplanation(report.explanation));

    const more = renderMoreSections({ glossary: report.glossary, medications: report.medications, branch: report.branch })
      || (() => { const section = el("section", "more"); section.append(el("h3", "more-title", "Per saperne di più")); return section; })();
    if (!report.medications) {
      const pending = el("div", "more-body");
      const button = el("button", "secondary", "Cerca i farmaci in questo referto");
      button.type = "button";
      button.addEventListener("click", async () => {
        button.disabled = true;
        button.textContent = "Sto cercando… può volerci un minuto";
        try {
          await fetchJson(`/api/referti/${id}/farmaci`, { method: "POST" });
          showReportDetail(id);
        } catch (error) {
          button.disabled = false;
          button.textContent = "Cerca i farmaci in questo referto";
          pending.append(el("p", "facilities-status error", error.message));
        }
      });
      pending.append(button);
      more.append(moreItem("Farmaci scritti nel referto", pending));
    }
    const original = el("pre", "report-original-text", report.report_text);
    more.append(moreItem("Il testo originale del referto", original));
    reportDetail.append(more);

    const remove = el("button", "danger-button", "Elimina questo referto");
    remove.type = "button";
    remove.addEventListener("click", async () => {
      if (!window.confirm("Vuoi davvero eliminare questo referto? Non potrai recuperarlo.")) return;
      try {
        await fetchJson(`/api/referti/${id}`, { method: "DELETE" });
        loadReports();
      } catch (error) {
        window.alert(error.message);
      }
    });
    reportDetail.append(remove);
    reportDetail.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    reportsList.replaceChildren(el("p", "empty-state", error.message));
  }
}
document.querySelector("#refresh-reports")?.addEventListener("click", loadReports);

/* ---------- Farmaci ---------- */
const medicationsList = document.querySelector("#medications-list");
const medicationsPending = document.querySelector("#medications-pending");

function renderMedicationGroup(group) {
  const [latest, ...others] = group.menzioni;
  const card = el("article", "med-card");
  card.append(el("h4", "", medicationTitle(latest, group.aifa)));
  const source = el("button", "med-source", `Dal referto del ${formatTraceDate(latest.data, { dateOnly: true })}`);
  source.type = "button";
  source.title = "Apri il referto";
  source.addEventListener("click", () => {
    activatePanel("reports");
    showReportDetail(latest.trace_id);
  });
  card.append(source);
  if (group.aifa && normalizeName(latest.nome) !== normalizeName(group.aifa.principio_attivo)) {
    card.append(el("p", "med-written", `Nel referto è scritto: ${latest.nome}`));
  }
  card.append(medicationFacts(latest), leafletButton(group.aifa));
  let extra = null;
  if (others.length) {
    extra = el("div", "med-others");
    extra.append(el("p", "med-label", `Compare anche in altri ${others.length === 1 ? "un referto" : `${others.length} referti`}`));
    others.forEach((mention) => {
      const row = el("button", "med-source", `${formatTraceDate(mention.data, { dateOnly: true })} · ${[mention.dose, mention.frequenza].filter(Boolean).join(" ") || "dose non scritta"}`);
      row.type = "button";
      row.addEventListener("click", () => {
        activatePanel("reports");
        showReportDetail(mention.trace_id);
      });
      extra.append(row);
    });
  }
  card.append(medicationDetails(latest, group.aifa, extra));
  return card;
}

async function analyzePendingReports(ids, button) {
  button.disabled = true;
  for (let index = 0; index < ids.length; index += 1) {
    button.textContent = `Sto cercando… ${index + 1} di ${ids.length}`;
    try {
      await fetchJson(`/api/referti/${ids[index]}/farmaci`, { method: "POST" });
    } catch (error) {
      medicationsPending.append(el("p", "facilities-status error", error.message));
      break;
    }
  }
  loadMedications();
}

async function loadMedications() {
  if (!medicationsList) return;
  try {
    const data = await fetchJson("/api/farmaci");
    document.querySelector("#medications-source").textContent = `Prontuario: ${data.prontuario.source}, ${data.prontuario.farmaci} farmaci autorizzati, aggiornato al ${data.prontuario.built_on}. I foglietti sono i PDF ufficiali della Banca Dati Farmaci AIFA.`;
    medicationsPending.replaceChildren();
    medicationsPending.hidden = !data.referti_da_analizzare.length;
    if (data.referti_da_analizzare.length) {
      const count = data.referti_da_analizzare.length;
      medicationsPending.append(el("p", "", `Ci sono ${count === 1 ? "un referto" : `${count} referti`} in cui non ho ancora cercato i farmaci.`));
      const button = el("button", "primary", "Cerca adesso");
      button.type = "button";
      button.addEventListener("click", () => analyzePendingReports(data.referti_da_analizzare, button));
      medicationsPending.append(button);
    }
    medicationsList.replaceChildren();
    if (!data.farmaci.length) {
      medicationsList.append(el("p", "empty-state", data.referti_totali ? "Nei tuoi referti non sono scritti farmaci." : "Non ci sono ancora referti. Spiegane uno per iniziare."));
      return;
    }
    data.farmaci.forEach((group) => medicationsList.append(renderMedicationGroup(group)));
  } catch (error) {
    medicationsList.replaceChildren(el("p", "empty-state", error.message));
  }
}
document.querySelector("#refresh-medications")?.addEventListener("click", loadMedications);

let catalogTimer = null;
document.querySelector("#catalog-search")?.addEventListener("input", (event) => {
  clearTimeout(catalogTimer);
  const query = event.target.value.trim();
  const results = document.querySelector("#catalog-results");
  if (query.length < 3) {
    results.replaceChildren();
    return;
  }
  catalogTimer = setTimeout(async () => {
    try {
      const data = await fetchJson(`/api/farmaci/cerca?${new URLSearchParams({ q: query })}`);
      const list = el("ul", "product-list");
      data.risultati.forEach((product) => {
        const row = renderProduct(product);
        row.querySelector(".product-info").append(el("small", "", `Principio attivo: ${product.principio_attivo} · ATC ${product.atc}`));
        list.append(row);
      });
      results.replaceChildren(data.risultati.length ? list : el("p", "empty-state", "Nessun farmaco trovato."));
    } catch (error) {
      results.replaceChildren(el("p", "empty-state", error.message));
    }
  }, 300);
});

function showSingleResult(target, result, traceId, glossary, branch, medications) {
  target.hidden = false;
  target.className = "result";
  target.replaceChildren();
  const title = document.createElement("h3");
  title.textContent = "Ecco la spiegazione del tuo referto";
  target.append(title, renderExplanation(result));
  const more = renderMoreSections({ glossary, medications, branch });
  if (more) target.append(more);
  const shortcut = traceShortcut(traceId);
  if (shortcut) target.append(shortcut);
  target.scrollIntoView({ behavior: "smooth", block: "start" });
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
      showSingleResult(target, data.result, data.trace_id, data.glossary, data.branch, data.medications);
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

/* ---------- Strumenti per il team ---------- */
const advancedToggle = document.querySelector("#advanced-toggle");

function setAdvanced(enabled) {
  document.body.classList.toggle("advanced", enabled);
  if (advancedToggle) {
    advancedToggle.textContent = enabled ? "Nascondi strumenti per il team" : "Mostra strumenti per il team";
    advancedToggle.setAttribute("aria-pressed", String(enabled));
  }
  try { localStorage.setItem("referto-advanced", enabled ? "1" : "0"); } catch { /* storage non disponibile */ }
  const active = document.querySelector(".tab.active");
  if (!enabled && active?.closest(".advanced-only")) activatePanel("explain");
}

let advancedStored = false;
try { advancedStored = localStorage.getItem("referto-advanced") === "1"; } catch { /* storage non disponibile */ }
setAdvanced(advancedStored);
advancedToggle?.addEventListener("click", () => setAdvanced(!document.body.classList.contains("advanced")));

/* ---------- Spiegami un referto: file, foto o testo ---------- */
const modeButtons = [...document.querySelectorAll(".mode")];
const modePanels = [...document.querySelectorAll(".mode-panel")];
const cameraVideo = document.querySelector("#camera-video");
const cameraPreview = document.querySelector("#camera-preview");
const cameraStatus = document.querySelector("#camera-status");
const cameraShoot = document.querySelector("#camera-shoot");
const cameraRetake = document.querySelector("#camera-retake");
const photoSubmit = document.querySelector("#photo-submit");
const photoInput = document.querySelector("#photo-input");
let cameraStream = null;

function setMode(mode) {
  modeButtons.forEach((button) => {
    const selected = button.dataset.mode === mode;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  modePanels.forEach((panel) => { panel.hidden = panel.dataset.modePanel !== mode; });
  document.querySelector("#result-explain").hidden = true;
  if (mode === "photo") startCamera();
  else stopCamera();
  if (mode === "text") document.querySelector("#report-text")?.focus();
}
modeButtons.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));

function stopCamera() {
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  if (cameraVideo) cameraVideo.srcObject = null;
}

function showCameraState(state, message = "") {
  // state: "live" (inquadratura), "shot" (foto pronta), "off" (nessuna fotocamera)
  cameraVideo.hidden = state !== "live";
  cameraPreview.hidden = state !== "shot";
  cameraShoot.hidden = state !== "live";
  cameraRetake.hidden = state !== "shot" || !cameraStream;
  photoSubmit.hidden = state !== "shot";
  cameraStatus.hidden = !message;
  cameraStatus.textContent = message;
}

async function startCamera() {
  if (cameraStream) {
    showCameraState("live");
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    showCameraState("off", "Questo browser non può usare la fotocamera: premi «Oppure scegli una foto già salvata».");
    return;
  }
  showCameraState("off", "Accendo la fotocamera… se il browser lo chiede, premi «Consenti».");
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    cameraVideo.srcObject = cameraStream;
    await cameraVideo.play();
    showCameraState("live");
  } catch {
    stopCamera();
    showCameraState("off", "Non riesco ad accendere la fotocamera. Puoi scegliere una foto già salvata qui sotto.");
  }
}

function useFile(file) {
  // La foto finisce nello stesso campo del modulo, così l'invio resta quello di sempre.
  const transfer = new DataTransfer();
  transfer.items.add(file);
  photoInput.files = transfer.files;
  cameraPreview.src = URL.createObjectURL(file);
  showCameraState("shot");
}

cameraShoot?.addEventListener("click", () => {
  const canvas = document.querySelector("#camera-canvas");
  canvas.width = cameraVideo.videoWidth;
  canvas.height = cameraVideo.videoHeight;
  canvas.getContext("2d").drawImage(cameraVideo, 0, 0);
  canvas.toBlob((blob) => {
    if (blob) useFile(new File([blob], "foto-referto.jpg", { type: "image/jpeg" }));
  }, "image/jpeg", 0.92);
});

cameraRetake?.addEventListener("click", () => showCameraState("live"));

photoInput?.addEventListener("change", () => {
  if (photoInput.files?.length) {
    cameraPreview.src = URL.createObjectURL(photoInput.files[0]);
    showCameraState("shot");
  }
});

// Durante l'analisi la fotocamera non serve più: si spegne.
document.querySelector("#photo-form")?.addEventListener("submit", stopCamera);
