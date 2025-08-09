/* ========= CONFIG ========= */
cconst GITHUB_OWNER  = "mich59139";
const GITHUB_REPO   = "test";
const GITHUB_BRANCH = "main";
const CSV_PATH      = "data/articles.csv"; // <— sans espace !
const CSV_URL_BASE  = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${CSV_PATH}`;

async function verifyGithubTarget() {
  if (!GHTOKEN) { alert("Pas de token (🔐 d’abord)"); return; }
  const H = { Authorization: `token ${GHTOKEN}`, "Accept":"application/vnd.github+json", "Cache-Control":"no-cache" };

  const repoUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
  const brUrl   = `${repoUrl}/branches/${encodeURIComponent(GITHUB_BRANCH)}`;
  const fileUrl = `${repoUrl}/contents/${CSV_PATH}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;

  const r1 = await fetch(repoUrl, { headers: H });   console.log("repo", r1.status);
  const r2 = await fetch(brUrl,   { headers: H });   console.log("branch", r2.status);
  const r3 = await fetch(fileUrl, { headers: H });   console.log("contents", r3.status);

  if (!r1.ok) return alert("Repo introuvable (owner/repo ?)");
  if (!r2.ok) return alert("Branche introuvable (fais un 1er commit sur main)");
  if (r3.status === 404) {
    alert("Le fichier data/articles.csv n'existe pas encore : je vais le créer au prochain 💾");
  } else if (!r3.ok) {
    alert("Erreur accès fichier: " + r3.status);
  } else {
    const j = await r3.json();
    console.log("sha courant:", j.sha);
  }
}
/* ========= TOKEN EN SESSION ========= */
let GHTOKEN = sessionStorage.getItem("ghtoken") || null;
const setToken = t => { GHTOKEN = t?.trim() || null; GHTOKEN ? sessionStorage.setItem("ghtoken", GHTOKEN) : sessionStorage.removeItem("ghtoken"); };

/* ========= ETAT ========= */
let articles = [];               // objets normalisés
let pendingAdds = [];            // lignes ajoutées via le formulaire (append-only)
const APPEND_ONLY = true;        // évite d’écraser, on ajoute au CSV distant
let currentPage = 1;
let rowsPerPage = 50;
let currentSort = { col: null, dir: "asc" };

