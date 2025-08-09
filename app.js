/* ========= CONFIG ========= */
const GITHUB_OWNER  = "mich59139";
const GITHUB_REPO   = "test";
const GITHUB_BRANCH = "main";
const CSV_PATH      = "data/articles.csv";
const RAW_URL       = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${CSV_PATH}`;

let GHTOKEN = localStorage.getItem("ghtoken") || null;
let ARTICLES = [];
let currentPage = 1;
let rowsPerPage = 50;
let sortCol = null, sortDir = "asc";

/* ========= UTIL ========= */
const HEADERS = ["Année","Numéro","Titre","Page(s)","Auteur(s)","Ville(s)","Theme(s)","Epoque"];
const esc = v => {
  const s = (v ?? "").toString();
  return /[",\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s;
};
const toCSV = rows => [HEADERS.join(",")].concat(rows.map(r=>HEADERS.map(h=>esc(r[h])).join(","))).join("\n");
const decodeB64 = b64 => decodeURIComponent(escape(atob(b64)));
const encodeB64 = str => btoa(unescape(encodeURIComponent(str)));
const setBadge = (id, ok) => { const el=document.getElementById(id); if(!el)return; el.textContent = ok?"✅":"❌"; el.style.color = ok? "var(--ok)":"var(--err)"; };

/* ========= PARSEUR ROBUSTE ========= */
function normalizeHeader(h) {
  const t = (h||"").trim();
  if (/^annee$/i.test(t) || /^année$/i.test(t)) return "Année";
  if (/^numero$/i.test(t) || /^numéro$/i.test(t)) return "Numéro";
  if (/^titre$/i.test(t)) return "Titre";
  if (/^pages?$/i.test(t)) return "Page(s)";
  if (/^auteurs?(\(s\))?$/i.test(t)) return "Auteur(s)";
  if (/^villes?(\(s\))?$/i.test(t)) return "Ville(s)";
  if (/^themes?(\(s\))?$/i.test(t)) return "Theme(s)";
  if (/^(periode|période|epoque|époque)$/i.test(t)) return "Epoque";
  return t;
}
function papaParseWith(delim, text){
  return Papa.parse(text, { header:true, skipEmptyLines:true, delimiter:delim, transformHeader: normalizeHeader });
}
function parseCsvFlexible(text) {
  if (text && text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  let r = papaParseWith(",", text);
  if ((r.meta.fields||[]).length<=1 && text.includes(";")) r = papaParseWith(";", text);
  const rows = (r.data||[]).map(row => ({
    "Année": row["Année"] ?? "",
    "Numéro": row["Numéro"] ?? "",
    "Titre": row["Titre"] ?? "",
    "Page(s)": row["Page(s]"] ?? row["Page(s)"] ?? "",
    "Auteur(s)": row["Auteur(s)"] ?? "",
    "Ville(s)": row["Ville(s)"] ?? "",
    "Theme(s)": row["Theme(s)"] ?? "",
    "Epoque": row["Epoque"] ?? row["Période"] ?? row["Periode"] ?? ""
  }));
  return rows.filter(r => Object.values(r).some(v => (v||"").toString().trim()!==""));
}

/* ========= LECTURE PUBLIQUE + BADGES ========= */
async function probePublicAndLoad() {
  const repoUrl   = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
  const branchUrl = `${repoUrl}/branches/${encodeURIComponent(GITHUB_BRANCH)}`;
  const fileUrl   = `${repoUrl}/contents/${CSV_PATH}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;
  try {
    const [rRepo, rBr, rFile] = await Promise.all([fetch(repoUrl), fetch(branchUrl), fetch(fileUrl)]);
    setBadge("status-repo", rRepo.ok);
    setBadge("status-branch", rBr.ok);
    setBadge("status-file", rFile.ok);
    if (rRepo.ok && rBr.ok && rFile.ok) {
      const r = await fetch(`${RAW_URL}?ts=${Date.now()}`, { cache: "no-store" });
      if (r.ok) {
        const text = await r.text();
        ARTICLES = parseCsvFlexible(text);
        populateFilters();
        render();
      } else {
        document.getElementById("articles-body").innerHTML = `<tr><td colspan="8">Erreur RAW: ${r.status}</td></tr>`;
      }
    } else {
      document.getElementById("articles-body").innerHTML = `<tr><td colspan="8">Aucun article trouvé.</td></tr>`;
    }
  } catch (e) {
    console.error(e);
  }
}

