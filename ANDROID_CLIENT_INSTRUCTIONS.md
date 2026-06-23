Instruções do aplicativo Android (PTT) — envio de SOS e streaming de frames

1. O Alerta Inicial (Chat de Emergência)

Assim que você toca no botão SOS, o método `sendEmergencyAlert()` no `PttService.kt` envia um objeto JSON para o servidor.

Formato enviado:

JSON
{
  "type": "chat",
  "name": "NomeDoUsuario",
  "message": "🚨 ALERTA DE EMERGÊNCIA ACIONADO! 🚨",
  "emergency": true
}

- Por que `type: "chat"`? Para que o servidor repasse essa mensagem imediatamente para o campo de texto de todos os usuários.
- O diferencial: a flag `"emergency": true` é o que faz o servidor tratar isso como prioridade e faz os outros apps exibirem o alerta vermelho na tela.

2. O Streaming de Vídeo (Frames da Câmera)

Imediatamente após o alerta, o aplicativo inicia a captura da câmera (CameraX). Em vez de enviar um arquivo de vídeo pesado,
envia-se uma sequência rápida de fotos (frames) em Base64 para garantir funcionamento em redes 3G/4G.

Formato enviado repetidamente (cada frame):

JSON
{
  "type": "emergency_video",
  "name": "NomeDoUsuario",
  "data": "/9j/4AAQSkZJRgABAQAAAQABAAD...", // Frame em Base64
  "emergency": true
}

- `type: "emergency_video"`: indica ao backend que esses dados devem ir para a função `flushPendingEmergencyVideo` (ou para a lógica de agregação de frames) e serem processados com o FFmpeg quando necessário.
- `data`: contém o frame da câmera convertido em string Base64.
- `emergency: true`: garante que o servidor trate e salve esses frames/frames-processados na pasta `emergency_images`.

3. Comportamento esperado no backend

- Ao receber `{ type: 'chat', emergency: true }` o servidor deve repassar a mensagem imediatamente para todos no room (alerta inicial).
- Ao receber múltiplos `{ type: 'emergency_video' }` ou `{ type: 'emergency_frame' }`:
  - O servidor pode agrupar frames em `pendingEmergencyVideo` por conexão, acumular chunks e, após timeout ou tamanho suficiente, rodar FFmpeg para gerar MP4.
  - Alternativamente, pode salvar cada frame como imagem e gerar vídeo offline.
- Para reduzir problemas de transporte, o servidor pode salvar a mídia no disco e enviar para os demais clientes apenas uma notificação leve com a URL do arquivo (ex.: `emergency_image_url`).

4. Exemplo de fluxo no `PttService.kt`

1. `sendEmergencyAlert()`
   - Envia o JSON do chat (com `emergency: true`) e chama `startEmergencyVideoStream()`.
2. `startEmergencyVideoStream()`
   - Inicializa CameraX e começa a capturar frames.
3. `processEmergencyFrame()` (executado para cada frame)
   - Converte bitmap para JPEG com qualidade baixa (ex.: 30%) para reduzir tamanho.
   - Codifica em Base64 e envia via `webSocket?.send(JSON.stringify(payload))`.

5. Dicas de implementação e robustez

- Reduza qualidade JPEG (ex.: 20–40%) e resolução para frames de emergência.
- Envie frames rapidamente (ex.: 2–5 fps) para cobrir a cena sem consumir muita banda.
- Adicione retry/backoff local se o envio falhar.
- Use `type: 'stop_emergency'` ao encerrar a transmissão para permitir flush no servidor.
- Se possível, envie mini-thumbnails adicionais (campo `thumbnail`) para preview rápido no cliente.

6. Exemplos de mensagens auxiliares

- Chunk TS (quando o cliente produz MPEG-TS):
{
  "type": "emergency_ts",
  "name": "NomeDoUsuario",
  "filename": "sugestao.ts",
  "data": "<base64 do chunk TS>"
}

- Encerrar gravação:
{
  "type": "stop_emergency"
}

7. Resumo

- `chat` + `emergency: true` = alerta imediato para todos.
- `emergency_video` (frames Base64) = streaming leve de imagens, acumuladas no servidor e processadas em vídeo.
- O servidor deve preferir salvar mídia e notificar por URL (`emergency_image_url`) em vez de retransmitir grandes base64 via WebSocket.


Arquivo de referência: `ANDROID_CLIENT_INSTRUCTIONS.md` (adicionado ao repositório)
