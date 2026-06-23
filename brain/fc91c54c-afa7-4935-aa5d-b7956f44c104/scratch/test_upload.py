import json
import urllib.request
import urllib.error
import os

url_base = "http://127.0.0.1:8000"

def make_request(url, method="GET", data=None, headers=None):
    if headers is None:
        headers = {}
    req = urllib.request.Request(url, method=method, headers=headers)
    try:
        if data is not None:
            response = urllib.request.urlopen(req, data=data)
        else:
            response = urllib.request.urlopen(req)
        return response.code, response.read().decode('utf-8')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8')
    except urllib.error.URLError as e:
        return 500, str(e.reason)

def encode_multipart_formdata(filename, file_bytes, fieldname="file"):
    boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
    CRLF = b'\r\n'
    parts = []
    parts.append(b'--' + boundary.encode('utf-8'))
    parts.append(f'Content-Disposition: form-data; name="{fieldname}"; filename="{filename}"'.encode('utf-8'))
    parts.append(b'Content-Type: image/png')
    parts.append(b'')
    parts.append(file_bytes)
    parts.append(b'--' + boundary.encode('utf-8') + b'--')
    parts.append(b'')
    
    body = b'\r\n'.join(parts)
    headers = {'Content-Type': f'multipart/form-data; boundary={boundary}'}
    return body, headers

def run_test():
    print("1. Criando produto temporario...")
    payload = {
        "name": "Smash de Teste",
        "description": "Descricao de teste",
        "price": 25.00,
        "category": "Burgers",
        "image_url": "🍔",
        "available": True
    }
    
    headers = {"Content-Type": "application/json"}
    code, text = make_request(f"{url_base}/api/admin/produtos", method="POST", data=json.dumps(payload).encode('utf-8'), headers=headers)
    
    if code != 200:
        print(f"Erro ao criar produto: {code} - {text}")
        return
    
    prod = json.loads(text)
    prod_id = prod["id"]
    print(f"Produto criado com ID: {prod_id}")
    
    assert prod["image_url"] == "🍔"
    
    print("2. Fazendo upload de foto...")
    test_img = "frontend/images/burger_classic_smash.png"
    if not os.path.exists(test_img):
        print(f"Imagem de teste nao encontrada: {test_img}")
        return
        
    with open(test_img, "rb") as f:
        file_bytes = f.read()
        
    body, upload_headers = encode_multipart_formdata("burger_classic_smash.png", file_bytes)
    
    code_up, text_up = make_request(f"{url_base}/api/admin/produtos/{prod_id}/image", method="POST", data=body, headers=upload_headers)
        
    if code_up != 200:
        print(f"Erro ao enviar foto: {code_up} - {text_up}")
        return
        
    updated_prod = json.loads(text_up)
    print(f"Produto atualizado com imagem: {updated_prod['image_url']}")
    
    assert updated_prod["image_url"].startswith("/static/images/prod_")
    
    filename = updated_prod["image_url"].split("/")[-1]
    saved_filepath = f"frontend/images/{filename}"
    if os.path.exists(saved_filepath):
        print(f"Sucesso! Imagem salva em: {saved_filepath}")
    else:
        print(f"Falha! Imagem nao encontrada em: {saved_filepath}")
        return
        
    print("3. Removendo produto temporario...")
    code_del, text_del = make_request(f"{url_base}/api/admin/produtos/{prod_id}", method="DELETE")
    if code_del != 200:
        print(f"Erro ao deletar produto: {code_del} - {text_del}")
        return
        
    print("4. Verificando se imagem foi purgada do disco...")
    if not os.path.exists(saved_filepath):
        print("Sucesso! Imagem purgada corretamente do disco.")
    else:
        print("Falha! Imagem residual nao foi excluida.")
        
if __name__ == "__main__":
    run_test()
