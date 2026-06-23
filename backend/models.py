from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base

class Mesa(Base):
    __tablename__ = "mesas"

    number = Column(Integer, primary_key=True, index=True)
    status = Column(String, default="Livre")  # Livre, Ocupada

class Produto(Base):
    __tablename__ = "produtos"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    price = Column(Float, nullable=False)
    category = Column(String, nullable=False)  # Burgers, Acompanhamentos, Bebidas, Sobremesas
    image_url = Column(String, nullable=True)
    available = Column(Boolean, default=True)
    stock_quantity = Column(Integer, default=50)
    control_stock = Column(Boolean, default=False)
    options_json = Column(String, nullable=True)

class Pedido(Base):
    __tablename__ = "pedidos"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    table_number = Column(Integer, ForeignKey("mesas.number"), nullable=True)  # Null for takeaway
    total_price = Column(Float, default=0.0)
    status = Column(String, default="Pendente")  # Pendente, Em Preparo, Pronto, Entregue
    type = Column(String, default="Mesa")  # Mesa, Viagem
    paid = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    table = relationship("Mesa")
    items = relationship("PedidoItem", back_populates="order", cascade="all, delete-orphan")

class PedidoItem(Base):
    __tablename__ = "pedido_itens"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("pedidos.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("produtos.id"), nullable=False)
    quantity = Column(Integer, default=1)
    notes = Column(String, nullable=True)  # e.g., "Sem cebola"
    selected_adicionais = Column(String, nullable=True)

    # Relationships
    order = relationship("Pedido", back_populates="items")
    product = relationship("Produto")


class ChamadoMesa(Base):
    __tablename__ = "chamados_mesa"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    table_number = Column(Integer, nullable=False)
    type = Column(String, nullable=False)  # garcom, conta
    status = Column(String, default="Pendente")  # Pendente, Atendido
    created_at = Column(DateTime(timezone=True), server_default=func.now())
