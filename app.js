async function loadCSV(file) {
  const resp = await fetch(file);
  const text = await resp.text();
  const [header, ...rows] = text.split("\n").filter(r => r.trim());
  const headers = header.split(",");
  return rows.map(r => {
    const values = r.split(",");
    return Object.fromEntries(headers.map((h, i) => [h.trim(), values[i]?.trim()]));
  });
}

async function init() {
  const [articles, villes, themes, auteurs] = await Promise.all([
    loadCSV("articles.csv"),
    loadCSV("villes.csv"),
    loadCSV("themes.csv"),
    loadCSV("auteurs.csv")
  ]);

  const villeSelect = document.getElementById("villeFilter");
  const themeSelect = document.getElementById("themeFilter");
  const auteurSelect = document.getElementById("auteurFilter");
  const tbody = document.querySelector("#articlesTable tbody");

  function populateSelect(select, data, key = "Nom") {
    select.innerHTML = '<option value="">— Toutes —</option>';
    data.forEach(item => {
      const val = item[key];
      if (val) select.innerHTML += `<option value="${val}">${val}</option>`;
    });
  }

  populateSelect(villeSelect, villes);
  populateSelect(themeSelect, themes);
  populateSelect(auteurSelect, auteurs, "Auteur");

  function renderTable() {
    const vf = villeSelect.value;
    const tf = themeSelect.value;
    const af = auteurSelect.value;
    tbody.innerHTML = "";

    articles
      .filter(a =>
        (!vf || a.Ville === vf) &&
        (!tf || a.Thème === tf) &&
        (!af || a.Auteur === af)
      )
      .forEach(a => {
        tbody.innerHTML += `<tr>
          <td>${a.Titre}</td><td>${a.Auteur}</td><td>${a.Ville}</td><td>${a.Thème}</td><td>${a.Année}</td>
        </tr>`;
      });
  }

  [villeSelect, themeSelect, auteurSelect].forEach(sel =>
    sel.addEventListener("change", renderTable)
  );
  document.getElementById("reset").addEventListener("click", () => {
    villeSelect.value = themeSelect.value = auteurSelect.value = "";
    renderTable();
  });

  renderTable();
}

window.onload = init;
