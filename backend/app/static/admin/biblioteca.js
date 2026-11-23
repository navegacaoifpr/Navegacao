// API e ENV_ID vêm de sessao.js e admin.js

const libraryPanel = {
    panel: null,
    toggle: null,

    init() {
        this.panel = document.getElementById("library-panel");
        this.toggle = document.getElementById("library-toggle");
        this.closeBtn = document.getElementById("library-close");
        this.overlay = document.getElementById("sidebar-overlay");

        this.toggle.addEventListener("click", () => this.togglePanel());
        this.closeBtn.addEventListener("click", () => this.close());
    },

    open() {
        this.panel.classList.add("open");
        this.toggle.classList.add("open");
        this.overlay.classList.add("show");
    },

    close() {
        this.panel.classList.remove("open");
        this.toggle.classList.remove("open");
        if (!sidebarMenu.el.classList.contains("open")) {
            this.overlay.classList.remove("show");
        }
    },

    togglePanel() {
        this.panel.classList.contains("open") ? this.close() : this.open();
    }

};

const sidebarMenu = {
    el: null,
    toggle: null,
    overlay: null,

    init() {
        this.el = document.getElementById("sidebar");
        this.toggle = document.getElementById("menu-toggle");
        this.overlay = document.getElementById("sidebar-overlay");

        this.toggle.addEventListener("click", () => this.togglePanel());

        this.el.querySelectorAll("li").forEach(item => {
            item.addEventListener("click", () => {
                this.el.querySelectorAll("li").forEach(li => li.classList.remove("active"));
                item.classList.add("active");
                this.close();
            });
        });
    },

    open() {
        this.el.classList.add("open");
        this.overlay.classList.add("show");
    },

    close() {
        this.el.classList.remove("open");
        if (!libraryPanel.panel.classList.contains("open")) {
            this.overlay.classList.remove("show");
        }
    },

    togglePanel() {
        this.el.classList.contains("open") ? this.close() : this.open();
    }
};


/* =========================
   ESTADO
========================= */

let folders = [];
let currentFolderId = null;
let currentFolderImages = [];
let viewMode = localStorage.getItem("libraryViewMode") || "grid-large";

let pendingFiles = null;

let modalMode = "create"; // "create" | "rename"
let renamingFolderId = null;

let contextFolderId = null;
let draggingFolderId = null;

let chainImages = [];
let draggingChainId = null;
let bridgeSourceFolderId = null;


/* =========================
   TOAST (substitui alert/confirm nativos)
========================= */

function showToast(message, type = "info"){
    const container = document.getElementById("toast-container");

    const toast = document.createElement("div");
    toast.className = `toast ${type === "error" ? "error" : ""}`;

    toast.innerHTML = `
        <i class="bi ${type === "error" ? "bi-exclamation-circle-fill" : "bi-check-circle-fill"} toast-icon"></i>
        <div class="toast-message">${escapeHtml(message)}</div>
        <i class="bi bi-x toast-close"></i>
    `;

    toast.querySelector(".toast-close").addEventListener("click", () => toast.remove());

    container.appendChild(toast);

    setTimeout(() => toast.remove(), 4000);
}

function showConfirmToast(message, onConfirm, confirmLabel = "Confirmar"){
    const container = document.getElementById("toast-container");

    const toast = document.createElement("div");
    toast.className = "toast error";

    toast.innerHTML = `
        <i class="bi bi-question-circle-fill toast-icon"></i>
        <div class="toast-message">${escapeHtml(message)}</div>
        <div class="toast-actions">
            <button class="danger">${escapeHtml(confirmLabel)}</button>
            <button class="ghost-btn">Cancelar</button>
        </div>
    `;

    const [confirmBtn, cancelBtn] = toast.querySelectorAll("button");

    confirmBtn.addEventListener("click", () => {
        toast.remove();
        onConfirm();
    });

    cancelBtn.addEventListener("click", () => toast.remove());

    container.appendChild(toast);
}


/* =========================
   HELPERS
========================= */

