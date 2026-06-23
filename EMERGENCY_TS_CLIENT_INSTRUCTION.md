# Instrução para enviar Emergency TS do app

## Objetivo
Enviar vídeo de emergência com pouco processamento no backend.

## Formato recomendado
Use o tipo de mensagem WebSocket:
```js
{
  type: 'emergency_ts',
  name: 'usuario1',
  filename: 'emergency.ts',
  data: '<base64 do chunk TS>'
}
```

## Fluxo ideal no app
1. Capturar o stream de vídeo e/ou áudio
2. Codificar em MPEG-TS no cliente (ou gerar chunks TS)
3. Cada vez que houver um pedaço TS pronto, enviar:
   - `type: 'emergency_ts'`
   - `name`: nome do usuário ou sala
   - `filename`: nome sugerido do arquivo TS
   - `data`: base64 do chunk TS
4. Quando terminar, enviar:
```js
{ type: 'stop_emergency' }
```

## Por que isso é melhor
- O backend não precisa decodificar ou transcodificar
- Ele recebe só base64 TS e faz append direto no arquivo
- Reduz muito o uso de CPU e memória do servidor

## Obs
Seu backend já faz:
- detectar a mensagem `emergency_ts`
- anexar o chunk no `.ts`
- retransmitir imediatamente para a sala
- encerrar com `stop_emergency`

## Exemplo de envio no app
```js
const payload = {
  type: 'emergency_ts',
  name: 'usuario1',
  filename: 'emergency.ts',
  data: base64TsChunk
};
ws.send(JSON.stringify(payload));
```

## Caso queira também retransmitir frames de imagem
Use este outro formato:
```js
{
  type: 'emergency_frame',
  name: 'usuario1',
  data: base64Frame
}
```

Mas para menor processamento e áudio preservado, prefira `emergency_ts`.
