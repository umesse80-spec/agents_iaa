
const { google } = require("googleapis");
const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const { analyzeEmail } = require("../assistant");

const DATA_DIR = path.join(__dirname, "..", "data");
const ANALYSES_PATH = path.join(DATA_DIR, "gmail-analyses.json");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const CREDENTIALS_PATH = path.join(__dirname, "..", "gmail-credentials.json");
const TOKEN_PATH = path.join(__dirname, "..", "token.json");

const SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send"
];

// ========================================
// CONNEXION GOOGLE
// ========================================

function createOAuthClient(redirectUri) {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
        throw new Error("Fichier gmail-credentials.json introuvable.");
    }

    const credentials = JSON.parse(
        fs.readFileSync(CREDENTIALS_PATH, "utf8")
    );

    const config = credentials.installed || credentials.web;

    if (!config) {
        throw new Error("Identifiants Google invalides.");
    }

    return new google.auth.OAuth2(
        config.client_id,
        config.client_secret,
        redirectUri
    );
}

async function authorize() {
    const server = http.createServer();

    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "localhost", resolve);
    });

    const port = server.address().port;
    const redirectUri = `http://localhost:${port}`;
    const client = createOAuthClient(redirectUri);

    if (fs.existsSync(TOKEN_PATH)) {
        const token = JSON.parse(
            fs.readFileSync(TOKEN_PATH, "utf8")
        );

        client.setCredentials(token);
        server.close();

        return client;
    }

    const state = crypto.randomBytes(24).toString("hex");

    const authUrl = client.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES,
        prompt: "consent",
        state
    });

    return new Promise((resolve, reject) => {
        let finished = false;

        function finish(error, result) {
            if (finished) return;

            finished = true;
            server.close();

            if (error) reject(error);
            else resolve(result);
        }

        server.on("request", async (req, res) => {
            const url = new URL(req.url, redirectUri);

            if (url.pathname !== "/") {
                res.writeHead(404);
                return res.end("Page introuvable");
            }

            const returnedState = url.searchParams.get("state");
            const code = url.searchParams.get("code");
            const oauthError = url.searchParams.get("error");

            if (returnedState !== state) {
                res.writeHead(400);
                res.end("Ã‰tat OAuth invalide.");
                return finish(new Error("Ã‰tat OAuth invalide."));
            }

            if (oauthError || !code) {
                res.writeHead(400);
                res.end("Autorisation Google refusÃ©e.");
                return finish(
                    new Error(oauthError || "Code OAuth absent.")
                );
            }

            try {
                const { tokens } = await client.getToken(code);

                client.setCredentials(tokens);

                fs.writeFileSync(
                    TOKEN_PATH,
                    JSON.stringify(tokens, null, 2)
                );

                res.writeHead(200, {
                    "Content-Type": "text/html; charset=utf-8"
                });

                res.end(
                    "<h2>Gmail connectÃ© !</h2><p>Tu peux fermer cette page.</p>"
                );

                console.log("[GMAIL] Connexion enregistrÃ©e.");

                finish(null, client);

            } catch (error) {
                res.writeHead(500);
                res.end("Erreur pendant la connexion Google.");
                finish(error);
            }
        });

        console.log("\nOuvre ce lien pour connecter Gmail :\n");
        console.log(authUrl);
    });
}

// ========================================
// LECTURE DES E-MAILS
// ========================================

function decodeEmailBody(data) {
    if (!data) return "";

    return Buffer.from(
        data.replace(/-/g, "+").replace(/_/g, "/"),
        "base64"
    ).toString("utf8");
}

function extractEmailBody(payload) {
    if (!payload) return "";

    if (payload.body?.data && payload.mimeType === "text/plain") {
        return decodeEmailBody(payload.body.data);
    }

    if (payload.parts) {
        for (const part of payload.parts) {
            if (part.mimeType === "text/plain" && part.body?.data) {
                return decodeEmailBody(part.body.data);
            }
        }

        for (const part of payload.parts) {
            const content = extractEmailBody(part);
            if (content) return content;
        }
    }

    return "";
}

async function getEmails(maxResults = 20, analyses = {}) {
    const auth = await authorize();

    const gmail = google.gmail({
        version: "v1",
        auth
    });

    const response = await gmail.users.messages.list({
        userId: "me",
        maxResults,
        q: "in:inbox"
    });

    const messages = response.data.messages || [];
    const emails = [];

    for (const message of messages) {
                if (analyses[message.id]?.analysis?.replyDraft) {
            continue;
        }
        const result = await gmail.users.messages.get({
            userId: "me",
            id: message.id,
            format: "full"
        });

        const headers = result.data.payload?.headers || [];

        const getHeader = name =>
            headers.find(
                h => h.name.toLowerCase() === name.toLowerCase()
            )?.value || "";

        emails.push({
            id: message.id,
            threadId: result.data.threadId,
            sender: getHeader("From"),
            subject: getHeader("Subject"),
            date: getHeader("Date"),
            messageId: getHeader("Message-ID"),
            references: getHeader("References"),
            snippet: result.data.snippet || "",
            body: extractEmailBody(result.data.payload)
        });
    }

    return emails;
}

