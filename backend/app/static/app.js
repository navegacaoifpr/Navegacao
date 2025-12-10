let currentNode = 1; // ID do nó inicial

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

  document.getElementById("view").src = `../images/${nextNode.image}`;
  currentNode = nextNode.id;
  updateNodeDisplay(currentNode);

  // Atualiza os botões de acordo com o novo nó
  updateButtons();
}

function updateNodeDisplay(nodeId) {
  const display = document.getElementById("node-id-display");
  display.textContent = `ID: ${nodeId}`;
}


// Liga os botões
document.getElementById("N").onclick = () => go("N");
document.getElementById("S").onclick = () => go("S");
document.getElementById("L").onclick = () => go("L");
document.getElementById("O").onclick = () => go("O");

// Quando a página carregar, configura os botões e coloca o id
window.onload = () => {
  updateButtons();
  updateNodeDisplay(currentNode);
};
