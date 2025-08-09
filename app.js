// Configuration
const GITHUB_OWNER  = "mich59139";
const GITHUB_REPO   = "test";
const GITHUB_BRANCH = "main";
const CSV_PATH      = "data/articles.csv";

// Token en session
let GHTOKEN = sessionStorage.getItem("ghtoken") || null;
const setToken = t => { GHTOKEN = t?.trim() || null; GHTOKEN ? sessionStorage.setItem("ghtoken", GHTOKEN) : sessionStorage.removeItem("ghtoken"); };

async function githubLoginInline() {
  const t = prompt("Collez votre token GitHub (scope public_repo) :");
  if (!t) return;
  setToken(t);
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CSV_PATH}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;
  const r = await fetch(url, { headers: { Authorization: `token ${GHTOKEN}` } });
  if (!r.ok && r.status !== 404) { alert(`Token/accès KO (HTTP ${r.status})`); setToken(null); return; }
  alert("Connecté à GitHub ✅ (session)");
}

function toBase64(str){ return btoa(unescape(encodeURIComponent(str))); }

async function saveToGitHub(updatedCsvText) {
  if (!GHTOKEN) { alert("Connectez-vous d’abord (🔐)."); return; }
  const headers = { Authorization: `token ${GHTOKEN}`, "Content-Type": "application/json", "Accept": "application/vnd.github+json" };
  const contentsUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CSV_PATH}`;
  const br = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/branches/${encodeURIComponent(GITHUB_BRANCH)}`, { headers });
  if (br.status === 404) { alert("Branche 'main' inexistante. Ajoutez un premier commit."); return; }
  if (!br.ok) { alert("Impossible de vérifier la branche: " + br.status); return; }
  let sha = null;
  const getRes = await fetch(contentsUrl + `?ref=${encodeURIComponent(GITHUB_BRANCH)}`, { headers });
  if (getRes.status === 200) { const cur = await getRes.json(); sha = cur.sha; }
  else if (getRes.status !== 404) { alert("Lecture impossible: " + getRes.status + "\n" + (await getRes.text())); return; }
  const body = { message: sha ? "maj UI (update)" : "maj UI (create)", content: toBase64(updatedCsvText), branch: GITHUB_BRANCH };
  if (sha) body.sha = sha;
  const putRes = await fetch(contentsUrl, { method: "PUT", headers, body: JSON.stringify(body) });
  if (!putRes.ok) { alert(`Échec du commit : ${putRes.status}\n${await putRes.text()}`); return; }
  alert("Modifications enregistrées ✅");
}

document.getElementById("login-btn").addEventListener("click", githubLoginInline);
document.getElementById("logout-btn").addEventListener("click", () => { setToken(null); alert("Token oublié (session nettoyée)."); });
document.getElementById("save-btn").addEventListener("click", () => { const csv = "Année,Numéro,Titre\n2025,1,Article test"; saveToGitHub(csv); });
