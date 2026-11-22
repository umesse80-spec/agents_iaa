
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const { randomUUID } = require("crypto");

const PROJECTS_DIR = path.join(__dirname, "generated-projects");

const START_MARKER = "<<<AGENTS_IA_FILES>>>";
const END_MARKER = "<<<END_AGENTS_IA_FILES>>>";

const MAX_FILES = 100;
const MAX_FILE_SIZE = 1024 * 1024;
const MAX_TOTAL_SIZE = 10 * 1024 * 1024;

function extractFiles(response) {
    if (typeof response !== "string") {
        return null;
    }

    const start = response.indexOf(START_MARKER);
    const end = response.indexOf(END_MARKER);

    if (start === -1 || end === -1 || end <= start) {
        return null;
    }

    const jsonContent = response
        .slice(start + START_MARKER.length, end)
        .trim();

    let data;

    try {
        data = JSON.parse(jsonContent);
    } catch {
        throw new Error("Les fichiers générés contiennent un JSON invalide.");
    }

    if (!Array.isArray(data.files) || data.files.length === 0) {
        throw new Error("Aucun fichier valide dans le projet généré.");
    }

    if (data.files.length > MAX_FILES) {
        throw new Error(`Maximum : ${MAX_FILES} fichiers par projet.`);
    }

    const files = [];
    const usedPaths = new Set();
    let totalSize = 0;

    for (const file of data.files) {
        if (
            !file ||
            typeof file.path !== "string" ||
            typeof file.content !== "string"
        ) {
            throw new Error("Un fichier généré possède un format invalide.");
        }

        const relativePath = file.path.replace(/\\/g, "/");
        const normalizedPath = path.posix.normalize(relativePath);

        if (
            !relativePath.trim() ||
            relativePath.startsWith("/") ||
            /^[a-zA-Z]:/.test(relativePath) ||
            normalizedPath === "." ||
            normalizedPath.startsWith("../") ||
            normalizedPath.includes("/../") ||
            normalizedPath !== relativePath
        ) {
            throw new Error(`Chemin de fichier interdit : ${file.path}`);
        }

        const segments = normalizedPath.split("/");

        if (
            segments.some(segment =>
                !segment ||
                segment === "." ||
                segment === ".." ||
                segment.startsWith(".env")
            )
        ) {
            throw new Error(`Nom de fichier interdit : ${file.path}`);
        }

        if (usedPaths.has(normalizedPath)) {
            throw new Error(`Fichier en double : ${normalizedPath}`);
        }

        usedPaths.add(normalizedPath);

        const size = Buffer.byteLength(file.content, "utf8");

        if (size > MAX_FILE_SIZE) {
            throw new Error(`Fichier trop volumineux : ${normalizedPath}`);
        }

        totalSize += size;

        if (totalSize > MAX_TOTAL_SIZE) {
            throw new Error("Le projet dépasse la taille maximale autorisée.");
        }

        files.push({
            path: normalizedPath,
            content: file.content
        });
    }

    return {
        files,
        cleanText: (
            response.slice(0, start) +
            response.slice(end + END_MARKER.length)
        ).trim()
    };
}

async function createProjectZip(response) {
    const extracted = extractFiles(response);

    if (!extracted) {
        return null;
    }

    const projectId = randomUUID();
    const projectDir = path.join(PROJECTS_DIR, projectId);
    const zipPath = path.join(projectDir, "project.zip");

    fs.mkdirSync(projectDir, { recursive: true });

    try {
        for (const file of extracted.files) {
            const destination = path.resolve(projectDir, file.path);

            if (!destination.startsWith(projectDir + path.sep)) {
                throw new Error("Chemin de destination interdit.");
            }

            fs.mkdirSync(path.dirname(destination), {
                recursive: true
            });

            fs.writeFileSync(destination, file.content, "utf8");
        }

        await new Promise((resolve, reject) => {
            const output = fs.createWriteStream(zipPath);
            const archive = archiver("zip", {
                zlib: { level: 9 }
            });

            output.on("close", resolve);
            output.on("error", reject);
            archive.on("error", reject);

            archive.pipe(output);

            for (const file of extracted.files) {
                archive.file(
                    path.join(projectDir, file.path),
                    { name: file.path }
                );
            }

            archive.finalize();
        });

        return {
            projectId,
            zipPath,
            zipUrl: `/api/projects/${projectId}/download`,
            files: extracted.files,
            text: extracted.cleanText
        };

    } catch (error) {
        fs.rmSync(projectDir, {
            recursive: true,
            force: true
        });

        throw error;
    }
}

function getProjectZip(projectId) {
    if (
        typeof projectId !== "string" ||
        !/^[a-f0-9-]{36}$/i.test(projectId)
    ) {
        return null;
    }

    const zipPath = path.join(
        PROJECTS_DIR,
        projectId,
        "project.zip"
    );

    return fs.existsSync(zipPath) ? zipPath : null;
}

module.exports = {
    createProjectZip,
    getProjectZip
};
