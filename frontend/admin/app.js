document.addEventListener('DOMContentLoaded', () => {
    // --- STATE VARIABLES ---
    let currentSection = 'dashboard';
    let produtos = [];
    let deleteProductId = null;
    let socket = null;
    let selectedImageFile = null;
    let shouldRemoveImage = false;
    let activeCalls = [];

    // --- DOM SELECTORS ---
    // Navigation
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.section');
    const pageTitle = document.getElementById('page-title');
    const pageSubtitle = document.getElementById('page-subtitle');
    const topbarActions = document.getElementById('topbar-actions');

    // Toast
    const toast = document.getElementById('admin-toast');

    // Dashboard
    const btnRefreshStats = document.getElementById('btn-refresh-stats');
    const btnLimparEntregues = document.getElementById('btn-limpar-entregues');
    const statsGrid = document.getElementById('stats-grid');

    // Cardápio
    const searchProdutos = document.getElementById('search-produtos');
    const filterCategory = document.getElementById('filter-category');
    const produtosTbody = document.getElementById('produtos-tbody');

    // Modals & Forms
    const modalProduto = document.getElementById('modal-produto');
    const modalProdutoTitle = document.getElementById('modal-produto-title');
    const btnCloseProdutoModal = document.getElementById('btn-close-produto-modal');
    const btnCancelForm = document.getElementById('btn-cancel-form');
    const formProduto = document.getElementById('form-produto');
    const formProdutoId = document.getElementById('form-produto-id');
    const formNome = document.getElementById('form-nome');
    const formEmoji = document.getElementById('form-emoji');
    const formDescricao = document.getElementById('form-descricao');
    const formPreco = document.getElementById('form-preco');
    const formCategoria = document.getElementById('form-categoria');
    const formDisponivel = document.getElementById('form-disponivel');
    const formImageFile = document.getElementById('form-image-file');
    const formImagePreview = document.getElementById('form-image-preview');
    const btnRemoveImage = document.getElementById('btn-remove-image');

    const modalConfirmDelete = document.getElementById('modal-confirm-delete');
    const btnCloseDeleteModal = document.getElementById('btn-close-delete-modal');
    const btnCancelDelete = document.getElementById('btn-cancel-delete');
    const btnConfirmDelete = document.getElementById('btn-confirm-delete');

    // Mesas
    const mesasGrid = document.getElementById('mesas-grid');

    // --- INITIALIZATION ---
    function init() {
        setupNavigation();
        setupDashboardActions();
        setupCardapioActions();
        setupModalActions();
        setupWebSocket();
        fetchActiveCalls();

        // Default to loading dashboard
        loadSection('dashboard');
    }

    // --- TOAST NOTIFICATIONS ---
    let toastTimeout = null;
    function showToast(message, type = 'success') {
        clearTimeout(toastTimeout);
        toast.className = `toast ${type} show`;
        toast.textContent = message;
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3500);
    }

    // --- ROUTING & SECTIONS ---
    function setupNavigation() {
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const sectionId = item.getAttribute('data-section');
                loadSection(sectionId);
            });
        });
    }

    function loadSection(sectionId) {
        currentSection = sectionId;

        // Toggle nav items active state
        navItems.forEach(item => {
            if (item.getAttribute('data-section') === sectionId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Toggle sections active state
        sections.forEach(section => {
            if (section.id === `section-${sectionId}`) {
                section.classList.add('active');
            } else {
                section.classList.remove('active');
            }
        });

        // Reset top bar actions & update titles
        topbarActions.innerHTML = '';

        if (sectionId === 'dashboard') {
            pageTitle.textContent = 'Dashboard';
            pageSubtitle.textContent = 'Visão geral do restaurante hoje';
            fetchDashboardStats();
        } else if (sectionId === 'cardapio') {
            pageTitle.textContent = 'Cardápio';
            pageSubtitle.textContent = 'Gerencie os produtos do cardápio e sua disponibilidade';
            
            // Add "Novo Produto" button dynamically
            const newBtn = document.createElement('button');
            newBtn.className = 'btn-primary';
            newBtn.id = 'btn-novo-produto';
            newBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Novo Produto';
            newBtn.addEventListener('click', () => openProdutoModal());
            topbarActions.appendChild(newBtn);
            
            fetchProdutos();
        } else if (sectionId === 'mesas') {
            pageTitle.textContent = 'Mesas';
            pageSubtitle.textContent = 'Acompanhe a ocupação física do salão e gerencie mesas';
            fetchMesas();
        } else if (sectionId === 'chamados') {
            pageTitle.textContent = 'Chamados em Tempo Real';
            pageSubtitle.textContent = 'Chamadas de garçom e fechamentos de conta solicitados pelos clientes';
            fetchActiveCalls();
        }
    }

    // --- WEBSOCKET FOR REAL-TIME UPDATE ---
    function setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/kitchen`;

        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
            console.log("WebSocket do Admin conectado para atualizações em tempo real.");
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log("Evento recebido no Admin via WS:", data.event);
                
                // If any order updates or table status changes occur, refresh our active sections
                if (data.event === 'new_order' || data.event === 'status_update') {
                    if (currentSection === 'dashboard') {
                        fetchDashboardStats(true); // silent refresh
                    } else if (currentSection === 'mesas') {
                        fetchMesas(true); // silent refresh
                    }
                }

                // Handle waiter calls and payment requests
                if (data.event === 'new_call') {
                    playBellSound();
                    const call = data.call;
                    const typeLabel = call.type === 'garcom' ? '🔔 Chamada de Garçom' : '💳 Pedido de Conta';
                    showToast(`${typeLabel} — Mesa ${String(call.table_number).padStart(2, '0')}`, 'warning');
                    activeCalls = [call, ...activeCalls.filter(c => c.id !== call.id)];
                    updateCallsBadge();
                    if (currentSection === 'chamados') {
                        renderCalls(activeCalls);
                    }
                }

                if (data.event === 'call_resolved' || data.event === 'payment_confirmed') {
                    activeCalls = activeCalls.filter(c => c.id !== data.call_id);
                    updateCallsBadge();
                    if (currentSection === 'chamados') {
                        renderCalls(activeCalls);
                    }
                    if (data.event === 'payment_confirmed') {
                        if (currentSection === 'dashboard') fetchDashboardStats(true);
                        if (currentSection === 'mesas') fetchMesas(true);
                    }
                }
            } catch (err) {
                console.error("Erro no parse do WS do Admin:", err);
            }
        };

        socket.onclose = () => {
            console.log("WebSocket do Admin desconectado. Reconectando em 5s...");
            setTimeout(setupWebSocket, 5000);
        };

        socket.onerror = (err) => {
            console.error("Erro no WebSocket do Admin:", err);
            socket.close();
        };
    }

    // --- DASHBOARD CODE ---
    function setupDashboardActions() {
        btnRefreshStats.addEventListener('click', () => {
            fetchDashboardStats();
            showToast('Estatísticas atualizadas.');
        });

        btnLimparEntregues.addEventListener('click', async () => {
            if (confirm('Tem certeza que deseja remover todos os pedidos com status "Entregue" do histórico do banco?')) {
                btnLimparEntregues.disabled = true;
                const originalText = btnLimparEntregues.innerHTML;
                btnLimparEntregues.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Limpando...';

                try {
                    const response = await fetch('/api/admin/pedidos/limpar', { method: 'DELETE' });
                    if (!response.ok) throw new Error('Falha ao limpar pedidos.');
                    const res = await response.json();
                    showToast(`${res.removed} pedidos entregues arquivados e removidos.`);
                    fetchDashboardStats();
                } catch (error) {
                    console.error(error);
                    showToast('Erro ao limpar histórico de pedidos.', 'error');
                } finally {
                    btnLimparEntregues.disabled = false;
                    btnLimparEntregues.innerHTML = originalText;
                }
            }
        });
    }

    async function fetchDashboardStats(silent = false) {
        if (!silent) {
            // Render skeletons
            statsGrid.innerHTML = `
                <div class="stat-skeleton"></div>
                <div class="stat-skeleton"></div>
                <div class="stat-skeleton"></div>
                <div class="stat-skeleton"></div>
                <div class="stat-skeleton"></div>
                <div class="stat-skeleton"></div>
            `;
        }

        try {
            const response = await fetch('/api/admin/stats');
            if (!response.ok) throw new Error('Não foi possível obter estatísticas.');
            const stats = await response.json();
            renderDashboardStats(stats);
        } catch (error) {
            console.error(error);
            if (!silent) {
                statsGrid.innerHTML = `<div class="table-empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>Erro ao carregar métricas da API.</p></div>`;
            }
        }
    }

    function renderDashboardStats(stats) {
        statsGrid.innerHTML = `
            <!-- Total de Pedidos -->
            <div class="stat-card info">
                <div class="stat-card-left">
                    <span class="stat-card-title">Pedidos Hoje</span>
                    <span class="stat-card-value">${stats.total_pedidos_hoje}</span>
                </div>
                <div class="stat-card-icon"><i class="fa-solid fa-clipboard-list"></i></div>
            </div>

            <!-- Receita Total -->
            <div class="stat-card success">
                <div class="stat-card-left">
                    <span class="stat-card-title">Faturamento Hoje</span>
                    <span class="stat-card-value">R$ ${stats.receita_hoje.toFixed(2)}</span>
                </div>
                <div class="stat-card-icon"><i class="fa-solid fa-brazilian-real-sign"></i></div>
            </div>

            <!-- Pedidos Pendentes -->
            <div class="stat-card primary">
                <div class="stat-card-left">
                    <span class="stat-card-title">Fila Pendente</span>
                    <span class="stat-card-value">${stats.pedidos_pendentes}</span>
                </div>
                <div class="stat-card-icon"><i class="fa-solid fa-clock"></i></div>
            </div>

            <!-- Pedidos Em Preparo -->
            <div class="stat-card warning">
                <div class="stat-card-left">
                    <span class="stat-card-title">Na Cozinha</span>
                    <span class="stat-card-value">${stats.pedidos_em_preparo}</span>
                </div>
                <div class="stat-card-icon"><i class="fa-solid fa-fire-burner"></i></div>
            </div>

            <!-- Pedidos Prontos -->
            <div class="stat-card success">
                <div class="stat-card-left">
                    <span class="stat-card-title">Prontos p/ Retirada</span>
                    <span class="stat-card-value">${stats.pedidos_prontos}</span>
                </div>
                <div class="stat-card-icon"><i class="fa-solid fa-bell"></i></div>
            </div>

            <!-- Mesas Ocupadas / Livres -->
            <div class="stat-card warning">
                <div class="stat-card-left">
                    <span class="stat-card-title">Ocupação do Salão</span>
                    <span class="stat-card-value">${stats.mesas_ocupadas} ocupadas</span>
                </div>
                <div class="stat-card-icon"><i class="fa-solid fa-chair"></i></div>
            </div>
        `;
    }

    // --- CARDÁPIO CODE ---
    function setupCardapioActions() {
        searchProdutos.addEventListener('input', () => renderProdutos());
        filterCategory.addEventListener('change', () => renderProdutos());
    }

    async function fetchProdutos() {
        try {
            const response = await fetch('/api/admin/produtos');
            if (!response.ok) throw new Error('Não foi possível obter produtos.');
            produtos = await response.json();
            renderProdutos();
        } catch (error) {
            console.error(error);
            produtosTbody.innerHTML = `
                <tr>
                    <td colspan="7" class="table-empty-state">
                        <i class="fa-solid fa-circle-exclamation" style="color: var(--primary);"></i>
                        <p>Erro ao carregar o cardápio. Verifique o servidor.</p>
                    </td>
                </tr>
            `;
        }
    }

    function renderProdutos() {
        const searchQuery = searchProdutos.value.toLowerCase().trim();
        const selectedCategory = filterCategory.value;

        // Filter products
        const filtered = produtos.filter(p => {
            const matchesSearch = p.name.toLowerCase().includes(searchQuery) || 
                                  (p.description && p.description.toLowerCase().includes(searchQuery));
            const matchesCategory = !selectedCategory || p.category === selectedCategory;
            return matchesSearch && matchesCategory;
        });

        if (filtered.length === 0) {
            produtosTbody.innerHTML = `
                <tr>
                    <td colspan="7" class="table-empty-state">
                        <i class="fa-solid fa-magnifying-glass"></i>
                        <p>Nenhum produto correspondente encontrado.</p>
                    </td>
                </tr>
            `;
            return;
        }

        produtosTbody.innerHTML = filtered.map(p => `
            <tr>
                <td>${p.id}</td>
                <td>
                    ${p.image_url && (p.image_url.startsWith('http') || p.image_url.startsWith('/') || p.image_url.includes('.')) 
                        ? `<img src="${p.image_url}" class="product-table-img" alt="${p.name}">` 
                        : `<span style="font-size: 1.4rem;">${p.image_url || '🍽️'}</span>`
                    }
                </td>
                <td>
                    <div class="product-cell-name">${p.name}</div>
                    <div class="product-cell-desc" title="${p.description || ''}">${p.description || 'Sem descrição cadastrada.'}</div>
                </td>
                <td><span class="category-badge">${p.category}</span></td>
                <td><span class="price-text">R$ ${p.price.toFixed(2)}</span></td>
                <td>
                    <span class="status-badge ${p.available ? 'available' : 'unavailable'}">
                        ${p.available ? 'Disponível' : 'Indisponível'}
                    </span>
                </td>
                <td>
                    <div class="table-actions-cell">
                        <button class="btn-icon edit" data-id="${p.id}" title="Editar Produto">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn-icon toggle" data-id="${p.id}" title="Alternar Disponibilidade">
                            <i class="fa-solid fa-power-off"></i>
                        </button>
                        <button class="btn-icon delete" data-id="${p.id}" title="Excluir Produto">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

        // Attach action events dynamically
        produtosTbody.querySelectorAll('.btn-icon.edit').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.getAttribute('data-id'));
                const prod = produtos.find(p => p.id === id);
                if (prod) openProdutoModal(prod);
            });
        });

        produtosTbody.querySelectorAll('.btn-icon.toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.getAttribute('data-id'));
                toggleProdutoAvailability(id);
            });
        });

        produtosTbody.querySelectorAll('.btn-icon.delete').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.getAttribute('data-id'));
                openDeleteModal(id);
            });
        });
    }

    async function toggleProdutoAvailability(id) {
        try {
            const response = await fetch(`/api/admin/produtos/${id}/toggle`, { method: 'PATCH' });
            if (!response.ok) throw new Error('Erro ao alternar status do produto.');
            
            const updated = await response.json();
            // Update in local state
            const idx = produtos.findIndex(p => p.id === id);
            if (idx > -1) {
                produtos[idx].available = updated.available;
                renderProdutos();
                showToast(`Produto "${updated.name}" está agora ${updated.available ? 'disponível' : 'indisponível'}.`);
            }
        } catch (error) {
            console.error(error);
            showToast('Erro ao alternar status do produto.', 'error');
        }
    }

    // --- CREATE & EDIT PRODUCT MODAL ---
    function openProdutoModal(produto = null) {
        formProduto.reset();
        selectedImageFile = null;
        shouldRemoveImage = false;
        formImageFile.value = '';
        formImagePreview.innerHTML = `<span class="preview-placeholder"><i class="fa-solid fa-image"></i> Nenhuma foto</span>`;
        btnRemoveImage.style.display = 'none';

        if (produto) {
            // Edit Mode
            modalProdutoTitle.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Editar Produto';
            formProdutoId.value = produto.id;
            formNome.value = produto.name;
            formEmoji.value = produto.image_url || '';
            formDescricao.value = produto.description || '';
            formPreco.value = produto.price;
            formCategoria.value = produto.category;
            formDisponivel.checked = produto.available;

            // Image Preview if custom image is set
            if (produto.image_url && (produto.image_url.startsWith('http') || produto.image_url.startsWith('/') || produto.image_url.includes('.'))) {
                formImagePreview.innerHTML = `<img src="${produto.image_url}" alt="${produto.name}">`;
                btnRemoveImage.style.display = 'inline-flex';
            }
        } else {
            // Create Mode
            modalProdutoTitle.innerHTML = '<i class="fa-solid fa-circle-plus"></i> Novo Produto';
            formProdutoId.value = '';
            formDisponivel.checked = true;
        }

        modalProduto.style.display = 'flex';
    }

    function closeProdutoModal() {
        modalProduto.style.display = 'none';
        formProduto.reset();
    }

    function setupModalActions() {
        // Product Modal closures
        btnCloseProdutoModal.addEventListener('click', closeProdutoModal);
        btnCancelForm.addEventListener('click', closeProdutoModal);

        // Delete Modal closures
        btnCloseDeleteModal.addEventListener('click', closeDeleteModal);
        btnCancelDelete.addEventListener('click', closeDeleteModal);

        // Click outside overlay to close modal
        window.addEventListener('click', (e) => {
            if (e.target === modalProduto) closeProdutoModal();
            if (e.target === modalConfirmDelete) closeDeleteModal();
        });

        // Image Selection Change Handler
        formImageFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                if (!file.type.startsWith('image/')) {
                    showToast('Por favor, selecione uma imagem válida.', 'error');
                    formImageFile.value = '';
                    return;
                }
                selectedImageFile = file;
                shouldRemoveImage = false;

                const reader = new FileReader();
                reader.onload = (event) => {
                    formImagePreview.innerHTML = `<img src="${event.target.result}" alt="Preview">`;
                    btnRemoveImage.style.display = 'inline-flex';
                };
                reader.readAsDataURL(file);
            }
        });

        // Remove Image Button Handler
        btnRemoveImage.addEventListener('click', () => {
            selectedImageFile = null;
            shouldRemoveImage = true;
            formImageFile.value = '';
            formImagePreview.innerHTML = `<span class="preview-placeholder"><i class="fa-solid fa-image"></i> Nenhuma foto</span>`;
            btnRemoveImage.style.display = 'none';
            // Reset emoji field to fallback if it has a file path
            if (formEmoji.value.startsWith('/') || formEmoji.value.includes('.')) {
                formEmoji.value = '🍔';
            }
        });

        // Submit form
        formProduto.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = formProdutoId.value;
            const priceVal = parseFloat(formPreco.value);

            if (isNaN(priceVal) || priceVal <= 0) {
                showToast('Preço inválido.', 'error');
                return;
            }

            const payload = {
                name: formNome.value.trim(),
                description: formDescricao.value.trim() || null,
                price: priceVal,
                category: formCategoria.value,
                image_url: formEmoji.value.trim() || '🍔',
                available: formDisponivel.checked
            };

            const submitBtn = document.getElementById('btn-submit-form');
            const origText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gravando...';

            try {
                let response;
                if (id) {
                    // Update
                    response = await fetch(`/api/admin/produtos/${id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                } else {
                    // Create
                    response = await fetch('/api/admin/produtos', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                }

                if (!response.ok) throw new Error('Não foi possível gravar dados do produto.');
                
                const savedProd = await response.json();

                // Check if we need to upload an image
                if (selectedImageFile) {
                    const formData = new FormData();
                    formData.append('file', selectedImageFile);

                    const imgResponse = await fetch(`/api/admin/produtos/${savedProd.id}/image`, {
                        method: 'POST',
                        body: formData
                    });

                    if (!imgResponse.ok) {
                        const errData = await imgResponse.json();
                        throw new Error(errData.detail || 'Erro ao enviar a imagem.');
                    }
                }
                
                showToast(`Produto gravado com sucesso!`);
                closeProdutoModal();
                fetchProdutos();
            } catch (error) {
                console.error(error);
                showToast('Ocorreu um erro ao salvar o produto.', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = origText;
            }
        });

        // Confirm Delete
        btnConfirmDelete.addEventListener('click', async () => {
            if (!deleteProductId) return;

            btnConfirmDelete.disabled = true;
            const origText = btnConfirmDelete.innerHTML;
            btnConfirmDelete.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Excluindo...';

            try {
                const response = await fetch(`/api/admin/produtos/${deleteProductId}`, { method: 'DELETE' });
                if (!response.ok) throw new Error('Não foi possível deletar produto.');
                
                showToast('Produto excluído com sucesso.');
                closeDeleteModal();
                fetchProdutos();
            } catch (error) {
                console.error(error);
                showToast('Erro ao remover produto do sistema.', 'error');
            } finally {
                btnConfirmDelete.disabled = false;
                btnConfirmDelete.innerHTML = origText;
            }
        });
    }

    // --- DELETE MODAL CODE ---
    function openDeleteModal(id) {
        deleteProductId = id;
        const prod = produtos.find(p => p.id === id);
        const nameText = prod ? `"${prod.name}"` : 'este produto';
        document.getElementById('delete-confirm-text').innerHTML = `Tem certeza que deseja remover o produto <strong>${nameText}</strong>? Esta ação é definitiva e não poderá ser desfeita.`;
        modalConfirmDelete.style.display = 'flex';
    }

    function closeDeleteModal() {
        modalConfirmDelete.style.display = 'none';
        deleteProductId = null;
    }

    // --- MESAS CODE ---
    async function fetchMesas(silent = false) {
        if (!silent) {
            mesasGrid.innerHTML = `
                <div class="stat-skeleton" style="height: 150px;"></div>
                <div class="stat-skeleton" style="height: 150px;"></div>
                <div class="stat-skeleton" style="height: 150px;"></div>
                <div class="stat-skeleton" style="height: 150px;"></div>
            `;
        }

        try {
            const response = await fetch('/api/mesas');
            if (!response.ok) throw new Error('Não foi possível obter as mesas.');
            const mesas = await response.json();
            renderMesas(mesas);
        } catch (error) {
            console.error(error);
            if (!silent) {
                mesasGrid.innerHTML = `<div class="table-empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>Erro ao obter status das mesas do servidor.</p></div>`;
            }
        }
    }

    function renderMesas(mesas) {
        if (mesas.length === 0) {
            mesasGrid.innerHTML = `<div class="table-empty-state"><i class="fa-solid fa-couch"></i><p>Nenhuma mesa cadastrada no sistema.</p></div>`;
            return;
        }

        // Sort tables by number ascending
        mesas.sort((a, b) => a.number - b.number);

        mesasGrid.innerHTML = mesas.map(m => `
            <div class="mesa-card ${m.status}" data-number="${m.number}">
                <div class="mesa-icon">
                    <i class="fa-solid fa-chair"></i>
                </div>
                <span class="mesa-number">Mesa ${String(m.number).padStart(2, '0')}</span>
                <span class="mesa-status-label">${m.status}</span>
                <span class="mesa-action-hint"><i class="fa-solid fa-arrows-rotate"></i> Alternar status</span>
            </div>
        `).join('');

        // Attach toggle events
        mesasGrid.querySelectorAll('.mesa-card').forEach(card => {
            card.addEventListener('click', () => {
                const number = parseInt(card.getAttribute('data-number'));
                const currentStatus = card.classList.contains('Livre') ? 'Livre' : 'Ocupada';
                const nextStatus = currentStatus === 'Livre' ? 'Ocupada' : 'Livre';
                toggleMesaStatus(number, nextStatus);
            });
        });
    }

    async function toggleMesaStatus(number, nextStatus) {
        try {
            const response = await fetch(`/api/mesas/${number}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: nextStatus })
            });

            if (!response.ok) throw new Error('Não foi possível alternar status da mesa.');
            
            showToast(`Mesa ${number} está agora ${nextStatus}.`);
            fetchMesas();
        } catch (error) {
            console.error(error);
            showToast(`Erro ao alterar status da Mesa ${number}.`, 'error');
        }
    }

    // --- CHAMADOS (CALLS) ---
    function playBellSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            // First tone (ding)
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(880, ctx.currentTime);
            osc1.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.3);
            gain1.gain.setValueAtTime(0.6, ctx.currentTime);
            gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
            osc1.start(ctx.currentTime);
            osc1.stop(ctx.currentTime + 0.6);

            // Second tone (dong)
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(660, ctx.currentTime + 0.35);
            osc2.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.7);
            gain2.gain.setValueAtTime(0, ctx.currentTime + 0.35);
            gain2.gain.setValueAtTime(0.5, ctx.currentTime + 0.36);
            gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);
            osc2.start(ctx.currentTime + 0.35);
            osc2.stop(ctx.currentTime + 1.0);
        } catch (e) {
            console.warn('Web Audio API não disponível:', e);
        }
    }

    function updateCallsBadge() {
        const badge = document.getElementById('calls-badge');
        if (!badge) return;
        const pendingCount = activeCalls.filter(c => c.status === 'Pendente').length;
        if (pendingCount > 0) {
            badge.textContent = pendingCount;
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
        }
    }

    async function fetchActiveCalls() {
        try {
            const res = await fetch('/api/chamados?status=Pendente');
            if (!res.ok) throw new Error('Falha ao buscar chamados.');
            activeCalls = await res.json();
            updateCallsBadge();
            if (currentSection === 'chamados') {
                renderCalls(activeCalls);
            }
        } catch (err) {
            console.error('Erro ao buscar chamados:', err);
        }
    }

    function renderCalls(calls) {
        const grid = document.getElementById('chamados-grid');
        if (!grid) return;

        const pending = calls.filter(c => c.status === 'Pendente');

        if (pending.length === 0) {
            grid.innerHTML = `
                <div class="calls-empty-state">
                    <i class="fa-solid fa-bell-slash"></i>
                    <p>Nenhum chamado ativo no momento. Ótimo!</p>
                </div>`;
            return;
        }

        grid.innerHTML = '';
        pending.forEach(call => {
            const card = buildCallCard(call);
            grid.appendChild(card);
        });
    }

    function buildCallCard(call) {
        const card = document.createElement('div');
        card.className = `call-card ${call.type}`;
        card.id = `call-card-${call.id}`;

        const typeIcon = call.type === 'garcom' ? 'fa-bell' : 'fa-file-invoice-dollar';
        const typeLabel = call.type === 'garcom' ? 'Chamada de Garçom' : 'Fechar Conta / Pix';
        const btnLabel = call.type === 'garcom' ? '<i class="fa-solid fa-check"></i> Marcar como Atendido' : '<i class="fa-solid fa-circle-check"></i> Confirmar Pagamento e Liberar Mesa';
        const timeStr = new Date(call.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        card.innerHTML = `
            <div class="call-card-header">
                <div class="call-card-icon"><i class="fa-solid ${typeIcon}"></i></div>
                <div class="call-card-info">
                    <h4>${typeLabel}</h4>
                    <div class="call-time"><i class="fa-regular fa-clock"></i> Solicitado às ${timeStr}</div>
                </div>
                <span class="call-mesa-badge">Mesa ${String(call.table_number).padStart(2, '0')}</span>
            </div>
            <div id="call-items-${call.id}"></div>
            <button class="btn-call-attend ${call.type}" id="btn-attend-${call.id}" data-id="${call.id}" data-type="${call.type}">
                ${btnLabel}
            </button>`;

        // If it's a billing call, load the consumed items
        if (call.type === 'conta') {
            fetch(`/api/mesas/${call.table_number}/conta`)
                .then(r => r.json())
                .then(data => {
                    const container = card.querySelector(`#call-items-${call.id}`);
                    if (!container || !data.items || data.items.length === 0) return;

                    let rowsHtml = data.items.map(item => `
                        <div class="call-item-row">
                            <span>${item.quantity}x ${item.name}</span>
                            <span>R$ ${item.total_price.toFixed(2).replace('.', ',')}</span>
                        </div>`).join('');

                    container.innerHTML = `
                        <div class="call-card-items">${rowsHtml}</div>
                        <div class="call-total-row">
                            <span>Total com serviço (10%)</span>
                            <strong>R$ ${data.total.toFixed(2).replace('.', ',')}</strong>
                        </div>`;
                })
                .catch(() => {});
        }

        // Attach attend button listener
        card.querySelector(`#btn-attend-${call.id}`).addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processando...';
            await attendCall(call.id);
        });

        return card;
    }

    async function attendCall(id) {
        try {
            const res = await fetch(`/api/chamados/${id}/atender`, { method: 'PUT' });
            if (!res.ok) throw new Error('Falha ao atender chamado.');
            const data = await res.json();
            activeCalls = activeCalls.filter(c => c.id !== id);
            updateCallsBadge();
            renderCalls(activeCalls);
            const msg = data.type === 'conta' ? '✅ Pagamento confirmado! Mesa liberada.' : '✅ Garçom marcado como atendido.';
            showToast(msg, 'success');
        } catch (err) {
            console.error(err);
            showToast('Erro ao processar chamado.', 'error');
            const btn = document.getElementById(`btn-attend-${id}`);
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-check"></i> Tentar novamente';
            }
        }
    }

    // Launch initial application setup
    init();
});
