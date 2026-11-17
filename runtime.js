const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const TASKS_FILE = path.join(DATA_DIR, "tasks.json");
const AGENTS_FILE = path.join(DATA_DIR, "agents.json");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadJSON(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return fallback;
    }
}

let agents = new Map();
let tasks = new Map();

let nextTaskId = 1;

// Charger les données sauvegardées
function loadData() {
    const savedAgents = loadJSON(AGENTS_FILE, { agents: [] });
    const savedTasks = loadJSON(TASKS_FILE, {
        tasks: [],
        nextTaskId: 1
    });

    agents = new Map(
        savedAgents.agents.map(agent => [agent.id, agent])
    );

    tasks = new Map(
        savedTasks.tasks.map(task => [task.id, task])
    );

    nextTaskId = savedTasks.nextTaskId || 1;

    // Libérer les agents dont les missions étaient en cours
    for (const task of tasks.values()) {
        if (task.status === "running") {
            task.status = "pending";
            task.startedAt = null;
        }
    }

    for (const agent of agents.values()) {
        agent.status = "idle";
        agent.currentTask = null;
    }

    saveAgents();
    saveTasks();
}

function saveAgents() {
    fs.writeFileSync(
        AGENTS_FILE,
        JSON.stringify({ agents: Array.from(agents.values()) }, null, 2)
    );
}

function saveTasks() {
    fs.writeFileSync(
        TASKS_FILE,
        JSON.stringify({
            tasks: Array.from(tasks.values()),
            nextTaskId
        }, null, 2)
    );
}

function registerAgent(agent) {
    if (!agent || !Number.isInteger(agent.id)) {
        throw new Error("Agent invalide");
    }

    if (!agents.has(agent.id)) {
        agents.set(agent.id, {
            ...agent,
            status: "idle",
            currentTask: null
        });
        saveAgents();
    }
}

function createTask(agentId, description) {
    const agent = agents.get(agentId);

    if (!agent) throw new Error("Agent introuvable");

    if (typeof description !== "string" || !description.trim()) {
        throw new Error("Description de mission invalide");
    }

    const task = {
        id: nextTaskId++,
        agentId,
        description: description.trim(),
        status: "pending",
        result: null,
        error: null,
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null
    };

    tasks.set(task.id, task);
    saveTasks();

    return task;
}

function startTask(taskId) {
    const task = tasks.get(taskId);

    if (!task) throw new Error("Mission introuvable");
    if (task.status !== "pending") {
        throw new Error("La mission n'est pas en attente");
    }

    const agent = agents.get(task.agentId);

    if (agent.status !== "idle") {
        throw new Error("Agent déjà occupé");
    }

    task.status = "running";
    task.startedAt = new Date().toISOString();

    agent.status = "working";
    agent.currentTask = task.id;

    saveTasks();
    saveAgents();

    return task;
}

function completeTask(taskId, result) {
    const task = tasks.get(taskId);

    if (!task || task.status !== "running") {
        throw new Error("Mission non active");
    }

    const agent = agents.get(task.agentId);

    task.status = "completed";
    task.result = result;
    task.completedAt = new Date().toISOString();

    agent.status = "idle";
    agent.currentTask = null;

    saveTasks();
    saveAgents();

    return task;
}

function failTask(taskId, error) {
    const task = tasks.get(taskId);

    if (!task || task.status !== "running") {
        throw new Error("Mission non active");
    }

    const agent = agents.get(task.agentId);

    task.status = "failed";
    task.error = String(error);
    task.completedAt = new Date().toISOString();

    agent.status = "idle";
    agent.currentTask = null;

    saveTasks();
    saveAgents();

    return task;
}

function getTasks() {
    return Array.from(tasks.values());
}

function getAgents() {
    return Array.from(agents.values());
}

loadData();

module.exports = {
    registerAgent,
    createTask,
    startTask,
    completeTask,
    failTask,
    getTasks,
    getAgents
};