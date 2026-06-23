from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.encoders import jsonable_encoder
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import sys
from fastapi import UploadFile, File
import shutil
import uuid

from backend.database import get_db, engine, Base
from backend.models import Mesa, Produto, Pedido, PedidoItem, ChamadoMesa
from backend.schemas import PedidoCreate, Pedido as PedidoSchema, Mesa as MesaSchema, MesaUpdate, Produto as ProdutoSchema, ProdutoCreate, ProdutoUpdate, AdminStats, ChamadoMesa as ChamadoMesaSchema, ChamadoMesaCreate
from backend.seed import seed_database

# PyInstaller paths setup
IS_PACKAGED = getattr(sys, 'frozen', False)
if IS_PACKAGED:
    BASE_DIR = sys._MEIPASS
    PERSISTENT_IMAGES_DIR = os.path.abspath("images")
else:
    BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    PERSISTENT_IMAGES_DIR = os.path.join(BASE_DIR, "frontend", "images")

FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
os.makedirs(PERSISTENT_IMAGES_DIR, exist_ok=True)

# Create tables if not exists
Base.metadata.create_all(bind=engine)

# Auto-seed database if new
try:
    seed_database()
except Exception as e:
    print(f"Erro ao semear banco de dados automaticamente: {e}")

# Automatic database migrations for SQLite (adds columns if they don't exist)
try:
    with engine.connect() as conn:
        from sqlalchemy import text
        # Check and add 'paid' column to pedidos
        result = conn.execute(text("PRAGMA table_info(pedidos)"))
        columns = [row[1] for row in result.fetchall()]
        if "paid" not in columns:
            conn.execute(text("ALTER TABLE pedidos ADD COLUMN paid BOOLEAN DEFAULT 0"))
            conn.commit()
            print("Auto-Migration: Added 'paid' column to 'pedidos' table.")
        # Check and add 'selected_adicionais' column to pedido_itens
        result2 = conn.execute(text("PRAGMA table_info(pedido_itens)"))
        columns2 = [row[1] for row in result2.fetchall()]
        if "selected_adicionais" not in columns2:
            conn.execute(text("ALTER TABLE pedido_itens ADD COLUMN selected_adicionais TEXT"))
            conn.commit()
            print("Auto-Migration: Added 'selected_adicionais' column to 'pedido_itens' table.")
except Exception as e:
    print(f"Erro ao aplicar migração automática: {e}")