function escapeHtml(str){
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function allowDropThroughOverlay(){
    document.getElementById("sidebar-overlay").style.pointerEvents = "none";
}

function restoreOverlay(){
    document.getElementById("sidebar-overlay").style.pointerEvents = "";
}


/* =========================
   LISTA DE PASTAS
========================= */

async function loadFolders(){
    folders = await fetch(`${API}/folders/?environment_id=${ENV_ID}`).then(r => r.json());
    renderFolderList();
}

function renderFolderList(){
    const container = document.getElementById("folder-list");
    const empty = document.getElementById("folder-empty");

    container.innerHTML = "";

    if(folders.length === 0){
        empty.classList.remove("hidden");
        return;
    }

    empty.classList.add("hidden");

    folders.forEach(folder => container.appendChild(buildFolderCard(folder)));
}

function buildFolderCard(folder){
    const card = document.createElement("div");
    card.className = "folder-card";
    card.draggable = true;
    card.dataset.id = folder.id;
    card.style.setProperty("--folder-color", folder.color || "#4D7C32");

    card.innerHTML = `
        <i class="bi bi-folder-fill folder-icon"></i>
        <div class="folder-meta">
            <div class="folder-title">${escapeHtml(folder.name)}</div>
            <div class="folder-info">${folder.image_count} imagem${folder.image_count === 1 ? "" : "s"}</div>
        </div>
    `;

    card.addEventListener("click", () => openFolder(folder.id));

    card.addEventListener("contextmenu", e => {
        e.preventDefault();
        openContextMenu(e, folder.id);
    });

    card.addEventListener("dragstart", e => {
        draggingFolderId = folder.id;
        card.classList.add("dragging");
        e.dataTransfer.setData("type", "folder");
        e.dataTransfer.setData("folderId", folder.id);
        allowDropThroughOverlay();
    });

    card.addEventListener("dragend", () => {
        card.classList.remove("dragging");
        draggingFolderId = null;
        restoreOverlay();
    });

    card.addEventListener("dragover", e => {
        e.preventDefault();
        if(draggingFolderId !== null && draggingFolderId !== folder.id){
            card.classList.add("drop-target");
        }
    });

    card.addEventListener("dragleave", () => {
        card.classList.remove("drop-target");
    });

    card.addEventListener("drop", async e => {
        e.preventDefault();
        card.classList.remove("drop-target");

        const draggedId = parseInt(e.dataTransfer.getData("folderId"));
        if(!draggedId || draggedId === folder.id) return;

        await reorderFolders(draggedId, folder.id);
    });

    return card;
}

async function reorderFolders(draggedId, targetId){
    const draggedIndex = folders.findIndex(f => f.id === draggedId);
    const targetIndex = folders.findIndex(f => f.id === targetId);

    if(draggedIndex === -1 || targetIndex === -1) return;

    const [moved] = folders.splice(draggedIndex, 1);
    folders.splice(targetIndex, 0, moved);

    folders.forEach((f, i) => f.position = i);

    renderFolderList();

    await fetch(`${API}/folders/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(folders.map(f => ({ id: f.id, position: f.position })))
    });
}


/* =========================
   ABRIR / VOLTAR DA PASTA
========================= */

async function openFolder(folderId){
    currentFolderId = folderId;
    currentFolderImages = await fetch(`${API}/folders/${folderId}/images`).then(r => r.json());

    const folder = folders.find(f => f.id === folderId);
    document.getElementById("library-title").innerText = folder ? folder.name : "Biblioteca";

    document.getElementById("library-view-folders").classList.add("hidden");
    document.getElementById("library-view-images").classList.remove("hidden");

    renderImageList();
}

function backToFolders(){
    currentFolderId = null;

    document.getElementById("library-title").innerText = "Biblioteca";
    document.getElementById("library-view-images").classList.add("hidden");
    document.getElementById("library-view-folders").classList.remove("hidden");

    loadFolders();
}


/* =========================
   IMAGENS DENTRO DA PASTA
========================= */

function renderImageList(){
    const container = document.getElementById("image-list");
    container.className = `view-${viewMode}`;
    container.innerHTML = "";

    currentFolderImages.forEach(node => {
        const card = document.createElement("div");
        card.className = "image-card";
        card.draggable = true;

        const placed = node.x !== null && node.y !== null;

        card.innerHTML = `
            ${placed ? '<i class="bi bi-geo-alt-fill" style="position:absolute;top:6px;right:6px;color:#4D7C32;font-size:13px;text-shadow:0 0 3px white;"></i>' : ""}
            <img src="${API}/images/thumbs/${encodeURIComponent(node.image)}" loading="lazy" alt="${escapeHtml(node.name)}">
            <div class="image-name">${escapeHtml(node.name)}</div>
        `;

        card.addEventListener("dragstart", e => {
            card.classList.add("dragging");
            e.dataTransfer.setData("type", "image");
            e.dataTransfer.setData("nodeId", node.id);
            allowDropThroughOverlay();
        });

        card.addEventListener("dragend", () => {
            card.classList.remove("dragging");
            restoreOverlay();
        });

        container.appendChild(card);
    });
}

function setViewMode(mode){
    viewMode = mode;
    localStorage.setItem("libraryViewMode", viewMode);

    document.querySelectorAll(".view-mode-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.mode === mode);
    });

    renderImageList();
}


/* =========================
   IMPORTAR / CRIAR PASTA
========================= */

async function uploadImages(folderId, files){
    const form = new FormData();
    Array.from(files).forEach(f => form.append("files", f));

    await fetch(`${API}/folders/${folderId}/upload`, {
        method: "POST",
        body: form
    });

    if(currentFolderId === folderId){
        currentFolderImages = await fetch(`${API}/folders/${folderId}/images`).then(r => r.json());
        renderImageList();
    }
}

function closeFolderModal(){
    document.getElementById("folder-modal").classList.add("hidden");
    document.getElementById("folder-input").value = "";
    pendingFiles = null;
}

async function confirmFolderModal(){
    const name = document.getElementById("folder-name-input").value.trim();
    if(!name) return;

    const confirmBtn = document.querySelector("#folder-modal .modal-buttons button:not(.danger)");
    confirmBtn.disabled = true;

    try{

        if(modalMode === "create"){

            const res = await fetch(`${API}/folders/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, environment_id: ENV_ID })
            }).then(r => r.json());

            if(!res.folder){
                showToast(res.detail || "Não deu pra criar a pasta.", "error");
                return;
            }

            const newFolder = res.folder;

            if(pendingFiles && pendingFiles.length > 0){
                await uploadImages(newFolder.id, pendingFiles);
            }

            closeFolderModal();

            await loadFolders();
            openFolder(newFolder.id);

        }else if(modalMode === "rename"){

            const res = await fetch(`${API}/folders/${renamingFolderId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name })
            }).then(r => r.json());

            if(!res.folder){
                showToast(res.detail || "Não deu pra renomear a pasta.", "error");
                return;
            }

            document.getElementById("folder-modal").classList.add("hidden");

            await loadFolders();

            if(currentFolderId === renamingFolderId){
                document.getElementById("library-title").innerText = name;
            }
        }

    } finally {
        confirmBtn.disabled = false;
    }
}


/* =========================
   MENU DE CONTEXTO DA PASTA
========================= */

function openContextMenu(e, folderId){
    contextFolderId = folderId;

    const menu = document.getElementById("folder-context-menu");
    menu.classList.remove("hidden");

    const menuWidth = 190;
    const maxLeft = window.innerWidth - menuWidth - 10;

    menu.style.left = Math.min(e.clientX, maxLeft) + "px";
    menu.style.top = e.clientY + "px";
}

function closeContextMenu(){
    document.getElementById("folder-context-menu").classList.add("hidden");
    contextFolderId = null;
}


/* =========================
   ORDENAÇÃO COMPARTILHADA
   (mesma regra usada no backend: chain_order manual primeiro,
   senão cai pro nome do arquivo)
========================= */

function sortByChainOrder(images){
    return [...images].sort((a, b) => {
        const aHas = a.chain_order !== null && a.chain_order !== undefined;
        const bHas = b.chain_order !== null && b.chain_order !== undefined;

        if(aHas && bHas) return a.chain_order - b.chain_order;
        if(aHas) return -1;
        if(bHas) return 1;

        return a.image.localeCompare(b.image);
    });
}


/* =========================
   ENCADEAR PASTA
========================= */

function openChainModal(){
    if(currentFolderImages.length < 2){
        showToast("Precisa de pelo menos 2 imagens na pasta pra encadear.", "error");
        return;
    }

    chainImages = sortByChainOrder(currentFolderImages);
    renderChainList();

    document.getElementById("chain-modal").classList.remove("hidden");
}

function closeChainModal(){
    document.getElementById("chain-modal").classList.add("hidden");
}

function renderChainList(){
    const container = document.getElementById("chain-image-list");
    container.innerHTML = "";

    chainImages.forEach((node, index) => {
        const item = document.createElement("div");
        item.className = "chain-item";
        item.draggable = true;

        item.innerHTML = `
            <span class="chain-index">${index + 1}</span>
            <img src="${API}/images/thumbs/${encodeURIComponent(node.image)}" loading="lazy">
            <span class="chain-name">${escapeHtml(node.name)}</span>
            <i class="bi bi-grip-vertical" style="color:#bbb;"></i>
        `;

        item.addEventListener("dragstart", () => {
            draggingChainId = node.id;
            item.classList.add("dragging");
        });

        item.addEventListener("dragend", () => {
            item.classList.remove("dragging");
            draggingChainId = null;
        });

        item.addEventListener("dragover", e => {
            e.preventDefault();
            item.classList.add("drop-target");
        });

        item.addEventListener("dragleave", () => item.classList.remove("drop-target"));

        item.addEventListener("drop", e => {
            e.preventDefault();
            item.classList.remove("drop-target");

            if(draggingChainId === node.id) return;

            const fromIndex = chainImages.findIndex(n => n.id === draggingChainId);
            const toIndex = chainImages.findIndex(n => n.id === node.id);

            const [moved] = chainImages.splice(fromIndex, 1);
            chainImages.splice(toIndex, 0, moved);

            renderChainList();
        });

        container.appendChild(item);
    });
}

async function confirmChain(){
    const direction = document.getElementById("chain-direction").value;

    const alreadyPlaced = chainImages.filter(n => n.x !== null && n.y !== null).length;

    if(alreadyPlaced > 0){
        document.getElementById("chain-modal").classList.add("hidden");

        showConfirmToast(
            `${alreadyPlaced} dessas fotos já estão posicionadas no mapa. Encadear vai realinhar todas em linha reta, perdendo a posição atual delas. Continuar?`,
            () => executeChain(direction),
            "Encadear mesmo assim"
        );

        return;
    }

    await executeChain(direction);
}

async function executeChain(direction){
    const items = chainImages.map((node, index) => ({ id: node.id, chain_order: index }));

    await fetch(`${API}/folders/${currentFolderId}/reorder-images`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(items)
    });

    const res = await fetch(`${API}/folders/${currentFolderId}/chain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction })
    }).then(r => r.json());

    document.getElementById("chain-modal").classList.add("hidden");

    showToast(res.message || "Pasta encadeada!");

    currentFolderImages = await fetch(`${API}/folders/${currentFolderId}/images`).then(r => r.json());
    renderImageList();

    await refreshGraph();
}


