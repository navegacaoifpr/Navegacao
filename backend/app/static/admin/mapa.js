const session = requireSession();
const INTER_ID = Number(getQueryParam("env"));

const DIRECTION_LABEL = { north: "Norte", south: "Sul", east: "Leste", west: "Oeste" };

let cy = null;
let graph = { members: [], links: [] };   // o que está no mapa
let projectEnvs = [];                      // todos os ambientes do projeto
let linkSourceEnvId = null;                // origem do modal "Conectar"

/* =========================
   CARREGAR
========================= */

async function loadAll(){
    try{
        const [envRes, graphRes] = await Promise.all([
            fetch(`${API}/projects/${session.projectId}/environments`),
            fetch(`${API}/intersections/${INTER_ID}/graph`)
        ]);

        if(!graphRes.ok){
            painelToast(await readError(graphRes, "Intersecção não encontrada."), "error");
            setTimeout(() => window.location.href = "ambientes.html", 1500);
            return;
        }

        projectEnvs = await envRes.json();
        graph = await graphRes.json();
    }catch{
        painelToast("Não foi possível conectar ao servidor. O backend está rodando?", "error");
        return;
    }

    document.getElementById("inter-title").textContent = `Mapa de ligação · ${session.projectName}`;
    document.title = `Mapa de ligação · ${session.projectName}`;

    renderEnvList();
    renderMap();
}

// peças do quebra-cabeça: ambientes comuns e intersecções (caminhos)
function mapableEnvs(){
    return projectEnvs
        .filter(e => e.kind === "comum" || e.kind === "intersecao")
        .sort((a, b) => (a.kind === "intersecao") - (b.kind === "intersecao"));
}

function isOnMap(envId){
    return graph.members.some(m => m.environment_id === envId);
}

// toda rota do mapa devolve o grafo atualizado; aqui aplicamos ele
function applyGraph(newGraph){
    graph = newGraph;
    renderEnvList();
    renderMap();
}

/* =========================
   LISTA DE AMBIENTES (lado esquerdo)
========================= */

function renderEnvList(){
    const list = document.getElementById("env-list");
    list.innerHTML = "";

    const envs = mapableEnvs();

    if(envs.length === 0){
        list.innerHTML = `<p class="hint">Nenhum ambiente criado ainda. Crie na tela de Ambientes.</p>`;
        return;
    }

    envs.forEach(env => {
        const onMap = isOnMap(env.id);
        const cover = imageUrl(env.cover_image);

        const row = document.createElement("div");
        row.className = `env-row kind-${env.kind} ${onMap ? "on-map" : ""}`;
        row.innerHTML = `
            <div class="env-thumb" ${cover ? `style="background-image:url('${cover}')"` : ""}></div>
            <div class="env-row-name">
                ${escapeHtml(env.name)}
                <span class="env-row-status">${env.kind === "intersecao" ? "Intersecção · " : ""}${onMap ? "No mapa" : `${env.image_count} foto(s)`}</span>
            </div>
            <button title="${onMap ? "Tirar do mapa" : "Colocar no mapa"}">
                <i class="bi ${onMap ? "bi-dash-lg" : "bi-plus-lg"}"></i>
            </button>
        `;

        row.querySelector("button").addEventListener("click", () => {
            onMap ? removeMember(env) : addMember(env.id);
        });

        list.appendChild(row);
    });
}

/* =========================
   MAPA (Cytoscape)
========================= */

