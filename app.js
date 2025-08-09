
// Config constants injected from index.html
// OWNER, REPO, BRANCH, FILE_PATH

const RAW_CSV_URL = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${FILE_PATH}`;

let GHTOKEN = null;
let GH_SHA = null; // last sha of file
let articles = [];
let currentPage = 1;
let rowsPerPage = 999999; // default "Tous"
let currentSort = { col: "Numéro", dir: "asc" };

// --- Utils
const norm = s => (s ?? "").toString().replace(/\u00A0/g," ").replace(/\u200B/g,"").trim();
const deaccent = s => norm(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const headers = ["Année","Numéro","Titre","Page(s)","Auteur(s)","Ville(s)","Theme(s)","Epoque"];

function normalizeKeys(row) {
  const out = {};
  for (const k of Object.keys(row)) {
    const nk0 = deaccent(k).replace(/\s+/g," ").replace(/[’']/g,"'");
    let nk = nk0;
    if (/^annee$/i.test(nk)) nk="Année";
    else if (/^numero$/i.test(nk)) nk="Numéro";
    else if (/^titre$/i.test(nk)) nk="Titre";
    else if (/^pages?$/i.test(nk) || /^page\(s\)$/i.test(nk)) nk="Page(s)";
    else if (/^auteurs?(\(s\))?$/i.test(nk)) nk="Auteur(s)";
    else if (/^villes?(\(s\))?$/i.test(nk)) nk="Ville(s)";
    else if (/^themes?(\(s\))?$/i.test(nk)) nk="Theme(s)";
    else if (/^epoque|periode$/i.test(nk)) nk="Epoque";
    out[nk] = norm(row[k]);
  }
  headers.forEach(h => { if (!(h in out)) out[h] = ""; }); // ensure all headers exist
  return out;
}

function toCSV(rows) {
  const esc = v => {
    const s = (v ?? "").toString().replaceAll('"','""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const lines = [headers.join(",")].concat(rows.map(r => headers.map(h => esc(r[h])).join(",")));
  return lines.join("\n");
}

function uniqueSorted(list) {
  return [...new Set(list.filter(v => norm(v)!==""))].sort((a,b)=> (""+a).localeCompare(""+b,'fr'));
}

// --- Loaders
async function loadRawCsv() {
  const res = await fetch(RAW_CSV_URL + "?" + Date.now(), { cache:"no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const text = await res.text();
  const { data, errors } = Papa.parse(text, { header:true, skipEmptyLines:true });
  if (errors?.length) console.warn("Papa errors:", errors.slice(0,5));
  articles = data.map(normalizeKeys).filter(r => Object.values(r).some(v => norm(v)!==""));
  console.log("Loaded (raw):", articles.length);
}

async function ghGetContents() {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`;
  const res = await fetch(url, { headers: GHTOKEN ? { Authorization: `Bearer ${GHTOKEN}` } : {} });
  if (!res.ok) throw new Error("GitHub GET " + res.status);
  const json = await res.json();
  GH_SHA = json.sha;
  const content = atob(json.content.replace(/\n/g,""));
  const { data, errors } = Papa.parse(content, { header:true, skipEmptyLines:true });
  if (errors?.length) console.warn("Papa errors (gh):", errors.slice(0,5));
  articles = data.map(normalizeKeys).filter(r => Object.values(r).some(v => norm(v)!==""));
  console.log("Loaded (gh):", articles.length, "sha:", GH_SHA);
}

async function ghPutContents(newCsv, message="Update articles.csv from UI") {
  if (!GHTOKEN) throw new Error("Pas de token");
  // fetch sha if missing
  if (!GH_SHA) await ghGetContents();
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`;
  const body = {
    message,
    content: btoa(unescape(encodeURIComponent(newCsv))),
    sha: GH_SHA,
    branch: BRANCH,
  };
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${GHTOKEN}`,
      "Content-Type": "application/json",
      "Accept": "application/vnd.github+json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error("GitHub PUT " + res.status + " — " + t.slice(0,200));
  }
  const json = await res.json();
  GH_SHA = json.content?.sha || null;
  console.log("Saved, new sha:", GH_SHA);
  document.getElementById("save-status").textContent = "✅ Enregistré";
  setTimeout(()=> document.getElementById("save-status").textContent="", 2500);
}

