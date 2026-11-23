// 2ª tela do visitante: escolher o ambiente onde a navegação começa

const carousel = setupCarousel();
const projectId = Number(new URLSearchParams(window.location.search).get("project"));

// sem instituição escolhida, volta pra primeira tela
if(!projectId){
    window.location.replace("index.html");
}

function showProjectHeader(project){
    document.title = `${project.name} - Onde você quer começar?`;

    // o logo do topo é o do IFPR; outra instituição mostra o próprio nome
    if(project.name !== "IFPR"){
        document.getElementById("logo").hidden = true;
        document.getElementById("logo-text").hidden = true;

        const title = document.getElementById("project-title");
        title.textContent = project.name;
        title.hidden = false;
    }
}

async function loadEnvironments(){
    try{
        const [projectRes, envRes] = await Promise.all([
            fetch(`${API}/projects/${projectId}`),
            fetch(`${API}/projects/${projectId}/environments`)
        ]);

        if(!projectRes.ok || !envRes.ok){
            carousel.message("Instituição não encontrada.");
            return;
        }

        showProjectHeader(await projectRes.json());

        const envs = await envRes.json();

        // intersecção não vira card, e ambiente sem foto não tem onde começar
        const visible = envs.filter(e => e.kind === "comum" && e.start_node_id);

        if(visible.length === 0){
            carousel.message("Ainda não há ambientes disponíveis para visitar.");
            return;
        }

        carousel.track.innerHTML = "";

        visible.forEach(env => carousel.track.appendChild(buildCard({
            // o visualizador começa na foto de partida desse ambiente
            href: `../viewer/index.html?start=${env.start_node_id}&project=${projectId}`,
            image: env.cover_image,
            name: env.name,
            description: env.description
        })));

        carousel.update();

    }catch{
        carousel.message("Não foi possível conectar ao servidor. Tente novamente em instantes.");
    }
}

if(projectId){
    loadEnvironments();
}
