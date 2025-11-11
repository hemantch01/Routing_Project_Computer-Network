document.addEventListener('DOMContentLoaded', () => {

    // =======================================================
    // GLOBAL STATE & DATA (from C globals)
    // =======================================================
    const NUM_ROUTERS = 4;
    const MAX_NETWORKS_PER_ROUTER = 4;
    const MAX_ROUTE_HISTORY = 20;

    // R1, R2, R3, R4 (0-indexed)
    // C's connection_matrix
    const connectionMatrix = [
        [1, 1, 0, 1], // R1
        [1, 1, 1, 0], // R2
        [0, 1, 1, 1], // R3
        [1, 0, 1, 1]  // R4
    ];

    // C's router_configs (will be populated)
    // Format: { 1: ['192.168.1.1', ...], 2: [...], ... }
    let routerConfigs = {};

    // C's route_history and intermediate_history
    // We'll use a Map for better performance
    // Key: "source_ip*dest_ip", Value: "124" (concatenated string)
    let routeHistory = new Map();

    // State for the manual routing process
    let manualRouteState = {
        active: false,
        sourceIp: '',
        destIp: '',
        sourceRouter: 0,
        destRouter: 0,
        currentRouter: 0,
        pathString: '' // Simulates the 'long long' from C
    };

    // =======================================================
    // DOM ELEMENT REFERENCES
    // =======================================================
    const configPhase = document.getElementById('config-phase');
    const routingPhase = document.getElementById('routing-phase');
    
    // Config Phase
    const networkCountForm = document.getElementById('network-count-form');
    const ipInputsContainer = document.getElementById('ip-inputs-container');
    const ipFieldsGrid = document.getElementById('ip-fields-grid');
    const saveConfigBtn = document.getElementById('save-config-btn');
    const configError = document.getElementById('config-error');

    // Routing Phase
    const routingQueryForm = document.getElementById('routing-query-form');
    const sourceIpInput = document.getElementById('source-ip');
    const destinationIpInput = document.getElementById('destination-ip');
    const routingLog = document.getElementById('routing-log');
    const historyLog = document.getElementById('history-log');

    // Manual Routing Controls
    const manualRouteControls = document.getElementById('manual-route-controls');
    const currentPathDisplay = document.getElementById('current-path-display');
    const currentRouterDisplay = document.getElementById('current-router-display');
    const currentDestDisplay = document.getElementById('current-dest-display');
    const nextHopInput = document.getElementById('next-hop-input');
    const addHopBtn = document.getElementById('add-hop-btn');
    const manualRouteError = document.getElementById('manual-route-error');


    // =======================================================
    // UTILITY FUNCTIONS (from C)
    // =======================================================

    /**
     * Validates an IPv4 address.
     * C's validate_ip (but using regex for a cleaner JS version)
     */
    function validateIP(ipStr) {
        if (!ipStr) return false;
        const octet = '([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])';
        const regex = new RegExp(`^${octet}\\.${octet}\\.${octet}\\.${octet}$`);
        return regex.test(ipStr);
    }

    /**
     * Finds the router (1-based) connected to a given IP.
     * C's find_router_by_ip
     */
    function findRouterByIP(ip) {
        for (let routerId = 1; routerId <= NUM_ROUTERS; routerId++) {
            if (routerConfigs[routerId] && routerConfigs[routerId].includes(ip)) {
                return routerId; // Return 1-based router number
            }
        }
        return 0; // Not found
    }

    /**
     * Concatenates two numbers as strings to simulate C's 'long long' logic.
     * C's concat_router_ids
     */
    function concatRouterIDs(currentPath, newId) {
        return currentPath.toString() + newId.toString();
    }

    /**
     * Helper to log messages to the main query log.
     */
    function logToQuery(message, type = '') {
        // We use innerHTML to render the styled spans
        routingLog.innerHTML = `<span class="${type}">${message}</span>\n` + routingLog.innerHTML;
    }


    // =======================================================
    // PHASE 1: CONFIGURATION LOGIC
    // =======================================================

    networkCountForm.addEventListener('submit', (e) => {
        e.preventDefault();
        ipFieldsGrid.innerHTML = ''; // Clear old fields
        let hasFields = false;

        for (let i = 1; i <= NUM_ROUTERS; i++) {
            const count = parseInt(document.getElementById(`r${i}-count`).value, 10);
            if (count > 0) {
                hasFields = true;
                const routerGroup = document.createElement('div');
                routerGroup.className = 'router-ip-group';
                let groupHTML = `<h4>Router ${i} IPs</h4>`;
                for (let j = 1; j <= count; j++) {
                    groupHTML += `
                        <div class="form-group">
                            <label for="r${i}-ip${j}">R${i} - Network IP ${j}</label>
                            <input type="text" id="r${i}-ip${j}" class="ip-input" data-router="${i}" placeholder="x.x.x.x">
                        </div>`;
                }
                routerGroup.innerHTML = groupHTML;
                ipFieldsGrid.appendChild(routerGroup);
            }
        }
        
        if (hasFields) {
            ipInputsContainer.style.display = 'block';
        } else {
            ipInputsContainer.style.display = 'none';
        }
    });

    saveConfigBtn.addEventListener('click', () => {
        routerConfigs = {}; // Reset configs
        configError.textContent = '';
        let allValid = true;
        
        const ipInputs = document.querySelectorAll('.ip-input');
        
        if (ipInputs.length === 0) {
            configError.textContent = 'Error: No IP fields were generated. Please set network counts.';
            return;
        }

        for (const input of ipInputs) {
            const ip = input.value;
            const routerId = input.dataset.router;

            if (!validateIP(ip)) {
                configError.textContent = `Error: Invalid IP format for Router ${routerId}: "${ip}". Please correct it.`;
                allValid = false;
                input.focus();
                break;
            }

            // Check for duplicate IPs
            for (const id in routerConfigs) {
                if (routerConfigs[id].includes(ip)) {
                    configError.textContent = `Error: Duplicate IP "${ip}" found. IPs must be unique.`;
                    allValid = false;
                    input.focus();
                    break;
                }
            }
            if (!allValid) break;

            // Add valid IP to config
            if (!routerConfigs[routerId]) {
                routerConfigs[routerId] = [];
            }
            routerConfigs[routerId].push(ip);
        }

        if (allValid) {
            console.log("Configuration Saved:", routerConfigs);
            configPhase.style.display = 'none';
            routingPhase.style.display = 'block';
            routingLog.textContent = 'Configuration loaded. Ready for routing queries.';
        }
    });

    // =======================================================
    // PHASE 2: ROUTING LOGIC
    // =======================================================

    routingQueryForm.addEventListener('submit', (e) => {
        e.preventDefault();
        routingLog.innerHTML = ''; // Clear log for new query
        manualRouteControls.style.display = 'none'; // Hide manual controls
        manualRouteError.textContent = '';
        
        const sourceIp = sourceIpInput.value.trim();
        const destIp = destinationIpInput.value.trim();

        // 1. Validate IPs
        if (!validateIP(sourceIp)) {
            logToQuery(`Error: Invalid Source IP format.`, 'error');
            return;
        }
        if (!validateIP(destIp)) {
            logToQuery(`Error: Invalid Destination IP format.`, 'error');
            return;
        }

        // 2. Find Routers
        const sourceRouter = findRouterByIP(sourceIp);
        const destRouter = findRouterByIP(destIp);

        if (sourceRouter === 0) {
            logToQuery(`Error: Source IP "${sourceIp}" not found in any router's network list.`, 'error');
            return;
        }
        if (destRouter === 0) {
            logToQuery(`Error: Destination IP "${destIp}" not found in any router's network list.`, 'error');
            return;
        }
        
        if (sourceRouter === destRouter) {
            logToQuery(`Info: Source and Destination are on the same router (R${sourceRouter}). No routing needed.`, 'success');
            return;
        }

        logToQuery(`Query: ${sourceIp} (R${sourceRouter}) -> ${destIp} (R${destRouter})`);

        // 3. Check History
        const routeKey = `${sourceIp}*${destIp}`;
        if (routeHistory.has(routeKey)) {
            const path = routeHistory.get(routeKey);
            logToQuery(`--- HISTORY FOUND ---`, 'history-found');
            logToQuery(`Source IP: ${sourceIp} -> R${sourceRouter}`);
            logToQuery(`Destination IP: ${destIp} -> R${destRouter}`);
            logToQuery(`Intermediate Routers (IDs): <span class="path">${path}</span>`, 'history-found');
            return;
        }

        // 4. No History - Calculate New Route
        logToQuery(`--- NEW ROUTE ---`);
        
        // Reset manual state
        manualRouteState = {
            active: true,
            sourceIp: sourceIp,
            destIp: destIp,
            sourceRouter: sourceRouter,
            destRouter: destRouter,
            currentRouter: sourceRouter,
            pathString: concatRouterIDs('', sourceRouter) // Start path with source router
        };
        
        // Check for direct connection (using 0-based index)
        const srcIdx = sourceRouter - 1;
        const dstIdx = destRouter - 1;
        const directConnection = connectionMatrix[srcIdx][dstIdx] === 1;

        if (directConnection) {
            logToQuery(`Direct link found between R${sourceRouter} and R${destRouter}.`);
            
            // Create dynamic buttons for user choice
            const choiceDiv = document.createElement('div');
            choiceDiv.style.margin = '10px 0';
            choiceDiv.innerHTML = `
                <button id="direct-path-btn" class="btn btn-secondary">Use Direct Path (R${sourceRouter} -> R${destRouter})</button>
                <button id="manual-path-btn" class="btn">Define Manual Path</button>
            `;
            routingLog.prepend(choiceDiv);

            // Add one-time listeners
            document.getElementById('direct-path-btn').addEventListener('click', () => {
                const finalState = { ...manualRouteState }; // Copy state
                finalState.pathString = concatRouterIDs(finalState.pathString, finalState.destRouter);
                finalizeRoute(finalState);
                choiceDiv.remove();
            }, { once: true });

            document.getElementById('manual-path-btn').addEventListener('click', () => {
                startManualRoutingUI();
                choiceDiv.remove();
            }, { once: true });

        } else {
            logToQuery(`No direct link. Starting manual path definition...`);
            startManualRoutingUI();
        }
    });

    /**
     * Shows the UI for hop-by-hop routing.
     */
    function startManualRoutingUI() {
        manualRouteControls.style.display = 'block';
        currentPathDisplay.textContent = manualRouteState.pathString;
        currentRouterDisplay.textContent = `R${manualRouteState.currentRouter}`;
        currentDestDisplay.textContent = `R${manualRouteState.destRouter}`;
        nextHopInput.value = '';
        nextHopInput.focus();
    }

    /**
     * Handles the "Add Hop" button click.
     * This is the core of the manual routing loop from C.
     */
    addHopBtn.addEventListener('click', () => {
        manualRouteError.textContent = '';
        const nextHop = parseInt(nextHopInput.value, 10);
        
        const { currentRouter, destRouter } = manualRouteState;
        const currentIdx = currentRouter - 1;
        const destIdx = destRouter - 1;

        // 1. Check for finalize (input 0)
        if (nextHop === 0) {
            if (connectionMatrix[currentIdx][destIdx] === 1) {
                logToQuery(`Path finalized: R${currentRouter} -> R${destRouter} (Destination)`);
                manualRouteState.pathString = concatRouterIDs(manualRouteState.pathString, destRouter);
                finalizeRoute(manualRouteState);
            } else {
                manualRouteError.textContent = `Cannot finalize. R${currentRouter} has no direct link to R${destRouter}.`;
            }
            return;
        }

        // 2. Check for valid router ID
        if (nextHop < 1 || nextHop > NUM_ROUTERS) {
            manualRouteError.textContent = `Invalid router ID. Must be between 1 and ${NUM_ROUTERS}.`;
            return;
        }

        // 3. Check if it's the destination
        if (nextHop === destRouter) {
            if (connectionMatrix[currentIdx][destIdx] === 1) {
                logToQuery(`Destination R${destRouter} reached successfully!`);
                manualRouteState.pathString = concatRouterIDs(manualRouteState.pathString, destRouter);
                finalizeRoute(manualRouteState);
            } else {
                manualRouteError.textContent = `R${destRouter} is the destination, but R${currentRouter} has no direct link. Please choose an intermediate router.`;
            }
            return;
        }
        
        // 4. Check for loop
        if (nextHop === currentRouter) {
            manualRouteError.textContent = `Invalid path: Cannot route from R${currentRouter} to itself.`;
            return;
        }

        // 5. Check connection from current to next hop
        const nextIdx = nextHop - 1;
        if (connectionMatrix[currentIdx][nextIdx] === 1) {
            // Valid hop
            manualRouteState.currentRouter = nextHop;
            manualRouteState.pathString = concatRouterIDs(manualRouteState.pathString, nextHop);
            
            // Update UI
            currentPathDisplay.textContent = manualRouteState.pathString;
            currentRouterDisplay.textContent = `R${manualRouteState.currentRouter}`;
            nextHopInput.value = '';
            nextHopInput.focus();
            
            logToQuery(`Hop added: R${currentRouter} -> R${nextHop}`);
            
            // Check if this new hop connects to destination
            if (connectionMatrix[nextIdx][destIdx] === 1) {
                manualRouteError.textContent = `Info: R${nextHop} is now directly connected to Destination R${destRouter}. Type 0 to finalize.`;
            }

        } else {
            // No connection
            manualRouteError.textContent = `Invalid path: R${currentRouter} has no direct link to R${nextHop}.`;
        }
    });

    /**
     * Finalizes and logs a route, saving it to history.
     */
    function finalizeRoute(state) {
        const { sourceIp, destIp, sourceRouter, destRouter, pathString } = state;
        
        logToQuery(`--- NEW ROUTE LOGGED ---`, 'new-route');
        logToQuery(`Source IP: ${sourceIp} -> R${sourceRouter}`);
        logToQuery(`Destination IP: ${destIp} -> R${destRouter}`);
        logToQuery(`Intermediate Routers (IDs): <span class="path">${pathString}</span>`, 'new-route');

        // Save to history
        if (routeHistory.size >= MAX_ROUTE_HISTORY) {
            logToQuery(`Warning: Route history full. Oldest route will be dropped (Not implemented in this demo).`, 'error');
            // In a real app, you might use an LRU cache. Here, we just stop adding.
            // For this project, we'll just overwrite (Map behavior) or stop.
            // Let's just log and not add.
            if(routeHistory.size > MAX_ROUTE_HISTORY) {
                logToQuery("History full, not saving.", "error");
                return;
            }
        }
        
        const routeKey = `${sourceIp}*${destIp}`;
        routeHistory.set(routeKey, pathString);
        
        // Update history log display
        updateHistoryLog();

        // Reset and hide manual controls
        manualRouteState.active = false;
        manualRouteControls.style.display = 'none';
        manualRouteError.textContent = '';
        sourceIpInput.value = '';
        destinationIpInput.value = '';
    }

    /**
     * Updates the on-screen history log
     */
    function updateHistoryLog() {
        if (routeHistory.size === 0) {
            historyLog.textContent = '(No routes logged yet)';
            return;
        }
        
        let logHTML = '';
        routeHistory.forEach((path, key) => {
            const [src, dst] = key.split('*');
            logHTML += `<b>${src} -> ${dst}</b>: <span class="path">${path}</span>\n`;
        });
        historyLog.innerHTML = logHTML;
    }
});