// --- Filters / sorting / pagination
let currentSortCol = "Numéro";
let currentSortDir = "asc";

function applyAllFilters(data) {
  const term = (document.getElementById("search")?.value || "").toLowerCase();
  const annee = document.getElementById("filter-annee")?.value || "";
  const numero = document.getElementById("filter-numero")?.value || "";

  let out = data.filter(r => {
    const okSearch = term ? Object.values(r).some(v => norm(v).toLowerCase().includes(term)) : true;
    const okAnnee  = !annee  || r["Année"]  == annee;
    const okNumero = !numero || r["Numéro"] == numero;
    return okSearch && okAnnee && okNumero;
  });

  if (currentSortCol) {
    const dir = currentSortDir === 'asc' ? 1 : -1;
    out.sort((a,b) => (""+a[currentSortCol]).localeCompare(""+b[currentSortCol], 'fr') * dir);
  }
  return out;
}

function sortBy(col) {
  if (currentSortCol === col) currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
  else { currentSortCol = col; currentSortDir = 'asc'; }
  currentPage = 1; render();
}

function changePage(delta, total) {
  const maxPage = Math.max(1, Math.ceil(total / rowsPerPage));
  currentPage = Math.min(maxPage, Math.max(1, currentPage + delta));
  render();
}

// --- Rendering
function populateFiltersFromData() {
  const aSel = document.getElementById("filter-annee");
  const nSel = document.getElementById("filter-numero");
  aSel.innerHTML = `<option value="">(toutes)</option>` + uniqueSorted(articles.map(a => a["Année"])).map(v=>`<option>${v}</option>`).join("");
  nSel.innerHTML = `<option value="">(tous)</option>`   + uniqueSorted(articles.map(a => a["Numéro"])).map(v=>`<option>${v}</option>`).join("");

  // Datalists for form
  fillDatalist("list-annee",  uniqueSorted(articles.map(a => a["Année"])));
  fillDatalist("list-numero", uniqueSorted(articles.map(a => a["Numéro"])));
  fillDatalist("list-auteurs",uniqueSorted(articles.map(a => a["Auteur(s)"])));
  fillDatalist("list-villes", uniqueSorted(articles.map(a => a["Ville(s)"])));
  fillDatalist("list-themes", uniqueSorted(articles.map(a => a["Theme(s)"])));
  fillDatalist("list-epoques",uniqueSorted(articles.map(a => a["Epoque"])));
}

function fillDatalist(id, items) {
  const dl = document.getElementById(id);
  if (!dl) return;
  dl.innerHTML = items.map(v => `<option value="${String(v).replace(/"/g,'&quot;')}">`).join("");
}

function updateCount(n) {
  const el = document.getElementById("count");
  el.textContent = `${n} articles`;
}

function render() {
  const container = document.getElementById("articles");
  const all = applyAllFilters(articles);
  updateCount(all.length);

  if (!all.length) { container.innerHTML = "<p>Aucun article trouvé.</p>"; return; }

  // rows per page
  const limit = document.getElementById("limit").value;
  rowsPerPage = (limit === "all") ? all.length : parseInt(limit,10);
  const start = (currentPage - 1) * rowsPerPage;
  const page = all.slice(start, start + rowsPerPage);

  const arrow = col => currentSortCol === col ? (currentSortDir === 'asc' ? '▲' : '▼') : '';

  let html = `<table><thead><tr>
    <th onclick="sortBy('Année')">Année <span class="arrow">${arrow('Année')}</span></th>
    <th onclick="sortBy('Numéro')">Numéro <span class="arrow">${arrow('Numéro')}</span></th>
    <th onclick="sortBy('Titre')">Titre <span class="arrow">${arrow('Titre')}</span></th>
    <th onclick="sortBy('Auteur(s)')">Auteur(s) <span class="arrow">${arrow('Auteur(s)')}</span></th>
    <th onclick="sortBy('Theme(s)')">Thème(s) <span class="arrow">${arrow('Theme(s)')}</span></th>
    <th onclick="sortBy('Epoque')">Période <span class="arrow">${arrow('Epoque')}</span></th>
    <th>Sel.</th>
  </tr></thead><tbody>`;

  html += page.map((row, idx) => `
    <tr>
      <td>${row["Année"] || ""}</td>
      <td>${row["Numéro"] || ""}</td>
      <td>${row["Titre"] || ""}</td>
      <td>${row["Auteur(s)"] || ""}</td>
      <td>${row["Theme(s)"] || ""}</td>
      <td>${row["Epoque"] || ""}</td>
      <td><input type="checkbox" class="row-select" data-index="${start+idx}"></td>
    </tr>
  `).join("");

  html += `</tbody></table>
  <div id="pagination">
    <button ${currentPage<=1?'disabled':''} onclick="changePage(-1, ${all.length})">◀ Précédent</button>
    <span>Page ${currentPage} / ${Math.max(1, Math.ceil(all.length/rowsPerPage))} — ${all.length} résultats</span>
    <button ${(start+rowsPerPage)>=all.length?'disabled':''} onclick="changePage(1, ${all.length})">Suivant ▶</button>
  </div>`;

  container.innerHTML = html;
}

