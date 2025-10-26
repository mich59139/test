async function loadRefCSV(file) {
  const resp = await fetch(file);
  const text = (await resp.text()).trim();
  const lines = text.split(/\r?\n/);
  // suppose format "Nom,...", ignore les colonnes suivantes
  return lines.slice(1).map(line => line.split(',')[0].replace(/"/g,'').trim()).filter(Boolean);
}

async function loadCSV(file) {
  const resp = await fetch(file);
  const text = (await resp.text()).trim();
  const lines = text.split(/\r?\n/);
  const separator = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(separator).map(h => h.trim());
  const data = lines.slice(1).map(line => {
    const values = line.split(separator);
    return values.map(v => v ? v.replace(/"/g, '').trim() : "");
  });
  return {headers, data};
}

window.validatePwd = function() {
  let value = document.getElementById("accessPwd").value;
  // Tu choisis ton propre mot de passe ici ("vizille2025" par exemple)
  if (value === "vizille2025") {
    window.editEnabled = true;
    document.getElementById("showAddForm").style.display = 'inline-block';
    document.getElementById("protectZone").style.display = 'none';
    document.getElementById("protectMsg").innerText = "";
  } else {
    document.getElementById("protectMsg").innerText = "Mot de passe incorrect.";
  }
};

async function init() {
  const {headers, data} = await loadCSV("articles.csv");
  const auteursList = await loadRefCSV("auteurs.csv");
  const villesList = await loadRefCSV("villes.csv");
  const themesList = await loadRefCSV("themes.csv");
  let table = null;

  $(document).ready(function () {
    table = $('#articlesTable').DataTable({
      data: data.map(row => [...row, ""]),
      columns: [
        ...headers.map(h => ({title: h})),
        {
          title: "Actions",
          data: null,
          orderable: false,
          defaultContent: `
            <button class="validateBtn">Valider</button>
            <button class="editBtn">Modifier</button>
            <button class="deleteBtn">Supprimer</button>
          `
        }
      ],
      pageLength: 50,
      lengthMenu: [[50, 100, -1], [50, 100, "Toutes"]],
      language: {
        url: "https://cdn.datatables.net/plug-ins/1.13.6/i18n/fr-FR.json"
      }
    });

    fillSelect("addAuteur", auteursList);
    fillSelect("addVille", villesList);
    fillSelect("addTheme", themesList);

    function fillSelect(elementId, values) {
      const sel = document.getElementById(elementId);
      if (sel) {
        sel.innerHTML = '';
        values.forEach(val => {
          const opt = document.createElement("option");
          opt.value = val;
          opt.text = val;
          sel.add(opt);
        });
      }
    }

    // Protection édition : cacher les boutons tant que non validé
    document.getElementById("showAddForm").style.display = "none";
    document.getElementById("protectZone").style.display = "block";
    window.editEnabled = false;

    $("#showAddForm").on("click", function() {
      if (window.editEnabled) $("#addFormContainer").show();
    });
    $("#cancelAdd").on("click", function() {
      $("#addFormContainer").hide();
      window.rowToEdit = null;
    });
    $('#articlesTable tbody').on('click', '.editBtn', function() {
      if (!window.editEnabled) return;
      const data = table.row($(this).closest('tr')).data();
      $("#addForm [name='Année']").val(data[0]);
      $("#addForm [name='Numéro']").val(data[1]);
      $("#addForm [name='Titre']").val(data[2]);
      $("#addForm [name='Page(s)']").val(data[3]);
      $("#addForm [name='Auteur(s)']").val(data[4]);
      $("#addForm [name='Ville(s)']").val(data[5]);
      $("#addForm [name='Theme(s)']").val(data[6]);
      $("#addForm [name='Epoque']").val(data[7]);
      $("#addFormContainer").show();
      window.rowToEdit = $(this).closest('tr');
    });

    $('#articlesTable tbody').on('click', '.validateBtn', function() {
      if (!window.editEnabled) return;
      $(this).closest('tr').css("background", "#e7fbe8");
    });

    $('#articlesTable tbody').on('click', '.deleteBtn', function() {
      if (!window.editEnabled) return;
      table.row($(this).closest('tr')).remove().draw();
      window.rowToEdit = null;
    });

    $("#addForm").on("submit", function(e){
      e.preventDefault();
      if (!window.editEnabled) return;
      const fd = new FormData(e.target);
      const newRow = [
        fd.get("Année"),
        fd.get("Numéro"),
        fd.get("Titre"),
        fd.get("Page(s)"),
        fd.get("Auteur(s)"),
        fd.get("Ville(s)"),
        fd.get("Theme(s)"),
        fd.get("Epoque"),
        ""
      ].map(cell => cell ? cell.replace(/"/g,'') : "");

      if (window.rowToEdit) {
        table.row(window.rowToEdit).data(newRow).draw();
        window.rowToEdit = null;
      } else {
        table.row.add(newRow).draw();
      }
      e.target.reset();
      $("#addFormContainer").hide();
    });
  });
}

window.onload = init;
