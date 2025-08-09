// ===== Config dépôt =====
const GITHUB_OWNER  = "mich59139";
const GITHUB_REPO   = "test";
const GITHUB_BRANCH = "main";
const CSV_PATH      = "data/articles.csv";
const CSV_URL_BASE  = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${CSV_PATH}`;

// ===== Token en session =====
let GHTOKEN = sessionStorage.getItem("ghtoken") || null;
const setToken = t => { GHTOKEN = t?.trim() || null; GHTOKEN ? sessionStorage.setItem("ghtoken", GHTOKEN) : sessionStorage.removeItem("ghtoken"); };
const headersAuth = () => (GHTOKEN ? { Authorization: `token ${GHTOKEN}`, Accept: "application/vnd.github+json", "Cache-Control":"no-cache" } : {});

// ===== État =====
let articles = []; // objets
let currentPage = 1;
let rowsPerPage = 50;
let currentSort = { col: null, dir: "asc" };

// ===== Helpers =====
const norm = s => (s ?? "").toString().replace(/\u00A0/g," ").replace(/\u200B/g,"").trim();
const deaccent = s => norm(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"");
function uniqueSorted(arr){ return [...new Set(arr.filter(v=>norm(v)!==""))].sort((a,b)=>(""+a).localeCompare(""+b,"fr")); }
function setStatus(msg){ const s=document.getElementById("status"); if (s) s.textContent = msg || ""; }

function normalizeKeys(row) {
  const out = {};
  for (const k of Object.keys(row)) {
    let nk = deaccent(k).replace(/\s+/g," ");
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

function parseCsv(delim, text) {
  const r = Papa.parse(text, { header:true, skipEmptyLines:true, delimiter:delim });
  const rows = (r.data||[]).map(normalizeKeys).filter(o => Object.values(o).some(v => norm(v)!==""));
  return { rows, meta: r.meta };
}
function parseCsvFlexible(text) {
  if (text && text.charCodeAt && text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  let { rows, meta } = parseCsv(",", text);
  if ((meta.fields||[]).length<=1 && text.includes(";")) ({ rows, meta } = parseCsv(";", text));
  return rows;
}

function buildCsvFromArticles(rows) {
  const headers = ["Année","Numéro","Titre","Page(s)","Auteur(s)","Ville(s)","Theme(s)","Epoque"];
  const lines = [headers.join(",")].concat(
    rows.map(r =>
      headers.map(h => (r[h] ?? "").toString().replaceAll('"','""'))
             .map(v => /[",\n]/.test(v) ? `"${v}"` : v)
             .join(",")
    )
  );
  return lines.join("\n");
}

// ===== UI Populate =====
function populateFilters() {
  const an = document.getElementById("filter-annee");
  const nu = document.getElementById("filter-numero");
  if (!an || !nu) return;
  an.innerHTML = `<option value="">(toutes)</option>` + uniqueSorted(articles.map(a=>a["Année"])).map(v=>`<option>${v}</option>`).join("");
  nu.innerHTML = `<option value="">(tous)</option>`   + uniqueSorted(articles.map(a=>a["Numéro"])).map(v=>`<option>${v}</option>`).join("");
}
function populateDatalists() {
  const fill = (id, list) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = uniqueSorted(list).map(v=>`<option value="${v}">`).join("");
  };
  fill("dl-annee",   articles.map(a=>a["Année"]));
  fill("dl-numero",  articles.map(a=>a["Numéro"]));
  fill("dl-auteurs", articles.map(a=>a["Auteur(s)"]));
  fill("dl-villes",  articles.map(a=>a["Ville(s)"]));
  fill("dl-themes",  articles.map(a=>a["Theme(s)"]));
  fill("dl-epoques", articles.map(a=>a["Epoque"]));
}

// ===== Filtrage / Tri / Pagination =====
function applyAllFilters(data){
  const term   = (document.getElementById("search")?.value || "").toLowerCase();
  const annee  = document.getElementById("filter-annee")?.value || "";
  const numero = document.getElementById("filter-numero")?.value || "";
  let out = data.filter(r=>{
    const okSearch = term ? Object.values(r).some(v=>norm(v).toLowerCase().includes(term)) : true;
    const okAn = !annee || r["Année"]===annee;
    const okNu = !numero || r["Numéro"]===numero;
    return okSearch && okAn && okNu;
  });
  if (currentSort.col){
    const dir = currentSort.dir==="asc" ? 1 : -1;
    out.sort((a,b)=> (""+a[currentSort.col]).localeCompare(""+b[currentSort.col],"fr")*dir);
  }
  return out;
}
function sortBy(col){
  if (currentSort.col===col) currentSort.dir = currentSort.dir==="asc" ? "desc" : "asc";
  else currentSort = { col, dir:"asc" };
  currentPage=1; render();
}

function render(){
  const container = document.getElementById("articles");
  const all = applyAllFilters(articles);
  if (!all.length){ container.innerHTML = "<p>Aucun article trouvé.</p>"; return; }

  const limitSel = document.getElementById("limit");
  const limitVal = limitSel ? limitSel.value : "50";
  rowsPerPage = (limitVal==="all") ? all.length : parseInt(limitVal,10);
  const start = (currentPage-1)*rowsPerPage;
  const page = all.slice(start, start+rowsPerPage);
  const arrow = c => currentSort.col===c ? (currentSort.dir==="asc"?"▲":"▼") : "";

  let html = `<table><thead><tr>
    <th onclick="sortBy('Année')">Année <span class="arrow">${arrow('Année')}</span></th>
    <th onclick="sortBy('Numéro')">Numéro <span class="arrow">${arrow('Numéro')}</span></th>
    <th onclick="sortBy('Titre')">Titre <span class="arrow">${arrow('Titre')}</span></th>
    <th onclick="sortBy('Auteur(s)')">Auteur(s) <span class="arrow">${arrow('Auteur(s)')}</span></th>
    <th onclick="sortBy('Theme(s)')">Thème(s) <span class="arrow">${arrow('Theme(s)')}</span></th>
    <th onclick="sortBy('Epoque')">Période <span class="arrow">${arrow('Epoque')}</span></th>
  </tr></thead><tbody>`;

  html += page.map(r=>`
    <tr>
      <td>${r["Année"]||""}</td>
      <td>${r["Numéro"]||""}</td>
      <td>${r["Titre"]||""}</td>
      <td>${r["Auteur(s)"]||""}</td>
      <td>${r["Theme(s)"]||""}</td>
      <td>${r["Epoque"]||""}</td>
    </tr>`).join("");

  const maxPage = Math.max(1, Math.ceil(all.length/rowsPerPage));
  html += `</tbody></table>
    <div style="margin-top:8px;">
      <button ${currentPage<=1?"disabled":""} onclick="currentPage--;render()">◀ Précédent</button>
      <span>Page ${currentPage} / ${maxPage} — ${all.length} résultats</span>
      <button ${currentPage>=maxPage?"disabled":""} onclick="currentPage++;render()">Suivant ▶</button>
    </div>`;
  container.innerHTML = html;
}

// ===== Chargement CSV (raw) =====
async function reloadCsv(resetFilters=false) {
  const url = `${CSV_URL_BASE}?ts=${Date.now()}`;
  const res = await fetch(url, { cache:"no-store" });
  if (!res.ok) throw new Error("HTTP "+res.status);
  const text = await res.text();
  articles = parseCsvFlexible(text);

  if (resetFilters) {
    document.getElementById("search").value="";
    document.getElementById("filter-annee").value="";
    document.getElementById("filter-numero").value="";
    const lim=document.getElementById("limit"); if (lim) lim.value="50";
    currentPage=1;
  }
  populateFilters();
  populateDatalists();
  render();
}

// ===== Chargement immédiat via API (pas de cache) =====
async function loadCsvFromApi() {
  if (!GHTOKEN) return;
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CSV_PATH}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;
  const r = await fetch(url, { headers: headersAuth() });
  if (!r.ok) throw new Error(`API contents ${r.status}`);
  const j = await r.json();
  const csv = decodeURIComponent(escape(atob(j.content)));
  articles = parseCsvFlexible(csv);
  populateFilters();
  populateDatalists();
  currentPage=1;
  render();
}

// ===== Login =====
async function githubLoginInline() {
  const t = prompt("Collez votre token GitHub (scope public_repo) :");
  if (!t) return;
  setToken(t);
  // test d'accès léger
  try {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CSV_PATH}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;
    const r = await fetch(url, { headers: headersAuth() });
    if (!r.ok && r.status!==404) { throw new Error("HTTP "+r.status); }
    const b=document.getElementById("login-btn"); if (b) b.textContent="🔐 Connecté (session)";
    alert("Connecté à GitHub ✅");
  } catch(e) {
    setToken(null);
    alert("Token invalide ou droits insuffisants.");
  }
}

// ===== SAVE avec merge + gestion 409 + refresh instantané =====
function toBase64(str){ return btoa(unescape(encodeURIComponent(str))); }

async function getLatestShaAndRows() {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CSV_PATH}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;
  const r = await fetch(url, { headers: headersAuth() });
  if (r.status===404) return { sha:null, rows:[] };
  if (!r.ok) throw new Error(`GET contents ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const csv = decodeURIComponent(escape(atob(j.content)));
  return { sha: j.sha, rows: parseCsvFlexible(csv) };
}

