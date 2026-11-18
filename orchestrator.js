
require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

const AGENTS = {
    1: "Documentation Specialist API",
    2: "Code Analyst",
    3: "Developer Agent",
    4: "Test Agent"
};

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
                /503|UNAVAILABLE|429|RESOURCE_EXHAUSTED/.test(message);

            if (!temporaryError || attempt === maxAttempts) {
                throw error;
            }

            const delay = attempt * 5000;

            console.log(
                `[ORCHESTRATOR] Gemini indisponible. Nouvelle tentative dans ${delay / 1000}s`
            );

            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

async function generatePlan(userRequest, selectedAgents) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("Clé API Gemini manquante");
    }

    if (typeof userRequest !== "string" || !userRequest.trim()) {
        throw new Error("Demande utilisateur invalide");
    }

    if (
        !Array.isArray(selectedAgents) ||
        selectedAgents.length === 0 ||
        selectedAgents.some(id => !Object.hasOwn(AGENTS, id))
    ) {
        throw new Error("Sélection des agents invalide");
    }

    const agentsDescription = selectedAgents
        .map(id => `- ID ${id} : ${AGENTS[id]}`)
        .join("\n");

    const prompt = `
Tu es un orchestrateur professionnel qui dirige une équipe de plusieurs agents IA spécialisés.

TON OBJECTIF :
Transformer une demande courte, composée éventuellement de simples mots-clés, en un véritable plan de travail professionnel, extrêmement précis et détaillé.

AGENTS AUTORISÉS :
${agentsDescription}

DEMANDE INITIALE DE L'UTILISATEUR :
${userRequest.trim()}

RÈGLES ABSOLUES :

1. Utilise EXCLUSIVEMENT les agents autorisés ci-dessus.
2. Chaque agent sélectionné doit recevoir une mission.
3. Organise les missions dans un ordre logique.
4. Chaque mission doit être extrêmement détaillée, compréhensible et exploitable sans ambiguïté.
5. Explique précisément le travail attendu, les objectifs, les contraintes, les étapes et le résultat à fournir.
6. Si un agent reçoit le résultat d'un agent précédent, demande-lui de l'analyser et de le poursuivre.
7. Ne demande jamais à un agent de réaliser une tâche qui ne correspond pas à sa spécialité.
8. Pour un projet informatique :
   - Documentation Specialist API : documentation technique, architecture documentaire et spécifications.
   - Code Analyst : analyse des besoins, architecture logicielle et identification des risques.
   - Developer Agent : développement concret et code complet.
   - Test Agent : vérification du code, tests, détection des erreurs et rapport.
9. Si un seul agent est sélectionné, donne-lui directement une mission complète adaptée à son rôle.
10. N'invente pas d'agents supplémentaires.
11. N'utilise jamais l'orchestrateur comme agent exécutant.

FORMAT DE RÉPONSE :
Réponds UNIQUEMENT avec un JSON valide, sans Markdown ni commentaire.

Structure obligatoire :
{
  "steps": [
    {
      "agentId": 2,
      "description": "Mission extrêmement détaillée..."
    }
  ]
}
`;

    const response = await generateWithRetry(prompt);
    const raw = response.text;

    if (!raw) {
        throw new Error("Gemini n'a fourni aucun plan");
    }

    let plan;

    try {
        const cleaned = raw
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/\s*```$/, "")
            .trim();

        plan = JSON.parse(cleaned);
    } catch {
        throw new Error("L'orchestrateur a renvoyé un JSON invalide");
    }

    if (
        !Array.isArray(plan.steps) ||
        plan.steps.length !== selectedAgents.length
    ) {
        throw new Error("Le nombre de missions générées est incorrect");
    }

    const generatedIds = plan.steps.map(step => step.agentId);

    if (
        generatedIds.some(id => !selectedAgents.includes(id)) ||
        new Set(generatedIds).size !== selectedAgents.length ||
        selectedAgents.some(id => !generatedIds.includes(id))
    ) {
        throw new Error("L'orchestrateur a utilisé un agent non autorisé");
    }

    for (const step of plan.steps) {
        if (
            ![1, 2, 3, 4].includes(step.agentId) ||
            typeof step.description !== "string" ||
            step.description.trim().length < 30
        ) {
            throw new Error("Une mission générée est invalide ou trop courte");
        }
    }

    return plan;
}

module.exports = {
    generatePlan
};
