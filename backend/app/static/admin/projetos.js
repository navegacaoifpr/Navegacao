// voltar pra tela de projetos encerra o login anterior: entrar em
// qualquer projeto (inclusive no mesmo) pede usuário e senha de novo
localStorage.removeItem("session");
localStorage.removeItem("isAdmin");

const grid = document.getElementById("project-grid");
const modal = document.getElementById("project-modal");
const form = document.getElementById("project-form");
const errorEl = document.getElementById("project-error");

// áreas de escolher a foto (com prévia)
const newCoverPicker = setupCoverPicker(document.getElementById("p-cover"));
const editCoverPicker = setupCoverPicker(document.getElementById("ep-cover"), "Capa atual. Clique para trocar.");

async function loadProjects(){
  grid.innerHTML = "";

  try{
    // com a conta conectada, a lista vem com a marca "is_mine" (projetos da sua conta)
    const token = await getAccessToken();
    const res = await fetch(`${API}/projects/`, {
      headers: token ? { "Authorization": `Bearer ${token}` } : {}
    });

    if(!res.ok){
      throw new Error(await readError(res, "Não deu pra carregar os projetos."));
    }

    const projects = await res.json();
    projects.forEach(p => grid.appendChild(buildProjectCard(p)));
  }catch(err){
    const msg = err instanceof TypeError
      ? "Não foi possível conectar ao servidor. O backend está rodando?"
      : err.message;

    grid.innerHTML = `<p class="empty-state">${escapeHtml(msg)}</p>`;
    return;
  }

  grid.appendChild(buildAddCard());
}

function buildProjectCard(project){
  const slot = document.createElement("div");
  slot.className = "card-slot";

  const cover = imageUrl(project.cover_image);

  slot.innerHTML = `
    <div class="card">
      ${cardImageHtml(cover, project.name)}
      <div class="card-body">
        <i class="bi bi-building"></i>
        <span class="card-title">${escapeHtml(project.name)}</span>
        ${project.is_mine ? '<span class="badge-dono">Seu projeto</span>' : ""}
      </div>
      ${project.description ? `<div class="card-info">${escapeHtml(project.description)}</div>` : ""}
      <button class="card-menu-btn" title="Opções"><i class="bi bi-three-dots-vertical"></i></button>
    </div>
  `;

  // entrar no projeto sempre pede o login dele
  slot.querySelector(".card").addEventListener("click", () => {
    window.location.href = `login.html?project=${project.id}`;
  });

  slot.querySelector(".card-menu-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    openCardMenu(e, project);
  });

  return slot;
}

function buildAddCard(){
  const slot = document.createElement("div");
  slot.className = "card-slot";

  slot.innerHTML = `
    <div class="card card-add">
      <i class="bi bi-plus-lg"></i>
      Novo projeto
    </div>
  `;

  slot.querySelector(".card").addEventListener("click", openModal);
  return slot;
}

async function openModal(){
  // criar projeto exige estar com a conta logada: quem cria vira o dono
  const user = await getAccountUser();

  if(!user){
    window.location.href = "acesso.html?mode=signup&next=projetos.html";
    return;
  }

  form.reset();
  newCoverPicker.reset(null);
  errorEl.classList.add("hidden");
  document.getElementById("project-owner").textContent = `Você (${user.email}) será o dono deste projeto.`;
  modal.classList.remove("hidden");
  document.getElementById("p-name").focus();
}

function closeModal(){
  modal.classList.add("hidden");
}

function showError(message){
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
}

modal.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", closeModal));

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.classList.add("hidden");

  const name = document.getElementById("p-name").value.trim();
  const description = document.getElementById("p-description").value.trim();
  const coverFile = document.getElementById("p-cover").files[0];

  const token = await getAccessToken();

  if(!token){
    window.location.href = "acesso.html?next=projetos.html";
    return;
  }

  const submit = document.getElementById("project-submit");
  submit.disabled = true;

  try{
    const res = await fetch(`${API}/projects/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ name, description: description || null })
    });

    if(!res.ok){
      showError(await readError(res, "Não deu pra cadastrar o projeto."));
      return;
    }

    const data = await res.json();

    let coverFailed = null;

    if(coverFile){
      const coverRes = await uploadCover(data.project.id, coverFile, token);

      if(!coverRes.ok){
        coverFailed = await readError(coverRes, "erro ao enviar a imagem.");
      }
    }

    if(coverFailed){
      // o projeto já existe: fecha o formulário e avisa, a capa se troca depois em "Editar projeto"
      closeModal();
      painelToast(`Projeto criado, mas a capa não foi enviada: ${coverFailed}`, "error");
      loadProjects();
      return;
    }

    // quem cadastrou já entra direto no projeto novo
    saveSession(data.project, token);
    window.location.href = "ambientes.html";

  }catch{
    showError("Não foi possível conectar ao servidor. O backend está rodando?");
  }finally{
    submit.disabled = false;
  }
});

/* =========================
   FOTO DE CAPA DO PROJETO
========================= */

async function uploadCover(projectId, file, token){
  const upload = new FormData();
  upload.append("file", file);

  return fetch(`${API}/projects/${projectId}/cover`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` },
    body: upload
  });
}

let popover = null;

