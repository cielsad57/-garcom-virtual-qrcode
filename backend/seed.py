import sys
import os
# Add the current directory to sys.path to allow imports when running directly
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import SessionLocal, engine, Base
from backend.models import Mesa, Produto

def seed_database():
    print("Iniciando a criação das tabelas no banco de dados...")
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    
    # 1. Seed Mesas (1 a 10)
    print("Semeando mesas...")
    existing_tables = db.query(Mesa).count()
    if existing_tables == 0:
        for i in range(1, 11):
            mesa = Mesa(number=i, status="Livre")
            db.add(mesa)
        db.commit()
        print("10 mesas criadas com sucesso!")
    else:
        print(f"Mesas já existem no banco ({existing_tables} encontradas).")

    # 2. Seed Produtos
    print("Semeando cardápio...")
    existing_products = db.query(Produto).count()
    if existing_products == 0:
        produtos_dados = [
            # --- BURGERS ---
            {
                "name": "Classic Smash Burger",
                "description": "Dois smash burgers de 80g blend bovino, queijo cheddar derretido, alface crespa, tomate fresco, picles artesanal e molho da casa no pão brioche selado na manteiga.",
                "price": 32.90,
                "category": "Burgers",
                "image_url": "🍔",
                "available": True
            },
            {
                "name": "Double Bacon Cheddar",
                "description": "Dois hambúrgueres de 120g blend angus, muito bacon crocante, cheddar cremoso injetado, cebola caramelizada e maionese defumada no pão australiano.",
                "price": 42.90,
                "category": "Burgers",
                "image_url": "🥓",
                "available": True
            },
            {
                "name": "Truffle Gorgonzola",
                "description": "Blend Angus de 150g, creme de gorgonzola dolce, rúcula baby fresca, mel trufado e cebola crispy no pão brioche.",
                "price": 45.90,
                "category": "Burgers",
                "image_url": "🧀",
                "available": True
            },
            {
                "name": "Green Veggie Burger",
                "description": "Hambúrguer de grão-de-bico e ervas finas de 120g, queijo coalho grelhado, mix de folhas, tomate seco e molho chimichurri artesanal no pão integral.",
                "price": 34.90,
                "category": "Burgers",
                "image_url": "🌱",
                "available": True
            },
            
            # --- ACOMPANHAMENTOS ---
            {
                "name": "Batata Frita Rústica",
                "description": "Batatas cortadas rusticamente, fritas com casca, temperadas com sal marinho, alecrim fresco e páprica defumada. Acompanha maionese verde.",
                "price": 18.00,
                "category": "Acompanhamentos",
                "image_url": "🍟",
                "available": True
            },
            {
                "name": "Anéis de Cebola Crocantes",
                "description": "Anéis de cebola gigantes empanados na farinha Panko super crocantes. Acompanha molho barbecue artesanal.",
                "price": 16.50,
                "category": "Acompanhamentos",
                "image_url": "🧅",
                "available": True
            },
            {
                "name": "Coxinha de Costela",
                "description": "Porção com 6 mini coxinhas sem massa, recheadas puramente com costela bovina desfiada e queijo catupiry original, empanadas e fritas.",
                "price": 24.90,
                "category": "Acompanhamentos",
                "image_url": "🍗",
                "available": True
            },

            # --- BEBIDAS ---
            {
                "name": "Suco Natural de Laranja",
                "description": "Suco natural espremido na hora, super refrescante e rico em vitamina C. Copo de 400ml.",
                "price": 9.90,
                "category": "Bebidas",
                "image_url": "🍊",
                "available": True
            },
            {
                "name": "Chopp IPA Artesanal",
                "description": "Chopp artesanal do estilo India Pale Ale, aromático, com notas cítricas de lúpulo e amargor marcante. Caneco congelado 400ml.",
                "price": 14.00,
                "category": "Bebidas",
                "image_url": "🍺",
                "available": True
            },
            {
                "name": "Soda Italiana de Limão Siciliano",
                "description": "Bebida gaseificada refrescante feita com xarope artesanal de limão siciliano, gelo e hortelã.",
                "price": 11.90,
                "category": "Bebidas",
                "image_url": "🥤",
                "available": True
            },
            {
                "name": "Refrigerante Lata",
                "description": "Coca-Cola Original ou Zero Açúcar gelada em lata (350ml).",
                "price": 6.50,
                "category": "Bebidas",
                "image_url": "🥤",
                "available": True
            },

            # --- SOBREMESAS ---
            {
                "name": "Grand Gateau",
                "description": "Bolo de chocolate quente com calda de chocolate belga, acompanhado de picolé Magnum de baunilha e morangos frescos fatiados.",
                "price": 28.90,
                "category": "Sobremesas",
                "image_url": "🍰",
                "available": True
            },
            {
                "name": "Waffle com Nutella e Morango",
                "description": "Waffle belga quentinho feito na hora, coberto com bastante creme de avelã Nutella, morangos frescos picados e polvilhado com açúcar de confeiteiro.",
                "price": 22.90,
                "category": "Sobremesas",
                "image_url": "🧇",
                "available": True
            }
        ]

        for item in produtos_dados:
            produto = Produto(**item)
            db.add(produto)
        db.commit()
        print("Cardápio gourmet semeado com sucesso!")
    else:
        print(f"Cardápio já existe no banco ({existing_products} itens encontrados).")

    db.close()
    print("Processo de semente do banco de dados concluído com sucesso!")

if __name__ == "__main__":
    seed_database()