app = FastAPI(
    title="Restaurante Inteligente API",
    description="Backend para automação de pedidos de restaurantes via Totem e QR Code",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- WEBSOCKET KITCHEN MANAGER ---
class KitchenConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"Nova conexão WebSocket na Cozinha. Total de conexões: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            print(f"Conexão WebSocket encerrada. Restantes: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        print(f"Transmitindo evento via WebSocket: {message.get('event')}")
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                # Silently skip failed connections (they will be cleaned up on disconnect)
                print(f"Erro ao transmitir WebSocket para conexão: {e}")

manager = KitchenConnectionManager()

@app.websocket("/ws/kitchen")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # We just keep the connection alive.
            # If kitchen sends messages (e.g. status changes, although they are mostly HTTP PUT calls), we can process here.
            data = await websocket.receive_text()
            print("Mensagem recebida do WebSocket cliente")
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# --- API ROUTES ---

# 1. PRODUTOS (CARDÁPIO)
@app.get("/api/produtos", response_model=List[ProdutoSchema])
def get_produtos(db: Session = Depends(get_db)):
    return db.query(Produto).filter(Produto.available == True).all()

# 2. MESAS
@app.get("/api/mesas", response_model=List[MesaSchema])
def get_mesas(db: Session = Depends(get_db)):
    return db.query(Mesa).all()

@app.put("/api/mesas/{number}", response_model=MesaSchema)
async def update_mesa(number: int, status_update: MesaUpdate, db: Session = Depends(get_db)):
    mesa = db.query(Mesa).filter(Mesa.number == number).first()
    if not mesa:
        raise HTTPException(status_code=404, detail="Mesa não encontrada.")
    mesa.status = status_update.status
    db.commit()
    db.refresh(mesa)
    
    # Notify admin dashboard/kitchen apps via WebSocket
    response_data = MesaSchema.model_validate(mesa)
    await manager.broadcast({
        "event": "status_update",
        "table_number": number,
        "status": mesa.status,
        "mesa": jsonable_encoder(response_data)
    })
    
    return mesa

# 3. PEDIDOS
@app.get("/api/pedidos", response_model=List[PedidoSchema])
def get_pedidos(status: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Pedido)
    if status:
        query = query.filter(Pedido.status == status)
    # Order by ID ascending so oldest pending is on top
    return query.order_by(Pedido.id.asc()).all()

@app.post("/api/pedidos", response_model=PedidoSchema)
async def create_pedido(pedido_in: PedidoCreate, db: Session = Depends(get_db)):
    # 1. Validations
    if pedido_in.type == "Mesa":
        if not pedido_in.table_number:
            raise HTTPException(status_code=400, detail="Número da mesa é obrigatório para pedidos do tipo Mesa.")
        mesa = db.query(Mesa).filter(Mesa.number == pedido_in.table_number).first()
        if not mesa:
            raise HTTPException(status_code=400, detail="Mesa informada não existe.")
        # Mark table as occupied
        mesa.status = "Ocupada"

    # 2. Calculate prices & create items
    total_price = 0.0
    db_items = []
    
    for item in pedido_in.items:
        product = db.query(Produto).filter(Produto.id == item.product_id).first()
        if not product:
            raise HTTPException(status_code=400, detail=f"Produto com ID {item.product_id} não encontrado.")
        if not product.available:
            raise HTTPException(status_code=400, detail=f"Produto '{product.name}' não está disponível no momento.")
        
        total_price += product.price * item.quantity
        
        db_item = PedidoItem(
            product_id=item.product_id,
            quantity=item.quantity,
            notes=item.notes
        )
        db_items.append(db_item)

    # 3. Save order
    pedido = Pedido(
        table_number=pedido_in.table_number if pedido_in.type == "Mesa" else None,
        type=pedido_in.type,
        total_price=round(total_price, 2),
        status="Pendente",
        items=db_items
    )
    
    db.add(pedido)
    db.commit()
    db.refresh(pedido)

    # Convert to schema format for serialization
    response_data = PedidoSchema.model_validate(pedido)
    
    # 4. Notify kitchen via WebSocket
    await manager.broadcast({
        "event": "new_order",
        "order": jsonable_encoder(response_data)
    })

    return pedido

@app.put("/api/pedidos/{id}/status", response_model=PedidoSchema)
async def update_pedido_status(id: int, status_update: MesaUpdate, db: Session = Depends(get_db)):
    pedido = db.query(Pedido).filter(Pedido.id == id).first()
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")
    
    valid_statuses = ["Pendente", "Em Preparo", "Pronto", "Entregue"]
    new_status = status_update.status
    if new_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Status inválido. Escolha entre: {', '.join(valid_statuses)}")
    
    pedido.status = new_status
    
    db.commit()
    db.refresh(pedido)
    
    response_data = PedidoSchema.model_validate(pedido)
    
    # Notify kitchen and client apps via WebSocket
    await manager.broadcast({
        "event": "status_update",
        "order_id": pedido.id,
        "status": new_status,
        "order": jsonable_encoder(response_data)
    })
    
    return pedido

# --- PIX GENERATOR & BILLING FLOW ---

def crc16_ccitt(data: str) -> str:
    crc = 0xFFFF
    for char in data:
        crc ^= (ord(char) << 8)
        for _ in range(8):
            if crc & 0x8000:
                crc = (crc << 1) ^ 0x1021
            else:
                crc = crc << 1
            crc &= 0xFFFF
    return f"{crc:04X}"

def generate_pix_payload(amount: float, mesa_num: int) -> str:
    payload_indicator = "000201"
    
    gui = "0014br.gov.bcb.pix"
    key = "financeiro@restaurantetech.com.br"
    key_formatted = f"01{len(key):02d}{key}"
    desc = f"Mesa {mesa_num:02d}"
    desc_formatted = f"02{len(desc):02d}{desc}"
    
    merchant_info_value = f"{gui}{key_formatted}{desc_formatted}"
    merchant_info = f"26{len(merchant_info_value):02d}{merchant_info_value}"
    
    mcc = "52040000"
    currency = "5303986" # BRL
    
    amount_str = f"{amount:.2f}"
    amount_field = f"54{len(amount_str):02d}{amount_str}"
    
    country = "5802BR"
    name = "Restaurante Tech"
    name_field = f"59{len(name):02d}{name}"
    
    city = "Sao Paulo"
    city_field = f"60{len(city):02d}{city}"
    
    ref = f"MESA{mesa_num:02d}"
    ref_formatted = f"05{len(ref):02d}{ref}"
    additional_data = f"62{len(ref_formatted):02d}{ref_formatted}"
    
    pre_payload = f"{payload_indicator}{merchant_info}{mcc}{currency}{amount_field}{country}{name_field}{city_field}{additional_data}6304"
    crc = crc16_ccitt(pre_payload)
    
    return f"{pre_payload}{crc}"

@app.get("/api/mesas/{number}/conta")
def get_mesa_conta(number: int, db: Session = Depends(get_db)):
    mesa = db.query(Mesa).filter(Mesa.number == number).first()
    if not mesa:
        raise HTTPException(status_code=404, detail="Mesa não encontrada.")
    
    if mesa.status != "Ocupada":
        return {
            "table_number": number,
            "status": "Livre",
            "orders": [],
            "items": [],
            "subtotal": 0.0,
            "service_tax": 0.0,
            "total": 0.0,
            "pix_payload": ""
        }
    
    # Get all orders for this table that are not paid yet
    orders = db.query(Pedido).filter(
        Pedido.table_number == number,
        Pedido.paid == False,
        Pedido.status.in_(["Pendente", "Em Preparo", "Pronto", "Entregue"])
    ).all()
    
    items_summary = {}
    subtotal = 0.0
    
    for order in orders:
        for item in order.items:
            product = item.product
            key = (product.id, product.name)
            if key not in items_summary:
                items_summary[key] = {
                    "product_id": product.id,
                    "name": product.name,
                    "quantity": 0,
                    "unit_price": product.price,
                    "image_url": product.image_url
                }
            items_summary[key]["quantity"] += item.quantity
            subtotal += product.price * item.quantity
            
    items_list = []
    for (prod_id, name), info in items_summary.items():
        items_list.append({
            "product_id": prod_id,
            "name": name,
            "quantity": info["quantity"],
            "unit_price": info["unit_price"],
            "total_price": round(info["unit_price"] * info["quantity"], 2),
            "image_url": info["image_url"]
        })
        
    service_tax = round(subtotal * 0.10, 2) # 10% service charge
    total = round(subtotal + service_tax, 2)
    
    pix_payload = ""
    if total > 0:
        pix_payload = generate_pix_payload(total, number)
        
    return {
        "table_number": number,
        "status": "Ocupada",
        "orders": [o.id for o in orders],
        "items": items_list,
        "subtotal": round(subtotal, 2),
        "service_tax": service_tax,
        "total": total,
        "pix_payload": pix_payload
    }

@app.get("/api/chamados", response_model=List[ChamadoMesaSchema])
def get_chamados(status: Optional[str] = "Pendente", db: Session = Depends(get_db)):
    query = db.query(ChamadoMesa)
    if status:
        query = query.filter(ChamadoMesa.status == status)
    return query.order_by(ChamadoMesa.created_at.asc()).all()

@app.post("/api/chamados", response_model=ChamadoMesaSchema)
async def create_chamado(chamado_in: ChamadoMesaCreate, db: Session = Depends(get_db)):
    mesa = db.query(Mesa).filter(Mesa.number == chamado_in.table_number).first()
    if not mesa:
        raise HTTPException(status_code=400, detail="Mesa não cadastrada.")
        
    existing = db.query(ChamadoMesa).filter(
        ChamadoMesa.table_number == chamado_in.table_number,
        ChamadoMesa.type == chamado_in.type,
        ChamadoMesa.status == "Pendente"
    ).first()
    
    if existing:
        return existing
        
    if mesa.status != "Ocupada":
        mesa.status = "Ocupada"
        
    chamado = ChamadoMesa(
        table_number=chamado_in.table_number,
        type=chamado_in.type,
        status="Pendente"
    )
    db.add(chamado)
    db.commit()
    db.refresh(chamado)
    
    response_data = ChamadoMesaSchema.model_validate(chamado)
    await manager.broadcast({
        "event": "new_call",
        "call": jsonable_encoder(response_data)
    })
    
    return chamado

@app.put("/api/chamados/{id}/atender", response_model=ChamadoMesaSchema)
async def atender_chamado(id: int, db: Session = Depends(get_db)):
    chamado = db.query(ChamadoMesa).filter(ChamadoMesa.id == id).first()
    if not chamado:
        raise HTTPException(status_code=404, detail="Chamado não encontrado.")
        
    chamado.status = "Atendido"
    
    if chamado.type == "conta":
        mesa = db.query(Mesa).filter(Mesa.number == chamado.table_number).first()
        if mesa:
            mesa.status = "Livre"
            
        orders = db.query(Pedido).filter(
            Pedido.table_number == chamado.table_number,
            Pedido.paid == False
        ).all()
        for order in orders:
            order.paid = True
            order.status = "Entregue"
            
    db.commit()
    db.refresh(chamado)
    
    response_data = ChamadoMesaSchema.model_validate(chamado)
    await manager.broadcast({
        "event": "payment_confirmed" if chamado.type == "conta" else "call_resolved",
        "table_number": chamado.table_number,
        "call_id": chamado.id,
        "call": jsonable_encoder(response_data)
    })
    
    return chamado

# --- ADMIN ROUTES ---

# Admin: Get ALL products (including unavailable)
@app.get("/api/admin/produtos", response_model=List[ProdutoSchema])
def admin_get_all_produtos(db: Session = Depends(get_db)):
    return db.query(Produto).order_by(Produto.id.asc()).all()

# Admin: Create new product
@app.post("/api/admin/produtos", response_model=ProdutoSchema)
def admin_create_produto(produto_in: ProdutoCreate, db: Session = Depends(get_db)):
    produto = Produto(**produto_in.model_dump())
    db.add(produto)
    db.commit()
    db.refresh(produto)
    return produto

# Admin: Update product
@app.put("/api/admin/produtos/{id}", response_model=ProdutoSchema)
def admin_update_produto(id: int, produto_in: ProdutoUpdate, db: Session = Depends(get_db)):
    produto = db.query(Produto).filter(Produto.id == id).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
    update_data = produto_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(produto, key, value)
    db.commit()
    db.refresh(produto)
    return produto

# Admin: Upload product image
@app.post("/api/admin/produtos/{id}/image", response_model=ProdutoSchema)
def admin_upload_produto_image(id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    produto = db.query(Produto).filter(Produto.id == id).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
    
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="O arquivo enviado não é uma imagem válida.")
        
    os.makedirs(PERSISTENT_IMAGES_DIR, exist_ok=True)
    
    # Get extension
    ext = os.path.splitext(file.filename)[1]
    if not ext:
        ext = ".png"
        
    # Delete old image if it was a custom upload
    if produto.image_url and produto.image_url.startswith("/static/images/prod_"):
        old_filename = produto.image_url.split("/")[-1]
        old_filepath = os.path.join(PERSISTENT_IMAGES_DIR, old_filename)
        if os.path.exists(old_filepath):
            try:
                os.remove(old_filepath)
            except Exception as e:
                print(f"Erro ao deletar imagem antiga: {e}")
                
    filename = f"prod_{id}_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(PERSISTENT_IMAGES_DIR, filename)
    
    try:
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar imagem no servidor: {e}")
        
    produto.image_url = f"/static/images/{filename}"
    db.commit()
    db.refresh(produto)
    return produto


# Admin: Toggle product availability
@app.patch("/api/admin/produtos/{id}/toggle", response_model=ProdutoSchema)
def admin_toggle_produto(id: int, db: Session = Depends(get_db)):
    produto = db.query(Produto).filter(Produto.id == id).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
    produto.available = not produto.available
    db.commit()
    db.refresh(produto)
    return produto

# Admin: Delete product
@app.delete("/api/admin/produtos/{id}")
def admin_delete_produto(id: int, db: Session = Depends(get_db)):
    produto = db.query(Produto).filter(Produto.id == id).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
        
    # Delete image if custom upload
    if produto.image_url and produto.image_url.startswith("/static/images/prod_"):
        filename = produto.image_url.split("/")[-1]
        filepath = os.path.join(PERSISTENT_IMAGES_DIR, filename)
        if os.path.exists(filepath):
            try:
                os.remove(filepath)
            except Exception as e:
                print(f"Erro ao deletar imagem ao remover produto: {e}")
                
    db.delete(produto)
    db.commit()
    return {"ok": True, "message": f"Produto '{produto.name}' removido."}

# Admin: Get stats for today
@app.get("/api/admin/stats", response_model=AdminStats)
def admin_get_stats(db: Session = Depends(get_db)):
    from datetime import date
    from sqlalchemy import func as sqlfunc
    
    today = date.today()
    
    pedidos_hoje = db.query(Pedido).filter(
        sqlfunc.date(Pedido.created_at) == today
    ).all()
    
    receita_hoje = sum(p.total_price for p in pedidos_hoje)
    pendentes = db.query(Pedido).filter(Pedido.status == "Pendente").count()
    em_preparo = db.query(Pedido).filter(Pedido.status == "Em Preparo").count()
    prontos = db.query(Pedido).filter(Pedido.status == "Pronto").count()
    mesas_ocupadas = db.query(Mesa).filter(Mesa.status == "Ocupada").count()
    mesas_livres = db.query(Mesa).filter(Mesa.status == "Livre").count()
    
    return AdminStats(
        total_pedidos_hoje=len(pedidos_hoje),
        receita_hoje=round(receita_hoje, 2),
        pedidos_pendentes=pendentes,
        pedidos_em_preparo=em_preparo,
        pedidos_prontos=prontos,
        mesas_ocupadas=mesas_ocupadas,
        mesas_livres=mesas_livres,
    )

# Admin: Clear all delivered orders
@app.delete("/api/admin/pedidos/limpar")
def admin_limpar_pedidos_entregues(db: Session = Depends(get_db)):
    pedidos = db.query(Pedido).filter(Pedido.status == "Entregue").all()
    count = len(pedidos)
    for p in pedidos:
        db.delete(p)
    db.commit()
    return {"ok": True, "removed": count}

# --- FRONTEND PAGES SERVING ---
# Ensure directories exist (only when running in development mode)
if not IS_PACKAGED:
    os.makedirs(os.path.join(FRONTEND_DIR, "client"), exist_ok=True)
    os.makedirs(os.path.join(FRONTEND_DIR, "totem"), exist_ok=True)
    os.makedirs(os.path.join(FRONTEND_DIR, "kitchen"), exist_ok=True)
    os.makedirs(os.path.join(FRONTEND_DIR, "qrcodes"), exist_ok=True)
    os.makedirs(os.path.join(FRONTEND_DIR, "admin"), exist_ok=True)

# Mount persistent uploaded images folder first so it overrides /static/images path
app.mount("/static/images", StaticFiles(directory=PERSISTENT_IMAGES_DIR), name="static_images")

# Mount separate static directories
app.mount("/client", StaticFiles(directory=os.path.join(FRONTEND_DIR, "client"), html=True), name="client")
app.mount("/totem", StaticFiles(directory=os.path.join(FRONTEND_DIR, "totem"), html=True), name="totem")
app.mount("/kitchen", StaticFiles(directory=os.path.join(FRONTEND_DIR, "kitchen"), html=True), name="kitchen")
app.mount("/admin", StaticFiles(directory=os.path.join(FRONTEND_DIR, "admin"), html=True), name="admin")
app.mount("/qrcodes", StaticFiles(directory=os.path.join(FRONTEND_DIR, "qrcodes"), html=True), name="qrcodes")

# Serve a global Hub dashboard on '/'
@app.get("/")
def read_root():
    # If the hub index.html exists, serve it, else direct to client
    if os.path.exists(os.path.join(FRONTEND_DIR, "index.html")):
        return RedirectResponse(url="/static/index.html")
    return RedirectResponse(url="/client/index.html")

# Serve a global assets/shared assets (or hub index.html)
app.mount("/static", StaticFiles(directory=FRONTEND_DIR, html=True), name="static")
