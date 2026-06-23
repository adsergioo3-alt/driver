// 1. IMPORTAÇÕES E CONFIGURAÇÃO DO BINÁRIO
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);

const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const fs = require('fs');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(cors());

// --- CONFIGURAÇÃO DE DIRETÓRIOS E VARIÁVEIS ---
const EMERGENCY_DIR = path.join(__dirname, 'emergency_images');
const EMERGENCY_META = path.join(EMERGENCY_DIR, 'meta.json');
let emergencyImages = [];
const USUARIOS_FILE = path.join(__dirname, 'usuarios.json');
let usuarios = [];
const rooms = new Map(); // roomName -> Map(ws -> userData)
let lastLocationUpdate = null;

// Funções de utilidade e gerenciamento de arquivos (mantidas do seu original)
function ensureEmergencyDir() { if (!fs.existsSync(EMERGENCY_DIR)) fs.mkdirSync(EMERGENCY_DIR, { recursive: true }); }
ensureEmergencyDir();

// Carregar usuários (planos) do arquivo usuarios.json (usando caminho absoluto)
function loadUsuarios() {
    try {
        if (fs.existsSync(USUARIOS_FILE)) {
            const data = fs.readFileSync(USUARIOS_FILE, 'utf-8');
            usuarios = JSON.parse(data) || [];
            console.log(`✓ ${usuarios.length} usuários carregados de usuarios.json`);
        } else {
            usuarios = [];
            console.log('ℹ usuarios.json não encontrado — iniciando com lista vazia');
        }
    } catch (e) {
        usuarios = [];
        console.error('⚠ Erro ao carregar usuarios.json:', e.message);
    }
}

// Carregar inicialmente
loadUsuarios();

// [Mantive suas funções: flushPendingEmergencyVideo, calcularStatusPlano, renovarPlano, saveBase64Media, etc...]
// (Para economizar espaço e focar na alteração, assuma que as funções auxiliares continuam as mesmas)

// --- NÚCLEO WEBSOCKET ATUALIZADO ---
wss.on('connection', (ws) => {
    console.log('Dispositivo conectado');

    ws.on('message', (message, isBinary) => {
        try {
            if (isBinary) return; // WebRTC usa JSON para sinalização
            
            const msgText = message.toString();
            let data = null;
            try { data = JSON.parse(msgText); } catch (e) { return; }

            if (!data || !data.type) return;

            // 1. REGISTRO E LOGIN
            if (data.type === 'register') {
                const { room, name, peerId } = data;
                ws.room = room;
                
                const usuario = usuarios.find(u => u.name === name) || { type: 'free', name };
                
                ws.userData = { 
                    name, 
                    peerId, 
                    isTalking: false, 
                    lat: null, 
                    lng: null, 
                    type: usuario.type 
                };

                if (!rooms.has(room)) rooms.set(room, new Map());
                rooms.get(room).set(ws, ws.userData);

                ws.send(JSON.stringify({ type: 'welcome', plan: usuario.type }));
                broadcastPresence(room);
                console.log(`[Registro] ${name} (ID: ${peerId}) na sala ${room}`);
                return;
            }

            // 2. SINALIZAÇÃO WEBRTC (P2P - O PONTO CHAVE)
            // Encaminha a mensagem diretamente para o Peer de destino (to)
            if (['webrtc_offer', 'webrtc_answer', 'webrtc_ice'].includes(data.type)) {
                const { to } = data;
                if (ws.room && to) {
                    const roomMap = rooms.get(ws.room);
                    if (roomMap) {
                        for (const [client, udata] of roomMap.entries()) {
                            if (udata && udata.peerId === to) {
                                if (client.readyState === WebSocket.OPEN) {
                                    client.send(msgText); // Repassa o SDP ou ICE candidate
                                }
                                break;
                            }
                        }
                    }
                }
                return;
            }

            // 3. REPASSE DE ÁUDIO (PTT)
            if (data.type === 'audio') {
                if (ws.room) broadcastToRoom(ws.room, msgText, ws);
                return;
            }

            // 4. ESTADO DE FALA
            if (data.type === 'talking_state') {
                if (ws.room && ws.userData) {
                    ws.userData.isTalking = data.isTalking;
                    broadcastPresence(ws.room);
                }
                return;
            }

// 5. LOCALIZAÇÃO
if (data.type === 'location' || data.type === 'location_update') {
    if (ws.userData) {
        ws.userData.lat = Number(data.lat);
        ws.userData.lng = Number(data.lng);
        
        if (ws.room) {
            // Re-enviar para os outros usuários para atualizar o mapa em tempo real
            broadcastToRoom(ws.room, msgText, ws);
            // Manter a lista lateral de usuários atualizada também
            broadcastPresence(ws.room); 
        }
    }
    return;
}

            // 6. EMERGÊNCIA (Legado + WebRTC Stop)
            if (data.type === 'emergency_image' || data.type === 'emergency_video') {
                // Mantém o envio de frames para compatibilidade ou gravação no servidor
                if (ws.room) broadcastToRoom(ws.room, msgText, ws);
                
                // Salva uma cópia no servidor (seu código original de saveBase64Media)
                const b64 = data.image || data.data;
                if (b64 && b64.length > 100) {
                    saveBase64Media(b64, data.name || 'sos', data.name || 'unknown');
                }
                return;
            }

            if (data.type === 'stop_emergency') {
                // Notifica a sala para fechar as conexões WebRTC
                if (ws.room) broadcastToRoom(ws.room, msgText, ws);
                console.log(`[Emergência] Parada por ${ws.userData?.name}`);
                return;
            }

            // 7. CHAT
            if (data.type === 'chat') {
                if (ws.room) broadcastToRoom(ws.room, msgText, ws);
                return;
            }

        } catch (e) {
            console.error('Erro no processamento da mensagem:', e.message);
        }
    });

    ws.on('close', () => {
        if (ws.room && rooms.has(ws.room)) {
            rooms.get(ws.room).delete(ws);
            broadcastPresence(ws.room);
        }
    });
});

// --- FUNÇÕES DE BROADCAST ---

function broadcastPresence(roomName) {
    const room = rooms.get(roomName);
    if (!room) return;
    const users = Array.from(room.values());
    const msg = JSON.stringify({ type: 'presence', users });
    room.forEach((_, client) => {
        if (client.readyState === WebSocket.OPEN) client.send(msg);
    });
}

function broadcastToRoom(roomName, msgText, senderWs) {
    const room = rooms.get(roomName);
    if (!room) return;
    room.forEach((userData, client) => {
        // Envia para todos na sala, EXCETO para quem enviou
        if (client !== senderWs && client.readyState === WebSocket.OPEN) {
            try { client.send(msgText); } catch (e) {}
        }
    });
}

// [Mantenha o restante das suas rotas de usuários, admin e mapa aqui...]

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Servidor PTT rodando na porta ${PORT}`));