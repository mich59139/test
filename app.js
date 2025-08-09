// ===== Config dépôt GitHub (adapter si besoin) =====
const GITHUB_OWNER  = "mich59139";
const GITHUB_REPO   = "test";
const GITHUB_BRANCH = "main";
const CSV_PATH      = "data/articles.csv";

// ===== Données / état =====
let GHTOKEN = null;                 // token en mémoire uniquement
let articles = [];                  // toutes les lignes
let currentPage = 1;
let rowsPerPage = 50;
let currentSort = { col: null, dir: 'asc' };

// ===== Utilitaires =====
const norm = s => (s ?? "").toString().replace(/\u00A0/g," ").replace(/\u200B/g,"").trim();
const deaccent = s => norm(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"");
function uniqueSorted(list){ return [...new Set(list.filter(v => norm(v)!==""))].sort((a,b)=>(""+a).localeCompare(""+b,'fr')); }

function normalizeKeys(row){
  const out={};
  for(const k of Object.keys(row)){
    let nk = deaccent(k).replace(/\s+/g," ").replace(/[’']/g,"'");
    if (/^annee$/i.test(nk)) nk="Année";
    else if (/^numero$/i.test(nk)) nk="Numéro";
    else if (/^titre$/i.test(nk)) nk="Titre";
    else if (/^pages?$/i.test(nk) || /^page\(s\)$/i.test(nk)) nk="Page(s)";
    else if (/^auteurs?(\(s\))?$/i.test(nk)) nk="Auteur(s)";
    else if (/^villes?(\(s\))?$/i.test(nk)) nk="Ville(s)";
    else if (/^themes?(\(s\))?$/i.test(nk)) nk="Theme(s)";
    else if (/^epoque|periode$/i.test(nk)) nk="Epoque";
    out[nk]=norm(row[k]);
  }
  return out;
}

function parseCsvWith(delim, text){
  const res = Papa.parse(text, { header:true, skipEmptyLines:true, delimiter:delim });
  const rows = (res.data||[]).map(normalizeKeys).filter(r => Object.values(r).some(v => norm(v)!==""));
  return { rows, errors: res.errors||[], meta: res.meta||{} };
}
function parseCsvTextFlexible(text){
  if (text.charCodeAt(0)===0xFEFF) text = text.slice(1);
  let {rows, meta} = parseCsvWith(",", text);
  if ((meta.fields||[]).length<=1 && text.includes(";")) ({rows, meta} = parseCsvWith(";", text));
  console.log("Champs détectés:", meta.fields);
  return rows;
}

// ===== Chargement CSV (sans token) =====
const CSV_URL_BASE = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${CSV_PATH}`;
async function reloadCsv(resetFilters=false){
  const url = `${CSV_URL_BASE}?ts=${Date.now()}`;
  const res = await fetch(url, { cache:"no-store" });
  if (!res.ok){ document.getElementById("table-container").innerHTML = `<p style="color:#b00;">Erreur CSV HTTP ${res.status}</p>`; return; }
  const text = await res.text();
  const rows = parseCsvTextFlexible(text);
  articles = rows;
  if (resetFilters){
    ["search","filter-annee","filter-numero"].forEach(id => { const el=document.getElementById(id); if(el) el.value=""; });
    currentPage = 1;
  }
  populateFilters();
  populateDatalists();
  updateCount(articles.length);
  render();
}

function updateCount(n){ const el=document.getElementById("count"); if (el) el.textContent = `${n} articles`; }

// ===== Filtres + tri + pagination =====
function populateFilters(){
  const aSel = document.getElementById("filter-annee");
  const nSel = document.getElementById("filter-numero");
  if (!aSel || !nSel) return;
  aSel.innerHTML = `<option value="">(toutes)</option>` + uniqueSorted(articles.map(a=>a["Année"])).map(v=>`<option>${v}</option>`).join("");
  nSel.innerHTML = `<option value="">(tous)</option>`   + uniqueSorted(articles.map(a=>a["Numéro"])).map(v=>`<option>${v}</option>`).join("");
}
function applyAllFilters(data){
  const term = (document.getElementById("search")?.value || "").toLowerCase();
  const annee = document.getElementById("filter-annee")?.value || "";
  const numero = document.getElementById("filter-numero")?.value || "";
  let out = data.filter(r => {
    const okSearch = term ? Object.values(r).some(v => norm(v).toLowerCase().includes(term)) : true;
    const okAnnee  = !annee  || r["Année"]==annee;
    const okNumero = !numero || r["Numéro"]==numero;
    return okSearch && okAnnee && okNumero;
  });
  if (currentSort.col){
    const c = currentSort.col, dir = currentSort.dir==='asc'?1:-1;
    out.sort((a,b)=> (""+a[c]).localeCompare(""+b[c],'fr')*dir );
  }
  return out;
}
function changePage(delta,total){
  const maxPage = Math.max(1, Math.ceil(total/rowsPerPage));
  currentPage = Math.min(maxPage, Math.max(1, currentPage+delta));
  render();
}
function sortBy(col){
  if (currentSort.col===col) currentSort.dir = currentSort.dir==='asc' ? 'desc':'asc';
  else currentSort = { col, dir:'asc' };
  currentPage=1; render();
}

// ===== Rendu table (sans colonne de numérotation) =====
function render(){
  const container = document.getElementById("table-container");
  const all = applyAllFilters(articles);
  if (!all.length){ container.innerHTML = "<p>Aucun article trouvé.</p>"; return; }

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
      <td ondblclick="editCell(this,'Année')">${row["Année"]||""}</td>
      <td ondblclick="editCell(this,'Numéro')">${row["Numéro"]||""}</td>
      <td ondblclick="editCell(this,'Titre')">${row["Titre"]||""}</td>
      <td ondblclick="editCell(this,'Auteur(s)')">${row["Auteur(s)"]||""}</td>
      <td ondblclick="editCell(this,'Theme(s)')">${row["Theme(s)"]||""}</td>
      <td ondblclick="editCell(this,'Epoque')">${row["Epoque"]||""}</td>
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

// ===== Edition inline =====
function editCell(td, col){
  const tr = td.parentElement;
  const rowIndexGlobal = computeGlobalIndex(tr); // calcule l'index réel dans `articles`
  const old = td.textContent;
  const input = document.createElement("input");
  input.value = old;
  input.style.width = "100%";
  td.innerHTML = "";
  td.appendChild(input);
  input.focus();
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") input.blur();
    if (e.key === "Escape"){ td.textContent = old; }
  });
  input.addEventListener("blur", () => {
    const val = input.value.trim();
    td.textContent = val;
    if (rowIndexGlobal>=0){
      articles[rowIndexGlobal][col] = val;
    }
  });
}

// calcule l'index global de la ligne affichée
function computeGlobalIndex(tr){
  const rowElts = Array.from(tr.parentElement.children);
  const idxInPage = rowElts.indexOf(tr);
  const limit = document.getElementById("limit").value;
  const filtered = applyAllFilters(articles);
  rowsPerPage = (limit==="all") ? filtered.length : parseInt(limit,10);
  const start = (currentPage-1)*rowsPerPage;
  return start + idxInPage;
}

// ===== Datalists pour formulaire d'ajout =====
function populateDatalists(){
  const f=(id,vals)=>{ const el=document.getElementById(id); if(!el) return; el.innerHTML=uniqueSorted(vals).map(v=>`<option value="${String(v).replace(/"/g,"&quot;")}">`).join(""); };
  f("dl-annee", articles.map(r=>r["Année"]));
  f("dl-numero",articles.map(r=>r["Numéro"]));
  f("dl-auteurs",articles.map(r=>r["Auteur(s)"]));
  f("dl-villes", articles.map(r=>r["Ville(s)"]));
  f("dl-themes", articles.map(r=>r["Theme(s)"]));
  f("dl-epoques",articles.map(r=>r["Epoque"]));
}

