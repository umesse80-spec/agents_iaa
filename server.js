const projectBuilder = require("./projectBuilder");
const http = require("http");
const fs = require("fs");
const path = require("path");
const plugins = require("./plugins");
const runtime = require("./runtime");
const executor = require("./executor");
const orchestrator = require("./orchestrator");
const assistant = require("./assistant");
const gmailAgent = require("./agents/gmailAgent");

const PORT = 3000;

const agents = [
    { id: 1, name: "Documentation Specialist API", role: "documentation" },
    { id: 2, name: "Code Analyst", role: "analysis" },
    { id: 3, name: "Developer Agent", role: "development" },
    { id: 4, name: "Test Agent", role: "testing" },
    { id: 5, name: "Orchestrateur IA", role: "orchestration" },
    { id: 6, name: "Gmail Agent", role: "email" }
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
        const chunks = [];
        let totalSize = 0;

        req.on("data", chunk => {
            totalSize += chunk.length;

            if (totalSize > 100000) {
                reject(new Error("Requête trop volumineuse."));
                req.destroy();
                return;
            }

            chunks.push(chunk);
        });

        req.on("end", () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
            } catch (error) {
                reject(new Error("JSON invalide : " + error.message));
            }
        });

        req.on("error", reject);
    });
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");

    if (req.method === "OPTIONS") {
        return sendJSON(res, 200, {});
    }

    // ACCUEIL
    if (req.method === "GET" && url.pathname === "/") {
        return sendJSON(res, 200, {
            name: "AGENTS_IA",
            status: "online",
            message: "Backend et runtime connectés"
        });
    }


    // ========================================
    // GESTION DES PLUGINS
    // ========================================

    // Liste des plugins
    if (req.method === "GET" && url.pathname === "/api/plugins") {
        return sendJSON(res, 200, plugins.getAll());
    }

    // Installer un plugin
    if (req.method === "POST" && url.pathname === "/api/plugins/install") {
        try {
            const data = await readBody(req);
            const plugin = plugins.install(data.pluginId);

            return sendJSON(res, 200, {
                message: "Plugin installé",
                plugin
            });
        } catch (error) {
            return sendJSON(res, 400, {
                error: error.message
            });
        }
    }

    // Désinstaller un plugin
    if (req.method === "POST" && url.pathname === "/api/plugins/uninstall") {
        try {
            const data = await readBody(req);
            const result = plugins.uninstall(data.pluginId);

            return sendJSON(res, 200, {
                message: "Plugin désinstallé",
                plugins: result
            });
        } catch (error) {
            return sendJSON(res, 400, {
                error: error.message
            });
        }
    }

    // Activer ou désactiver un plugin
    if (req.method === "POST" && url.pathname === "/api/plugins/toggle") {
        try {
            const data = await readBody(req);

            const plugin = plugins.setEnabled(
                data.pluginId,
                data.enabled
            );

            return sendJSON(res, 200, {
                message: "État du plugin modifié",
                plugin
            });
        } catch (error) {
            return sendJSON(res, 400, {
                error: error.message
            });
        }
    }


    // AGENTS
    if (req.method === "GET" && url.pathname === "/api/agents") {
        return sendJSON(res, 200, runtime.getAgents());
    }

    // MISSIONS
    if (req.method === "GET" && url.pathname === "/api/tasks") {
        return sendJSON(res, 200, runtime.getTasks());
    }

    // STATUT GMAIL
    if (req.method === "GET" && url.pathname === "/api/gmail/status") {
        const tokenPath = path.join(__dirname, "token.json");
        const connected = fs.existsSync(tokenPath);

        return sendJSON(res, 200, {
            connected,
            message: connected
                ? "Connexion Gmail enregistrée"
                : "Connexion Gmail non configurée"
        });
    }

    // ANALYSES GMAIL
    if (req.method === "GET" && url.pathname === "/api/gmail/analyses") {
        try {
            const analysesPath = path.join(
                __dirname,
                "data",
                "gmail-analyses.json"
            );

            if (!fs.existsSync(analysesPath)) {
                return sendJSON(res, 200, {
                    count: 0,
                    analyses: []
                });
            }

            const analyses = JSON.parse(
                fs.readFileSync(analysesPath, "utf8")
            );

            const results = Object.values(analyses).reverse();

            return sendJSON(res, 200, {
                count: results.length,
                analyses: results
            });

        } catch (error) {
            console.error("[GMAIL] Erreur analyses :", error.message);

            return sendJSON(res, 500, {
                error: "Impossible de récupérer les analyses"
            });
        }
    }

    // RÉCUPÉRER LES E-MAILS
    if (req.method === "GET" && url.pathname === "/api/gmail/emails") {
        try {
            const requestedLimit = Number(
                url.searchParams.get("limit") || 20
            );

            if (
                !Number.isInteger(requestedLimit) ||
                requestedLimit < 1 ||
                requestedLimit > 50
            ) {
                return sendJSON(res, 400, {
                    error: "La limite doit être comprise entre 1 et 50"
                });
            }

            const emails = await gmailAgent.getEmails(requestedLimit);

            return sendJSON(res, 200, {
                message: "E-mails récupérés avec succès",
                count: emails.length,
                emails
            });

        } catch (error) {
            console.error("[GMAIL] Erreur :", error.message);

            return sendJSON(res, 500, {
                error: "Impossible de récupérer les e-mails",
                details: error.message
            });
        }
    }

    // ENVOYER UNE RÉPONSE GMAIL APRÈS VALIDATION
    if (req.method === "POST" && url.pathname === "/api/gmail/send") {
        try {
            const data = await readBody(req);

            if (
                typeof data.emailId !== "string" ||
                !data.emailId.trim()
            ) {
                return sendJSON(res, 400, {
                    error: "Identifiant de l'e-mail manquant."
                });
            }

            if (
                typeof data.replyText !== "string" ||
                !data.replyText.trim()
            ) {
                return sendJSON(res, 400, {
                    error: "Le texte de la réponse est vide."
                });
            }

            const result = await gmailAgent.sendReply(
                data.emailId,
                data.replyText
            );

            return sendJSON(res, 200, {
                message: "Réponse envoyée avec succès.",
                result
            });

        } catch (error) {
            console.error("[GMAIL] Erreur d'envoi :", error.message);

            return sendJSON(res, 500, {
                error: "Impossible d'envoyer la réponse.",
                details: error.message
            });
        }
    }

    // Vérifier que le plugin Gmail est installé et activé
