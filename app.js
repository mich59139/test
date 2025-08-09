
// Config dépôt
const GITHUB_OWNER  = "mich59139";
const GITHUB_REPO   = "test";
const GITHUB_BRANCH = "main";
const CSV_PATH      = "data/articles.csv";

// Lecture directe (raw) avec anti-cache
const CSV_URL_BASE = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${CSV_PATH}`;

// Token en session (pas sur disque)
let GHTOKEN = sessionStorage.getItem("ghtoken");
const setToken = (t) => {
  const v = (t || "").trim();
  if (v) { GHTOKEN = v; sessionStorage.setItem("ghtoken", v); }
  else { GHTOKEN = null; sessionStorage.removeItem("ghtoken"); }
};

let articles = [];
let currentPage = 1;
let rowsPerPage = 50;
let currentSort = { col: null, dir: 'asc' };
const headersOrder = ["Année","Numéro","Titre","Page(s)","Auteur(s)","Ville(s)","Theme(s)","Epoque"];

// Utils
const norm = s => (s ?? "").toString().replace(/\u00A0/g," ").replace(/\u200B/g,"").trim();
const deaccent = s => norm(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"");

function normalizeKeys(row) {
  const out = {};
  for (const k of Object.keys(row)) {
    let nk = deaccent(k).replace(/\s+/g," ").replace(/[’']/g,"'");
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
  return out;
}

function parseCsvWith(delim, text) {
  const res = Papa.parse(text, { header:true, skipEmptyLines:true, delimiter:delim });
  const rows = (res.data || []).map(normalizeKeys).filter(r => Object.values(r).some(v => norm(v)!==""));
  return { rows, errors: res.errors || [], meta: res.meta || {} };
}

function parseCsvTextFlexible(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  let { rows, meta } = parseCsvWith(",", text);
  if ((meta.fields || []).length <= 1 && text.includes(";")) {
    ({ rows, meta } = parseCsvWith(";", text));
  }
  console.log("Champs détectés:", meta.fields);
  return rows;
}

async function reloadCsv(resetFilters=false) {
  const url = `${CSV_URL_BASE}?ts=${Date.now()}`;
  const res = await fetch(url, { cache:"no-store" });
  if (!res.ok) throw new Error("HTTP "+res.status);
  let text = await res.text();
  articles = parseCsvTextFlexible(text);
  if (resetFilters) {
    ["filter-annee","filter-numero","search"].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = "";
    });
    currentPage = 1;
  }
  populateFilters();
  render();
  updateCount(articles.length);
}

function uniqueSorted(arr){ return [...new Set(arr.filter(v=>norm(v)!==""))].sort((a,b)=> (""+a).localeCompare(""+b,'fr')); }

function populateFilters() {
  const aSel = document.getElementById("filter-annee");
  const nSel = document.getElementById("filter-numero");
  aSel.innerHTML = `<option value="">(toutes)</option>` + uniqueSorted(articles.map(a=>a["Année"])).map(v=>`<option>${v}</option>`).join("");
  nSel.innerHTML = `<option value="">(tous)</option>` + uniqueSorted(articles.map(a=>a["Numéro"])).map(v=>`<option>${v}</option>`).join("");

  // datalists pour formulaire
  fillDatalist("dl-annee", uniqueSorted(articles.map(a=>a["Année"])));
  fillDatalist("dl-numero", uniqueSorted(articles.map(a=>a["Numéro"])));
  fillDatalist("dl-auteurs", uniqueSorted(articles.map(a=>a["Auteur(s)"])));
  fillDatalist("dl-villes", uniqueSorted(articles.map(a=>a["Ville(s)"])));
  fillDatalist("dl-themes", uniqueSorted(articles.map(a=>a["Theme(s)"])));
  fillDatalist("dl-epoques", uniqueSorted(articles.map(a=>a["Epoque"])));
}

function fillDatalist(id, values) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = values.map(v=>`<option value="${String(v).replace(/"/g,'&quot;')}">`).join("");
}

function applyAllFilters(data) {
  const term = (document.getElementById("search")?.value || "").toLowerCase();
  const annee = document.getElementById("filter-annee")?.value || "";
  const numero = document.getElementById("filter-numero")?.value || "";
  let out = data.filter(r => {
    const okSearch = term ? Object.values(r).some(v => norm(v).toLowerCase().includes(term)) : true;
    const okAnnee  = !annee || r["Année"]==annee;
    const okNumero = !numero|| r["Numéro"]==numero;
    return okSearch && okAnnee && okNumero;
  });
  if (currentSort.col) {
    const c=currentSort.col, dir=currentSort.dir==='asc'?1:-1;
    out.sort((a,b)=> (""+a[c]).localeCompare(""+b[c],'fr')*dir);
  }
  return out;
}