function closePopover(){
  if(popover){
    popover.remove();
    popover = null;
  }
}

document.addEventListener("click", closePopover);

function openCardMenu(event, project){
  closePopover();

  popover = document.createElement("div");
  popover.className = "popover";
  popover.innerHTML = `
    <div class="popover-item" data-action="edit"><i class="bi bi-pencil"></i> Editar projeto e capa</div>
    <div class="popover-item danger-item" data-action="delete"><i class="bi bi-trash"></i> Excluir projeto</div>
  `;
  document.body.appendChild(popover);

  const rect = popover.getBoundingClientRect();
  popover.style.left = `${Math.max(10, Math.min(event.clientX, window.innerWidth - rect.width - 10))}px`;
  popover.style.top = `${Math.max(10, Math.min(event.clientY + 8, window.innerHeight - rect.height - 10))}px`;

  popover.addEventListener("click", e => e.stopPropagation());
  popover.querySelector("[data-action=edit]").addEventListener("click", () => {
    closePopover();
    openEditModal(project);
  });
  popover.querySelector("[data-action=delete]").addEventListener("click", () => {
    closePopover();
    openDeleteModal(project);
  });
}

/* =========================
   EXCLUIR PROJETO
========================= */

const deleteModal = document.getElementById("delete-modal");
const deleteInput = document.getElementById("delete-confirm-name");
const deleteBtn = document.getElementById("delete-confirm");
const deleteError = document.getElementById("delete-error");
let deletingProject = null;

function openDeleteModal(project){
  deletingProject = project;
  deleteInput.value = "";
  deleteBtn.disabled = true;
  deleteError.classList.add("hidden");
  document.getElementById("delete-name").textContent = project.name;
  deleteModal.classList.remove("hidden");
  deleteInput.focus();
}

function closeDeleteModal(){
  deleteModal.classList.add("hidden");
  deletingProject = null;
}

deleteModal.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", closeDeleteModal));

// o botão só libera quando o nome digitado é igual ao do projeto
deleteInput.addEventListener("input", () => {
  deleteBtn.disabled = !deletingProject || deleteInput.value.trim() !== deletingProject.name;
});

deleteBtn.addEventListener("click", async () => {
  if(!deletingProject) return;

  const showDeleteError = (msg) => {
    deleteError.textContent = msg;
    deleteError.classList.remove("hidden");
  };

  deleteError.classList.add("hidden");

  const token = await getAccessToken();

  if(!token){
    window.location.href = "acesso.html?next=projetos.html";
    return;
  }

  deleteBtn.disabled = true;

  try{
    const res = await fetch(`${API}/projects/${deletingProject.id}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });

    if(!res.ok){
      showDeleteError(await readError(res, "Não deu pra excluir o projeto."));
      deleteBtn.disabled = false;
      return;
    }

    const name = deletingProject.name;
    closeDeleteModal();
    painelToast(`"${name}" excluído.`);
    loadProjects();
  }catch{
    showDeleteError("Não foi possível conectar ao servidor. O backend está rodando?");
    deleteBtn.disabled = false;
  }
});

/* =========================
   EDITAR PROJETO (nome, descrição e capa)
========================= */

const editModal = document.getElementById("edit-modal");
const editForm = document.getElementById("edit-form");
const editError = document.getElementById("edit-error");
let editingProject = null;

function openEditModal(project){
  editingProject = project;
  editForm.reset();
  editError.classList.add("hidden");

  document.getElementById("edit-modal-title").textContent = `Editar · ${project.name}`;
  document.getElementById("ep-name").value = project.name;
  document.getElementById("ep-description").value = project.description || "";
  editCoverPicker.reset(imageUrl(project.cover_image));

  editModal.classList.remove("hidden");
  document.getElementById("ep-name").focus();
}

function closeEditModal(){
  editModal.classList.add("hidden");
}

editModal.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", closeEditModal));

editForm.addEventListener("submit", async e => {
  e.preventDefault();
  editError.classList.add("hidden");

  const showEditError = (msg) => {
    editError.textContent = msg;
    editError.classList.remove("hidden");
  };

  const name = document.getElementById("ep-name").value.trim();
  const description = document.getElementById("ep-description").value.trim();
  const file = document.getElementById("ep-cover").files[0];

  if(!name){
    showEditError("Informe o nome do projeto.");
    return;
  }

  const token = await getAccessToken();

  if(!token){
    window.location.href = "acesso.html?next=projetos.html";
    return;
  }

  const submit = document.getElementById("edit-submit");
  submit.disabled = true;

  try{
    const res = await fetch(`${API}/projects/${editingProject.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ name, description })
    });

    if(!res.ok){
      showEditError(await readError(res, "Não deu pra salvar o projeto."));
      return;
    }

    if(file){
      const coverRes = await uploadCover(editingProject.id, file, token);

      if(!coverRes.ok){
        showEditError(`Nome e descrição foram salvos, mas a capa não: ${await readError(coverRes, "erro ao enviar a imagem.")}`);
        loadProjects();
        return;
      }
    }

    closeEditModal();
    painelToast("Projeto atualizado!");
    loadProjects();
  }catch{
    showEditError("Não foi possível conectar ao servidor. O backend está rodando?");
  }finally{
    submit.disabled = false;
  }
});

loadProjects();