/* =========================
   CONECTAR PASTAS (bridge)
========================= */

async function openBridgeModal(folderId){
    // só pastas DESTE ambiente; pra ligar ambientes diferentes,
    // use o mapa do ambiente de intersecção
    const groups = [{ env: { id: ENV_ID, name: currentEnvironment?.name || "Este ambiente" }, folders }];

    const hasTarget = groups.some(g => g.folders.some(f => f.id !== folderId));

    if(!hasTarget){
        showToast("Precisa de pelo menos duas pastas pra conectar.", "error");
        return;
    }

    bridgeSourceFolderId = folderId;

    const targetSelect = document.getElementById("bridge-target-folder");
    targetSelect.innerHTML = "";

    groups.forEach(({ env, folders: envFolders }) => {
        const options = envFolders.filter(f => f.id !== folderId);
        if(options.length === 0) return;

        const group = document.createElement("optgroup");
        group.label = env.name;

        options.forEach(f => {
            const opt = document.createElement("option");
            opt.value = f.id;
            opt.textContent = f.name;
            group.appendChild(opt);
        });

        targetSelect.appendChild(group);
    });

    populateBridgeSourceNodes();
    populateBridgeTargetNodes();

    targetSelect.onchange = populateBridgeTargetNodes;

    document.getElementById("bridge-modal").classList.remove("hidden");
}

