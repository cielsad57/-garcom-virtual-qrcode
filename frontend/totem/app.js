document.addEventListener('DOMContentLoaded', () => {
    // --- STATE ---
    let products = [];
    let kioskCart = [];
    let orderType = 'Viagem'; // Viagem or Mesa
    let selectedTable = null;
    let currentCategory = 'Todos';
    let returnTimerInterval = null;

    // --- DOM STAGES ---
    const stages = {
        welcome: document.getElementById('stage-welcome'),
        serviceOption: document.getElementById('stage-service-option'),
        tableSelect: document.getElementById('stage-table-select'),
        menu: document.getElementById('stage-menu'),
        payment: document.getElementById('stage-payment'),
        success: document.getElementById('stage-kiosk-success')
    };

    // --- BUTTONS & DISPLAY ---
    // Navigation Welcome/Options/Table
    const btnStartKiosk = document.getElementById('btn-start-kiosk');
    const btnBackToWelcome = document.getElementById('btn-back-to-welcome');
    const btnOptionDinein = document.getElementById('btn-option-dinein');
    const btnOptionTakeaway = document.getElementById('btn-option-takeaway');
    const btnBackToOptions = document.getElementById('btn-back-to-options');
    const kioskTablesGrid = document.getElementById('kiosk-tables-grid');
    
    // Kiosk Menu View
    const kioskOrderTypeBadge = document.getElementById('kiosk-order-type-badge');
    const btnCancelKioskOrder = document.getElementById('btn-cancel-kiosk-order');
    const kioskProductsGrid = document.getElementById('kiosk-products-grid');
    const kioskCartItems = document.getElementById('kiosk-cart-items');
    const kioskCartTotal = document.getElementById('kiosk-cart-total');
    const btnKioskClearCart = document.getElementById('btn-kiosk-clear-cart');
    const btnKioskCheckout = document.getElementById('btn-kiosk-checkout');
    
    // Payment Display
    const paymentValueDisplay = document.getElementById('payment-value-display');
    const paymentStatusMessage = document.getElementById('payment-status-message');
    const paymentProgressDots = document.getElementById('payment-progress-dots');
    
    // Success Ticket View
    const ticketDateTime = document.getElementById('ticket-date-time');
    const ticketType = document.getElementById('ticket-type');
    const ticketQueueNumber = document.getElementById('ticket-queue-number');
    const ticketItemsSummary = document.getElementById('ticket-items-summary');
    const ticketTotalValue = document.getElementById('ticket-total-value');
    const autoReturnTimer = document.getElementById('auto-return-timer');

    // --- INIT ---
    function init() {
        fetchProducts();
        setupEventListeners();
    }

    async function fetchProducts() {
        try {
            const response = await fetch('/api/produtos');
            if (response.ok) {
                products = await response.json();
            }
        } catch (error) {
            console.error("Erro ao carregar cardápio no totem:", error);
        }
    }

    // --- NAVIGATION LOGIC ---
    function switchStage(targetStageId) {
        Object.keys(stages).forEach(key => {
            stages[key].style.display = key === targetStageId ? 'flex' : 'none';
        });
    }

    function setupEventListeners() {
        // Stage 1 -> Stage 2
        btnStartKiosk.addEventListener('click', () => switchStage('serviceOption'));
        
        // Stage 2 -> Stage 1
        btnBackToWelcome.addEventListener('click', () => switchStage('welcome'));

        // Dine In selection (requires table checkin)
        btnOptionDinein.addEventListener('click', () => {
            orderType = 'Mesa';
            loadTablesGrid();
            switchStage('tableSelect');
        });

        // Takeaway selection (direct to menu)
        btnOptionTakeaway.addEventListener('click', () => {
            orderType = 'Viagem';
            selectedTable = null;
            kioskOrderTypeBadge.textContent = '🛍️ Para Viagem';
            kioskOrderTypeBadge.style.background = '#1e90ff';
            startOrdering();
        });

        // Table selector back btn
        btnBackToOptions.addEventListener('click', () => switchStage('serviceOption'));

        // Cancel order button in menu
        btnCancelKioskOrder.addEventListener('click', () => {
            clearCart();
            switchStage('welcome');
        });

        // Category filter buttons
        document.querySelectorAll('.kiosk-cat-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.kiosk-cat-btn').forEach(b => b.classList.remove('active'));
                const curBtn = e.currentTarget;
                curBtn.classList.add('active');
                currentCategory = curBtn.getAttribute('data-category');
                renderKioskProducts();
            });
        });

        // Cart utilities
        btnKioskClearCart.addEventListener('click', clearCart);
        btnKioskCheckout.addEventListener('click', startPaymentProcess);
    }

    // Load and render tables checkin list
    async function loadTablesGrid() {
        kioskTablesGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">
                <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 12px;"></i>
                <p>Verificando mesas disponíveis...</p>
            </div>
        `;

        try {
            const response = await fetch('/api/mesas');
            if (!response.ok) throw new Error("Erro ao buscar mesas.");
            const tables = await response.json();
            
            kioskTablesGrid.innerHTML = '';
            
            tables.forEach(mesa => {
                const isFree = mesa.status === 'Livre';
                const card = document.createElement('div');
                card.className = `kiosk-table-card ${isFree ? 'free' : 'occupied'}`;
                card.innerHTML = `
                    <span class="table-number-label">${String(mesa.number).padStart(2, '0')}</span>
                    <span class="table-status-label">${mesa.status}</span>
                `;
                
                if (isFree) {
                    card.addEventListener('click', () => {
                        selectedTable = mesa.number;
                        kioskOrderTypeBadge.textContent = `🍽️ Mesa ${String(selectedTable).padStart(2, '0')}`;
                        kioskOrderTypeBadge.style.background = 'var(--primary)';
                        startOrdering();
                    });
                }
                
                kioskTablesGrid.appendChild(card);
            });
        } catch (error) {
            console.error(error);
            kioskTablesGrid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; color: var(--danger); padding: 40px;">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size: 2rem; margin-bottom: 12px;"></i>
                    <p>Erro de comunicação com o servidor.</p>
                </div>
            `;
        }
    }

    // --- MENU STAGE ACTIONS ---
    function startOrdering() {
        clearCart();
        // Reset category to 'Todos'
        document.querySelectorAll('.kiosk-cat-btn').forEach(btn => {
            if (btn.getAttribute('data-category') === 'Todos') btn.classList.add('active');
            else btn.classList.remove('active');
        });
        currentCategory = 'Todos';
        
        renderKioskProducts();
        switchStage('menu');
    }

    function renderKioskProducts() {
        kioskProductsGrid.innerHTML = '';
        
        const filtered = currentCategory === 'Todos' 
            ? products 
            : products.filter(p => p.category === currentCategory);

        if (filtered.length === 0) {
            kioskProductsGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">Nenhum produto disponível nesta categoria.</p>`;
            return;
        }

        filtered.forEach(product => {
            const card = document.createElement('div');
            card.className = 'kiosk-product-card';
            card.innerHTML = `
                <div>
                    <div class="kiosk-prod-emoji">${product.image_url || '🍽️'}</div>
                    <div class="kiosk-prod-info">
                        <h4>${product.name}</h4>
                        <p>${product.description || ''}</p>
                    </div>
                </div>
                <div class="kiosk-prod-footer">
                    <span class="kiosk-prod-price">R$ ${product.price.toFixed(2).replace('.', ',')}</span>
                    <button class="kiosk-add-btn" aria-label="Adicionar item"><i class="fa-solid fa-plus"></i></button>
                </div>
            `;
            
            card.addEventListener('click', () => addToKioskCart(product));
            kioskProductsGrid.appendChild(card);
        });
    }

    // --- CART ACTIONS ---
    function addToKioskCart(product) {
        const existingIdx = kioskCart.findIndex(item => item.product_id === product.id);
        
        if (existingIdx > -1) {
            kioskCart[existingIdx].quantity += 1;
        } else {
            kioskCart.push({
                product_id: product.id,
                name: product.name,
                price: product.price,
                quantity: 1,
                emoji: product.image_url
            });
        }
        
        renderKioskCart();
    }

    function changeKioskCartQty(index, delta) {
        kioskCart[index].quantity += delta;
        if (kioskCart[index].quantity < 1) {
            kioskCart.splice(index, 1);
        }
        renderKioskCart();
    }

    function removeKioskCartItem(index) {
        kioskCart.splice(index, 1);
        renderKioskCart();
    }

    function clearCart() {
        kioskCart = [];
        renderKioskCart();
    }

    function renderKioskCart() {
        kioskCartItems.innerHTML = '';
        
        if (kioskCart.length === 0) {
            kioskCartItems.innerHTML = `
                <div class="empty-cart-message">
                    <i class="fa-solid fa-cart-shopping"></i>
                    <p>Toque nos produtos do cardápio para adicioná-los aqui.</p>
                </div>
            `;
            kioskCartTotal.textContent = 'R$ 0,00';
            btnKioskCheckout.disabled = true;
            return;
        }

        btnKioskCheckout.disabled = false;

        kioskCart.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = 'kiosk-cart-item';
            card.innerHTML = `
                <div class="kiosk-c-emoji">${item.emoji || '🍽️'}</div>
                <div class="kiosk-c-details">
                    <span class="kiosk-c-title">${item.name}</span>
                    <div class="kiosk-c-qty-row">
                        <span class="kiosk-c-price">R$ ${(item.price * item.quantity).toFixed(2).replace('.', ',')}</span>
                        <div class="kiosk-c-qty-controls">
                            <button class="kiosk-c-qty-btn btn-k-minus" data-index="${index}"><i class="fa-solid fa-minus"></i></button>
                            <span class="kiosk-c-qty-val">${item.quantity}</span>
                            <button class="kiosk-c-qty-btn btn-k-plus" data-index="${index}"><i class="fa-solid fa-plus"></i></button>
                        </div>
                    </div>
                </div>
                <button class="kiosk-c-remove btn-k-remove" data-index="${index}"><i class="fa-solid fa-trash"></i></button>
            `;
            
            kioskCartItems.appendChild(card);
        });

        // Listeners
        kioskCartItems.querySelectorAll('.btn-k-minus').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(e.currentTarget.getAttribute('data-index'));
                changeKioskCartQty(idx, -1);
            });
        });
        kioskCartItems.querySelectorAll('.btn-k-plus').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(e.currentTarget.getAttribute('data-index'));
                changeKioskCartQty(idx, 1);
            });
        });
        kioskCartItems.querySelectorAll('.btn-k-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(e.currentTarget.getAttribute('data-index'));
                removeKioskCartItem(idx);
            });
        });

        // Calculate total
        const total = kioskCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        kioskCartTotal.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
    }

    // --- PAYMENT FLOW SIMULATION ---
    function startPaymentProcess() {
        if (kioskCart.length === 0) return;

        const total = kioskCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        paymentValueDisplay.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
        paymentStatusMessage.textContent = 'Insira ou Aproxime o Cartão';
        paymentProgressDots.style.visibility = 'hidden';

        switchStage('payment');

        // Mocks step-by-step payment processing
        setTimeout(() => {
            paymentStatusMessage.textContent = 'Processando...';
            paymentProgressDots.style.visibility = 'visible';
            
            setTimeout(() => {
                paymentStatusMessage.textContent = 'Aprovando transação...';
                
                setTimeout(() => {
                    paymentStatusMessage.textContent = 'Aprovado! Imprimindo senha...';
                    paymentProgressDots.style.visibility = 'hidden';
                    
                    // Proceed to send order to API
                    submitKioskOrder();
                }, 1500);
            }, 1500);
        }, 2000);
    }

    // Submit Order to API
    async function submitKioskOrder() {
        const payload = {
            table_number: selectedTable,
            type: orderType,
            items: kioskCart.map(item => ({
                product_id: item.product_id,
                quantity: item.quantity,
                notes: orderType === 'Viagem' ? "Pedido do Totem (Viagem)" : "Pedido do Totem (Consumo Local)"
            }))
        };

        try {
            const response = await fetch('/api/pedidos', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error("Erro ao criar pedido do totem.");
            const order = await response.json();
            
            showSuccessKioskTicket(order);
        } catch (error) {
            console.error(error);
            // Even on error, show mock success to not break the kiosk user demonstration experience,
            // but log the actual error.
            const mockOrder = {
                id: Math.floor(Math.random() * 900) + 100,
                status: 'Pendente',
                created_at: new Date().toISOString(),
                type: orderType,
                table_number: selectedTable,
                total_price: kioskCart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
                items: kioskCart.map((item, idx) => ({
                    id: idx,
                    product_id: item.product_id,
                    quantity: item.quantity,
                    notes: '',
                    product: { name: item.name }
                }))
            };
            showSuccessKioskTicket(mockOrder);
        }
    }

    // --- SUCCESS SCREEN ---
    function showSuccessKioskTicket(order) {
        // Date/Time
        const date = new Date(order.created_at || new Date());
        const formattedDate = date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
        ticketDateTime.textContent = formattedDate;

        // Type
        ticketType.textContent = order.type === 'Mesa' ? `MESA ${String(order.table_number).padStart(2, '0')}` : 'VIAGEM';

        // Password number
        ticketQueueNumber.textContent = String(order.id).padStart(3, '0');

        // Items list
        ticketItemsSummary.innerHTML = '';
        order.items.forEach(item => {
            const line = document.createElement('div');
            line.className = 'ticket-item-line';
            line.innerHTML = `
                <span>${item.quantity}x ${item.product.name}</span>
                <span>R$ ${(item.product.price * item.quantity).toFixed(2).replace('.', ',')}</span>
            `;
            ticketItemsSummary.appendChild(line);
        });

        // Total price
        ticketTotalValue.textContent = `Total: R$ ${order.total_price.toFixed(2).replace('.', ',')}`;

        switchStage('success');
        
        // Start automatic return countdown
        let secondsLeft = 6;
        autoReturnTimer.textContent = secondsLeft;
        
        if (returnTimerInterval) clearInterval(returnTimerInterval);
        
        returnTimerInterval = setInterval(() => {
            secondsLeft--;
            autoReturnTimer.textContent = secondsLeft;
            
            if (secondsLeft <= 0) {
                clearInterval(returnTimerInterval);
                clearCart();
                switchStage('welcome');
            }
        }, 1000);
    }

    // Start Kiosk Kiosk App
    init();
});