// --- UI actions
document.addEventListener("DOMContentLoaded", async () => {
  // Drawer actions
  document.getElementById("toggle-add").addEventListener("click", () => {
    document.getElementById("drawer").classList.add("open");
  });
  document.getElementById("close-drawer").addEventListener("click", () => {
    document.getElementById("drawer").classList.remove("open");
  });

  // Mutual exclusive filters
  document.getElementById("filter-annee").addEventListener("change", (e) => {
    if (e.target.value) document.getElementById("filter-numero").value = "";
    currentPage = 1; render();
  });
  document.getElementById("filter-numero").addEventListener("change", (e) => {
    if (e.target.value) document.getElementById("filter-annee").value = "";
    currentPage = 1; render();
  });

  document.getElementById("limit").addEventListener("change", () => { currentPage=1; render(); });
  document.getElementById("search").addEventListener("input", () => { currentPage=1; render(); });

  // Add form -> push row in-memory only
  document.getElementById("form-article").addEventListener("submit", (e) => {
    e.preventDefault();
    const row = {};
    for (const el of e.target.elements) if (el.name) row[el.name] = el.value.trim();
    articles.unshift(row);
    e.target.reset();
    document.getElementById("drawer").classList.remove("open");
    populateFiltersFromData();
    render();
  });

  // Remove selected
  document.getElementById("remove-selected").addEventListener("click", () => {
    const checks = Array.from(document.querySelectorAll(".row-select:checked"));
    if (!checks.length) return alert("Sélectionnez au moins une ligne.");
    if (!confirm(`Supprimer ${checks.length} article(s) de la vue ? (ils seront supprimés définitivement au prochain Enregistrer dans GitHub)`)) return;
    const indexes = checks.map(c => parseInt(c.getAttribute("data-index"),10)).sort((a,b)=>b-a); // remove high to low
    for (const i of indexes) articles.splice(i,1);
    populateFiltersFromData();
    render();
  });

  // Export current view
  document.getElementById("export-view").addEventListener("click", () => {
    const current = applyAllFilters(articles); // ignore pagination
    const csv = toCSV(current);
    const blob = new Blob([csv], { type:"text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "vue_filtrée.csv";
    a.click(); URL.revokeObjectURL(a.href);
  });

  // GitHub auth & save
  document.getElementById("gh-login").addEventListener("click", async () => {
    const t = document.getElementById("gh-token").value.trim();
    if (!t) return alert("Collez votre token GitHub (scope repo).");
    GHTOKEN = t;
    try {
      await ghGetContents(); // also sets GH_SHA and loads same CSV
      document.getElementById("gh-save").disabled = false;
      document.getElementById("save-status").textContent = "Connecté à GitHub ✅";
      setTimeout(()=> document.getElementById("save-status").textContent="", 2500);
      populateFiltersFromData();
      render();
    } catch (e) {
      alert("Échec de connexion GitHub: " + e);
      GHTOKEN = null;
    }
  });

  document.getElementById("gh-save").addEventListener("click", async () => {
    if (!GHTOKEN) return alert("Connectez-vous avec un token GitHub d'abord.");
    const csv = toCSV(articles);
    document.getElementById("save-status").textContent = "Enregistrement…";
    try {
      await ghPutContents(csv, "Mise à jour depuis l'interface (UI)");
    } catch (e) {
      document.getElementById("save-status").textContent = "❌ " + e;
    }
  });

  // Initial load (raw) without auth
  await loadRawCsv();
  populateFiltersFromData();
  render();
});