/* ========= HELPERS ========= */
const norm = s => (s ?? "").toString().replace(/\u00A0/g," ").replace(/\u200B/g,"").trim();
const deaccent = s => norm(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const canonKey = s => deaccent(s||"").toLowerCase();

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
  if (text && text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  let { rows, meta } = parseCsv(",", text);
  if ((meta.fields||[]).length<=1 && text.includes(";")) ({ rows, meta } = parseCsv(";", text));
  return rows;
}

function uniqueSorted(arr){ return [...new Set(arr.filter(v=>norm(v)!==""))].sort((a,b)=>(""+a).localeCompare(""+b,"fr")); }

/* multi-valeurs (auteurs/thèmes/villes) */
function splitMulti(value) {
  const raw = norm(value);
  if (!raw) return [];
  return raw
    .split(/[;,/|·•]/)
    .map(v => v.replace(/^\W+|\W+$/g,""))
    .map(v => v.replace(/\s*-\s*/g,"-"))
    .map(v => v.replace(/\s{2,}/g," ").trim())
    .filter(v => v && v !== "i" && v.length >= 2);
}
function uniquePretty(list) {
  const map = new Map();
  for (const item of list) {
    const pretty = norm(item);
    if (!pretty) continue;
    const key = canonKey(pretty);
    if (!key || key === "i") continue;
    if (/^\d+$/.test(pretty)) continue; // évite nombres isolés
    if (!map.has(key)) map.set(key, pretty);
  }
  return Array.from(map.values()).sort((a,b)=>a.localeCompare(b,'fr'));
}

/* clé d’unicité pour doublons (évite d’ajouter deux fois la même entrée) */
const rowKey = r => [r["Année"], r["Numéro"], r["Titre"]].map(x => canonKey(x||"")).join("¦");

/* ========= CHARGEMENT ========= */
async function reloadCsv(reset=false) {
  const url = `${CSV_URL_BASE}?ts=${Date.now()}`;
  const res = await fetch(url, { cache:"no-store" });
  if (!res.ok) throw new Error("HTTP "+res.status);
  const text = await res.text();
  articles = parseCsvFlexible(text);

  if (reset) {
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

/* Chargement immédiat depuis l’API GitHub (après commit, pour éviter l’attente CDN) */
async function loadCsvFromApi() {
  if (!GHTOKEN) return;
  const headers = { Authorization: `token ${GHTOKEN}`, "Accept":"application/vnd.github+json", "Cache-Control":"no-cache" };
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CSV_PATH}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`API contents ${r.status}`);
  const j = await r.json();
  const csv = decodeURIComponent(escape(atob(j.content)));
  articles = parseCsvFlexible(csv);
  populateFilters(); populateDatalists();
  currentPage = 1; render();
}

/* ========= POPULATE UI ========= */
function populateFilters() {
  const an = document.getElementById("filter-annee");
  const nu = document.getElementById("filter-numero");
  if (!an || !nu) return;
  an.innerHTML = `<option value="">(toutes)</option>` + uniqueSorted(articles.map(a=>a["Année"])).map(v=>`<option>${v}</option>`).join("");
  nu.innerHTML = `<option value="">(tous)</option>`   + uniqueSorted(articles.map(a=>a["Numéro"])).map(v=>`<option>${v}</option>`).join("");
}
function populateDatalists() {
  const fill = (id, items) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = uniquePretty(items).map(v=>`<option value="${v}">`).join("");
  };
  const auteurs = articles.flatMap(a => splitMulti(a["Auteur(s)"]));
  const themes  = articles.flatMap(a => splitMulti(a["Theme(s)"]));
  const villes  = articles.flatMap(a => splitMulti(a["Ville(s)"]));
  fill("dl-annee",   articles.map(a=>a["Année"]));
  fill("dl-numero",  articles.map(a=>a["Numéro"]));
  fill("dl-auteurs", auteurs);
  fill("dl-villes",  villes);
  fill("dl-themes",  themes);
  fill("dl-epoques", articles.map(a=>a["Epoque"]));
}

/* ========= FILTRES / TRI / PAGINATION / RENDER ========= */
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

/* ========= FORMULAIRE (AJOUT) ========= */
function addFromForm() {
  const $ = n => document.querySelector(`#form-container [name="${n}"]`);
  const row = {
    "Année":   norm($("Année")?.value),
    "Numéro":  norm($("Numéro")?.value),
    "Titre":   norm($("Titre")?.value),
    "Page(s)": norm($("Page(s)")?.value),
    "Auteur(s)": splitMulti($("Auteur(s)")?.value).join("; "),
    "Ville(s)":  splitMulti($("Ville(s)")?.value).join("; "),
    "Theme(s)":  splitMulti($("Theme(s)")?.value).join("; "),
    "Epoque":    norm($("Epoque")?.value),
  };
  // évite doublon strict (Année+Numéro+Titre)
  if (articles.some(r => rowKey(r) === rowKey(row))) {
    alert("Doublon détecté : même Année + Numéro + Titre.");
    return;
  }
  articles.push(row);
  pendingAdds.push(row);
  currentPage = 1;
  render();
}

/* ========= CONSTRUCTION CSV ========= */
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

/* ========= GITHUB SAVE (robuste + retry 409) ========= */
function toBase64(str){ return btoa(unescape(encodeURIComponent(str))); }