/* ========= UI ========= */
function applyFiltersSortPaginate() {
  const term = (document.getElementById("search")?.value || "").toLowerCase();
  const an = document.getElementById("filter-annee")?.value || "";
  const nu = document.getElementById("filter-numero")?.value || "";
  let data = ARTICLES.filter(r=>{
    const okSearch = !term || Object.values(r).some(v=> (v||"").toString().toLowerCase().includes(term));
    const okAn = !an || r["Année"]===an;
    const okNu = !nu || r["Numéro"]===nu;
    return okSearch && okAn && okNu;
  });
  if (sortCol) {
    const dir = sortDir==="asc" ? 1 : -1;
    data.sort((a,b)=> (""+a[sortCol]).localeCompare(""+b[sortCol],"fr")*dir);
  }
  const limit = document.getElementById("limit")?.value || "50";
  const per = (limit==="all") ? data.length : parseInt(limit,10);
  const start = (currentPage-1)*per;
  return { data, page: data.slice(start, start+per), total: data.length, per };
}
function render() {
  const tbody = document.getElementById("articles-body");
  if (!tbody) return;
  const { data, page, total, per } = applyFiltersSortPaginate();
  if (!page.length) {
    tbody.innerHTML = `<tr><td colspan="8">Aucun article trouvé.</td></tr>`;
  } else {
    tbody.innerHTML = page.map(r=>`
      <tr>
        <td>${r["Année"]||""}</td>
        <td>${r["Numéro"]||""}</td>
        <td>${r["Titre"]||""}</td>
        <td>${r["Page(s)"]||""}</td>
        <td>${r["Auteur(s)"]||""}</td>
        <td>${r["Ville(s)"]||""}</td>
        <td>${r["Theme(s)"]||""}</td>
        <td>${r["Epoque"]||""}</td>
      </tr>
    `).join("");
  }
  const maxPage = Math.max(1, Math.ceil(total / (per||1)));
  document.getElementById("pageinfo").textContent = `Page ${currentPage} / ${maxPage} — ${total} résultats`;
  document.getElementById("prev").disabled = currentPage<=1;
  document.getElementById("next").disabled = currentPage>=maxPage;
}
function populateFilters() {
  const an = document.getElementById("filter-annee");
  const nu = document.getElementById("filter-numero");
  const uniq = arr => [...new Set(arr.filter(Boolean))].sort((a,b)=>(""+a).localeCompare(""+b,"fr"));
  if (an) an.innerHTML = `<option value="">(toutes)</option>` + uniq(ARTICLES.map(a=>a["Année"])).map(v=>`<option>${v}</option>`).join("");
  if (nu) nu.innerHTML = `<option value="">(tous)</option>`   + uniq(ARTICLES.map(a=>a["Numéro"])).map(v=>`<option>${v}</option>`).join("");
}

/* ========= TRI ========= */
function wireSorting(){
  document.querySelectorAll("th[data-col]").forEach(th=>{
    th.addEventListener("click", ()=>{
      const col = th.getAttribute("data-col");
      if (sortCol===col) sortDir = (sortDir==="asc")?"desc":"asc"; else { sortCol=col; sortDir="asc"; }
      currentPage = 1; render();
    });
  });
}

/* ========= AJOUT + SAVE ========= */
async function githubLoginInline() {
  const t = prompt("Collez votre token GitHub (scope public_repo) :");
  if (!t) return;
  GHTOKEN = t.trim();
  localStorage.setItem("ghtoken", GHTOKEN);
  setBadge("status-auth", true);
  alert("Connecté à GitHub ✅");
}
window._login = async ()=>{ try{ await githubLoginInline(); }catch(e){ alert(e); } };

