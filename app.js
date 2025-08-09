/* ========= CONFIG (adapter si besoin) ========= */
const GITHUB_OWNER  = "mich59139";
const GITHUB_REPO   = "test";
const GITHUB_BRANCH = "main";
const CSV_PATH      = "data/articles.csv";
const RAW_URL = "https://raw.githubusercontent.com/mich59139/test/main/data/articles.csv";
let GHTOKEN = localStorage.getItem("ghtoken") || null;
let ARTICLES = [];
let currentPage = 1;
let sortCol = null, sortDir = "asc";

/* ========= UTILS ========= */
const HEADERS = ["Année","Numéro","Titre","Page(s)","Auteur(s)","Ville(s)","Theme(s)","Epoque"];
const esc = v => { const s=(v??"").toString(); return /[",\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s; };
const toCSV = rows => [HEADERS.join(",")].concat(rows.map(r=>HEADERS.map(h=>esc(r[h])).join(","))).join("\n");
const decodeB64 = b64 => decodeURIComponent(escape(atob(b64)));
const encodeB64 = str => btoa(unescape(encodeURIComponent(str)));
const setBadge = (id, ok) => { const el=document.getElementById(id); if(!el)return; el.textContent = ok?"✅":"❌"; el.style.color = ok? "#16a34a":"#dc2626"; };
const uniqSorted = a => [...new Set(a.filter(Boolean))].sort((x,y)=>(""+x).localeCompare(""+y,"fr"));

/* ========= PARSEUR CSV ROBUSTE ========= */
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
    "Page(s)": row["Page(s)"] ?? "",
    "Auteur(s)": row["Auteur(s)"] ?? "",
    "Ville(s)": row["Ville(s)"] ?? "",
    "Theme(s)": row["Theme(s)"] ?? "",
    "Epoque": row["Epoque"] ?? row["Période"] ?? row["Periode"] ?? ""
  }));
  return rows.filter(r => Object.values(r).some(v => (v||"").toString().trim()!==""));
}

/* ========= RESET FILTRES ========= */
function resetFiltersUI() {
  const fA = document.getElementById("filter-annee");
  const fN = document.getElementById("filter-numero");
  const s  = document.getElementById("search");
  const l  = document.getElementById("limit");
  if (fA) fA.value = "";
  if (fN) fN.value = "";
  if (s)  s.value  = "";
  if (l)  l.value  = "50";
  currentPage = 1;
}

