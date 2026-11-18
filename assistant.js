
require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

const ALLOWED_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp"
];

const MAX_IMAGES = 5;
const MODEL = "gemini-3.5-flash-lite";
const MAX_PROMPT_LENGTH = 2048;

const systemInstruction = `
Tu es l'Assistant IA principal du système AGENTS_IA.

Tu es polyvalent, intelligent, clair et pédagogique.
Tu peux discuter, expliquer, conseiller et analyser des images.

Tu disposes de l'historique de la conversation.
Utilise les anciens messages pour comprendre le contexte.

Si l'utilisateur envoie des images, analyse-les attentivement.
Ne prétends jamais voir des éléments absents.
`;


// DÉTECTION DE L'INTENTION DE CRÉATION VISUELLE
async function detectImageIntent(message) {
    const prompt = `
Détermine si l'utilisateur souhaite réellement générer une création visuelle.

Exemples :
- Image, photo, illustration, dessin
- Affiche, flyer, poster
- Logo, bannière, miniature YouTube
- Couverture, fond d'écran
- Photomontage, infographie, icône
- Avatar, portrait, création artistique

Réponds uniquement en JSON :
{"generateImage":true}
ou
{"generateImage":false}

Exemples :
"Fais-moi une affiche" = true
"J'aimerais un logo" = true
"Imagine un chat dans l'espace" = true
"Comment créer un logo ?" = false
"Explique-moi ce qu'est une affiche" = false

Demande :
${message}
`;

    try {
        const response = await ai.models.generateContent({
            model: MODEL,
            contents: prompt,
            config: {
                responseMimeType: "application/json"
            }
        });

        const result = JSON.parse(response.text.trim());

        return result.generateImage === true;

    } catch (error) {
        console.warn(
            "Détection Gemini indisponible, utilisation des mots-clés."
        );

        return fallbackImageIntent(message);
    }
}


// DÉTECTION DE SECOURS
function fallbackImageIntent(message) {
    const text = message.toLowerCase();

    const visualWords =
        /\b(image|images|photo|photos|affiche|affiches|poster|posters|flyer|flyers|logo|logos|illustration|illustrations|dessin|dessins|bannière|bannières|miniature|miniatures|couverture|couvertures|fond d'écran|fonds d'écran|photomontage|visuel|visuels|infographie|infographies|icône|icônes|avatar|avatars|portrait|portraits|wallpaper|thumbnail|homme|femme|chat|chien)\b/i;

    const creationWords =
        /\b(fais|fait|faire|crée|créer|crée-moi|génère|générer|dessine|dessiner|fabrique|fabriquer|produis|produire|conçois|concevoir|imagine|prépare|préparer|réalise|réaliser|je veux|je voudrais|j'aimerais|peux-tu|pourrais-tu)\b/i;

    return visualWords.test(text) && creationWords.test(text);
}


// AMÉLIORATION AUTOMATIQUE DU PROMPT AVEC GEMINI
async function improveImagePrompt(message) {
    const instructions = `
Tu es un directeur artistique professionnel spécialisé
dans la création d'images par intelligence artificielle.

Transforme la demande de l'utilisateur en un prompt visuel
précis, détaillé et efficace pour un générateur d'images.

RÈGLES IMPORTANTES :
- Respecte exactement le sujet demandé.
- Ne change jamais le sujet principal.
- N'ajoute pas d'éléments sans rapport avec la demande.
- Si aucun style n'est précisé, choisis un photoréalisme naturel.
- Décris précisément le sujet, son apparence et sa position.
- Décris le cadrage et la composition.
- Précise la lumière, les couleurs et l'environnement.
- Recherche un rendu réaliste, propre et détaillé.
- Évite les déformations anatomiques et les défauts visuels.
- Ne crée aucun texte dans l'image sauf si demandé.
- Réponds uniquement avec le prompt final.
- Utilise l'anglais pour obtenir une description visuelle efficace.
- Maximum 1700 caractères.
- Les personnes représentées sont entièrement habillées.
- Les scènes sont ordinaires et non sexuelles.
- Les portraits représentent des adultes.
- Évite toute nudité ou situation suggestive.
`;

    try {
        const response = await ai.models.generateContent({
            model: MODEL,
            contents: `
${instructions}

DEMANDE DE L'UTILISATEUR :
${message}
`,
            config: {
                maxOutputTokens: 700
            }
        });

        const improvedPrompt = response.text?.trim();

        if (!improvedPrompt) {
            throw new Error("Gemini n'a pas amélioré le prompt.");
        }

        return improvedPrompt.slice(0, 1700);

    } catch (error) {
        console.warn(
            "Amélioration Gemini indisponible, utilisation du prompt original."
        );

        return message.trim().slice(0, 1700);
    }
}


// GÉNÉRATION D'IMAGE AVEC CLOUDFLARE
async function generateImage(message) {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;

    if (!accountId || !apiToken) {
        throw new Error(
            "Identifiants Cloudflare manquants dans le fichier .env"
        );
    }

    // Gemini construit une meilleure description visuelle.
    const improvedPrompt = await improveImagePrompt(message);

    const finalPrompt = `
${improvedPrompt}

High quality, professional composition, coherent details.
`.trim().slice(0, MAX_PROMPT_LENGTH);

    const url =
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            prompt: finalPrompt,
            steps: 4
        })
    });

    let result;

    try {
        result = await response.json();
    } catch {
        throw new Error("Cloudflare a retourné une réponse illisible.");
    }

    if (!response.ok || result.success === false) {
        const details = result.errors
            ?.map(error => error.message || error.code)
            .join(", ");

        throw new Error(
            details || `Erreur Cloudflare : HTTP ${response.status}`
        );
    }

    const imageData = result.result?.image;

    if (!imageData || typeof imageData !== "string") {
        throw new Error("Cloudflare n'a pas retourné d'image.");
    }

    return {
        text: "Voici l'image que j'ai créée.",
        images: [
            {
                mimeType: "image/jpeg",
                data: imageData
            }
        ]
    };
}