const gmailPlugin = plugins.getAll().find(
    plugin => plugin.id === "gmail"
);

if (!gmailPlugin?.installed || !gmailPlugin?.enabled) {
    return sendJSON(res, 403, {
        error: "Le plugin Gmail doit être installé et activé."
    });
}

    // CRÉER UNE MISSION
    if (req.method === "POST" && url.pathname === "/api/tasks") {
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

    // EXÉCUTER UNE MISSION
    if (req.method === "POST" && url.pathname === "/api/tasks/execute") {
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

    // ORCHESTRATION
    if (req.method === "POST" && url.pathname === "/api/orchestrate") {
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

    // DÉMARRER UNE MISSION
    if (req.method === "POST" && url.pathname === "/api/tasks/start") {
        try {
            const data = await readBody(req);
            const task = runtime.startTask(Number(data.taskId));

            const completedTask = runtime.getTask(Number(data.taskId));

return sendJSON(res, 200, {
    message: "Mission exécutée avec succès",
    result,
    project: completedTask?.project || null
});

        } catch (error) {
            return sendJSON(res, 400, {
                error: error.message
            });
        }
    }

    // TERMINER UNE MISSION
    if (req.method === "POST" && url.pathname === "/api/tasks/complete") {
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

    // ÉCHEC D'UNE MISSION
    if (req.method === "POST" && url.pathname === "/api/tasks/fail") {
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
// TÉLÉCHARGEMENT DES PROJETS ZIP
if (
    req.method === "GET" &&
    url.pathname.startsWith("/api/projects/") &&
    url.pathname.endsWith("/download")
) {
    const projectId = url.pathname.split("/")[3];
    const zipPath = projectBuilder.getProjectZip(projectId);

    if (!zipPath) {
        return sendJSON(res, 404, {
            error: "Projet introuvable."
        });
    }

    res.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="projet-agents-ia.zip"',
        "Content-Length": fs.statSync(zipPath).size,
        "Access-Control-Allow-Origin": "*"
    });

    const stream = fs.createReadStream(zipPath);

    stream.on("error", error => {
        console.error("[PROJECT] Erreur de téléchargement :", error.message);

        if (!res.headersSent) {
            sendJSON(res, 500, {
                error: "Erreur pendant le téléchargement."
            });
        } else {
            res.destroy(error);
        }
    });

    stream.pipe(res);
    return;
}

    // ASSISTANT IA
    if (req.method === "POST" && url.pathname === "/api/assistant") {
        try {
            const data = await readBody(req);

            const result = await assistant.chat(
                data.message,
                data.images || [],
                data.history || []
            );

            return sendJSON(res, 200, {
    message: "Réponse de l'Assistant IA",
    response: result.text,
    images: result.images || [],
    project: result.project || null
});

        } catch (error) {
            console.error("[ASSISTANT] Erreur :", error.message);

            return sendJSON(res, 500, {
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
    console.log("Orchestrateur : connecté");
    console.log("Assistant IA : connecté");
    console.log("Gmail Agent : connecté");
    console.log("Génération d'images : disponible");
    console.log("Encodage : UTF-8");

    gmailAgent.startMonitoring(60_000);
});