/* ========= LECTURE PUBLIQUE + BADGES ========= */
async function probePublicAndLoad() {
  try {
    // Lire UNIQUEMENT via RAW (pas d'API → pas de 403 CORS/rate limit)
    const r = await fetch(`${RAW_URL}?ts=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) {
      document.getElementById("articles-body").innerHTML =
        `<tr><td colspan="8">Erreur RAW: ${r.status}</td></tr>`;
      // Badges: on ne les met pas à jour via l'API pour éviter le 403.
      return;
    }

    const text = await r.text();
    ARTICLES = parseCsvFlexible(text);

    // UI
    populateFilters();
    resetFiltersUI();
    render();

    // On met les badges au vert si la lecture RAW a réussi
    setBadge("status-repo",   true);
    setBadge("status-branch", true);
    setBadge("status-file",   true);
  } catch (e) {
    console.error(e);
    document.getElementById("articles-body").innerHTML =
      `<tr><td colspan="8">Impossible de charger les données.</td></tr>`;
  }
}
/* ========= UI ========= */
function populateFilters(){
  const an=document.getElementById("filter-annee");
  const nu=document.getElementById("filter-numero");
  if (an) an.innerHTML = `<option value="">(toutes)</option>` + uniqSorted(ARTICLES.map(r=>r["Année"])).map(v=>`<option>${v}</option>`).join("");
  if (nu) nu.innerHTML = `<option value="">(tous)</option>`   + uniqSorted(ARTICLES.map(r=>r["Numéro"])).map(v=>`<option>${v}</option>`).join("");
}
function applyFiltersSortPaginate(){
  const term=(document.getElementById("search")?.value||"").toLowerCase();
  const an=document.getElementById("filter-annee")?.value||"";
  const nu=document.getElementById("filter-numero")?.value||"";
  let data=ARTICLES.filter(r=>{
    const okS=!term||Object.values(r).some(v=> (v||"").toString().toLowerCase().includes(term));
    const okA=!an||r["Année"]===an;
    const okN=!nu||r["Numéro"]===nu;
    return okS&&okA&&okN;
  });
  if (sortCol){
    const dir=sortDir==="asc"?1:-1;
    data.sort((a,b)=> (""+a[sortCol]).localeCompare(""+b[sortCol],"fr")*dir);
  }
  const limit=document.getElementById("limit")?.value||"50";
  const per=(limit==="all")?data.length:parseInt(limit,10);
  const start=(currentPage-1)*per;
  return {data,page:data.slice(start,start+per),total:data.length,per};
}
function render(){
  const tb=document.getElementById("articles-body"); if(!tb) return;
  const {page,total,per}=applyFiltersSortPaginate();
  if (!page.length) { tb.innerHTML=`<tr><td colspan="8">Aucun article trouvé.</td></tr>`; }
  else {
    tb.innerHTML = page.map(r=>`
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
  const max=Math.max(1, Math.ceil(total/(per||1)));
  document.getElementById("pageinfo").textContent=`Page ${currentPage} / ${max} — ${total} résultats`;
  document.getElementById("prev").disabled=currentPage<=1;
  document.getElementById("next").disabled=currentPage>=max;
}
function wireSorting(){
  document.querySelectorAll("th[data-col]").forEach(th=>{
    th.addEventListener("click", ()=>{
      const col=th.getAttribute("data-col");
      if (sortCol===col) sortDir = (sortDir==="asc")?"desc":"asc"; else { sortCol=col; sortDir="asc"; }
      currentPage=1; render();
    });
  });
}

/* ========= LOGIN / LOGOUT ========= */
async function githubLoginInline(){
  const t=prompt("Collez votre token GitHub (scope public_repo si repo public) :");
  if (!t) return;
  GHTOKEN=t.trim();
  localStorage.setItem("ghtoken", GHTOKEN);
  setBadge("status-auth", true);
  alert("Connecté à GitHub ✅");
}
window._login  = async ()=>{ try{ await githubLoginInline(); }catch(e){ alert(e); } };
window._logout = ()=>{ localStorage.removeItem("ghtoken"); GHTOKEN=null; setBadge("status-auth", false); alert("Déconnecté."); };

/* ========= SAVE (headers GitHub autorisés) ========= */
async function saveToGitHubMerged(newRow){
  if (!GHTOKEN){ alert("🔐 Connectez-vous d’abord."); throw new Error("no token"); }
  const headers = {
    Authorization: `token ${GHTOKEN}`,
    "Accept": "application/vnd.github+json",
    "Content-Type": "application/json"
  };
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CSV_PATH}`;

  // lire distant
  const get = await fetch(`${url}?ref=${encodeURIComponent(GITHUB_BRANCH)}`, { headers });
  let sha=null, remoteRows=[];
  if (get.status===404) remoteRows=[];
  else if (get.ok){ const j=await get.json(); sha=j.sha; remoteRows=parseCsvFlexible(decodeB64(j.content)); }
  else { const t=await get.text(); alert(`Lecture KO: ${get.status}\n${t}`); throw new Error("load failed"); }

  // merge append-only (évite doublons Année+Numéro+Titre)
  const key=r=>[r["Année"],r["Numéro"],r["Titre"]].map(v=>(v||"").toLowerCase()).join("¦");
  const seen=new Set(remoteRows.map(key));
  const merged=[...remoteRows];
  if (newRow && !seen.has(key(newRow))) merged.push(newRow);

  const bodyBase={ message: sha?"maj UI (update)":"init + ajout", content: encodeB64(toCSV(merged)), branch:GITHUB_BRANCH };
  let attempts=0; let put, bodyTxt="";
  while (attempts<3){
    put=await fetch(url,{ method:"PUT", headers, body: JSON.stringify(sha?{...bodyBase, sha}:{...bodyBase}) });
    if (put.status!==409) break;
    const r2=await fetch(`${url}?ref=${encodeURIComponent(GITHUB_BRANCH)}`, { headers });
    if (!r2.ok){ const t2=await r2.text(); alert(`Retry GET KO: ${r2.status}\n${t2}`); throw new Error("retry failed"); }
    const j2=await r2.json(); sha=j2.sha; attempts++;
  }
  bodyTxt = await put.text();
  if (!put.ok){ alert(`Commit KO: ${put.status}\n${bodyTxt.slice(0,500)}`); throw new Error("put failed"); }

  // succès → URL du commit
  let commitUrl=""; try{ const j=JSON.parse(bodyTxt); commitUrl=j?.commit?.html_url||""; }catch{}
  // relecture publique + reset filtres
  setTimeout(async ()=>{ await probePublicAndLoad(); resetFiltersUI(); render(); }, 1200);
  alert(`Enregistré ✅${commitUrl?`\nCommit: ${commitUrl}`:""}`);
  if (commitUrl) console.log("Commit:", commitUrl);
}

/* ========= INIT CSV SI MANQUANT ========= */
async function initCsvIfMissing(){
  if (!GHTOKEN){ alert("🔐 Connectez-vous d’abord."); return; }
  const headers = { Authorization:`token ${GHTOKEN}`, "Accept":"application/vnd.github+json", "Content-Type":"application/json" };
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CSV_PATH}`;
  const get = await fetch(`${url}?ref=${encodeURIComponent(GITHUB_BRANCH)}`, { headers });
  if (get.ok){ alert("Le fichier existe déjà — aucune action."); return; }
  if (get.status!==404){ const t=await get.text(); alert(`Erreur: ${get.status}\n${t}`); return; }
  const body = { message:"init: create data/articles.csv", content: encodeB64(HEADERS.join(",")+"\n"), branch:GITHUB_BRANCH };
  const put = await fetch(url, { method:"PUT", headers, body: JSON.stringify(body) });
  if (!put.ok){ const t=await put.text(); alert(`Création KO: ${put.status}\n${t}`); return; }
  alert("CSV initialisé ✅"); await probePublicAndLoad(); resetFiltersUI(); render();
}

/* ========= HANDLERS GLOBAUX (onclick HTML) ========= */
window._save = async ()=>{ try{
  if (!ARTICLES.length){ alert("Rien à enregistrer."); return; }
  await saveToGitHubMerged(ARTICLES[0]); // déclenche le merge/commit
} catch(e){ alert("Save: "+(e?.message||e)); } };

window._init = async ()=>{ try{ await initCsvIfMissing(); }catch(e){ alert("Init: "+e.message); } };

window._add = async (ev)=>{ try{
  if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
  const get=id=>document.getElementById(id)?.value?.trim()||"";
  const row={ "Année":get("add-annee"), "Numéro":get("add-numero"), "Titre":get("add-titre"),
              "Page(s)":get("add-pages"), "Auteur(s)":get("add-auteurs"), "Ville(s)":get("add-villes"),
              "Theme(s)":get("add-themes"), "Epoque":get("add-epoque") };
  if (!row["Titre"]) { alert("Le champ Titre est obligatoire."); return; }
  ARTICLES.unshift(row); currentPage=1; render();
  if (!GHTOKEN){ alert("Ajout local OK. Pour enregistrer dans GitHub, cliquez 🔐 puis réessayez."); return; }
  await saveToGitHubMerged(row);
} catch(e){ alert("Add: "+(e?.message||e)); } };

/* ========= EVENTS ========= */
document.addEventListener("DOMContentLoaded", async ()=>{
  await probePublicAndLoad();

  document.getElementById("prev")?.addEventListener("click", ()=>{ currentPage=Math.max(1,currentPage-1); render(); });
  document.getElementById("next")?.addEventListener("click", ()=>{ currentPage=currentPage+1; render(); });
  document.getElementById("filter-annee")?.addEventListener("change", ()=>{ document.getElementById("filter-numero").value=""; currentPage=1; render(); });
  document.getElementById("filter-numero")?.addEventListener("change", ()=>{ document.getElementById("filter-annee").value=""; currentPage=1; render(); });
  document.getElementById("limit")?.addEventListener("change", ()=>{ currentPage=1; render(); });
  document.getElementById("search")?.addEventListener("input", ()=>{ currentPage=1; render(); });

  document.querySelectorAll("th[data-col]").forEach(th=>{
    th.addEventListener("click", ()=>{
      const col=th.getAttribute("data-col");
      if (sortCol===col) sortDir = (sortDir==="asc")?"desc":"asc"; else { sortCol=col; sortDir="asc"; }
      currentPage=1; render();
    });
  });

  setBadge("status-auth", !!GHTOKEN);
});