async function saveToGitHubMerged() {
  if (!GHTOKEN) { alert("Connectez-vous d’abord (🔐)."); return; }
  setStatus("Enregistrement…");
  // Branche check
  const br = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/branches/${encodeURIComponent(GITHUB_BRANCH)}`, { headers: headersAuth() });
  if (!br.ok){ setStatus(""); alert("Branche introuvable. Créez un premier commit (README) sur main."); return; }

  // Toujours partir de la dernière version distante
  let { sha, rows: remoteRows } = await getLatestShaAndRows();

  // Merge simple (clé Titre+Numéro+Année, priorité à la vue locale)
  const key = r => [r["Titre"], r["Numéro"], r["Année"]].map(v=>v||"").join("¦");
  const map = new Map(remoteRows.map(r => [key(r), r]));
  for (const r of articles) map.set(key(r), r);
  const merged = Array.from(map.values());
  const csvMerged = buildCsvFromArticles(merged);

  const contentsUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CSV_PATH}`;
  let body = { message: sha ? "maj UI (merge update)" : "maj UI (create)", content: toBase64(csvMerged), branch: GITHUB_BRANCH };
  if (sha) body.sha = sha;

  let put = await fetch(contentsUrl, { method:"PUT", headers: headersAuth(), body: JSON.stringify(body) });

  if (put.status===409){
    // rebase et retente 1x
    ({ sha, rows: remoteRows } = await getLatestShaAndRows());
    const map2 = new Map(remoteRows.map(r => [key(r), r]));
    for (const r of articles) map2.set(key(r), r);
    const merged2 = Array.from(map2.values());
    const csv2 = buildCsvFromArticles(merged2);
    const body2 = { message: "maj UI (rebase merge)", content: toBase64(csv2), branch: GITHUB_BRANCH, sha };
    put = await fetch(contentsUrl, { method:"PUT", headers: headersAuth(), body: JSON.stringify(body2) });
  }

  if (!put.ok){
    setStatus("");
    const txt = await put.text();
    alert(`Échec du commit : ${put.status}\n${txt}`);
    return;
  }

  setStatus("Enregistré. Mise à jour immédiate…");
  // 1) MAJ immédiate via API (instantané)
  try { await loadCsvFromApi(); setStatus("À jour. Sync CDN dans 5 s…"); } catch {}
  // 2) Sync CDN après propagation
  setTimeout(async ()=>{ try { await reloadCsv(true); setStatus(""); } catch {} }, 5000);
}

