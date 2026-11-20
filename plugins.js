
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const PLUGINS_FILE = path.join(DATA_DIR, "plugins.json");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const catalog = [
    {
        id: "gmail",
        name: "Gmail",
        description: "Lire, analyser et gérer les e-mails.",
        category: "Communication"
    },
    {
        id: "google-calendar",
        name: "Google Calendar",
        description: "Consulter et organiser les événements.",
        category: "Productivité"
    },
    {
        id: "web-search",
        name: "Recherche Web",
        description: "Rechercher des informations sur Internet.",
        category: "Recherche"
    }
];

function loadPlugins() {
    try {
        const data = JSON.parse(
            fs.readFileSync(PLUGINS_FILE, "utf8")
        );

        return data.plugins || [];
    } catch {
        return [];
    }
}

let installedPlugins = loadPlugins();

function savePlugins() {
    fs.writeFileSync(
        PLUGINS_FILE,
        JSON.stringify(
            { plugins: installedPlugins },
            null,
            2
        ),
        "utf8"
    );
}

function getAll() {
    return catalog.map(plugin => {
        const installed = installedPlugins.find(
            item => item.id === plugin.id
        );

        return {
            ...plugin,
            installed: Boolean(installed),
            enabled: installed?.enabled || false
        };
    });
}

function install(pluginId) {
    const plugin = catalog.find(
        item => item.id === pluginId
    );

    if (!plugin) {
        throw new Error("Plugin introuvable.");
    }

    if (installedPlugins.some(item => item.id === pluginId)) {
        throw new Error("Plugin déjà installé.");
    }

    installedPlugins.push({
        id: pluginId,
        enabled: false,
        installedAt: new Date().toISOString()
    });

    savePlugins();

    return getAll().find(item => item.id === pluginId);
}

function uninstall(pluginId) {
    const exists = installedPlugins.some(
        item => item.id === pluginId
    );

    if (!exists) {
        throw new Error("Plugin non installé.");
    }

    installedPlugins = installedPlugins.filter(
        item => item.id !== pluginId
    );

    savePlugins();

    return getAll();
}

function setEnabled(pluginId, enabled) {
    const plugin = installedPlugins.find(
        item => item.id === pluginId
    );

    if (!plugin) {
        throw new Error("Installe d'abord ce plugin.");
    }

    if (typeof enabled !== "boolean") {
        throw new Error("État d'activation invalide.");
    }

    plugin.enabled = enabled;

    savePlugins();

    return getAll().find(item => item.id === pluginId);
}

function getEnabled() {
    return installedPlugins.filter(
        plugin => plugin.enabled
    );
}

module.exports = {
    getAll,
    install,
    uninstall,
    setEnabled,
    getEnabled
};