function updateCount(n){ const el = document.getElementById("count"); if (el) el.textContent = `${n} articles`; }

function render() {
  const container = document.getElementById("articles");
  const all = applyAllFilters(articles);
  if (!all.length) { container.innerHTML = "<p>Aucun article trouvé.</p>"; return; }

  const limit = document.getElementById("limit").value;
  rowsPerPage = (limit==="all") ? all.length : parseInt(limit,10);
  const start = (currentPage-1)*rowsPerPage;
  const page = all.slice(start, start+rowsPerPage);

  const arrow = col => currentSort.col===col ? (currentSort.dir==='asc'?'▲':'▼') : '';

  let html = `<table><thead><tr>
    <th onclick="sortBy('Année')">Année <span class="arrow">${arrow('Année')}</span></th>
    <th onclick="sortBy('Numéro')">Numéro <span class="arrow">${arrow('Numéro')}</span></th>
    <th onclick="sortBy('Titre')">Titre <span class="arrow">${arrow('Titre')}</span></th>
    <th onclick="sortBy('Auteur(s)')">Auteur(s) <span class="arrow">${arrow('Auteur(s)')}</span></th>
    <th onclick="sortBy('Theme(s)')">Thème(s) <span class="arrow">${arrow('Theme(s)')}</span></th>
    <th onclick="sortBy('Epoque')">Période <span class="arrow">${arrow('Epoque')}</span></th>
  </tr></thead><tbody>`;

  html += page.map(row => `
    <tr>
      <td contenteditable onblur="editCell(this,'Année')">${row["Année"]||""}</td>
      <td contenteditable onblur="editCell(this,'Numéro')">${row["Numéro"]||""}</td>
      <td contenteditable onblur="editCell(this,'Titre')">${row["Titre"]||""}</td>
      <td contenteditable onblur="editCell(this,'Auteur(s)')">${row["Auteur(s)"]||""}</td>
      <td contenteditable onblur="editCell(this,'Theme(s)')">${row["Theme(s)"]||""}</td>
      <td contenteditable onblur="editCell(this,'Epoque')">${row["Epoque"]||""}</td>
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

function sortBy(col){ if (currentSort.col===col) currentSort.dir = currentSort.dir==='asc'?'desc':'asc'; else currentSort={col,dir:'asc'}; currentPage=1; render(); }
function changePage(d,total){ const max=Math.max(1, Math.ceil(total/rowsPerPage)); currentPage=Math.min(max, Math.max(1, currentPage+d)); render(); }

// Édition inline (modifie la ligne correspondante dans le tableau complet)
function editCell(td, col) {
  const tr = td.parentElement;
  const rowIndexInPage = Array.from(tr.parentElement.children).indexOf(tr);
  // recalcul index global
  const all = applyAllFilters(articles);
  const limit = document.getElementById("limit").value;
  rowsPerPage = (limit==="all") ? all.length : parseInt(limit,10);
  const start = (currentPage-1)*rowsPerPage;
  const globalIndex = start + rowIndexInPage;
  const newVal = norm(td.textContent);
  const target = all[globalIndex];
  // retrouver l'objet original (référence) dans articles
  const originalIndex = articles.indexOf(target);
  if (originalIndex >= 0) {
    articles[originalIndex][col] = newVal;
  }
  td.style.background = "#fff8cc"; // feedback visuel
}

// Export vue filtrée
document.getElementById("export-btn").addEventListener("click", () => {
  const rows = applyAllFilters(articles);
  const csv = buildCsvFromArticles(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "export_vue.csv";
  a.click(); URL.revokeObjectURL(a.href);
});

// Build CSV
function buildCsvFromArticles(rows){
  const lines = [headersOrder.join(",")].concat(
    rows.map(r => headersOrder.map(h => (r[h]??"").toString().replaceAll('"','""'))
      .map(v => /[",\n]/.test(v) ? `"${v}"` : v).join(","))
  );
  return lines.join("\n");
}

// GitHub login inline (sessionStorage)
async function githubLoginInline() {
  const t = prompt("Collez votre token GitHub (jamais stocké sur disque) :");
  if (!t) return;
  setToken(t);
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CSV_PATH}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;
  const r = await fetch(url, { headers: { Authorization: `token ${GHTOKEN}` } });
  if (!r.ok) { alert(`Token invalide ou droits insuffisants (HTTP ${r.status}).`); setToken(null); return; }
  alert("Connecté à GitHub ✅ (session)");
  const btn = document.getElementById("login-btn"); if (btn) btn.textContent = "🔐 Connecté (session)";
}

async function saveToGitHub(updatedCsvText){
  if (!GHTOKEN) { alert("Connectez-vous d’abord (🔐)."); return; }
  const contentsUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CSV_PATH}`;
  const headers = { Authorization:`token ${GHTOKEN}`, "Content-Type":"application/json", "Accept":"application/vnd.github+json" };

  // lire sha (update ou create)
  let sha=null;
  const getRes = await fetch(contentsUrl+`?ref=${encodeURIComponent(GITHUB_BRANCH)}`, { headers });
  if (getRes.status===200) { const cur = await getRes.json(); sha = cur.sha; }
  else if (getRes.status!==404) { const t = await getRes.text(); alert(`Lecture impossible (HTTP ${getRes.status})\n${t}`); return; }

  const body = { message: sha ? "maj depuis UI (update)" : "maj depuis UI (create)",
                 content: btoa(unescape(encodeURIComponent(updatedCsvText))),
                 branch: GITHUB_BRANCH };
  if (sha) body.sha = sha;

  const putRes = await fetch(contentsUrl, { method:"PUT", headers, body: JSON.stringify(body) });
  if (!putRes.ok) { const t = await putRes.text(); alert(`Échec du commit : ${putRes.status}\n${t}`); return; }

  alert("Modifications enregistrées ✅");
  await new Promise(r=>setTimeout(r,1500));
  await reloadCsv(true);
}

// Drawer & batch
const batch = [];
function updateBatchPreview(){
  const headers = headersOrder;
  const lines = [headers.join(",")].concat(
    batch.map(r => headers.map(h => (r[h]||"").replaceAll('"','""')).map(v => /[",\n]/.test(v) ? `"${v}"` : v).join(","))
  );
  document.getElementById("batch-preview").textContent = lines.join("\n");
  document.getElementById("batch-count").textContent = `${batch.length} en attente`;
}

document.addEventListener("DOMContentLoaded", async () => {
  // UI state token
  if (GHTOKEN) { const btn = document.getElementById("login-btn"); if (btn) btn.textContent = "🔐 Connecté (session)"; }

  // Listeners filtres
  document.getElementById("filter-annee").addEventListener("change", e => {
    if (e.target.value) { document.getElementById("filter-numero").value=""; const s=document.getElementById("search"); if (s) s.value=""; }
    currentPage=1; render();
  });
  document.getElementById("filter-numero").addEventListener("change", e => {
    if (e.target.value) { document.getElementById("filter-annee").value=""; const s=document.getElementById("search"); if (s) s.value=""; }
    currentPage=1; render();
  });
  document.getElementById("limit").addEventListener("change", ()=>{ currentPage=1; render(); });
  document.getElementById("search").addEventListener("input", ()=>{ currentPage=1; render(); });

  // Drawer
  document.getElementById("toggle-add").addEventListener("click", ()=> document.getElementById("drawer").classList.add("open"));
  document.getElementById("close-drawer").addEventListener("click", ()=> document.getElementById("drawer").classList.remove("open"));

  // Batch form
  document.getElementById("form-article").addEventListener("submit", e => {
    e.preventDefault();
    const row = {};
    for (const el of e.target.elements) if (el.name) row[el.name] = norm(el.value);
    batch.push(row);
    e.target.reset();
    updateBatchPreview();
    alert("Ajouté au lot. Téléchargez ou copiez le lot quand vous avez fini.");
  });
  document.getElementById("download-batch").addEventListener("click", ()=>{
    if (!batch.length) return alert("Aucun enregistrement dans le lot.");
    const txt = document.getElementById("batch-preview").textContent || "";
    const blob = new Blob([txt], { type:"text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "nouveaux_articles.csv"; a.click(); URL.revokeObjectURL(a.href);
  });
  document.getElementById("copy-batch").addEventListener("click", async ()=>{
    if (!batch.length) return alert("Aucun enregistrement dans le lot.");
    await navigator.clipboard.writeText(document.getElementById("batch-preview").textContent || "");
    alert("Lot copié !");
  });
  document.getElementById("reset-batch").addEventListener("click", ()=>{ batch.length=0; updateBatchPreview(); });

  // Login/Logout/Save
  document.getElementById("login-btn").addEventListener("click", githubLoginInline);
  document.getElementById("logout-btn").addEventListener("click", ()=>{ setToken(null); const btn=document.getElementById("login-btn"); if (btn) btn.textContent="🔐 Se connecter GitHub"; alert("Token oublié."); });
  document.getElementById("save-btn").addEventListener("click", async ()=>{
    const csv = buildCsvFromArticles(articles);
    await saveToGitHub(csv);
  });

  // Data initiale
  await reloadCsv(true);
});
