
require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");
const runtime = require("./runtime");

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

        const prompt = `
Tu es un agent IA nommé ${agent.name}.
Ton rôle est : ${agent.role}.

Voici ta mission :
${task.description}

${previousResult}

Réalise cette mission et fournis un résultat clair, précis et structuré.
`;

        console.log("[EXECUTOR] Appel de Gemini...");

        const response = await generateWithRetry(prompt);

        const result = response.text;

        if (!result) {
            throw new Error("Gemini n'a fourni aucun résultat");
        }

        runtime.completeTask(taskId, result);

        console.log(`[EXECUTOR] Mission ${taskId} terminée`);

        return result;

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