// ===== Add depuis le formulaire =====
function addFromForm() {
  const $ = name => document.querySelector(`#form-container [name="${name}"]`);
  const row = {
    "Année":   norm($("Année")?.value),
    "Numéro":  norm($("Numéro")?.value),
    "Titre":   norm($("Titre")?.value),
    "Page(s)": norm($("Page(s)")?.value),
    "Auteur(s)": norm($("Auteur(s)")?.value),
    "Ville(s)":  norm($("Ville(s)")?.value),
    "Theme(s)":  norm($("Theme(s)")?.value),
    "Epoque":    norm($("Epoque")?.value),
  };
  articles.push(row);
  render();
}

// ===== Wire UI =====
function wireUI(){
  const an = document.getElementById("filter-annee");
  const nu = document.getElementById("filter-numero");
  const lim = document.getElementById("limit");
  const sch = document.getElementById("search");

  if (an) an.addEventListener("change", e=>{ if (e.target.value) nu.value=""; sch.value=""; currentPage=1; render(); });
  if (nu) nu.addEventListener("change", e=>{ if (e.target.value) an.value=""; sch.value=""; currentPage=1; render(); });
  if (lim) lim.addEventListener("change", ()=>{ currentPage=1; render(); });
  if (sch) sch.addEventListener("input", ()=>{ currentPage=1; render(); });

  document.getElementById("login-btn")?.addEventListener("click", githubLoginInline);
  document.getElementById("logout-btn")?.addEventListener("click", ()=>{ setToken(null); const b=document.getElementById("login-btn"); if (b) b.textContent="🔐 Se connecter GitHub"; alert("Token oublié (session nettoyée)."); });
  document.getElementById("save-btn")?.addEventListener("click", saveToGitHubMerged);
  document.getElementById("save-in-drawer")?.addEventListener("click", async ()=>{ addFromForm(); await saveToGitHubMerged(); });
}

// ===== Init =====
document.addEventListener("DOMContentLoaded", async ()=>{
  if (GHTOKEN){ const b=document.getElementById("login-btn"); if (b) b.textContent="🔐 Connecté (session)"; }
  try {
    await reloadCsv(true); // affichage initial depuis raw
    wireUI();
  } catch (e) {
    console.error(e);
    const c=document.getElementById("articles");
    if (c) c.innerHTML = `<p style="color:#b00">Erreur de chargement : ${e}</p>`;
  }
});

// Expose pour tri via onclick dans header
window.sortBy = sortBy;