// ========================================
// ENVOI D'UNE RÃ‰PONSE
// ========================================

async function sendReply(emailId, replyText) {
    if (!emailId || typeof emailId !== "string") {
        throw new Error("Identifiant de l'e-mail invalide.");
    }

    if (typeof replyText !== "string" || !replyText.trim()) {
        throw new Error("La rÃ©ponse est vide.");
    }

    if (replyText.length > 20000) {
        throw new Error("La rÃ©ponse est trop longue.");
    }

    const auth = await authorize();

    const gmail = google.gmail({
        version: "v1",
        auth
    });

    const original = await gmail.users.messages.get({
        userId: "me",
        id: emailId,
        format: "full"
    });

    const headers = original.data.payload?.headers || [];

    const getHeader = name =>
        headers.find(
            h => h.name.toLowerCase() === name.toLowerCase()
        )?.value || "";

    const sender = getHeader("Reply-To") || getHeader("From");

    const match = sender.match(
        /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
    );

    if (!match) {
        throw new Error("Adresse du destinataire introuvable.");
    }

    const to = match[0];

    const originalSubject = getHeader("Subject") || "";
    const subject = /^re:/i.test(originalSubject)
        ? originalSubject
        : `Re: ${originalSubject}`;

    const encodeHeader = value =>
        `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;

    const messageId = getHeader("Message-ID");
    const references = getHeader("References");

    const mime = [
        `To: ${to}`,
        `Subject: ${encodeHeader(subject)}`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        messageId ? `In-Reply-To: ${messageId}` : null,
        messageId
            ? `References: ${[references, messageId].filter(Boolean).join(" ")}`
            : null,
        "",
        Buffer.from(replyText.trim(), "utf8").toString("base64")
    ].filter(line => line !== null).join("\r\n");

    const raw = Buffer.from(mime)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

    const sent = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
            raw,
            threadId: original.data.threadId
        }
    });

    console.log("[GMAIL] RÃ©ponse envoyÃ©e :", subject);

    return {
        success: true,
        messageId: sent.data.id,
        threadId: sent.data.threadId
    };
}

// ========================================
// MÃ‰MOIRE DES ANALYSES
// ========================================

function loadAnalyses() {
    try {
        if (!fs.existsSync(ANALYSES_PATH)) {
            return {};
        }

        return JSON.parse(
            fs.readFileSync(ANALYSES_PATH, "utf8")
        );

    } catch (error) {
        console.error("[GMAIL] Erreur mÃ©moire :", error.message);
        return {};
    }
}

function saveAnalyses(analyses) {
    fs.writeFileSync(
        ANALYSES_PATH,
        JSON.stringify(analyses, null, 2),
        "utf8"
    );
}

// ========================================
// PROTECTION DES E-MAILS IMPORTANTS
// ========================================

function isProtectedEmail(email) {
    const text = [
        email.sender,
        email.subject,
        email.snippet,
        email.body
    ].join(" ").toLowerCase();

    const protectedPatterns = [
        /\bindeed\b/,
        /\blinkedin\b/,
        /\bemploi\b/,
        /\boffre d'emploi\b/,
        /\brecrutement\b/,
        /\bcandidature\b/,
        /\bentretien\b/,
        /\balternance\b/,
        /\bstage\b/,
        /\bcdi\b/,
        /\bcdd\b/,
        /\bsalaire\b/,
        /\bfacture\b/,
        /\bpaiement\b/,
        /\bremboursement\b/,
        /\bcommande\b/,
        /\blivraison\b/,
        /\breÃ§u\b/,
        /\bprÃ©lÃ¨vement\b/,
        /\bbanque\b/,
        /\btransaction\b/,
        /\bimpayÃ©\b/,
        /\bsÃ©curitÃ©\b/,
        /\bconnexion\b/,
        /\bmot de passe\b/,
        /\bvÃ©rification\b/,
        /\bauthentification\b/,
        /\bactivitÃ© suspecte\b/,
        /\brendez-vous\b/,
        /\bÃ©cole\b/,
        /\blycÃ©e\b/,
        /\bimpÃ´ts\b/,
        /\bassurance\b/,
        /\bcontrat\b/,
        /\bsantÃ©\b/,
        /\bdocument officiel\b/
    ];

    return protectedPatterns.some(pattern => pattern.test(text));
}

// ========================================
// DÃ‰TECTION DES PUBLICITÃ‰S
// ========================================

function isAdvertising(email, analysis) {
    const category = String(analysis?.category || "")
        .toLowerCase()
        .trim();

    if (category !== "publicitÃ©" && category !== "publicite") {
        return false;
    }

    if (isProtectedEmail(email)) {
        console.log(
            "[GMAIL] Protection : e-mail conservÃ© :",
            email.subject
        );

        return false;
    }

    const urgency = String(analysis?.urgency || "")
        .toLowerCase()
        .trim();

    if (
        urgency === "Ã©levÃ©e" ||
        urgency === "elevee" ||
        urgency === "haute"
    ) {
        return false;
    }

    return true;
}

// ========================================
// BROUILLON DE SECOURS
// ========================================

function createFallbackDraft(email, analysis) {
    const subject = email.subject || "votre message";
    const summary = analysis?.summary || "";

    if (summary) {
        return [
            "Bonjour,",
            "",
            "Merci pour votre message concernant Â« " + subject + " Â».",
            "",
            "J'ai bien pris connaissance des informations communiquÃ©es.",
            "",
            "Je reviendrai vers vous si des prÃ©cisions supplÃ©mentaires sont nÃ©cessaires.",
            "",
            "Cordialement"
        ].join("\n");
    }

    return [
        "Bonjour,",
        "",
        "Merci pour votre message.",
        "",
        "J'en ai bien pris connaissance.",
        "",
        "Cordialement"
    ].join("\n");
}

// ========================================
// MISE Ã€ LA CORBEILLE
// ========================================

async function moveToTrash(gmail, emailId, subject) {
    await gmail.users.messages.trash({
        userId: "me",
        id: emailId
    });

    console.log(
        "[GMAIL] PublicitÃ© dÃ©placÃ©e dans la corbeille :",
        subject
    );
}

// ========================================
// CRÃ‰ATION DES VRAIS BROUILLONS GMAIL
// ========================================

async function createGmailDraft(gmail, email, replyText) {
    const sender = email.sender || "";

    const match = sender.match(
        /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
    );

    if (!match) {
        throw new Error("Adresse du destinataire introuvable.");
    }

    const to = match[0];
    const originalSubject = email.subject || "";

    const subject = /^re:/i.test(originalSubject)
        ? originalSubject
        : `Re: ${originalSubject}`;

    const encodeHeader = value =>
        `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;

    const mime = [
        `To: ${to}`,
        `Subject: ${encodeHeader(subject)}`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        email.messageId ? `In-Reply-To: ${email.messageId}` : null,
        email.messageId
            ? `References: ${[email.references, email.messageId].filter(Boolean).join(" ")}`
            : null,
        "",
        Buffer.from(replyText.trim(), "utf8").toString("base64")
    ].filter(line => line !== null).join("\r\n");

    const raw = Buffer.from(mime)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

    const result = await gmail.users.drafts.create({
        userId: "me",
        requestBody: {
            message: {
                raw,
                threadId: email.threadId
            }
        }
    });

    console.log("[GMAIL] Brouillon crÃ©Ã© :", subject);

    return result.data.id;
}

