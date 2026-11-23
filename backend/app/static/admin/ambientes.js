const session = requireSession();

const grid = document.getElementById("env-grid");
const interGrid = document.getElementById("inter-grid");
const modal = document.getElementById("env-modal");
const form = document.getElementById("env-form");
const errorEl = document.getElementById("env-error");

let environments = [];     // comuns e intersecções (o mapa fica de fora)
let mapId = null;          // mapa de ligações do projeto
let editingEnvId = null;   // null = criando | número = editando
let modalKind = "comum";   // tipo vem do card "+" clicado (ou do ambiente editado)

// área de escolher a foto do card (com prévia)
const coverPicker = setupCoverPicker(document.getElementById("e-cover"), "Foto atual do card. Clique para trocar.");

document.getElementById("logout-btn").addEventListener("click", logout);

if(session){
  document.getElementById("project-title").textContent = `Ambientes · ${session.projectName}`;
}

function openEditor(envId){
  window.location.href = `admin.html?env=${envId}`;
}

document.getElementById("map-banner").addEventListener("click", () => {
  if(mapId) window.location.href = `mapa.html?env=${mapId}`;
});

/* =========================
   CARREGAR E DESENHAR
========================= */

async function loadEnvironments(){
  try{
    const [envRes, mapRes] = await Promise.all([
      fetch(`${API}/projects/${session.projectId}/environments`),
      fetch(`${API}/projects/${session.projectId}/map`)
    ]);

    if(!envRes.ok){
      throw new Error(await readError(envRes, "Não deu pra carregar os ambientes."));
    }

    const all = await envRes.json();
    environments = all.filter(e => e.kind === "comum" || e.kind === "intersecao");

    if(mapRes.ok){
      mapId = (await mapRes.json()).id;
    }
  }catch(err){
    const msg = err instanceof TypeError
      ? "Não foi possível conectar ao servidor. O backend está rodando?"
      : err.message;

    grid.innerHTML = `<p class="empty-state">${escapeHtml(msg)}</p>`;
    return;
  }

  render();
}

function render(){
  grid.innerHTML = "";
  interGrid.innerHTML = "";

  const names = Object.fromEntries(environments.map(e => [e.id, e.name]));

  environments.filter(e => e.kind === "comum")
    .forEach(env => grid.appendChild(buildEnvCard(env, names)));
  grid.appendChild(buildAddCard("comum"));

  environments.filter(e => e.kind === "intersecao")
    .forEach(env => interGrid.appendChild(buildEnvCard(env, names)));
  interGrid.appendChild(buildAddCard("intersecao"));

  // resumo no botão do mapa
  const pairs = new Set();
  environments.forEach(e => e.linked_environments.forEach(o => {
    if(names[o]) pairs.add([e.id, o].sort().join("-"));
  }));

  document.getElementById("map-banner-info").textContent = pairs.size
    ? `${pairs.size} ligação(ões) entre ambientes · clique para ver e editar`
    : "Nenhum ambiente encaixado ainda · clique para montar o mapa";
}

function buildEnvCard(env, names){
  const slot = document.createElement("div");
  slot.className = `card-slot kind-${env.kind}`;

  const cover = imageUrl(env.cover_image);

  const linked = env.linked_environments.map(id => names[id]).filter(Boolean);
  const linkText = linked.length
    ? `<i class="bi bi-signpost-2"></i> Liga com: ${linked.map(escapeHtml).join(", ")}`
    : `<i class="bi bi-signpost-2"></i> Ainda sem ligação com outros ambientes`;

  slot.innerHTML = `
    <div class="card">
      ${cardImageHtml(cover, env.name)}
      <button class="card-menu-btn" title="Opções"><i class="bi bi-three-dots-vertical"></i></button>
      <div class="card-body">
        <i class="bi bi-geo-alt"></i>
        <span class="card-title">${escapeHtml(env.name)}</span>
      </div>
      <div class="card-info">${env.image_count} foto(s) · ${env.folder_count} pasta(s)</div>
      <div class="card-links ${linked.length ? "" : "muted"}">${linkText}</div>
    </div>
  `;

  slot.querySelector(".card").addEventListener("click", () => openEditor(env.id));

  slot.querySelector(".card-menu-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    openCardMenu(e, env);
  });

  return slot;
}

function buildAddCard(kind){
  const slot = document.createElement("div");
  slot.className = "card-slot";

  slot.innerHTML = `
    <div class="card card-add ${kind === "intersecao" ? "add-intersecao" : ""}">
      <i class="bi bi-plus-lg"></i>
      ${kind === "intersecao" ? "Nova intersecção" : "Novo ambiente"}
    </div>
  `;

  slot.querySelector(".card").addEventListener("click", () => openModal(null, kind));
  return slot;
}

/* =========================
   MENU ⋮ DO CARD
========================= */

let popover = null;

function closePopover(){
  if(popover){
    popover.remove();
    popover = null;
  }
}

document.addEventListener("click", closePopover);

function openCardMenu(event, env){
  closePopover();

  popover = document.createElement("div");
  popover.className = "popover";
  popover.innerHTML = `
    <div class="popover-item" data-action="open"><i class="bi bi-images"></i> Editar fotos</div>
    <div class="popover-item" data-action="edit"><i class="bi bi-pencil"></i> Editar nome e capa</div>
    <div class="popover-item danger-item" data-action="delete"><i class="bi bi-trash"></i> Excluir</div>
  `;
  document.body.appendChild(popover);

  const rect = popover.getBoundingClientRect();
  popover.style.left = `${Math.max(10, Math.min(event.clientX, window.innerWidth - rect.width - 10))}px`;
  popover.style.top = `${Math.max(10, Math.min(event.clientY + 8, window.innerHeight - rect.height - 10))}px`;

  const actions = {
    open: () => openEditor(env.id),
    edit: () => openModal(env),
    delete: () => deleteEnvironment(env),
  };

  popover.querySelectorAll("[data-action]").forEach(item => {
    item.addEventListener("click", () => {
      closePopover();
      actions[item.dataset.action]();
    });
  });

  popover.addEventListener("click", e => e.stopPropagation());
}

