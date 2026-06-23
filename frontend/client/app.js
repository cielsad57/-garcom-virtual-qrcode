document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT ---
    let products = [];
    let cart = [];
    let currentSelectedProduct = null;
    let tableNumber = null;
    let currentCategory = 'Todos';
    let socket = null;
    let activeOrderId = null;

    // --- DOM ELEMENTS ---
    const tableNumberDisplay = document.getElementById('table-number-display');
    const productsGrid = document.getElementById('products-grid');
    const currentCategoryTitle = document.getElementById('current-category-title');
    const floatingCartBar = document.getElementById('floating-cart-bar');
    const cartBadgeCount = document.getElementById('cart-badge-count');
    const cartBadgeTotal = document.getElementById('cart-badge-total');
    
    // Category Buttons
    const categoryButtons = document.querySelectorAll('.category-btn');

    // Product Detail Modal Elements
    const productDetailModal = document.getElementById('product-detail-modal');
    const btnCloseDetail = document.getElementById('btn-close-detail');
    const modalProductEmoji = document.getElementById('modal-product-emoji');
    const modalProductTitle = document.getElementById('modal-product-title');
    const modalProductDesc = document.getElementById('modal-product-desc');
    const modalProductPrice = document.getElementById('modal-product-price');
    const inputProductNotes = document.getElementById('input-product-notes');
    const modalQtyDisplay = document.getElementById('modal-qty-display');
    const btnQtyMinus = document.getElementById('btn-qty-minus');
    const btnQtyPlus = document.getElementById('btn-qty-plus');
    const btnAddToCartSubmit = document.getElementById('btn-add-to-cart-submit');
    const modalAddTotalPrice = document.getElementById('modal-add-total-price');

    // Cart Drawer Elements
    const cartDrawer = document.getElementById('cart-drawer');
    const btnOpenCart = document.getElementById('btn-open-cart');
    const btnCloseCart = document.getElementById('btn-close-cart');
    const cartItemsList = document.getElementById('cart-items-list');
    const cartSummarySubtotal = document.getElementById('cart-summary-subtotal');
    const cartSummaryTotal = document.getElementById('cart-summary-total');
    const btnSubmitOrder = document.getElementById('btn-submit-order');

    // Order Tracking Screen Elements
    const orderTrackingScreen = document.getElementById('order-tracking-screen');
    const trackingOrderId = document.getElementById('tracking-order-id');
    const btnBackToMenu = document.getElementById('btn-back-to-menu');
    
    // Toast Notification
    const toast = document.getElementById('toast-notification');

    // --- INITIALIZATION ---
    function init() {
        parseTableNumber();
        fetchProducts();
        setupEventListeners();
    }

    // Parse 'mesa' from URL query params
    function parseTableNumber() {
        const urlParams = new URLSearchParams(window.location.search);
        const mesa = urlParams.get('mesa');
        if (mesa) {
            tableNumber = parseInt(mesa);
            if (!isNaN(tableNumber)) {
                tableNumberDisplay.innerHTML = `<span>Mesa ${String(tableNumber).padStart(2, '0')}</span>`;
                showToast(`Bem-vindo! Você está na Mesa ${tableNumber}`);
                markTableAsOccupied(tableNumber);
            } else {
                tableNumber = null;
                setTakeawayMode();
            }
        } else {
            setTakeawayMode();
        }
    }

    async function markTableAsOccupied(num) {
        try {
            await fetch(`/api/mesas/${num}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: 'Ocupada' })
            });
        } catch (err) {
            console.error('Erro ao marcar mesa como ocupada:', err);
        }
    }

    function setTakeawayMode() {
        tableNumberDisplay.innerHTML = `<span style="background: #1e90ff;">Balcão / Viagem</span>`;
        tableNumber = null;
        showToast("Modo Viagem ativo. Adicione ?mesa=N na URL para simular QR Code da Mesa.");
    }

    // Fetch Products from backend
    async function fetchProducts() {
        try {
            const response = await fetch('/api/produtos');
            if (!response.ok) throw new Error("Erro ao buscar produtos.");
            products = await response.json();
            renderProducts();
        } catch (error) {
            console.error(error);
            productsGrid.innerHTML = `
                <div class="error-state" style="text-align: center; padding: 40px; color: var(--primary);">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size: 2.5rem; margin-bottom: 12px;"></i>
                    <p>Não foi possível carregar o cardápio. Verifique se o servidor está rodando.</p>
                </div>
            `;
        }
    }

    // --- EVENT LISTENERS SETUP ---
    function setupEventListeners() {
        // Category filters
        categoryButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                categoryButtons.forEach(b => b.classList.remove('active'));
                const targetBtn = e.currentTarget;
                targetBtn.classList.add('active');
                
                currentCategory = targetBtn.getAttribute('data-category');
                currentCategoryTitle.textContent = currentCategory === 'Todos' ? 'Todos os Itens' : currentCategory;
                renderProducts();
            });
        });

        // Detail Modal actions
        btnCloseDetail.addEventListener('click', hideProductModal);
        btnQtyMinus.addEventListener('click', () => changeModalQty(-1));
        btnQtyPlus.addEventListener('click', () => changeModalQty(1));
        btnAddToCartSubmit.addEventListener('click', handleAddToCart);

        // Cart Drawer actions
        btnOpenCart.addEventListener('click', showCartDrawer);
        btnCloseCart.addEventListener('click', hideCartDrawer);
        btnSubmitOrder.addEventListener('click', handleCheckout);

        // Tracking return
        btnBackToMenu.addEventListener('click', () => {
            orderTrackingScreen.style.display = 'none';
            if (socket) {
                socket.close();
            }
        });

        // Minha Mesa Button
        const btnOpenMesa = document.getElementById('btn-open-mesa');
        if (btnOpenMesa) {
            btnOpenMesa.addEventListener('click', openMesaDrawer);
        }

        const btnCloseMesa = document.getElementById('btn-close-mesa');
        if (btnCloseMesa) {
            btnCloseMesa.addEventListener('click', closeMesaDrawer);
        }

        const btnCallGarcom = document.getElementById('btn-call-garcom');
        if (btnCallGarcom) {
            btnCallGarcom.addEventListener('click', callGarcom);
        }

        const btnRequestConta = document.getElementById('btn-request-conta');
        if (btnRequestConta) {
            btnRequestConta.addEventListener('click', requestConta);
        }

        const btnCopyPix = document.getElementById('btn-copy-pix');
        if (btnCopyPix) {
            btnCopyPix.addEventListener('click', copyPixCode);
        }

        const btnFinishPayment = document.getElementById('btn-finish-payment-flow');
        if (btnFinishPayment) {
            btnFinishPayment.addEventListener('click', () => {
                document.getElementById('payment-success-screen').style.display = 'none';
                closeMesaDrawer();
                // Refresh page to reset state
                window.location.reload();
            });
        }
    }

    // --- MINHA MESA DRAWER ---
    let pixQRInstance = null;
    let currentPixPayload = '';

    function openMesaDrawer() {
        if (!tableNumber) {
            showToast('Esta função é exclusiva para pedidos feitos na mesa via QR Code.');
            return;
        }
        document.getElementById('mesa-drawer-number').textContent = `${String(tableNumber).padStart(2, '0')}`;
        document.getElementById('mesa-drawer').style.display = 'flex';
        loadMesaConta();
        // Connect WebSocket to listen for payment_confirmed event
        setupMesaWebSocket();
    }

    function closeMesaDrawer() {
        document.getElementById('mesa-drawer').style.display = 'none';
    }

    async function loadMesaConta() {
        const consumedList = document.getElementById('consumed-items-list');
        consumedList.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Carregando...</div>`;

        try {
            const res = await fetch(`/api/mesas/${tableNumber}/conta`);
            if (!res.ok) throw new Error('Falha ao buscar conta.');
            const data = await res.json();
            renderConsumedItems(data);
        } catch (err) {
            consumedList.innerHTML = `<p class="empty-mesa-msg"><i class="fa-solid fa-triangle-exclamation"></i> Não foi possível carregar os itens.</p>`;
        }
    }

    function renderConsumedItems(data) {
        const consumedList = document.getElementById('consumed-items-list');
        const subtotalEl = document.getElementById('mesa-summary-subtotal');
        const taxEl = document.getElementById('mesa-summary-tax');
        const totalEl = document.getElementById('mesa-summary-total');

        if (!data.items || data.items.length === 0) {
            consumedList.innerHTML = `<p class="empty-mesa-msg">Nenhum item consumido nesta mesa ainda.</p>`;
            subtotalEl.textContent = 'R$ 0,00';
            taxEl.textContent = 'R$ 0,00';
            totalEl.textContent = 'R$ 0,00';
            return;
        }

        consumedList.innerHTML = data.items.map(item => {
            const thumbHtml = item.image_url && (item.image_url.startsWith('http') || item.image_url.startsWith('/') || item.image_url.includes('.'))
                ? `<img src="${item.image_url}" alt="${item.name}">`
                : (item.image_url || '🍽️');
            return `
                <div class="consumed-item-row">
                    <div class="consumed-item-thumb">${thumbHtml}</div>
                    <div class="consumed-item-info">
                        <div class="consumed-item-name">${item.name}</div>
                        <div class="consumed-item-qty">${item.quantity}x × R$ ${item.unit_price.toFixed(2).replace('.', ',')}</div>
                    </div>
                    <span class="consumed-item-price">R$ ${item.total_price.toFixed(2).replace('.', ',')}</span>
                </div>`;
        }).join('');

        subtotalEl.textContent = `R$ ${data.subtotal.toFixed(2).replace('.', ',')}`;
        taxEl.textContent = `R$ ${data.service_tax.toFixed(2).replace('.', ',')}`;
        totalEl.textContent = `R$ ${data.total.toFixed(2).replace('.', ',')}`;

        // Store pix payload for later use
        currentPixPayload = data.pix_payload || '';
    }

    async function callGarcom() {
        if (!tableNumber) return;
        const btn = document.getElementById('btn-call-garcom');
        btn.disabled = true;
        btn.style.opacity = '0.6';

        try {
            const res = await fetch('/api/chamados', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table_number: tableNumber, type: 'garcom' })
            });
            if (!res.ok) throw new Error('Falha ao chamar garçom.');
            showToast('🔔 Garçom chamado! Ele virá em instantes.');
        } catch (err) {
            showToast('Não foi possível chamar o garçom. Tente novamente.');
        } finally {
            setTimeout(() => {
                btn.disabled = false;
                btn.style.opacity = '1';
            }, 5000);
        }
    }

    async function requestConta() {
        if (!tableNumber) return;
        const btn = document.getElementById('btn-request-conta');
        btn.disabled = true;
        btn.style.opacity = '0.6';

        try {
            // First load latest bill info
            const res = await fetch(`/api/mesas/${tableNumber}/conta`);
            if (!res.ok) throw new Error('Falha ao buscar conta.');
            const data = await res.json();

            if (!data.items || data.items.length === 0) {
                showToast('Nenhum item consumido na mesa para fechar a conta.');
                btn.disabled = false;
                btn.style.opacity = '1';
                return;
            }

            renderConsumedItems(data);
            currentPixPayload = data.pix_payload || '';

            // Show payment area and generate QR Code
            const paymentArea = document.getElementById('payment-area');
            paymentArea.style.display = 'block';
            paymentArea.scrollIntoView({ behavior: 'smooth', block: 'start' });

            // Generate QR Code
            const qrCanvas = document.getElementById('pix-qrcode-canvas');
            qrCanvas.innerHTML = ''; // Clear old QR
            pixQRInstance = null;

            if (currentPixPayload) {
                pixQRInstance = new QRCode(qrCanvas, {
                    text: currentPixPayload,
                    width: 152,
                    height: 152,
                    colorDark: '#0b0f19',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.M
                });
                document.getElementById('pix-copiacola-input').value = currentPixPayload;
            }

            // Create the "conta" call to notify admin
            await fetch('/api/chamados', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table_number: tableNumber, type: 'conta' })
            });

            showToast('💳 Conta solicitada! Pague via Pix e aguarde a confirmação.');
        } catch (err) {
            showToast('Não foi possível carregar o Pix. Tente novamente.');
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    }

    function copyPixCode() {
        const input = document.getElementById('pix-copiacola-input');
        if (!input.value) return;
        navigator.clipboard.writeText(input.value).then(() => {
            showToast('✅ Código Pix copiado!');
        }).catch(() => {
            input.select();
            document.execCommand('copy');
            showToast('✅ Código Pix copiado!');
        });
    }

    // WebSocket specifically for the mesa drawer (listening for payment_confirmed)
    let mesaSocket = null;
    function setupMesaWebSocket() {
        if (mesaSocket && mesaSocket.readyState === WebSocket.OPEN) return;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/kitchen`;
        mesaSocket = new WebSocket(wsUrl);

        mesaSocket.onopen = () => {
            console.log('Mesa WebSocket conectado para alertas de pagamento.');
        };

        mesaSocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.event === 'payment_confirmed' && data.table_number === tableNumber) {
                    // Show success screen
                    document.getElementById('mesa-drawer').style.display = 'none';
                    document.getElementById('payment-success-screen').style.display = 'flex';
                    mesaSocket.close();
                }
            } catch (err) { /* ignore */ }
        };

        mesaSocket.onclose = () => {
            mesaSocket = null;
        };
    }

    // --- PRODUCT RENDERING ---
    function renderProducts() {
        productsGrid.innerHTML = '';
        
        const filteredProducts = currentCategory === 'Todos' 
            ? products 
            : products.filter(p => p.category === currentCategory);

        if (filteredProducts.length === 0) {
            productsGrid.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 40px;">Nenhum produto disponível nesta categoria.</p>`;
            return;
        }

        filteredProducts.forEach(product => {
            const card = document.createElement('div');
            card.className = 'product-card';
            card.id = `product-card-${product.id}`;
            card.innerHTML = `
                <div class="product-emoji-wrapper">
                    ${product.image_url && (product.image_url.startsWith('http') || product.image_url.startsWith('/') || product.image_url.includes('.')) 
                        ? `<img src="${product.image_url}" alt="${product.name}">` 
                        : (product.image_url || '🍽️')
                    }
                </div>
                <div class="product-info">
                    <div class="product-name-row">
                        <h3 class="product-name">${product.name}</h3>
                        <span class="product-price">R$ ${product.price.toFixed(2).replace('.', ',')}</span>
                    </div>
                    <p class="product-desc">${product.description || ''}</p>
                </div>
            `;
            
            card.addEventListener('click', () => showProductModal(product));
            productsGrid.appendChild(card);
        });
    }

    // --- PRODUCT MODAL ---
    function showProductModal(product) {
        currentSelectedProduct = product;
        if (product.image_url && (product.image_url.startsWith('http') || product.image_url.startsWith('/') || product.image_url.includes('.'))) {
            modalProductEmoji.innerHTML = `<img src="${product.image_url}" alt="${product.name}">`;
        } else {
            modalProductEmoji.textContent = product.image_url || '🍽️';
        }
        modalProductTitle.textContent = product.name;
        modalProductDesc.textContent = product.description || '';
        modalProductPrice.textContent = `R$ ${product.price.toFixed(2).replace('.', ',')}`;
        
        inputProductNotes.value = '';
        modalQtyDisplay.textContent = '1';
        
        updateModalPrice();
        
        productDetailModal.style.display = 'flex';
    }

    function hideProductModal() {
        productDetailModal.style.display = 'none';
        currentSelectedProduct = null;
    }

    function changeModalQty(delta) {
        let currentQty = parseInt(modalQtyDisplay.textContent);
        currentQty += delta;
        if (currentQty < 1) currentQty = 1;
        modalQtyDisplay.textContent = currentQty;
        updateModalPrice();
    }

    function updateModalPrice() {
        if (!currentSelectedProduct) return;
        const qty = parseInt(modalQtyDisplay.textContent);
        const total = currentSelectedProduct.price * qty;
        modalAddTotalPrice.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
    }

    // --- CART ACTIONS ---
    function handleAddToCart() {
        if (!currentSelectedProduct) return;

        const qty = parseInt(modalQtyDisplay.textContent);
        const notes = inputProductNotes.value.trim();

        // Check if item already exists in cart with SAME product id AND notes
        const existingIndex = cart.findIndex(item => 
            item.product_id === currentSelectedProduct.id && 
            item.notes === notes
        );

        if (existingIndex > -1) {
            cart[existingIndex].quantity += qty;
        } else {
            cart.push({
                product_id: currentSelectedProduct.id,
                name: currentSelectedProduct.name,
                price: currentSelectedProduct.price,
                quantity: qty,
                notes: notes,
                image_url: currentSelectedProduct.image_url
            });
        }

        hideProductModal();
        updateCartState();
        showToast(`Adicionado: ${qty}x ${currentSelectedProduct.name}`);
    }

    function updateCartState() {
        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        const totalPrice = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        if (totalItems > 0) {
            floatingCartBar.style.display = 'block';
            cartBadgeCount.textContent = totalItems;
            cartBadgeTotal.textContent = `R$ ${totalPrice.toFixed(2).replace('.', ',')}`;
        } else {
            floatingCartBar.style.display = 'none';
        }
    }

    function showCartDrawer() {
        renderCartItems();
        cartDrawer.style.display = 'flex';
    }

    function hideCartDrawer() {
        cartDrawer.style.display = 'none';
    }

    function renderCartItems() {
        cartItemsList.innerHTML = '';
        
        if (cart.length === 0) {
            cartItemsList.innerHTML = `
                <div style="text-align: center; padding: 40px 0; color: var(--text-muted);">
                    <i class="fa-solid fa-basket-shopping" style="font-size: 2.5rem; margin-bottom: 12px; opacity: 0.5;"></i>
                    <p>Sua sacola está vazia.</p>
                </div>
            `;
            const totalPrice = 0;
            cartSummarySubtotal.textContent = 'R$ 0,00';
            cartSummaryTotal.textContent = 'R$ 0,00';
            btnSubmitOrder.disabled = true;
            btnSubmitOrder.style.opacity = '0.5';
            return;
        }

        btnSubmitOrder.disabled = false;
        btnSubmitOrder.style.opacity = '1';

        cart.forEach((item, index) => {
            const cartItem = document.createElement('div');
            cartItem.className = 'cart-item';
            cartItem.id = `cart-item-${index}`;
            cartItem.innerHTML = `
                <div class="cart-item-emoji">
                    ${item.image_url && (item.image_url.startsWith('http') || item.image_url.startsWith('/') || item.image_url.includes('.')) 
                        ? `<img src="${item.image_url}" alt="${item.name}">` 
                        : (item.image_url || '🍽️')
                    }
                </div>
                <div class="cart-item-details">
                    <div>
                        <h4 class="cart-item-title">${item.name}</h4>
                        ${item.notes ? `<p class="cart-item-notes">"${item.notes}"</p>` : ''}
                    </div>
                    <div class="cart-item-bottom">
                        <span class="cart-item-price">R$ ${(item.price * item.quantity).toFixed(2).replace('.', ',')}</span>
                        <div class="cart-item-qty-selector">
                            <button class="cart-qty-btn btn-cart-minus" data-index="${index}"><i class="fa-solid fa-minus"></i></button>
                            <span class="cart-item-qty">${item.quantity}</span>
                            <button class="cart-qty-btn btn-cart-plus" data-index="${index}"><i class="fa-solid fa-plus"></i></button>
                        </div>
                    </div>
                </div>
                <button class="cart-item-remove btn-cart-remove" data-index="${index}"><i class="fa-regular fa-trash-can"></i></button>
            `;
            cartItemsList.appendChild(cartItem);
        });

        // Set up event listeners for dynamically added buttons
        cartItemsList.querySelectorAll('.btn-cart-minus').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.getAttribute('data-index'));
                changeCartQty(idx, -1);
            });
        });

        cartItemsList.querySelectorAll('.btn-cart-plus').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.getAttribute('data-index'));
                changeCartQty(idx, 1);
            });
        });

        cartItemsList.querySelectorAll('.btn-cart-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.getAttribute('data-index'));
                removeCartItem(idx);
            });
        });

        const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        cartSummarySubtotal.textContent = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
        cartSummaryTotal.textContent = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
    }

    function changeCartQty(index, delta) {
        cart[index].quantity += delta;
        if (cart[index].quantity < 1) {
            cart.splice(index, 1);
        }
        updateCartState();
        renderCartItems();
    }

    function removeCartItem(index) {
        cart.splice(index, 1);
        updateCartState();
        renderCartItems();
    }

    // --- CHECKOUT & ORDER SUBMISSION ---
    async function handleCheckout() {
        if (cart.length === 0) return;

        btnSubmitOrder.disabled = true;
        btnSubmitOrder.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Enviando...`;

        const payload = {
            table_number: tableNumber,
            type: tableNumber ? "Mesa" : "Viagem",
            items: cart.map(item => ({
                product_id: item.product_id,
                quantity: item.quantity,
                notes: item.notes || null
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

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || "Erro ao processar pedido.");
            }

            const order = await response.json();
            
            // Clear cart
            cart = [];
            updateCartState();
            hideCartDrawer();

            // Show tracking screen
            activeOrderId = order.id;
            displayTrackingScreen(order);

            // Connect Real-Time WebSocket for updates
            setupTrackingWebSocket(order.id);

        } catch (error) {
            console.error(error);
            showToast(`Falha: ${error.message}`);
        } finally {
            btnSubmitOrder.disabled = false;
            btnSubmitOrder.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Enviar Pedido para a Cozinha`;
        }
    }

    // --- REAL-TIME ORDER TRACKING ---
    function displayTrackingScreen(order) {
        trackingOrderId.textContent = `Pedido #${String(order.id).padStart(4, '0')}`;
        updateStepperStatus(order.status);
        orderTrackingScreen.style.display = 'flex';
    }

    function updateStepperStatus(status) {
        // Status possibilities: "Pendente", "Em Preparo", "Pronto", "Entregue"
        const steps = ['pendente', 'preparo', 'pronto', 'entregue'];
        const currentIdx = steps.indexOf(status.toLowerCase().replace(' ', '')); // maps to pendente, preparo, pronto, entregue

        steps.forEach((step, idx) => {
            const stepEl = document.getElementById(`step-${step}`);
            if (!stepEl) return;

            stepEl.classList.remove('active', 'completed');

            if (idx < currentIdx) {
                stepEl.classList.add('completed');
                // Alter details checklist icon to check
                const icon = stepEl.querySelector('.step-icon');
                icon.innerHTML = `<i class="fa-solid fa-check"></i>`;
            } else if (idx === currentIdx) {
                stepEl.classList.add('active');
                // Restore original icons for active step
                restoreStepIcon(step, stepEl);
            } else {
                // Future steps
                restoreStepIcon(step, stepEl);
            }
        });
    }

    function restoreStepIcon(step, stepEl) {
        const icon = stepEl.querySelector('.step-icon');
        if (step === 'pendente') icon.innerHTML = `<i class="fa-solid fa-receipt"></i>`;
        if (step === 'preparo') icon.innerHTML = `<i class="fa-solid fa-fire-burner"></i>`;
        if (step === 'pronto') icon.innerHTML = `<i class="fa-solid fa-bell"></i>`;
        if (step === 'entregue') icon.innerHTML = `<i class="fa-solid fa-hand-holding-plate"></i>`;
    }

    function setupTrackingWebSocket(orderId) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/kitchen`;

        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
            console.log("WebSocket de rastreamento conectado.");
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.event === 'status_update' && data.order_id === orderId) {
                    console.log(`Atualização de status recebida: ${data.status}`);
                    updateStepperStatus(data.status);
                    
                    if (data.status === 'Entregue') {
                        showToast("Seu pedido foi entregue! Bom apetite!");
                        // Close socket as it's completed
                        socket.close();
                    } else if (data.status === 'Pronto') {
                        showToast("Oba! Seu pedido está pronto e saindo da cozinha.");
                    } else if (data.status === 'Em Preparo') {
                        showToast("Seu pedido começou a ser preparado.");
                    }
                }
            } catch (err) {
                console.error("Erro ao decodificar WebSocket:", err);
            }
        };

        socket.onclose = () => {
            console.log("WebSocket de rastreamento desconectado.");
        };

        socket.onerror = (error) => {
            console.error("Erro no WebSocket de rastreamento:", error);
        };
    }

    // --- HELPER TOAST ---
    function showToast(message) {
        toast.textContent = message;
        toast.style.display = 'block';
        
        // Reset animation
        toast.style.animation = 'none';
        toast.offsetHeight; // trigger reflow
        toast.style.animation = null;

        setTimeout(() => {
            toast.style.display = 'none';
        }, 4000);
    }

    // Start everything
    init();
});
