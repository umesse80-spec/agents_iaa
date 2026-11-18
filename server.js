
const http = require("http");
const runtime = require("./runtime");
const executor = require("./executor");
const orchestrator = require("./orchestrator");
const assistant = require("./assistant");

const PORT = 3000;

// Enregistrement des agents
const agents = [
    { id: 1, name: "Documentation Specialist API", role: "documentation" },
    { id: 2, name: "Code Analyst", role: "analysis" },
    { id: 3, name: "Developer Agent", role: "development" },
    { id: 4, name: "Test Agent", role: "testing" },
    { id: 5, name: "Orchestrateur IA", role: "orchestration" }
];

agents.forEach(agent => runtime.registerAgent(agent));

// Envoyer une réponse JSON en UTF-8
function sendJSON(res, status, data) {
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    });

    res.end(JSON.stringify(data, null, 2));
}

// Lire les données reçues en UTF-8
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];

        req.on("data", chunk => chunks.push(chunk));

        req.on("end", () => {
            try {
                const body = Buffer.concat(chunks).toString("utf8");
                resolve(JSON.parse(body));
            } catch (error) {
                reject(new Error("JSON invalide : " + error.message));
            }
        });

        req.on("error", reject);
    });
}

const server = http.createServer(async (req, res) => {

    // Gestion des requêtes OPTIONS
    if (req.method === "OPTIONS") {
        return sendJSON(res, 200, {});
    }

    // Accueil
    if (req.method === "GET" && req.url === "/") {
        return sendJSON(res, 200, {
            name: "AGENTS_IA",
            status: "online",
            message: "Backend et runtime connectés"
        });
    }

    // Récupérer les agents
    if (req.method === "GET" && req.url === "/api/agents") {
        return sendJSON(res, 200, runtime.getAgents());
    }

    // Récupérer les missions
    if (req.method === "GET" && req.url === "/api/tasks") {
        return sendJSON(res, 200, runtime.getTasks());
    }

    // Créer une mission
    if (req.method === "POST" && req.url === "/api/tasks") {
        try {
            const data = await readBody(req);
            const description = data.description || data.task;

            const task = runtime.createTask(
                Number(data.agentId),
                description
            );

            return sendJSON(res, 201, {
                message: "Mission créée",
                task
            });

        } catch (error) {
            return sendJSON(res, 400, {
                error: error.message
            });
        }
    }

    // Exécuter une mission
    if (req.method === "POST" && req.url === "/api/tasks/execute") {
        try {
            const data = await readBody(req);

            const result = await executor.executeTask(
                Number(data.taskId),
                data.previousTaskId !== undefined
                    ? Number(data.previousTaskId)
                    : null
            );

            return sendJSON(res, 200, {
                message: "Mission exécutée avec succès",
                result
            });

        } catch (error) {
            return sendJSON(res, 400, {
                error: error.message
            });
        }
    }

    // Orchestration automatique des agents
    if (req.method === "POST" && req.url === "/api/orchestrate") {
        try {
            const data = await readBody(req);
            const userRequest = data.request || data.description || data.task;
            const selectedAgents = data.selectedAgents;

            if (typeof userRequest !== "string" || !userRequest.trim()) {
                return sendJSON(res, 400, {
                    error: "Demande utilisateur manquante"
                });
            }

            if (
                !Array.isArray(selectedAgents) ||
                selectedAgents.length === 0 ||
                selectedAgents.some(id => ![1, 2, 3, 4].includes(id))
            ) {
                return sendJSON(res, 400, {
                    error: "Sélectionne au moins un agent valide"
                });
            }

            console.log("[ORCHESTRATOR] Analyse de la demande...");
            console.log("[ORCHESTRATOR] Agents sélectionnés :", selectedAgents);

            const plan = await orchestrator.generatePlan(
                userRequest,
                selectedAgents
            );

            const completedTasks = [];
            let previousTaskId = null;

            for (const step of plan.steps) {
                const task = runtime.createTask(
                    step.agentId,
                    step.description
                );

                console.log(
                    `[ORCHESTRATOR] Agent ${step.agentId} : mission ${task.id}`
                );

                await executor.executeTask(task.id, previousTaskId);

                previousTaskId = task.id;
                completedTasks.push(runtime.getTask(task.id));
            }

            return sendJSON(res, 200, {
                message: "Workflow automatique terminé",
                plan,
                tasks: completedTasks,
                finalResult: completedTasks[completedTasks.length - 1].result
            });

        } catch (error) {
            console.error("[ORCHESTRATOR] Erreur :", error.message);

            return sendJSON(res, 500, {
                error: error.message
            });
        }
    }

    // Démarrer une mission
    if (req.method === "POST" && req.url === "/api/tasks/start") {
        try {
            const data = await readBody(req);
            const task = runtime.startTask(Number(data.taskId));

            return sendJSON(res, 200, {
                message: "Mission démarrée",
                task
            });

        } catch (error) {
            return sendJSON(res, 400, {
                error: error.message
            });
        }
    }

    // Terminer une mission
    if (req.method === "POST" && req.url === "/api/tasks/complete") {
        try {
            const data = await readBody(req);

            if (typeof data.result !== "string" || !data.result.trim()) {
                return sendJSON(res, 400, {
                    error: "Résultat invalide"
                });
            }

            const task = runtime.completeTask(
                Number(data.taskId),
                data.result.trim()
            );

            return sendJSON(res, 200, {
                message: "Mission terminée",
                task
            });

        } catch (error) {
            return sendJSON(res, 400, {
                error: error.message
            });
        }
    }

    // Signaler un échec
    if (req.method === "POST" && req.url === "/api/tasks/fail") {
        try {
            const data = await readBody(req);

            if (typeof data.error !== "string" || !data.error.trim()) {
                return sendJSON(res, 400, {
                    error: "Description de l'échec invalide"
                });
            }

            const task = runtime.failTask(
                Number(data.taskId),
                data.error.trim()
            );

            return sendJSON(res, 200, {
                message: "Mission échouée",
                task
            });

        } catch (error) {
            return sendJSON(res, 400, {
                error: error.message
            });
        }
    }

    // Assistant IA : discussion, analyse et génération d'images
    if (req.method === "POST" && req.url === "/api/assistant") {
        try {
            const data = await readBody(req);

            console.log(
                "Nombre d'images reçues :",
                Array.isArray(data.images) ? data.images.length : 0
            );

            console.log(
                "Historique reçu :",
                Array.isArray(data.history) ? data.history.length : 0
            );

            const result = await assistant.chat(
                data.message,
                data.images || [],
                data.history || []
            );

            return sendJSON(res, 200, {
                message: "Réponse de l'Assistant IA",
                response: result.text,
                images: result.images || []
            });

        } catch (error) {
            console.error("[ASSISTANT] Erreur :", error.message);

            return sendJSON(res, 500, {
                error: error.message
            });
        }
    }

    // Route inconnue
    return sendJSON(res, 404, {
        error: "Route introuvable"
    });
});

// Démarrage du serveur
server.listen(PORT, () => {
    console.log("--------------------------------");
    console.log(" AGENTS_IA - BACKEND");
    console.log("--------------------------------");
    console.log(`Serveur : http://localhost:${PORT}`);
    console.log("Runtime : connecté");
    console.log("Orchestrateur : connecté");
    console.log("Assistant IA : connecté");
    console.log("Génération d'images : disponible");
    console.log("Encodage : UTF-8");
});
