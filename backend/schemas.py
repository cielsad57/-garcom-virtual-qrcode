from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

# --- PRODUTO SCHEMAS ---
class ProdutoBase(BaseModel):
    name: str
    description: Optional[str] = None
    price: float
    category: str
    image_url: Optional[str] = None
    available: Optional[bool] = True
    stock_quantity: Optional[int] = 50
    control_stock: Optional[bool] = False
    options_json: Optional[str] = None

class ProdutoCreate(ProdutoBase):
    pass

class ProdutoUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    category: Optional[str] = None
    image_url: Optional[str] = None
    available: Optional[bool] = None
    stock_quantity: Optional[int] = None
    control_stock: Optional[bool] = None
    options_json: Optional[str] = None

class Produto(ProdutoBase):
    id: int

    model_config = {"from_attributes": True}


# --- PEDIDO ITEM SCHEMAS ---
class PedidoItemBase(BaseModel):
    product_id: int
    quantity: int = Field(..., gt=0)
    notes: Optional[str] = None
    selected_adicionais: Optional[str] = None

class PedidoItemCreate(PedidoItemBase):
    pass

class PedidoItem(PedidoItemBase):
    id: int
    order_id: int
    product: Produto

    model_config = {"from_attributes": True}


# --- PEDIDO SCHEMAS ---
class PedidoBase(BaseModel):
    table_number: Optional[int] = None
    type: str = "Mesa"  # Mesa, Viagem

class PedidoCreate(PedidoBase):
    items: List[PedidoItemCreate]

class Pedido(PedidoBase):
    id: int
    total_price: float
    status: str
    paid: bool
    created_at: datetime
    items: List[PedidoItem]

    model_config = {"from_attributes": True}


# --- MESA SCHEMAS ---
class MesaBase(BaseModel):
    number: int
    status: str = "Livre"

class MesaUpdate(BaseModel):
    status: str

class Mesa(MesaBase):
    model_config = {"from_attributes": True}


# --- ADMIN SCHEMAS ---
class AdminStats(BaseModel):
    total_pedidos_hoje: int
    receita_hoje: float
    pedidos_pendentes: int
    pedidos_em_preparo: int
    pedidos_prontos: int
    mesas_ocupadas: int
    mesas_livres: int


# --- CHAMADO MESA SCHEMAS ---
class ChamadoMesaBase(BaseModel):
    table_number: int
    type: str  # garcom, conta

class ChamadoMesaCreate(ChamadoMesaBase):
    pass

class ChamadoMesa(ChamadoMesaBase):
    id: int
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}