// DISCUSSION ET ANALYSE
async function chat(message, images = [], history = []) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("Clé API Gemini manquante");
    }

    if (typeof message !== "string" || !message.trim()) {
        throw new Error("Message invalide");
    }

    if (!Array.isArray(images) || !Array.isArray(history)) {
        throw new Error("Images ou historique invalides");
    }

    if (images.length > MAX_IMAGES) {
        throw new Error("Maximum : 5 images par message");
    }

    // GEMINI DÉTECTE LES DEMANDES DE CRÉATION
    const wantsImage = await detectImageIntent(message);

    if (wantsImage) {
        return await generateImage(message);
    }

    // DISCUSSION CLASSIQUE AVEC GEMINI
    const contents = [];

    for (const item of history.slice(-20)) {
        if (!item || !["user", "assistant"].includes(item.role)) {
            continue;
        }

        const parts = [];

        if (typeof item.content === "string" && item.content.trim()) {
            parts.push({ text: item.content });
        }

        const oldImages = Array.isArray(item.images)
            ? item.images
            : (item.imageData ? [item.imageData] : []);

        if (item.role === "user") {
            for (const imageData of oldImages.slice(0, MAX_IMAGES)) {
                if (typeof imageData !== "string") continue;

                const match = imageData.match(
                    /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/
                );

                if (match) {
                    parts.push({
                        inlineData: {
                            mimeType: match[1],
                            data: match[2]
                        }
                    });
                }
            }
        }

        if (parts.length > 0) {
            contents.push({
                role: item.role === "assistant" ? "model" : "user",
                parts
            });
        }
    }

    const currentParts = [
        { text: message.trim() }
    ];

    for (const image of images) {
        if (
            !image ||
            typeof image.data !== "string" ||
            !ALLOWED_IMAGE_TYPES.includes(image.mimeType)
        ) {
            throw new Error("Une image possède un format invalide");
        }

        currentParts.push({
            inlineData: {
                mimeType: image.mimeType,
                data: image.data
            }
        });
    }

    contents.push({
        role: "user",
        parts: currentParts
    });

    const response = await ai.models.generateContent({
        model: MODEL,
        contents,
        config: {
            systemInstruction
        }
    });

    if (!response.text) {
        throw new Error("Aucune réponse reçue de Gemini");
    }

    return {
        text: response.text,
        images: []
    };
}


module.exports = {
    chat
};
