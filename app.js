/* ===== CONFIG ===== */
const GITHUB_OWNER  = "mich59139";
const GITHUB_REPO   = "test";
const GITHUB_BRANCH = "main";
const CSV_PATH      = "data/articles.csv";
const CSV_URL_BASE  = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${CSV_PATH}`;

let GHTOKEN = sessionStorage.getItem("ghtoken") || null;
const setToken = t => { GHTOKEN = t?.trim() || null; GHTOKEN ? sessionStorage.setItem("ghtoken", GHTOKEN) : sessionStorage.removeItem("ghtoken"); };

/* ===== STATE ===== */
let articles = []; // objets normalisés
let currentPage = 1;
let rowsPerPage = 50;
let currentSort = { col: null, dir: "asc" };

/* ===== HELPERS ===== */
const norm = s => (s ?? "").toString().replace(/\u00A0/g," ").replace(/\u200B/g,"").trim();
const deaccent = s => norm(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"");
function uniqueSorted(arr){ return [...new Set(arr.filter(v=>norm(v)!==""))].sort((a,b)=>(""+a).localeCompare(""+b,"fr")); }

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

// essaie virgule puis point-virgule
function parseCsvFlexible(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  let { rows, meta } = parseCsv(",", text);
  if ((meta.fields||[]).length<=1 && text.includes(";")) ({ rows, meta } = parseCsv(";", text));
  return rows;
}

/* ===== LOAD / UI POPULATE ===== */
async function reloadCsv(resetFilters=false) {
  const url = `${CSV_URL_BASE}?ts=${Date.now()}`;
  const res = await fetch(url, { cache:"no-store" });
  if (!res.ok) throw new Error("HTTP "+res.status);
  const text = await res.text();
  articles = parseCsvFlexible(text);

  if (resetFilters) {
    const s=document.getElementById("search"); if (s) s.value="";
    const fa=document.getElementById("filter-annee"); if (fa) fa.value="";
    const fn=document.getElementById("filter-numero"); if (fn) fn.value="";
    const lim=document.getElementById("limit"); if (lim) lim.value="50";
    currentPage=1;
  }
  populateFilters();
  populateDatalists();
  render();
}

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

/* ===== RENDER / FILTER / SORT / PAGINATION ===== */
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
    <th onclick="sortBy('Année')">Année ${arrow('Année')}</th>
    <th onclick="sortBy('Numéro')">Numéro ${arrow('Numéro')}</th>
    <th onclick="sortBy('Titre')">Titre ${arrow('Titre')}</th>
    <th onclick="sortBy('Auteur(s)')">Auteur(s) ${arrow('Auteur(s)')}</th>
    <th onclick="sortBy('Theme(s)')">Thème(s) ${arrow('Theme(s)')}</th>
    <th onclick="sortBy('Epoque')">Période ${arrow('Epoque')}</th>
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

/* ===== ADD FROM FORM (boîte) ===== */
function addFromForm() {
  const $ = id => document.querySelector(`#form-container [name="${id}"]`);
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
  // Ajoute au dataset en mémoire
  articles.push(row);
  render();
}

/* ===== CSV BUILD (sauvegarde) ===== */
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

/* ===== GITHUB SAVE (409-friendly + merge) ===== */
function toBase64(str){ return btoa(unescape(encodeURIComponent(str))); }

async function githubLoginInline() {
  const t = prompt("Collez votre token GitHub (scope public_repo) :");
  if (!t) return;
  setToken(t);
  // Test léger d’accès (404 autorisé si fichier absent)
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CSV_PATH}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;
  const r = await fetch(url, { headers:{ Authorization:`token ${GHTOKEN}` } });
  if (!r.ok && r.status!==404){ alert(`Token/accès KO (HTTP ${r.status})`); setToken(null); return; }
  const b=document.getElementById("login-btn"); if (b) b.textContent="🔐 Connecté (session)";
  alert("Connecté à GitHub ✅");
}

async function getCurrentSha(headers, contentsUrl){
  const res = await fetch(contentsUrl+`?ref=${encodeURIComponent(GITHUB_BRANCH)}`, { headers });
  if (res.status===200){ const cur = await res.json(); return { sha: cur.sha, contentB64: cur.content }; }
  if (res.status===404) return { sha: null, contentB64: null };
  throw new Error("GET contents: "+res.status+" "+await res.text());
}

