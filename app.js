// Fonction universelle de lecture CSV avec détection du séparateur
async function loadCSV(file) {
  const resp = await fetch(file);
  const text = (await resp.text()).trim(); // Correction ! Utilisation de await avant .trim()
  const lines = text.split(/\r?\n/);

  // Détecte le séparateur utilisé : "," ou ";"
  const separator = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(separator).map(h => h.trim());

  const data = lines.slice(1).map(line => {
    const values = line.split(separator);
    const record = {};
    headers.forEach((head, i) => record[head] = values[i] ? values[i].trim() : "");
    return record;
  });
  return data;
}

// Initialisation principale
async function init() {
  // Chargement des fichiers CSV
  const articles = await loadCSV("articles.csv");
  const villes = await loadCSV("villes.csv");
  const themes = await loadCSV("themes.csv");
  const auteurs = await loadCSV("auteurs.csv");

  // Sélecteurs de filtres
  const villeSelect = document.getElementById("villeFilter");
  const themeSelect = document.getElementById("themeFilter");
  const auteurSelect = document.getElementById("auteurFilter");
  const tbody = document.querySelector("#articlesTable tbody");

  // Fonction utilitaire pour valeurs uniques triées
  const uniqueValues = (arr, key) => Array.from(new Set(
    arr.map(a => a[key])
      .filter(Boolean)
      .flatMap(v => v.split(","))
      .map(s => s.trim())
  )).sort();

  // Fonction pour remplir les menus déroulants
  function populateSelect(select, values) {
    select.innerHTML = "<option value=''>— Toutes —</option>";
    values.forEach(v => { select.innerHTML += `<option value="${v}">${v}</option>`; });
  }

  populateSelect(villeSelect, uniqueValues(articles, "Ville(s)"));
  populateSelect(themeSelect, uniqueValues(articles, "Theme(s)"));
  populateSelect(auteurSelect, uniqueValues(articles, "Auteur(s)"));

  // Rendu du tableau principal
  function renderTable() {
    const vf = villeSelect.value;
    const tf = themeSelect.value;
    const af = auteurSelect.value;
    tbody.innerHTML = "";

    articles
      .filter(a =>
        (!vf || a["Ville(s)"].includes(vf)) &&
        (!tf || a["Theme(s)"].includes(tf)) &&
        (!af || a["Auteur(s)"].includes(af))
      )
      .forEach(a => {
        tbody.innerHTML += `
          <tr>
            <td>${a["Numéro"]}</td>
            <td>${a["Titre"]}</td>
            <td>${a["Auteur(s)"]}</td>
            <td>${a["Ville(s)"]}</td>
            <td>${a["Theme(s)"]}</td>
            <td>${a["Année"]}</td>
            <td>${a["Page(s)"]}</td>
            <td>${a["Epoque"]}</td>
          </tr>`;
      });
  }

  // Rafraîchit la table à chaque changement de filtre
  [villeSelect, themeSelect, auteurSelect].forEach(el =>
    el.addEventListener("change", renderTable)
  );

  // Bouton de réinitialisation
  document.getElementById("reset").addEventListener("click", () => {
    villeSelect.value = themeSelect.value = auteurSelect.value = "";
    renderTable();
  });

  // Affichage initial
  renderTable();
}

// Lancement de l’application
window.onload = init;
