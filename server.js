
const http = require("http");
const runtime = require("./runtime");
const executor = require("./executor");

const PORT = 3000;

// Enregistrement des agents
const agents = [
    { id: 1, name: "Documentation Specialist API", role: "documentation" },
    { id: 2, name: "Code Analyst", role: "analysis" },
    { id: 3, name: "Developer Agent", role: "development" },
    { id: 4, name: "Test Agent", role: "testing" }
];

agents.forEach(agent => runtime.registerAgent(agent));

function sendJSON(res, status, data) {
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    });

    res.end(JSON.stringify(data, null, 2));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";

        req.on("data", chunk => body += chunk);

        req.on("end", () => {
            try {
                resolve(JSON.parse(body));
            } catch {
                reject(new Error("JSON invalide"));
            }
        });

        req.on("error", reject);
    });
}

const server = http.createServer(async (req, res) => {

    if (req.method === "OPTIONS") {
        return sendJSON(res, 200, {});
    }

    if (req.method === "GET" && req.url === "/") {
        return sendJSON(res, 200, {
            name: "AGENTS_IA",
            status: "online",
            message: "Backend et runtime connectés"
        });
    }

    if (req.method === "GET" && req.url === "/api/agents") {
        return sendJSON(res, 200, runtime.getAgents());
    }

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


    // Exécuter automatiquement une mission
if (req.method === "POST" && req.url === "/api/tasks/execute") {
    try {
        const data = await readBody(req);

        const result = await executor.executeTask(
            Number(data.taskId)
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

    return sendJSON(res, 404, {
        error: "Route introuvable"
    });
});

server.listen(PORT, () => {
    console.log("--------------------------------");
    console.log(" AGENTS_IA - BACKEND");
    console.log("--------------------------------");
    console.log(`Serveur : http://localhost:${PORT}`);
    console.log("Runtime : connecté");
});