// ===== Export de la vue filtrée =====
function exportViewCsv(){
  const filtered = applyAllFilters(articles);
  const headers = ["Année","Numéro","Titre","Page(s)","Auteur(s)","Ville(s)","Theme(s)","Epoque"];
  const lines = [headers.join(",")].concat(
    filtered.map(r => headers.map(h => (r[h] ?? "").toString().replaceAll('"','""')).map(v => /[",\n]/.test(v) ? `"${v}"` : v).join(","))
  );
  const csv = lines.join("\n");
  const blob = new Blob([csv],{type:"text/csv;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "export_vue.csv";
  a.click(); URL.revokeObjectURL(a.href);
}

// ===== Drawer & lot =====
const batch=[];
const HEADERS=["Année","Numéro","Titre","Page(s)","Auteur(s)","Ville(s)","Theme(s)","Epoque"];
function updateBatchPreview(){
  const lines=[HEADERS.join(",")].concat(
    batch.map(r=>HEADERS.map(h=>(r[h]||"").replaceAll('"','""')).map(v=>/[",\n]/.test(v)?`"${v}"`:v).join(","))
  );
  document.getElementById("batch-preview").textContent = lines.join("\n");
  document.getElementById("batch-count").textContent = `${batch.length} en attente`;
}

// ===== GitHub inline login & save =====
function toBase64(str){ return btoa(unescape(encodeURIComponent(str))); }

async function githubLoginInline(){
  const t = prompt("Collez votre token GitHub (non stocké) :");
  if (!t) return;
  GHTOKEN = t.trim();
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CSV_PATH}`;
  const r = await fetch(url,{ headers:{ Authorization:`token ${GHTOKEN}` } });
  if (!r.ok){ alert(`Token invalide ou droits insuffisants (HTTP ${r.status}).`); GHTOKEN=null; return; }
  alert("Connecté à GitHub ✅ (token en mémoire uniquement)");
}

async function saveToGitHub(updatedCsvText){
  if (!GHTOKEN){ alert("Connectez-vous d’abord (🔐)."); return; }
  const contentsUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CSV_PATH}`;
  const getRes = await fetch(contentsUrl,{ headers:{ Authorization:`token ${GHTOKEN}` } });
  if (!getRes.ok){ alert(`Lecture du fichier impossible (HTTP ${getRes.status}).`); return; }
  const current = await getRes.json(); // {sha,...}

  const putRes = await fetch(contentsUrl,{
    method:"PUT",
    headers:{
      Authorization:`token ${GHTOKEN}`,
      "Content-Type":"application/json"
    },
    body: JSON.stringify({
      message:"maj depuis UI",
      content: toBase64(updatedCsvText),
      sha: current.sha,
      branch: GITHUB_BRANCH
    })
  });
  if (!putRes.ok){
    const err = await putRes.text();
    alert("Échec du commit : "+putRes.status+"\n"+err);
    return;
  }
  alert("Modifications enregistrées ✅");
  await new Promise(r=>setTimeout(r,1500));
  await reloadCsv(true);
}

// ===== DOM Ready =====
document.addEventListener("DOMContentLoaded", () => {
  // listeners filtres
  document.getElementById("filter-annee").addEventListener("change", e => {
    if (e.target.value){ document.getElementById("filter-numero").value=""; document.getElementById("search").value=""; }
    currentPage=1; render();
  });
  document.getElementById("filter-numero").addEventListener("change", e => {
    if (e.target.value){ document.getElementById("filter-annee").value=""; document.getElementById("search").value=""; }
    currentPage=1; render();
  });
  document.getElementById("limit").addEventListener("change", ()=>{ currentPage=1; render(); });
  document.getElementById("search").addEventListener("input", ()=>{ currentPage=1; render(); });

  // export
  document.getElementById("export-btn").addEventListener("click", exportViewCsv);

  // drawer
  document.getElementById("toggle-add").addEventListener("click", ()=> document.getElementById("drawer").classList.add("open"));
  document.getElementById("close-drawer").addEventListener("click", ()=> document.getElementById("drawer").classList.remove("open"));

  // lot
  document.getElementById("form-article").addEventListener("submit", e => {
    e.preventDefault();
    const row={};
    for (const el of e.target.elements) if (el.name) row[el.name]=el.value.trim();
    batch.push(row); e.target.reset(); updateBatchPreview();
    alert("Ajouté au lot. Téléchargez ou copiez quand vous avez fini.");
  });
  document.getElementById("download-batch").addEventListener("click", () => {
    if (!batch.length) return alert("Aucun enregistrement dans le lot.");
    const txt = document.getElementById("batch-preview").textContent || "";
    const blob = new Blob([txt], {type:"text/csv;charset=utf-8"});
    const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="nouveaux_articles.csv"; a.click(); URL.revokeObjectURL(a.href);
  });
  document.getElementById("copy-batch").addEventListener("click", async () => {
    if (!batch.length) return alert("Aucun enregistrement dans le lot.");
    await navigator.clipboard.writeText(document.getElementById("batch-preview").textContent || "");
    alert("Lot copié !");
  });
  document.getElementById("reset-batch").addEventListener("click", () => { batch.length=0; updateBatchPreview(); });

  // GitHub inline
  document.getElementById("login-btn").addEventListener("click", githubLoginInline);
  document.getElementById("save-btn").addEventListener("click", () => {
    const headers=["Année","Numéro","Titre","Page(s)","Auteur(s)","Ville(s)","Theme(s)","Epoque"];
    const lines = [headers.join(",")].concat(
      articles.map(r => headers.map(h => (r[h] ?? "").toString().replaceAll('"','""')).map(v => /[",\n]/.test(v) ? `"${v}"` : v).join(","))
    );
    const csvText = lines.join("\n");
    saveToGitHub(csvText);
  });

  // 1er chargement sans token
  reloadCsv(true);
});
