
require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");
const runtime = require("./runtime");

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

async function executeTask(taskId) {
    let taskStarted = false;

    try {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error("Clé API Gemini manquante");
        }

        console.log(`[EXECUTOR] Mission ${taskId} : démarrage`);

        const task = runtime.startTask(taskId);
        taskStarted = true;

        const agent = runtime.getAgents().find(
            a => a.id === task.agentId
        );

        const prompt = `
Tu es un agent IA nommé ${agent.name}.
Ton rôle est : ${agent.role}.

Voici ta mission :
${task.description}

Réalise cette mission et fournis un résultat clair, précis et structuré.
`;

        console.log("[EXECUTOR] Appel de Gemini...");

        const response = await ai.models.generateContent({
            model: "gemini-3.5-flash-lite",
            contents: prompt
        });

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
