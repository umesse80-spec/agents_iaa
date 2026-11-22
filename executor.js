
require("dotenv").config();

const projectBuilder = require("./projectBuilder");
const { GoogleGenAI } = require("@google/genai");
const runtime = require("./runtime");
const plugins = require("./plugins");
const gmailAgent = require("./agents/gmailAgent");

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

async function generateWithRetry(prompt, maxAttempts = 4) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await ai.models.generateContent({
                model: "gemini-3.5-flash-lite",
                contents: prompt
            });
        } catch (error) {
            const message = error.message || "";

            const temporaryError =
                message.includes("503") ||
                message.includes("UNAVAILABLE") ||
                message.includes("429") ||
                message.includes("RESOURCE_EXHAUSTED");

            if (!temporaryError || attempt === maxAttempts) {
                throw error;
            }

            const delay = attempt * 5000;

            console.log(
                `[EXECUTOR] Gemini indisponible. Nouvelle tentative dans ${delay / 1000}s (${attempt + 1}/${maxAttempts})`
            );

            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

async function executeTask(taskId, previousTaskId = null) {
    let taskStarted = false;

    try {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error("Clé API Gemini manquante");
        }

        console.log(`[EXECUTOR] Mission ${taskId} : démarrage`);

        // Récupération du résultat de la mission précédente
        let previousResult = "";

        if (previousTaskId !== null) {
            const previousTask = runtime.getTask(previousTaskId);

            if (!previousTask || previousTask.status !== "completed") {
                throw new Error(
                    "La mission précédente est introuvable ou non terminée"
                );
            }

            previousResult = `
Voici le résultat de la mission précédente :
${previousTask.result}

Utilise ce résultat pour réaliser ta mission.
`;
        }

        const task = runtime.startTask(taskId);
        taskStarted = true;

        const agent = runtime.getAgents().find(
            a => a.id === task.agentId
        );

        if (!agent) {
            throw new Error("Agent introuvable");
        }

        // Contexte Gmail
        let gmailContext = "";

        if (agent.role === "email") {
            const gmailPlugin = plugins.getAll().find(
                plugin => plugin.id === "gmail"
            );

            if (!gmailPlugin?.installed || !gmailPlugin?.enabled) {
                throw new Error(
                    "Le plugin Gmail doit être installé et activé."
                );
            }

            console.log("[EXECUTOR] Connexion au plugin Gmail...");

            const emails = await gmailAgent.getEmails(10);

            gmailContext = `
Voici les 10 derniers e-mails récupérés depuis Gmail :

${JSON.stringify(emails, null, 2)}

Tu peux analyser ces e-mails pour réaliser ta mission.
Tu ne dois jamais prétendre avoir envoyé ou supprimé un e-mail.
`;
        }

        // Instructions de l'agent
        const prompt = `
Tu es un agent IA nommé ${agent.name}.
Ton rôle est : ${agent.role}.

Voici ta mission :
${task.description}

${previousResult}

${gmailContext}

SI LA MISSION DEMANDE DE CRÉER OU MODIFIER UN PROJET INFORMATIQUE :

TU DOIS IMPÉRATIVEMENT générer les vrais fichiers du projet.

Ta réponse doit contenir DEUX PARTIES :

PARTIE 1 — PRÉSENTATION
- Présente le projet.
- Affiche le code complet de chaque fichier dans des blocs de code séparés.
- Indique le nom de chaque fichier.

PARTIE 2 — EXPORT AUTOMATIQUE
À la toute fin de ta réponse, ajoute obligatoirement les deux marqueurs suivants et le JSON complet entre eux.

<<<AGENTS_IA_FILES>>>
{
  "files": [
    {
      "path": "index.html",
      "content": "CODE COMPLET EXACT DU FICHIER"
    },
    {
      "path": "style.css",
      "content": "CODE COMPLET EXACT DU FICHIER"
    },
    {
      "path": "script.js",
      "content": "CODE COMPLET EXACT DU FICHIER"
    }
  ]
}
<<<END_AGENTS_IA_FILES>>>

RÈGLES ABSOLUES :
- Les marqueurs sont obligatoires pour tout projet informatique.
- Le JSON doit être valide et analysable par JSON.parse.
- Échappe correctement les guillemets et les retours à la ligne dans les chaînes JSON.
- Le contenu des fichiers dans le JSON doit être exactement le même que dans les blocs de code affichés.
- N'écris aucun texte après le marqueur de fin.
- N'utilise jamais de contenu fictif comme "CONTENU COMPLET".
- N'omets aucun fichier nécessaire au fonctionnement du projet.
- Ne tronque jamais le code.
- Les chemins doivent correspondre aux vrais noms des fichiers.
- Inclus tous les fichiers nécessaires, même si le projet contient plus de trois fichiers.
- Ne fournis pas les marqueurs pour une mission qui ne demande pas de créer ou modifier des fichiers.
`;

        console.log("[EXECUTOR] Appel de Gemini...");

        const response = await generateWithRetry(prompt);

        const result = response.text;

        if (!result) {
            throw new Error("Gemini n'a fourni aucun résultat");
        }

        // Création automatique du projet ZIP
        let project = null;
        let displayResult = result;

        try {
            const generatedProject =
                await projectBuilder.createProjectZip(result);

            if (generatedProject) {
                project = {
                    projectId: generatedProject.projectId,
                    zipUrl: generatedProject.zipUrl,
                    files: generatedProject.files.map(file => file.path)
                };

                displayResult = generatedProject.text;

                console.log("[PROJECT] ZIP créé avec succès");
            }
        } catch (error) {
            console.error(
                "[PROJECT] Erreur de création du ZIP :",
                error.message
            );
        }

        // Enregistrement du résultat et du projet
        runtime.completeTask(taskId, displayResult, project);

        console.log(`[EXECUTOR] Mission ${taskId} terminée`);

        return displayResult;

    } catch (error) {
        console.error("[EXECUTOR] Erreur :", error.message);

        if (taskStarted) {
            runtime.failTask(taskId, error.message);
        }

        throw error;
    }
}

module.exports = {
    executeTask
};