function closeBridgeModal(){
    document.getElementById("bridge-modal").classList.add("hidden");
}

async function populateBridgeSourceNodes(){
    const images = await fetch(`${API}/folders/${bridgeSourceFolderId}/images`).then(r => r.json());
    const sorted = sortByChainOrder(images);

    const select = document.getElementById("bridge-source-node");
    select.innerHTML = "";

    sorted.forEach(n => {
        const opt = document.createElement("option");
        opt.value = n.id;
        opt.textContent = n.name;
        select.appendChild(opt);
    });

    // sugere o ÚLTIMO da sequência como ponto de saída padrão
    if(select.options.length > 0){
        select.selectedIndex = select.options.length - 1;
    }
}

async function populateBridgeTargetNodes(){
    const targetFolderId = document.getElementById("bridge-target-folder").value;
    if(!targetFolderId) return;

    const images = await fetch(`${API}/folders/${targetFolderId}/images`).then(r => r.json());
    const sorted = sortByChainOrder(images);

    const select = document.getElementById("bridge-target-node");
    select.innerHTML = "";

    sorted.forEach(n => {
        const opt = document.createElement("option");
        opt.value = n.id;
        opt.textContent = n.name;
        select.appendChild(opt);
    });
    // já fica selecionado o primeiro (padrão do <select>), que é o
    // ponto de entrada sugerido
}

