# Como rodar o app (Mobile)

## Pré-requisito (uma vez na vida)
Instalar o **Node.js**: <https://nodejs.org/>
Escolha a versão **LTS** e instale com as opções padrão.

## Como abrir no dia-a-dia
1. Dê duplo-clique no arquivo **`iniciar-app.bat`**
2. Espere aparecer no terminal algo como:
   ```
   Local:   http://localhost:5173/Cottolengo_Escala_Mobile/
   ```
3. Copie essa URL e cole no Chrome ou Edge
4. Pronto! O app abre

> **Importante:** não feche a janela preta do terminal enquanto estiver usando o app — ela é o servidor que mantém o app no ar.

## Solução de problemas

**"Node.js nao encontrado"**
Instale o Node.js: <https://nodejs.org/>

**Tela branca**
F12 → aba **Application** → **Service Workers** → **Unregister** → Ctrl+Shift+R

**A janela do terminal fecha sozinha**
Abra o terminal manualmente (Win+R → cmd) e rode:
```
cd /d "C:\Users\happy\OneDrive\Área de Trabalho\Projetos\Projetos Cottolengo\Projeto Escalas\Mobile_Novo_Projeto"
npm run dev
```
Me mande qualquer erro que aparecer.