async function saveToGitHubMerged(newRow) {
  if (!GHTOKEN) { alert("Connectez-vous d’abord (🔐)."); throw new Error("no token"); }
  const headers = { Authorization:`token ${GHTOKEN}`, "Accept":"application/vnd.github+json", "Content-Type":"application/json", "Cache-Control":"no-cache" };
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CSV_PATH}`;

  // lire le distant
  const get = await fetch(`${url}?ref=${encodeURIComponent(GITHUB_BRANCH)}`, { headers });
  let sha=null, remoteRows=[];
  if (get.status===404) {
    remoteRows=[];
  } else if (get.ok){
    const j=await get.json();
    sha=j.sha;
    remoteRows = parseCsvFlexible(decodeB64(j.content));
  } else { throw new Error(`GET ${get.status}`); }

  // fusion append-only (évite doublons Année+Numéro+Titre)
  const key = r => [r["Année"],r["Numéro"],r["Titre"]].map(v=>(v||"").toLowerCase()).join("¦");
  const seen = new Set(remoteRows.map(key));
  const merged = [...remoteRows];
  if (newRow && !seen.has(key(newRow))) merged.push(newRow);

  // PUT + retry 409
  const bodyBase = { message: sha ? "maj UI (update)" : "init + ajout", content: encodeB64(toCSV(merged)), branch: GITHUB_BRANCH };
  let attempts=0;
  while (attempts<3){
    const put = await fetch(url, { method:"PUT", headers, body: JSON.stringify(sha? {...bodyBase, sha} : bodyBase) });
    if (put.status!==409){
      if (!put.ok) throw new Error(`PUT ${put.status}: ${await put.text()}`);
      // succès → recharger
      await probePublicAndLoad();
      return;
    }
    // conflit → relire sha et retenter
    const r2 = await fetch(`${url}?ref=${encodeURIComponent(GITHUB_BRANCH)}`, { headers });
    if (!r2.ok) throw new Error(`GET after 409 ${r2.status}`);
    const j2 = await r2.json(); sha=j2.sha; attempts++;
  }
  throw new Error("Conflit 409 persistant. Réessaie dans quelques secondes.");
}

/* ========= INIT CSV SI MANQUANT ========= */
async function initCsvIfMissing(){
  if (!GHTOKEN){ alert("Connectez-vous d’abord (🔐)."); return; }
  const headers = { Authorization:`token ${GHTOKEN}`, "Content-Type":"application/json", "Accept":"application/vnd.github+json" };
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CSV_PATH}`;
  const get = await fetch(`${url}?ref=${encodeURIComponent(GITHUB_BRANCH)}`, { headers });
  if (get.ok){ alert("Le fichier existe déjà — aucune action."); return; }
  if (get.status!==404){ alert("Erreur: "+get.status); return; }
  const body = { message:"init: create data/articles.csv", content: encodeB64(HEADERS.join(",")+"\n"), branch:GITHUB_BRANCH };
  const put = await fetch(url, { method:"PUT", headers, body: JSON.stringify(body) });
  if (!put.ok){ alert("Échec création: "+put.status+"\n"+await put.text()); return; }
  alert("CSV initialisé ✅");
  await probePublicAndLoad();
}

/* ========= EVENTS ========= */
document.addEventListener("DOMContentLoaded", async ()=>{
  // lecture publique + badges
  await probePublicAndLoad();

  // listeners
  document.getElementById("logout-btn")?.addEventListener("click", ()=>{ localStorage.removeItem("ghtoken"); location.reload(); });
  document.getElementById("save-btn")?.addEventListener("click", async ()=>{
    if (!ARTICLES.length){ alert("Rien à enregistrer."); return; }
    try { await saveToGitHubMerged(ARTICLES[0]); alert("Enregistré ✅"); } catch(e){ alert(e.message); }
  });
  document.getElementById("init-btn")?.addEventListener("click", initCsvIfMissing);
  document.getElementById("add-btn")?.addEventListener("click", async ()=>{
    const row = {
      "Année":    document.getElementById("add-annee").value.trim(),
      "Numéro":   document.getElementById("add-numero").value.trim(),
      "Titre":    document.getElementById("add-titre").value.trim(),
      "Page(s)":  document.getElementById("add-pages").value.trim(),
      "Auteur(s)":document.getElementById("add-auteurs").value.trim(),
      "Ville(s)": document.getElementById("add-villes").value.trim(),
      "Theme(s)": document.getElementById("add-themes").value.trim(),
      "Epoque":   document.getElementById("add-epoque").value.trim(),
    };
    if (!row["Titre"]){ alert("Le champ Titre est obligatoire."); return; }
    ARTICLES.unshift(row); currentPage=1; render();
    try { await saveToGitHubMerged(row); alert("Article ajouté ✅"); } catch(e){ alert("Échec : "+e.message); }
  });

  // filtres + recherche + pagination
  document.getElementById("filter-annee")?.addEventListener("change", ()=>{ document.getElementById("filter-numero").value=""; currentPage=1; render(); });
  document.getElementById("filter-numero")?.addEventListener("change", ()=>{ document.getElementById("filter-annee").value=""; currentPage=1; render(); });
  document.getElementById("limit")?.addEventListener("change", ()=>{ currentPage=1; render(); });
  document.getElementById("search")?.addEventListener("input", ()=>{ currentPage=1; render(); });
  document.getElementById("prev")?.addEventListener("click", ()=>{ currentPage=Math.max(1,currentPage-1); render(); });
  document.getElementById("next")?.addEventListener("click", ()=>{ currentPage=currentPage+1; render(); });

  // tri
  wireSorting();

  // badge auth si token déjà stocké
  setBadge("status-auth", !!GHTOKEN);
});
