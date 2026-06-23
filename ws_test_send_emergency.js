const WebSocket = require('ws');
const url = 'ws://localhost:3000';

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

(async ()=>{
  const ws = new WebSocket(url);
  ws.on('open', async ()=>{
    console.log('connected to', url);
    // register (room 'teste' and name Fabio to match examples)
    ws.send(JSON.stringify({ type: 'register', room: 'teste', name: 'Fabio', peerId: 'ptt-56' }));
    await sleep(200);

    // Send initial chat emergency
    const alert = { type: 'chat', name: 'Adriano', message: '🚨 ALERTA DE EMERGÊNCIA ACIONADO! 🚨', emergency: true };
    console.log('sending emergency chat');
    ws.send(JSON.stringify(alert));
    await sleep(200);

    // Small 1x1 GIF base64 (data URI) for lightweight testing
    const onePixelGif = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

    // Send multiple frames as emergency_video
    console.log('sending frames');
    for (let i=0;i<5;i++){
      const payload = { type: 'emergency_video', name: 'Fabio', data: onePixelGif, thumbnail: onePixelGif, emergency: true };
      ws.send(JSON.stringify(payload));
      await sleep(250);
    }

    // Signal stop
    console.log('sending stop_emergency');
    ws.send(JSON.stringify({ type: 'stop_emergency' }));

    // wait a bit to receive server responses
    await sleep(2000);
    console.log('closing');
    ws.close();
  });

  ws.on('message', (m)=>{ try { console.log('recv', m.toString().slice(0,1000)); } catch(e){} });
  ws.on('error', (e)=>{ console.error('err', e); });
})();
