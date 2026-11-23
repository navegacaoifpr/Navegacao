// Visualizador dentro do mapa de ligação (janelinha flutuante).
// Carregue DEPOIS do mapa.js: este arquivo se encaixa nele sem alterá-lo.
//
//  - botão "Visualizador" no cabeçalho: abre a navegação começando num
//    ambiente do mapa, pra acompanhar as passagens que você cria;
//  - no menu de cada card: "Ver no visualizador" (começa naquele ambiente);
//  - quando uma ligação é criada ou desfeita, o visualizador recarrega sozinho
//    pra enxergar a mudança.

(function(){

const pip = document.getElementById("viewer-pip");
const btn = document.getElementById("viewer-btn");
const iframe = document.getElementById("pip-iframe");
const header = pip.querySelector(".pip-header");
const resizeHandle = pip.querySelector(".pip-resize-handle");
const titleEl = document.getElementById("pip-title");

let currentSrc = "";
let reloadTimer = null;

/* =========================
   QUAL FOTO MOSTRAR
========================= */

// ambiente que tem foto de partida (sem ela o visualizador não tem onde começar)
function startable(env){
  return env && env.kind === "comum" && env.start_node_id;
}

function envOnMapWithStart(){
  // primeiro, na ordem em que aparecem no mapa
  for(const member of graph.members){
    const env = projectEnvs.find(e => e.id === member.environment_id);
    if(startable(env)) return env;
  }

  // senão, qualquer ambiente do projeto que tenha foto de partida
  return projectEnvs.find(startable) || null;
}

function viewerUrl(env){
  return `${API}/static/viewer/index.html?start=${env.start_node_id}`;
}

/* =========================
   ABRIR, FECHAR, RECARREGAR
========================= */

function openViewer(env){
  const target = env || envOnMapWithStart();

  if(!target){
    painelToast("Nenhum ambiente tem foto de partida ainda. Defina uma no editor de fotos do ambiente.", "error");
    return;
  }

  if(!startable(target)){
    painelToast(`"${target.name}" ainda não tem foto de partida. Defina uma no editor de fotos.`, "error");
    return;
  }

  const src = viewerUrl(target);

  if(src !== currentSrc){
    iframe.src = src;
    currentSrc = src;
  }

  titleEl.textContent = `Visualizador · ${target.name}`;
  pip.classList.remove("hidden", "minimized");
  btn.classList.add("active");
}

function closeViewer(){
  pip.classList.add("hidden");
  btn.classList.remove("active");
}

function reloadViewer(){
  if(!currentSrc) return;

  // recarrega a mesma página: o visualizador volta pra foto de partida
  iframe.src = currentSrc;
}

// depois de criar/desfazer ligações, o visualizador precisa buscar os dados de novo
function reloadViewerSoon(){
  if(pip.classList.contains("hidden") || !currentSrc) return;

  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(reloadViewer, 400);
}

btn.addEventListener("click", () => {
  pip.classList.contains("hidden") ? openViewer() : closeViewer();
});

document.getElementById("pip-close").addEventListener("click", e => {
  e.stopPropagation();
  closeViewer();
});

document.getElementById("pip-refresh").addEventListener("click", e => {
  e.stopPropagation();
  reloadViewer();
});

document.getElementById("pip-minimize").addEventListener("click", e => {
  e.stopPropagation();
  pip.classList.remove("fullscreen");
  pip.classList.toggle("minimized");
});

document.getElementById("pip-fullscreen").addEventListener("click", e => {
  e.stopPropagation();
  pip.classList.remove("minimized");
  pip.classList.toggle("fullscreen");
});

header.addEventListener("dblclick", () => {
  pip.classList.remove("minimized");
  pip.classList.toggle("fullscreen");
});

/* =========================
   ARRASTAR E REDIMENSIONAR
========================= */

let dragging = false;
let resizing = false;
let offsetX = 0, offsetY = 0;
let startW = 0, startH = 0, startX = 0, startY = 0;

header.addEventListener("mousedown", e => {
  if(pip.classList.contains("fullscreen")) return;
  if(e.target.closest(".pip-controls")) return;

  const rect = pip.getBoundingClientRect();
  offsetX = e.clientX - rect.left;
  offsetY = e.clientY - rect.top;

  // passa a posicionar por left/top (antes era por right/bottom)
  pip.style.left = rect.left + "px";
  pip.style.top = rect.top + "px";
  pip.style.right = "auto";
  pip.style.bottom = "auto";

  dragging = true;
  pip.classList.add("dragging"); // senão o iframe "engole" o mouse
  e.preventDefault();
});

resizeHandle.addEventListener("mousedown", e => {
  const rect = pip.getBoundingClientRect();
  startW = rect.width;
  startH = rect.height;
  startX = e.clientX;
  startY = e.clientY;

  resizing = true;
  pip.classList.add("dragging");
  e.preventDefault();
});

document.addEventListener("mousemove", e => {
  if(dragging){
    const x = Math.max(0, Math.min(e.clientX - offsetX, window.innerWidth - 80));
    const y = Math.max(0, Math.min(e.clientY - offsetY, window.innerHeight - 40));
    pip.style.left = x + "px";
    pip.style.top = y + "px";
  }

  if(resizing){
    pip.style.width = Math.max(260, startW + (e.clientX - startX)) + "px";
    pip.style.height = Math.max(180, startH + (e.clientY - startY)) + "px";
  }
});

document.addEventListener("mouseup", () => {
  dragging = false;
  resizing = false;
  pip.classList.remove("dragging");
});

/* =========================
   ENCAIXE NO mapa.js
========================= */

// menu do card: acrescenta "Ver no visualizador"
const originalOpenCardMenu = openCardMenu;

openCardMenu = function(event, envId){
  originalOpenCardMenu(event, envId);

  if(!popover) return;

  const env = projectEnvs.find(e => e.id === envId);
  if(!env) return;

  const item = document.createElement("div");
  item.className = "popover-item";
  item.dataset.viewer = "1";
  item.innerHTML = '<i class="bi bi-compass"></i> Ver no visualizador';

  item.addEventListener("click", () => {
    closePopover();
    openViewer(env);
  });

  // antes do "Tirar do mapa", que é o último
  const remove = popover.querySelector('[data-action="remove"]');
  popover.insertBefore(item, remove);
};

// toda mudança no grafo (ligação criada, desfeita...) recarrega o visualizador
const originalApplyGraph = applyGraph;

applyGraph = function(newGraph){
  originalApplyGraph(newGraph);
  reloadViewerSoon();
};

})();
