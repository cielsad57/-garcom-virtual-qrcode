import sys
import os
import uvicorn
import webbrowser
import threading
import time

# Garante que o pacote backend seja importável se executado como script diretamente
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.main import app

def open_browser():
    # Aguarda o Uvicorn subir antes de abrir a página
    time.sleep(2.0)
    webbrowser.open("http://localhost:8000")

if __name__ == "__main__":
    # Inicia a thread que abre o navegador padrão
    threading.Thread(target=open_browser, daemon=True).start()
    
    # Roda o servidor Uvicorn
    print("Iniciando o servidor do Garçom Virtual...")
    print("Acesse em seu navegador: http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