async function githubLoginInline() {
  const t = prompt("Collez votre token GitHub (scope public_repo) :");
  if (!t) return;
  setToken(t);
  // test léger (404 toléré si le fichier n'existe pas encore)
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CSV_PATH}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;
  const r = await fetch(url, { headers:{ Authorization:`token ${GHTOKEN}` } });
  if (!r.ok && r.status!==404){ alert(`Token/accès KO (HTTP ${r.status})`); setToken(null); return; }
  const b=document.getElementById("login-btn"); if (b) b.textContent="🔐 Connecté (session)";
  alert("Connecté à GitHub ✅");
}

async function saveToGitHubMerged() {
  if (!GHTOKEN) { alert("Connectez-vous d’abord (🔐)."); return; }
  const headers = {
    Authorization: `token ${GHTOKEN}`,
    "Content-Type": "application/json",
    "Accept": "application/vnd.github+json",
    "Cache-Control": "no-cache"
  };
  const contentsUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CSV_PATH}`;

  // 0) Branche existante ?
  const br = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/branches/${encodeURIComponent(GITHUB_BRANCH)}`, { headers });
  if (!br.ok) { alert("Branche introuvable (ajoute un 1er commit sur 'main')."); return; }

  const getLatest = async () => {
    const r = await fetch(contentsUrl + `?ref=${encodeURIComponent(GITHUB_BRANCH)}`, { headers });
    if (r.status === 404) return { sha: null, rows: [] };
    if (!r.ok) throw new Error(`GET contents ${r.status}: ${await r.text()}`);
    const j = await r.json();
    const csv = decodeURIComponent(escape(atob(j.content)));
    return { sha: j.sha, rows: parseCsvFlexible(csv) };
  };

  // 1) repartir du dernier distant
  let { sha, rows: remoteRows } = await getLatest();

  // 2) préparer ce qu’on écrit
  let toWriteRows;
  if (APPEND_ONLY) {
    const remoteKeys = new Set(remoteRows.map(r => rowKey(r)));
    const newAdds = (pendingAdds||[]).filter(r => !remoteKeys.has(rowKey(r)));
    if (!newAdds.length && (!articles || !articles.length)) {
      alert("Rien de nouveau à enregistrer.");
      return;
    }
    toWriteRows = remoteRows.concat(newAdds.length ? newAdds : []);
  } else {
    // merge complet (si tu veux basculer un jour)
    const key = r => [r["Titre"], r["Numéro"], r["Année"]].map(v=>v||"").join("¦");
    const map = new Map(remoteRows.map(r => [key(r), r]));
    for (const r of articles) map.set(key(r), r);
    toWriteRows = Array.from(map.values());
  }

  const csvMerged = buildCsvFromArticles(toWriteRows);

  // 3) PUT + retry 409 (3 fois max)
  let attempts = 0, put;
  while (attempts < 3) {
    const body = { message: sha ? "maj UI (update)" : "maj UI (create)", content: toBase64(csvMerged), branch: GITHUB_BRANCH, ...(sha ? { sha } : {}) };
    put = await fetch(contentsUrl, { method: "PUT", headers, body: JSON.stringify(body) });
    if (put.status !== 409) break;
    // relire le dernier sha et retenter
    const latest = await getLatest();
    sha = latest.sha;
    attempts++;
  }

  if (!put.ok) {
    const txt = await put.text();
    alert(`Échec du commit : ${put.status}\n${txt}`);
    return;
  }

  // 4) succès → affichage immédiat (API) puis sync raw (5s)
  try { await loadCsvFromApi(); } catch {}
  setTimeout(() => { reloadCsv(true).catch(()=>{}); }, 5000);

  pendingAdds = [];
  alert("Modifications enregistrées ✅");
}

/* ========= EVENTS ========= */
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

  // bouton du formulaire (en haut)
  document.getElementById("save-in-drawer")?.addEventListener("click", async ()=>{
    addFromForm();              // ajoute à articles + pendingAdds
    await saveToGitHubMerged(); // enregistre + vue instantanée
  });
}

/* ========= INIT ========= */
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
