document.addEventListener('DOMContentLoaded', () => {
    // --- STATE ---
    let orders = [];
    let socket = null;

    // --- DOM ELEMENTS ---
    const wsStatus = document.getElementById('ws-status');
    const statTotalActive = document.querySelector('#stat-total-active .stat-num');
    const statPending = document.querySelector('#stat-pending .stat-num');
    const statPreparing = document.querySelector('#stat-preparing .stat-num');
    const statReady = document.querySelector('#stat-ready .stat-num');

    const lists = {
        Pendente: document.getElementById('list-pendente'),
        "Em Preparo": document.getElementById('list-preparo'),
        Pronto: document.getElementById('list-pronto'),
        Entregue: document.getElementById('list-entregue')
    };

    const counts = {
        Pendente: document.querySelector('#col-pendente .col-count'),
        "Em Preparo": document.querySelector('#col-preparo .col-count'),
        Pronto: document.querySelector('#col-pronto .col-count'),
        Entregue: document.querySelector('#col-entregue .col-count')
    };

    // --- INIT ---
    function init() {
        fetchOrders();
        setupWebSocket();
        
        // Update order timers every minute
        setInterval(updateTimers, 60000);
    }

    // Load active orders from backend REST API
    async function fetchOrders() {
        try {
            const response = await fetch('/api/pedidos');
            if (!response.ok) throw new Error("Erro ao buscar pedidos.");
            orders = await response.json();
            renderBoard();
        } catch (error) {
            console.error(error);
            showConnectionOffline("Erro API");
        }
    }

    // --- WEBSOCKET CONNECTION ---
    function setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/kitchen`;

        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
            console.log("Conectado ao WebSocket da Cozinha.");
            showConnectionOnline();
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleWebSocketMessage(data);
            } catch (err) {
                console.error("Erro ao interpretar dados do WebSocket:", err);
            }
        };

        socket.onclose = () => {
            console.log("Conexão WebSocket perdida. Tentando reconectar...");
            showConnectionOffline("Desconectado");
            setTimeout(setupWebSocket, 3000); // retry after 3 seconds
        };

        socket.onerror = (err) => {
            console.error("Erro no WebSocket da Cozinha:", err);
            socket.close();
        };
    }

    function handleWebSocketMessage(data) {
        if (data.event === 'new_order') {
            console.log("Novo pedido recebido via WS:", data.order);
            // Play sound chime
            playNotificationChime();
            
            // Push to local list if not already there
            if (!orders.some(o => o.id === data.order.id)) {
                orders.push(data.order);
                renderBoard();
            }
        } else if (data.event === 'status_update') {
            console.log(`Pedido ${data.order_id} atualizado para ${data.status}`);
            
            const idx = orders.findIndex(o => o.id === data.order_id);
            if (idx > -1) {
                orders[idx].status = data.status;
                
                // If the update includes the full order object, refresh our local data
                if (data.order) {
                    orders[idx] = data.order;
                }
                
                renderBoard();
            } else {
                // If it's not in our list (e.g. was loaded after startup), pull it or add it
                if (data.order) {
                    orders.push(data.order);
                    renderBoard();
                }
            }
        }
    }

    // Web Audio API synthesizer for notification bell
    function playNotificationChime() {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            
            const audioCtx = new AudioContextClass();
            
            // First note (High G)
            const osc1 = audioCtx.createOscillator();
            const gain1 = audioCtx.createGain();
            osc1.connect(gain1);
            gain1.connect(audioCtx.destination);
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(783.99, audioCtx.currentTime); // G5
            gain1.gain.setValueAtTime(0.15, audioCtx.currentTime);
            gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
            osc1.start(audioCtx.currentTime);
            osc1.stop(audioCtx.currentTime + 0.18);
            
            // Second note delayed (Higher C - chord resolution)
            setTimeout(() => {
                const osc2 = audioCtx.createOscillator();
                const gain2 = audioCtx.createGain();
                osc2.connect(gain2);
                gain2.connect(audioCtx.destination);
                osc2.type = 'sine';
                osc2.frequency.setValueAtTime(1046.50, audioCtx.currentTime); // C6
                gain2.gain.setValueAtTime(0.18, audioCtx.currentTime);
                gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
                osc2.start(audioCtx.currentTime);
                osc2.stop(audioCtx.currentTime + 0.35);
            }, 90);
        } catch (e) {
            console.warn("Audio Context bloqueado pelo navegador até interação do usuário:", e);
        }
    }

    // Connection Indicators UI
    function showConnectionOnline() {
        const indicator = wsStatus.querySelector('.status-indicator');
        const text = wsStatus.querySelector('.status-text');
        indicator.className = "status-indicator online";
        text.textContent = "Conectado";
    }

    function showConnectionOffline(reason) {
        const indicator = wsStatus.querySelector('.status-indicator');
        const text = wsStatus.querySelector('.status-text');
        indicator.className = "status-indicator offline";
        text.textContent = reason;
    }

    // --- KANBAN RENDERING ---
    function renderBoard() {
        // Clear all columns
        Object.keys(lists).forEach(key => {
            lists[key].innerHTML = '';
        });

        // Group counts
        const stats = {
            TotalActive: 0,
            Pendente: 0,
            "Em Preparo": 0,
            Pronto: 0,
            Entregue: 0
        };

        // Populate cards
        orders.forEach(order => {
            stats[order.status]++;
            if (order.status !== 'Entregue') {
                stats.TotalActive++;
            }

            const card = createOrderCard(order);
            const targetList = lists[order.status];
            if (targetList) {
                targetList.appendChild(card);
            }
        });

        // Update column headers counters
        Object.keys(counts).forEach(key => {
            if (counts[key]) {
                counts[key].textContent = stats[key];
            }
        });

        // Update top stats panel
        statTotalActive.textContent = stats.TotalActive;
        statPending.textContent = stats.Pendente;
        statPreparing.textContent = stats["Em Preparo"];
        statReady.textContent = stats.Pronto;
    }

    function createOrderCard(order) {
        const card = document.createElement('div');
        card.className = `order-card order-card-${order.status.toLowerCase().replace(' ', '-')}`;
        card.id = `order-card-${order.id}`;

        // Header line
        const isTable = order.type === 'Mesa';
        const typeLabel = isTable ? `Mesa ${String(order.table_number).padStart(2, '0')}` : 'Viagem';
        const typeClass = isTable ? 'mesa' : 'viagem';
        
        // Calculate minutes elapsed
        const elapsedMin = getMinutesElapsed(order.created_at);
        const timerClass = (order.status === 'Pendente' && elapsedMin >= 10) ? 'warning' : '';

        // Items list content
        let itemsHtml = '';
        order.items.forEach(item => {
            itemsHtml += `
                <div class="order-item-row">
                    <span><strong class="order-item-qty">${item.quantity}x</strong> ${item.product.name}</span>
                </div>
                ${item.notes ? `
                    <div class="order-item-notes">
                        <i class="fa-regular fa-comment"></i>
                        <span>Obs: ${item.notes}</span>
                    </div>
                ` : ''}
            `;
        });

        // Setup dynamic action button based on current status
        let actionButtonHtml = '';
        if (order.status === 'Pendente') {
            actionButtonHtml = `<button class="order-card-action-btn btn-start-prep" data-id="${order.id}">
                <i class="fa-solid fa-play"></i> Iniciar Preparo
            </button>`;
        } else if (order.status === 'Em Preparo') {
            actionButtonHtml = `<button class="order-card-action-btn btn-complete-prep" data-id="${order.id}">
                <i class="fa-solid fa-check"></i> Pronto para Servir
            </button>`;
        } else if (order.status === 'Pronto') {
            actionButtonHtml = `<button class="order-card-action-btn btn-deliver-order" data-id="${order.id}">
                <i class="fa-solid fa-hand-holding-plate"></i> Finalizar / Entregar
            </button>`;
        } else {
            // Delivered / Entregue: Show archived state button
            actionButtonHtml = `<button class="order-card-action-btn btn-archive-order" data-id="${order.id}" disabled style="opacity: 0.5;">
                <i class="fa-solid fa-circle-check"></i> Entregue
            </button>`;
        }

        card.innerHTML = `
            <div class="order-card-header">
                <span class="order-id-label">Pedido #${String(order.id).padStart(4, '0')}</span>
                <span class="order-timer-label ${timerClass}">
                    <i class="fa-regular fa-clock"></i> <span class="time-elapsed-text">${elapsedMin}m atrás</span>
                </span>
            </div>
            
            <span class="order-type-badge ${typeClass}">${typeLabel}</span>
            
            <div class="order-items-list">
                ${itemsHtml}
            </div>
            
            ${actionButtonHtml}
        `;

        // Attach event to the action button
        const actionBtn = card.querySelector('.order-card-action-btn');
        if (actionBtn && order.status !== 'Entregue') {
            actionBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                handleOrderStateTransition(order);
            });
        }

        return card;
    }

    async function handleOrderStateTransition(order) {
        let newStatus = '';
        if (order.status === 'Pendente') newStatus = 'Em Preparo';
        else if (order.status === 'Em Preparo') newStatus = 'Pronto';
        else if (order.status === 'Pronto') newStatus = 'Entregue';

        if (!newStatus) return;

        // Set loader class on click
        const btn = document.querySelector(`#order-card-${order.id} .order-card-action-btn`);
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Atualizando...`;
        }

        try {
            const response = await fetch(`/api/pedidos/${order.id}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: newStatus })
            });

            if (!response.ok) throw new Error("Erro ao atualizar status do pedido.");
            
            // The API response will update our local array on WS broadcast message, 
            // but we also update it locally instantly for snappier feedback.
            const updatedOrder = await response.json();
            const idx = orders.findIndex(o => o.id === order.id);
            if (idx > -1) {
                orders[idx] = updatedOrder;
                renderBoard();
            }
        } catch (error) {
            console.error(error);
            alert("Não foi possível mudar o status do pedido.");
            fetchOrders(); // Reload board to be safe
        }
    }

    // Helper: calculate minutes elapsed since creation
    function getMinutesElapsed(createdTimeStr) {
        const createdDate = new Date(createdTimeStr);
        const diffMs = new Date() - createdDate;
        const diffMin = Math.floor(diffMs / 60000);
        return diffMin < 0 ? 0 : diffMin;
    }

    // Recalculates card times on a tick interval
    function updateTimers() {
        orders.forEach(order => {
            const card = document.getElementById(`order-card-${order.id}`);
            if (!card) return;

            const elapsedText = card.querySelector('.time-elapsed-text');
            const timerLabel = card.querySelector('.order-timer-label');
            if (elapsedText && timerLabel) {
                const elapsedMin = getMinutesElapsed(order.created_at);
                elapsedText.textContent = `${elapsedMin}m atrás`;

                // Add warning class for long pending orders
                if (order.status === 'Pendente' && elapsedMin >= 10) {
                    timerLabel.classList.add('warning');
                }
            }
        });
    }

    // Launch everything
    init();
});