function renderMap(){
    const envNames = Object.fromEntries(projectEnvs.map(e => [e.id, e.name]));

    const elements = [
        ...graph.members.map(m => ({
            data: { id: `env${m.environment_id}`, envId: m.environment_id, label: m.name },
            classes: m.kind === "intersecao" ? "intersecao" : "comum",
            position: { x: m.x ?? 0, y: m.y ?? 0 }
        })),
        ...graph.links.map(l => ({
            data: {
                id: `link${l.id}`,
                linkId: l.id,
                source: `env${l.source_environment_id}`,
                target: `env${l.target_environment_id}`,
                label: DIRECTION_LABEL[l.direction] || l.direction,
                info: l,
                sourceEnvName: envNames[l.source_environment_id] || "",
                targetEnvName: envNames[l.target_environment_id] || ""
            }
        }))
    ];

    document.getElementById("map-empty").classList.toggle("hidden", graph.members.length > 0);

    // guarda o zoom/posição da câmera entre uma atualização e outra
    let view = null;

    if(cy){
        view = { zoom: cy.zoom(), pan: cy.pan() };
        cy.destroy();
    }

    cy = cytoscape({
        container: document.getElementById("cy"),
        elements,
        layout: { name: "preset" },
        style: [
            {
                selector: "node",
                style: {
                    "shape": "round-rectangle",
                    "width": 170,
                    "height": 70,
                    "background-color": "#f8f5ee",
                    "border-width": 3,
                    "border-color": "#4D7C32",
                    "label": "data(label)",
                    "text-valign": "center",
                    "text-halign": "center",
                    "text-wrap": "wrap",
                    "text-max-width": "150px",
                    "font-size": 16,
                    "font-weight": "bold",
                    "color": "#3f3a32"
                }
            },
            {
                // intersecção (caminho): peça amarela, mais baixinha
                selector: "node.intersecao",
                style: {
                    "background-color": "#fdf4c8",
                    "border-color": "#d9a800",
                    "border-style": "dashed",
                    "height": 54
                }
            },
            {
                selector: "edge",
                style: {
                    "label": "data(label)",
                    "curve-style": "bezier",
                    "width": 4,
                    "line-color": "#f0a400",
                    "target-arrow-shape": "triangle",
                    "target-arrow-color": "#f0a400",
                    "font-size": 12,
                    "text-background-color": "#eee6d2",
                    "text-background-opacity": 1,
                    "text-background-padding": 3
                }
            }
        ]
    });

    if(view){
        cy.zoom(view.zoom);
        cy.pan(view.pan);
    }else if(graph.members.length > 0){
        cy.fit(undefined, 80);
        if(cy.zoom() > 1.2) cy.zoom(1.2);
    }

    cy.on("tap", "node", e => openCardMenu(e.originalEvent, e.target.data("envId")));
    cy.on("tap", "edge", e => openLinkMenu(e.originalEvent, e.target.data()));
    cy.on("tap", e => { if(e.target === cy) closePopover(); });

    cy.on("dragfree", "node", async e => {
        const pos = e.target.position();
        await fetch(`${API}/intersections/${INTER_ID}/members/${e.target.data("envId")}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ x: Math.round(pos.x), y: Math.round(pos.y) })
        });
    });
}

/* =========================
   AÇÕES NO MAPA
========================= */

async function callGraphRoute(url, options, successMessage){
    try{
        const res = await fetch(url, options);

        if(!res.ok){
            painelToast(await readError(res, "Não deu pra fazer isso."), "error");
            return false;
        }

        applyGraph(await res.json());
        if(successMessage) painelToast(successMessage);
        return true;
    }catch{
        painelToast("Não foi possível conectar ao servidor.", "error");
        return false;
    }
}

function addMember(envId){
    // coloca o card no centro do que está aparecendo na tela
    let body = { environment_id: envId };

    if(cy && graph.members.length > 0){
        const ext = cy.extent();
        body.x = Math.round((ext.x1 + ext.x2) / 2 + (Math.random() - 0.5) * 120);
        body.y = Math.round((ext.y1 + ext.y2) / 2 + (Math.random() - 0.5) * 120);
    }

    return callGraphRoute(`${API}/intersections/${INTER_ID}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
}

function removeMember(env){
    const hasLinks = graph.links.some(l =>
        l.source_environment_id === env.id || l.target_environment_id === env.id
    );

    if(hasLinks && !confirm(`Tirar "${env.name}" do mapa? As ligações dele nesta intersecção também serão desfeitas.`)){
        return;
    }

    callGraphRoute(`${API}/intersections/${INTER_ID}/members/${env.id}`, { method: "DELETE" }, "Ambiente tirado do mapa.");
}

function deleteLink(linkId){
    if(!confirm("Desfazer essa ligação?")) return;

    callGraphRoute(`${API}/intersections/${INTER_ID}/links/${linkId}`, { method: "DELETE" }, "Ligação desfeita.");
}

/* =========================
   POPOVERS (clique no card / na seta)
========================= */

let popover = null;

function closePopover(){
    if(popover){
        popover.remove();
        popover = null;
    }
}

function showPopover(event, html, actions){
    closePopover();

    popover = document.createElement("div");
    popover.className = "popover";
    popover.innerHTML = html;
    document.body.appendChild(popover);

    const rect = popover.getBoundingClientRect();
    const x = Math.min(event.clientX, window.innerWidth - rect.width - 10);
    const y = Math.min(event.clientY + 8, window.innerHeight - rect.height - 10);
    popover.style.left = `${Math.max(10, x)}px`;
    popover.style.top = `${Math.max(10, y)}px`;

    popover.querySelectorAll("[data-action]").forEach(item => {
        item.addEventListener("click", () => {
            closePopover();
            actions[item.dataset.action]();
        });
    });

    popover.addEventListener("click", e => e.stopPropagation());
}

document.addEventListener("click", e => {
    if(!e.target.closest("#cy")) closePopover();
});

function openCardMenu(event, envId){
    const env = projectEnvs.find(e => e.id === envId);
    if(!env) return;

    showPopover(event, `
        <div class="popover-title">${escapeHtml(env.name)}</div>
        <div class="popover-item" data-action="link"><i class="bi bi-signpost-2"></i> Conectar a outro ambiente</div>
        <div class="popover-item" data-action="open"><i class="bi bi-images"></i> Editar fotos do ambiente</div>
        <div class="popover-item danger-item" data-action="remove"><i class="bi bi-dash-circle"></i> Tirar do mapa</div>
    `, {
        link: () => openLinkModal(env.id),
        open: () => window.location.href = `admin.html?env=${env.id}`,
        remove: () => removeMember(env),
    });
}

function openLinkMenu(event, data){
    const l = data.info;

    showPopover(event, `
        <div class="popover-title">LIGAÇÃO · ${escapeHtml(data.label).toUpperCase()}</div>
        <div class="popover-text">
            Sai de <b>${escapeHtml(data.sourceEnvName)}</b> (${escapeHtml(l.source_node_name)})<br>
            entra em <b>${escapeHtml(data.targetEnvName)}</b> (${escapeHtml(l.target_node_name)})
        </div>
        <div class="popover-item danger-item" data-action="delete"><i class="bi bi-trash"></i> Desfazer ligação</div>
    `, {
        delete: () => deleteLink(l.id),
    });
}

/* =========================
   MODAL CONECTAR AMBIENTES
========================= */

const linkModal = document.getElementById("link-modal");
const linkError = document.getElementById("link-error");

// fotos de um ambiente, com o nome da pasta na frente pra ficar fácil de achar
async function loadEnvPhotos(envId){
    const [nodes, folders] = await Promise.all([
        fetch(`${API}/nodes/?environment_id=${envId}`).then(r => r.json()),
        fetch(`${API}/folders/?environment_id=${envId}`).then(r => r.json())
    ]);

    const folderNames = Object.fromEntries(folders.map(f => [f.id, f.name]));

    return nodes
        .map(n => ({ ...n, folderName: folderNames[n.folder_id] || "Sem pasta" }))
        .sort((a, b) =>
            a.folderName.localeCompare(b.folderName) ||
            (a.chain_order ?? 1e9) - (b.chain_order ?? 1e9) ||
            (a.image || "").localeCompare(b.image || "")
        );
}

function fillPhotoSelect(select, preview, photos){
    select.innerHTML = "";

    if(photos.length === 0){
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "Esse ambiente ainda não tem fotos";
        select.appendChild(opt);
        preview.classList.add("hidden");
        return;
    }

    let group = null;
    let currentFolder = null;

    photos.forEach(p => {
        if(p.folderName !== currentFolder){
            currentFolder = p.folderName;
            group = document.createElement("optgroup");
            group.label = currentFolder;
            select.appendChild(group);
        }

        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name;
        opt.dataset.image = p.image || "";
        group.appendChild(opt);
    });

    const updatePreview = () => {
        const image = select.selectedOptions[0]?.dataset.image;
        if(image){
            preview.src = imageUrl(image);
            preview.classList.remove("hidden");
        }else{
            preview.classList.add("hidden");
        }
    };

    select.onchange = updatePreview;
    updatePreview();
}

async function openLinkModal(sourceEnvId){
    const sourceEnv = projectEnvs.find(e => e.id === sourceEnvId);
    const targets = mapableEnvs().filter(e => e.id !== sourceEnvId);

    if(targets.length === 0){
        painelToast("Precisa de pelo menos dois ambientes pra encaixar.", "error");
        return;
    }

    linkSourceEnvId = sourceEnvId;
    linkError.classList.add("hidden");

    document.getElementById("link-source-env").textContent = sourceEnv.name;

    // destino: os que já estão no mapa primeiro
    const targetSelect = document.getElementById("link-target-env");
    targetSelect.innerHTML = "";

    [...targets]
        .sort((a, b) => isOnMap(b.id) - isOnMap(a.id))
        .forEach(env => {
            const opt = document.createElement("option");
            opt.value = env.id;
            const tag = env.kind === "intersecao" ? " · intersecção" : "";
            opt.textContent = isOnMap(env.id) ? `${env.name}${tag}` : `${env.name}${tag} (vai entrar no mapa)`;
            targetSelect.appendChild(opt);
        });

    const sourcePhotos = await loadEnvPhotos(sourceEnvId);
    fillPhotoSelect(
        document.getElementById("link-source-node"),
        document.getElementById("link-source-preview"),
        sourcePhotos
    );

    const refreshTarget = async () => {
        const photos = await loadEnvPhotos(Number(targetSelect.value));
        fillPhotoSelect(
            document.getElementById("link-target-node"),
            document.getElementById("link-target-preview"),
            photos
        );
    };

    targetSelect.onchange = refreshTarget;
    await refreshTarget();

    linkModal.classList.remove("hidden");
}

function closeLinkModal(){
    linkModal.classList.add("hidden");
}

linkModal.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", closeLinkModal));

document.getElementById("link-form").addEventListener("submit", async e => {
    e.preventDefault();
    linkError.classList.add("hidden");

    const sourceNode = Number(document.getElementById("link-source-node").value);
    const targetNode = Number(document.getElementById("link-target-node").value);
    const direction = document.getElementById("link-direction").value;

    if(!sourceNode || !targetNode){
        linkError.textContent = "Os dois ambientes precisam ter fotos pra serem conectados.";
        linkError.classList.remove("hidden");
        return;
    }

    const submit = document.getElementById("link-submit");
    submit.disabled = true;

    try{
        const res = await fetch(`${API}/intersections/${INTER_ID}/links`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source_node_id: sourceNode, target_node_id: targetNode, direction })
        });

        if(!res.ok){
            linkError.textContent = await readError(res, "Não deu pra conectar os ambientes.");
            linkError.classList.remove("hidden");
            return;
        }

        applyGraph(await res.json());
        closeLinkModal();
        painelToast("Ambientes conectados!");
    }catch{
        linkError.textContent = "Não foi possível conectar ao servidor.";
        linkError.classList.remove("hidden");
    }finally{
        submit.disabled = false;
    }
});

if(session && INTER_ID){
    loadAll();
}