async function saveToGitHubMerged() {
  if (!GHTOKEN){ alert("Connectez-vous d’abord (🔐)."); return; }

  const headers = { Authorization:`token ${GHTOKEN}`, "Content-Type":"application/json", "Accept":"application/vnd.github+json" };
  const contentsUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CSV_PATH}`;

  // branche présente ?
  const br = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/branches/${encodeURIComponent(GITHUB_BRANCH)}`, { headers });
  if (br.status===404){ alert("La branche 'main' n’existe pas (repo vide). Ajoute un 1er commit."); return; }
  if (!br.ok){ alert("Vérif branche: "+br.status); return; }

  // Lire la dernière version distante (sha + contenu)
  let { sha, contentB64 } = await getCurrentSha(headers, contentsUrl);
  let remoteRows = [];
  if (contentB64) {
    const remoteCsv = decodeURIComponent(escape(atob(contentB64)));
    remoteRows = parseCsvFlexible(remoteCsv);
  }

  // MERGE simple : on prend toutes les lignes distantes + toutes en mémoire (dédupe basique sur Titre+Numéro+Année)
  const key = r => [r["Titre"], r["Numéro"], r["Année"]].map(v=>v||"").join("¦");
  const map = new Map(remoteRows.map(r => [key(r), r]));
  for (const r of articles) map.set(key(r), r);
  const merged = Array.from(map.values());

  // Construit CSV fusionné
  const csv = buildCsvFromArticles(merged);

  // PUT (create/update)
  let body = { message: sha ? "maj UI (merge update)" : "maj UI (create)", content: toBase64(csv), branch: GITHUB_BRANCH };
  if (sha) body.sha = sha;

  let put = await fetch(contentsUrl, { method:"PUT", headers, body: JSON.stringify(body) });

  // 409 -> relire le nouveau sha puis retenter une fois
  if (put.status===409){
    ({ sha } = await getCurrentSha(headers, contentsUrl));
    if (!sha){ alert("Conflit 409 et pas de sha distant. Réessaie."); return; }
    body.sha = sha;
    put = await fetch(contentsUrl, { method:"PUT", headers, body: JSON.stringify(body) });
  }

  if (!put.ok){
    const txt = await put.text();
    alert(`Échec du commit : ${put.status}\n${txt}`);
    return;
  }

  alert("Modifications enregistrées ✅");
  // Recharge la dernière version distante (anti-cache + reset filtres)
  await new Promise(r=>setTimeout(r,1500));
  await reloadCsv(true);
}

/* ===== EVENTS ===== */
function wireUI(){
  const an = document.getElementById("filter-annee");
  const nu = document.getElementById("filter-numero");
  const lim = document.getElementById("limit");
  const sch = document.getElementById("search");

  if (an) an.addEventListener("change", e=>{ if (e.target.value) nu.value=""; sch.value=""; currentPage=1; render(); });
  if (nu) nu.addEventListener("change", e=>{ if (e.target.value) an.value=""; sch.value=""; currentPage=1; render(); });
  if (lim) lim.addEventListener("change", ()=>{ currentPage=1; render(); });
  if (sch) sch.addEventListener("input", ()=>{ currentPage=1; render(); });

  // Boutons haut
  document.getElementById("login-btn")?.addEventListener("click", githubLoginInline);
  document.getElementById("logout-btn")?.addEventListener("click", ()=>{ setToken(null); const b=document.getElementById("login-btn"); if (b) b.textContent="🔐 Se connecter GitHub"; alert("Token oublié (session nettoyée)."); });
  document.getElementById("save-btn")?.addEventListener("click", saveToGitHubMerged);

  // Bouton dans la boîte
  document.getElementById("save-in-drawer")?.addEventListener("click", async ()=>{
    addFromForm();                 // ajoute la ligne à la vue
    await saveToGitHubMerged();    // merge + save
  });
}

/* ===== INIT ===== */
document.addEventListener("DOMContentLoaded", async ()=>{
  if (GHTOKEN){ const b=document.getElementById("login-btn"); if (b) b.textContent="🔐 Connecté (session)"; }
  try {
    await reloadCsv(true);
    wireUI();
  } catch (e) {
    console.error(e);
    const c=document.getElementById("articles");
    if (c) c.innerHTML = `<p style="color:#b00">Erreur de chargement : ${e}</p>`;
  }
});
