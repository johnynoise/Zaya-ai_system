# Zaya-ai_system

Projeto estático pronto para deploy na Vercel.

## Deploy na Vercel

1. Faça push deste repositório para o GitHub.
2. No painel da Vercel, clique em **Add New Project**.
3. Importe o repositório.
4. Mantenha as configurações padrão.
   - Framework Preset: **Other**
   - Build Command: vazio
   - Output Directory: vazio
5. Faça o deploy.

## Estrutura esperada

- `index.html` como entrada principal
- `script.js` para a lógica da aplicação
- `style.css` para os estilos

## Observação

O arquivo `.vercelignore` evita que a pasta local `.venv` seja enviada para a Vercel.