/* =========================
   MODAL CRIAR / EDITAR
========================= */

const MODAL_TEXT = {
  comum: {
    create: "Novo ambiente",
    edit: "Editar ambiente",
    placeholder: "Ex: Bloco 1",
    description: "Ex: Salas de aula e laboratórios de informática"
  },
  intersecao: {
    create: "Nova intersecção",
    edit: "Editar intersecção",
    placeholder: "Ex: Caminho Bloco 1 - Bloco 2",
    description: "Ex: Corredor coberto entre os blocos"
  }
};

function setModalMode(env){
  const text = MODAL_TEXT[modalKind] || MODAL_TEXT.comum;
  document.getElementById("env-modal-title").textContent = env ? text.edit : text.create;
  document.getElementById("env-submit").textContent = env ? "Salvar" : "Criar";
}

function openModal(env, kind = "comum"){
  form.reset();
  modalKind = env ? env.kind : kind;

  const text = MODAL_TEXT[modalKind] || MODAL_TEXT.comum;
  document.getElementById("e-name").placeholder = text.placeholder;
  document.getElementById("e-description").placeholder = text.description;
  errorEl.classList.add("hidden");
  editingEnvId = env ? env.id : null;

  setModalMode(env);
  document.getElementById("e-name").value = env ? env.name : "";
  document.getElementById("e-description").value = env?.description || "";

  // editando: mostra a foto que o card usa hoje
  coverPicker.reset(env ? imageUrl(env.cover_image) : null);

  modal.classList.remove("hidden");
  document.getElementById("e-name").focus();
}

function closeModal(){
  modal.classList.add("hidden");
}

modal.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", closeModal));

function showError(message){
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.classList.add("hidden");

  const name = document.getElementById("e-name").value.trim();
  const description = document.getElementById("e-description").value.trim();
  const coverFile = document.getElementById("e-cover").files[0];
  const kind = modalKind;

  if(!name){
    showError("Informe o nome do ambiente.");
    return;
  }

  const submit = document.getElementById("env-submit");
  submit.disabled = true;

  try{
    let res;

    if(editingEnvId){
      res = await fetch(`${API}/environments/${editingEnvId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, kind })
      });
    }else{
      res = await fetch(`${API}/environments/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: session.projectId, name, description: description || null, kind })
      });
    }

    if(!res.ok){
      showError(await readError(res, "Não deu pra salvar o ambiente."));
      return;
    }

    const data = await res.json();
    const wasEditing = !!editingEnvId;
    const envId = editingEnvId || data.environment.id;

    if(coverFile){
      const upload = new FormData();
      upload.append("file", coverFile);

      const coverRes = await fetch(`${API}/environments/${envId}/cover`, { method: "POST", body: upload });

      if(!coverRes.ok){
        // o ambiente já foi salvo: continua no modal, agora em modo "editar", pra tentar a foto de novo
        editingEnvId = envId;
        setModalMode({ id: envId });
        showError(`${wasEditing ? "As alterações foram salvas" : "O ambiente foi criado"}, mas a foto não foi enviada: ${await readError(coverRes, "erro ao enviar a imagem.")}`);
        loadEnvironments();
        return;
      }
    }

    closeModal();

    // ambiente novo: já abre o editor dele pra começar a montar
    if(!wasEditing){
      openEditor(envId);
      return;
    }

    painelToast("Ambiente atualizado!");
    loadEnvironments();

  }catch{
    showError("Não foi possível conectar ao servidor. O backend está rodando?");
  }finally{
    submit.disabled = false;
  }
});

/* =========================
   EXCLUIR
========================= */

const deleteModal = document.getElementById("delete-modal");
let deletingEnv = null;

function deleteEnvironment(env){
  deletingEnv = env;

  const parts = [];
  if(env.folder_count) parts.push(`${env.folder_count} pasta(s)`);
  if(env.image_count) parts.push(`${env.image_count} foto(s)`);

  document.getElementById("delete-name").textContent = env.name;
  document.getElementById("delete-summary").textContent = parts.length ? parts.join(" e ") : "tudo o que estiver nele";

  deleteModal.classList.remove("hidden");
}

function closeDeleteModal(){
  deleteModal.classList.add("hidden");
  deletingEnv = null;
}

deleteModal.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", closeDeleteModal));

document.getElementById("delete-confirm").addEventListener("click", async () => {
  if(!deletingEnv) return;

  const btn = document.getElementById("delete-confirm");
  btn.disabled = true;

  try{
    const res = await fetch(`${API}/environments/${deletingEnv.id}`, { method: "DELETE" });

    if(!res.ok){
      painelToast(await readError(res, "Não deu pra excluir o ambiente."), "error");
      return;
    }

    painelToast(`"${deletingEnv.name}" excluído.`);
    closeDeleteModal();
    loadEnvironments();
  }catch{
    painelToast("Não foi possível conectar ao servidor.", "error");
  }finally{
    btn.disabled = false;
  }
});

if(session){
  loadEnvironments();
}