// ========================================
// ANALYSE AUTOMATIQUE DES E-MAILS
// ========================================

async function analyzeNewEmails() {
    const START_DATE = new Date("2026-11-20T11:30:00+01:00");
    console.log("[GMAIL AGENT] Recherche de nouveaux e-mails...");

    const analyses = loadAnalyses();
    const emails = await getEmails(20, analyses);

    const newEmails = emails.filter(email =>
    new Date(email.date).getTime() > START_DATE.getTime()
);

    const auth = await authorize();

    const gmail = google.gmail({
        version: "v1",
        auth
    });

    let analyzedCount = 0;
    let trashedCount = 0;

    for (const email of newEmails) {
        try {
            let saved = analyses[email.id];

            // 1. Analyser les nouveaux e-mails.
            if (!saved || !saved.analysis?.replyDraft) {
                console.log("[GMAIL] Analyse :", email.subject);

                const analysis = await analyzeEmail(email);

                if (!analysis || typeof analysis !== "object") {
                    throw new Error("L'analyse IA est invalide.");
                }

                if (
                    typeof analysis.replyDraft !== "string" ||
                    !analysis.replyDraft.trim()
                ) {
                    analysis.replyDraft = createFallbackDraft(
                        email,
                        analysis
                    );
                }

                saved = {
                    email: {
                        id: email.id,
                        threadId: email.threadId,
                        sender: email.sender,
                        subject: email.subject,
                        date: email.date,
                        messageId: email.messageId,
                        references: email.references,
                        snippet: email.snippet
                    },
                    analysis,
                    analyzedAt: new Date().toISOString()
                };

                analyses[email.id] = saved;
                saveAnalyses(analyses);
                analyzedCount++;

                console.log(
                    "[GMAIL] Analyse terminÃ©e avec brouillon :",
                    email.subject
                );
            }

            // 2. PublicitÃ©s : corbeille, aucune rÃ©ponse.
            if (isAdvertising(email, saved.analysis)) {
                await moveToTrash(gmail, email.id, email.subject);
                trashedCount++;
                continue;
            }

            const replyText = saved.analysis.replyDraft;

            if (!replyText || !replyText.trim()) {
                continue;
            }

            // 3. Messages sensibles : brouillon uniquement.
            
            // 3. Réponse automatique sans validation humaine.
// Les publicités sont déjà écartées plus haut.
const requiresHumanReview = false;

if (isProtectedEmail(email)) {
    console.log(
        "[GMAIL] Message protégé : réponse automatique prudente :",
        email.subject
    );
}
            // 4. Ã‰viter les doubles envois.
            if (
                saved.autoReplySentAt ||
                saved.autoReplyStatus === "sending" ||
                saved.autoReplyStatus === "needs_review"
            ) {
                continue;
            }

            // Enregistrer la tentative avant l'envoi.
            saved.autoReplyStatus = "sending";
            saved.autoReplyAttemptedAt = new Date().toISOString();

            analyses[email.id] = saved;
            saveAnalyses(analyses);

            try {
                let sent;

                if (saved.gmailDraftId) {
                    sent = await gmail.users.drafts.send({
                        userId: "me",
                        requestBody: {
                            id: saved.gmailDraftId
                        }
                    });
                } else {
                    sent = await sendReply(email.id, replyText);
                }

                saved.autoReplyStatus = "sent";
                saved.autoReplySentAt = new Date().toISOString();
                saved.sentMessageId = sent.messageId || sent.id || null;

                analyses[email.id] = saved;
                saveAnalyses(analyses);

                console.log(
                    "[GMAIL] RÃ©ponse automatique envoyÃ©e :",
                    email.subject
                );

            } catch (sendError) {
                saved.autoReplyStatus = "needs_review";
                saved.autoReplyError = sendError.message;

                analyses[email.id] = saved;
                saveAnalyses(analyses);

                console.error(
                    "[GMAIL] Envoi Ã  vÃ©rifier :",
                    email.subject,
                    sendError.message
                );
            }

        } catch (error) {
            console.error(
                "[GMAIL] Erreur pendant le traitement :",
                email.subject,
                error.message
            );
        }
    }

    console.log(
        `[GMAIL] ${analyzedCount} analyse(s), ${trashedCount} publicitÃ©(s) dans la corbeille.`
    );

    return {
        analyzedCount,
        trashedCount,
        totalAnalyzed: Object.keys(analyses).length
    };
}