async function confirmBridge(){
    const sourceNode = document.getElementById("bridge-source-node").value;
    const targetNode = document.getElementById("bridge-target-node").value;
    const direction = document.getElementById("bridge-direction").value;

    if(!sourceNode || !targetNode){
        showToast("Selecione os dois pontos de conexão.", "error");
        return;
    }

    const params = new URLSearchParams({
        source_id: sourceNode,
        target_id: targetNode,
        direction
    });

    const res = await fetch(`${API}/edges/?${params}`, { method: "POST" });

    if(!res.ok){
        const data = await res.json().catch(() => ({}));
        showToast(data.detail || "Não deu pra conectar as pastas.", "error");
        return;
    }

    document.getElementById("bridge-modal").classList.add("hidden");
    showToast("Pastas conectadas!");

    await refreshGraph();
}


/* =========================
   ATUALIZAR O GRAFO
========================= */

// recarrega o grafo (função loadGraph do admin.js) depois de mudanças
// feitas pela biblioteca, sem precisar apertar F5
async function refreshGraph(){
    if(typeof loadGraph === "function"){
        await loadGraph();
    }
}


/* =========================
   INICIALIZAÇÃO
========================= */

function initLibraryUI(){

    document.querySelectorAll(".view-mode-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.mode === viewMode);
        b.addEventListener("click", () => setViewMode(b.dataset.mode));
    });

    document.getElementById("import-folder").addEventListener("click", () => {
        document.getElementById("folder-input").click();
    });

    document.getElementById("folder-add-images").addEventListener("click", () => {
        document.getElementById("file-input").click();
    });

    document.getElementById("folder-input").addEventListener("change", e => {
        const allFiles = Array.from(e.target.files);
        const images = allFiles.filter(f => f.type.startsWith("image/"));

        if(images.length === 0){
            showToast("Essa pasta não tem imagens.", "error");
            e.target.value = "";
            return;
        }

        pendingFiles = images;

        const suggestedName = allFiles[0].webkitRelativePath.split("/")[0];

        modalMode = "create";

        document.getElementById("folder-modal-title").innerText = "Nova pasta";
        document.getElementById("folder-name-input").value = suggestedName;
        document.getElementById("folder-modal").classList.remove("hidden");
    });

    document.getElementById("file-input").addEventListener("change", async e => {
        const files = e.target.files;
        if(!files || files.length === 0) return;

        await uploadImages(currentFolderId, files);
        e.target.value = "";
    });

    document.getElementById("folder-back").addEventListener("click", backToFolders);

    document.getElementById("chain-folder-btn").addEventListener("click", openChainModal);

    document.querySelectorAll(".ctx-item[data-action]").forEach(item => {
        item.addEventListener("click", async e => {
            e.stopPropagation();

            const action = item.dataset.action;
            const folderId = contextFolderId;
            if(!folderId) return;

            if(action === "rename"){
                const folder = folders.find(f => f.id === folderId);

                modalMode = "rename";
                renamingFolderId = folderId;

                document.getElementById("folder-modal-title").innerText = "Renomear pasta";
                document.getElementById("folder-name-input").value = folder ? folder.name : "";
                document.getElementById("folder-modal").classList.remove("hidden");
            }

            if(action === "delete"){
                closeContextMenu();
                showConfirmToast(
                    "Excluir essa pasta? As imagens dela e as conexões no mapa também serão apagadas.",
                    async () => {
                        const res = await fetch(`${API}/folders/${folderId}`, { method: "DELETE" });

                        if(!res.ok){
                            const data = await res.json().catch(() => ({}));
                            showToast(data.detail || "Não deu pra excluir a pasta.", "error");
                            return;
                        }

                        await refreshGraph();

                        if(currentFolderId === folderId){
                            backToFolders();
                        }

                        await loadFolders();
                        showToast("Pasta excluída!");
                    },
                    "Excluir"
                );
                return;
            }

            if(action === "unplace"){
                closeContextMenu();

                const res = await fetch(`${API}/folders/${folderId}/unplace`, { method: "POST" });
                const data = await res.json().catch(() => ({}));

                if(!res.ok){
                    showToast(data.detail || "Não deu pra tirar a pasta do grafo.", "error");
                    return;
                }

                if(data.count === 0){
                    showToast("Essa pasta já não está no grafo.");
                    return;
                }

                if(currentFolderId === folderId){
                    currentFolderImages = await fetch(`${API}/folders/${folderId}/images`).then(r => r.json());
                    renderImageList();
                }

                await refreshGraph();
                showToast("Pasta retirada do grafo. Arraste ela pro mapa pra colocar de volta.");
                return;
            }

            if(action === "show"){
                showToast("Em breve: destacar as imagens dessa pasta no mapa.");
            }

            if(action === "copy"){
                showToast("Em breve: duplicar pasta.");
            }

            if(action === "bridge"){
                closeContextMenu();
                openBridgeModal(folderId);
                return;
            }

            closeContextMenu();
        });
    });

    document.querySelectorAll(".swatch").forEach(swatch => {
        swatch.addEventListener("click", async e => {
            e.stopPropagation();

            const color = swatch.dataset.color;
            const folderId = contextFolderId;
            if(!folderId) return;

            await fetch(`${API}/folders/${folderId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ color })
            });

            await loadFolders();
            closeContextMenu();
        });
    });

    document.addEventListener("click", () => closeContextMenu());

    loadFolders();
}

window.addEventListener("load", () => {
    libraryPanel.init();
    sidebarMenu.init();
    initLibraryUI();

    document.getElementById("sidebar-overlay")
        .addEventListener("click", () => {
            libraryPanel.close();
            sidebarMenu.close();
        });
});