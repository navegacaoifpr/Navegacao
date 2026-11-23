let currentNode = null; // definido dinamicamente em initStart()

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
    const edges = await fetch(`http://127.0.0.1:8000/edges/${currentNode}`)
      .then(r => r.json());

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

async function go(direction) {
  const map = { N: "north", S: "south", L: "east", O: "west" };

  const edges = await fetch(`http://127.0.0.1:8000/edges/${currentNode}`)
    .then(r => r.json())
    .catch(() => alert("Erro ao buscar conexões."));

  const edge = edges.find(e => e.direction === map[direction]);
  if (!edge) return alert("Sem caminho nessa direção!");

  const nodes = await fetch(`http://127.0.0.1:8000/nodes`)
    .then(r => r.json())
    .catch(() => alert("Erro ao carregar nós."));

  const nextNode = nodes.find(n => n.id === edge.target_id);
  if (!nextNode) return alert("Destino não encontrado!");

  document.getElementById("view").src = `/images/${encodeURIComponent(nextNode.image)}`;
  currentNode = nextNode.id;
  updateNodeDisplay(nextNode);

  // Atualiza os botões de acordo com o novo nó
  updateButtons();
}

// nome dos ambientes já buscados (pra não perguntar pra API a cada passo)
const environmentNames = {};
let currentEnvironmentId = null;

async function environmentName(envId) {
  if (!envId) return null;

  if (!(envId in environmentNames)) {
    try {
      const env = await fetch(`http://127.0.0.1:8000/environments/${envId}`).then(r => r.json());
      environmentNames[envId] = env.name || null;
    } catch {
      environmentNames[envId] = null;
    }
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
    const nodes = await fetch("http://127.0.0.1:8000/nodes").then(r => r.json());

    // ponto de partida escolhido na tela de ambientes (?start=ID);
    // sem ele, prioriza nodes já posicionados no mapa do admin
    const wanted = Number(new URLSearchParams(window.location.search).get("start"));
    const placed = nodes.filter(n => n.x !== null && n.y !== null);
    const start = nodes.find(n => n.id === wanted) || placed[0] || nodes[0];

    if (!start) {
      document.getElementById("node-id-display").textContent = "Nenhum node cadastrado ainda.";
      return;
    }

    currentNode = start.id;
    document.getElementById("view").src = `/images/${encodeURIComponent(start.image)}`;
    updateNodeDisplay(start);
    updateButtons();

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
