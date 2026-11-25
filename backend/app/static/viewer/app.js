let currentNode = null; // definido dinamicamente em initStart()

/* =========================================================
   CACHE: o que já foi buscado fica guardado, pra navegação
   ser instantânea mesmo com o servidor longe (Vercel).
========================================================= */
const nodesById = {};      // todas as fotos, buscadas UMA vez no início
const edgesCache = {};     // ligações de cada foto (id -> Promise)
const preloaded = new Set(); // fotos já baixadas antecipadamente

function imageUrl(node) {
  return `/images/${encodeURIComponent(node.image)}`;
}

// busca as ligações de uma foto só na primeira vez; depois usa a guardada
function getEdges(nodeId) {
  if (!edgesCache[nodeId]) {
    edgesCache[nodeId] = fetch(`/edges/${nodeId}`)
      .then(r => {
        if (!r.ok) throw new Error("erro ao buscar conexões");
        return r.json();
      })
      .catch(err => {
        delete edgesCache[nodeId]; // deu erro: tenta de novo na próxima
        throw err;
      });
  }
  return edgesCache[nodeId];
}

// busca uma foto pelo id (normalmente já está na lista carregada no início)
async function getNode(nodeId) {
  if (nodesById[nodeId]) return nodesById[nodeId];
  const node = await fetch(`/nodes/${nodeId}`).then(r => r.json());
  nodesById[node.id] = node;
  return node;
}

// baixa a imagem em segundo plano, pra ela já estar pronta no clique
function preloadImage(node) {
  if (!node || preloaded.has(node.id)) return;
  preloaded.add(node.id);
  const img = new Image();
  img.src = imageUrl(node);
}

// enquanto o visitante olha a foto atual, adianta as vizinhas:
// baixa a imagem de cada direção possível e as ligações delas
async function prefetchNeighbors(nodeId) {
  try {
    const edges = await getEdges(nodeId);
    edges.forEach(e => {
      const next = nodesById[e.target_id];
      if (next) {
        preloadImage(next);
        getEdges(next.id).catch(() => {});
        environmentName(next.environment_id);
      }
    });
  } catch {
    // sem problema: só não adiantou
  }
}

// Função que carrega as conexões e atualiza os botões
async function updateButtons() {
  const buttons = {
    N: document.getElementById("N"),
    S: document.getElementById("S"),
    L: document.getElementById("L"),
    O: document.getElementById("O"),
  };

  const map = { north: "N", south: "S", east: "L", west: "O" };

  try {
    const edges = await getEdges(currentNode);

    // Primeiro, desativa todos
    Object.values(buttons).forEach(btn => {
      btn.disabled = true;
      btn.style.opacity = "0.4"; // efeito visual (opcional)
      btn.style.cursor = "not-allowed";
    });

    // Depois, ativa os que realmente existem
    edges.forEach(e => {
      const dir = map[e.direction];
      if (dir && buttons[dir]) {
        buttons[dir].disabled = false;
        buttons[dir].style.opacity = "1";
        buttons[dir].style.cursor = "pointer";
      }
    });

  } catch {
    alert("Erro ao buscar conexões.");
  }
}

// mostra uma foto: troca a imagem, o nome do ambiente e os botões
function showNode(node) {
  currentNode = node.id;
  document.getElementById("view").src = imageUrl(node);
  updateNodeDisplay(node);
  updateButtons();
  prefetchNeighbors(node.id);
}

async function go(direction) {
  const map = { N: "north", S: "south", L: "east", O: "west" };

  let edges;
  try {
    edges = await getEdges(currentNode);
  } catch {
    return alert("Erro ao buscar conexões.");
  }

  const edge = edges.find(e => e.direction === map[direction]);
  if (!edge) return alert("Sem caminho nessa direção!");

  let nextNode;
  try {
    nextNode = await getNode(edge.target_id);
  } catch {
    return alert("Erro ao carregar nós.");
  }
  if (!nextNode) return alert("Destino não encontrado!");

  showNode(nextNode);
}

// nome dos ambientes já buscados (pra não perguntar pra API a cada passo)
const environmentNames = {};
let currentEnvironmentId = null;

async function environmentName(envId) {
  if (!envId) return null;

  if (!(envId in environmentNames)) {
    // guarda a Promise na hora, pra não buscar o mesmo ambiente duas vezes
    environmentNames[envId] = fetch(`/environments/${envId}`)
      .then(r => r.json())
      .then(env => env.name || null)
      .catch(() => null);
  }

  return environmentNames[envId];
}

// mostra em qual ambiente o visitante está; quando ele atravessa
// pra outro ambiente, avisa rapidinho na tela
async function updateNodeDisplay(node) {
  const display = document.getElementById("node-id-display");
  display.title = `Foto ${node.id}`;

  const name = await environmentName(node.environment_id);
  display.textContent = name || `ID: ${node.id}`;

  if (currentEnvironmentId !== null && node.environment_id !== currentEnvironmentId && name) {
    showEnvironmentBanner(name);
  }

  currentEnvironmentId = node.environment_id;
}

function showEnvironmentBanner(name) {
  const banner = document.getElementById("env-banner");
  banner.textContent = `Você entrou em: ${name}`;
  banner.classList.add("show");

  clearTimeout(showEnvironmentBanner.timer);
  showEnvironmentBanner.timer = setTimeout(() => banner.classList.remove("show"), 2500);
}

// Descobre um node válido pra começar a navegação, em vez de um
// ID/foto fixo no código (que quebra assim que aquele node é apagado
// ou a foto é trocada).
async function initStart() {
  try {
    // a lista de fotos é buscada UMA vez só e guardada
    const nodes = await fetch("/nodes/").then(r => r.json());
    nodes.forEach(n => { nodesById[n.id] = n; });

    // ponto de partida escolhido na tela de ambientes (?start=ID);
    // sem ele, prioriza nodes já posicionados no mapa do admin
    const wanted = Number(new URLSearchParams(window.location.search).get("start"));
    const placed = nodes.filter(n => n.x !== null && n.y !== null);
    const start = nodes.find(n => n.id === wanted) || placed[0] || nodes[0];

    if (!start) {
      document.getElementById("node-id-display").textContent = "Nenhum node cadastrado ainda.";
      return;
    }

    showNode(start);

  } catch {
    alert("Erro ao carregar o node inicial.");
  }
}

// Liga os botões
document.getElementById("N").onclick = () => go("N");
document.getElementById("S").onclick = () => go("S");
document.getElementById("L").onclick = () => go("L");
document.getElementById("O").onclick = () => go("O");

// Quando a página carregar, busca o node inicial dinamicamente
window.onload = () => {
  initStart();
};