// ========================================
// SURVEILLANCE AUTOMATIQUE
// ========================================

let monitoringInterval = null;
let monitoringRunning = false;


function startMonitoring(intervalMs = 60_000) {
    if (monitoringInterval) {
        console.log("[GMAIL] Surveillance déjà active.");
        return;
    }

    let currentDelayMs = intervalMs;

    console.log("[GMAIL] Surveillance automatique activée.");
    console.log(`[GMAIL] Vérification toutes les ${intervalMs / 1000} secondes.`);

    async function checkEmails() {
        if (monitoringRunning) return;

        monitoringRunning = true;

        try {
            await analyzeNewEmails();

            // Si tout fonctionne, retour au délai normal.
            currentDelayMs = intervalMs;

        } catch (error) {
            console.error(
                "[GMAIL] Erreur de surveillance :",
                error.message
            );

            const message = error.message.toLowerCase();
            const isQuotaError =
                message.includes("quota") ||
                message.includes("rate limit") ||
                error.code === 429;

            if (isQuotaError) {
                currentDelayMs = Math.min(
                    currentDelayMs * 2,
                    300_000
                );

                console.log(
                    `[GMAIL] Quota dépassé. Nouvelle tentative dans ${currentDelayMs / 1000} secondes.`
                );
            }

        } finally {
            monitoringRunning = false;

            monitoringInterval = setTimeout(
                checkEmails,
                currentDelayMs
            );
        }
    }

    checkEmails();
}


// ========================================
// EXPORTS
// ========================================

module.exports = {
    authorize,
    getEmails,
    analyzeNewEmails,
    startMonitoring,
    sendReply
};

