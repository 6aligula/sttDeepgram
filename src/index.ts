import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import * as dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import cors from 'cors';

// Cargar variables de entorno
dotenv.config();

// Validar API Key
const apiKey = process.env.DEEPGRAM_API_KEY;
if (!apiKey) {
  console.error('Error: DEEPGRAM_API_KEY no está definida en el archivo .env');
  process.exit(1);
}

// Inicializar Express
const app = express();
const server = http.createServer(app);

// Configurar CORS
app.use(cors());
app.use(express.json());

// Servir archivos estáticos desde la carpeta public
app.use(express.static('public'));

// Crear servidor WebSocket
const wss = new WebSocketServer({ server });

// Almacenar conexiones activas
const clients = new Map<string, any>(); // clientId -> { socket, deepgramConnection }

// Ruta de prueba
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Servidor funcionando correctamente' });
});

// WebSocket connection handler
wss.on('connection', (ws: WebSocket) => {
  const clientId = Date.now().toString();
  console.log(`[SERVER] Nueva conexión WebSocket recibida`);
  console.log(`[SERVER] Cliente conectado - ID: ${clientId}`);
  
  // Enviar mensaje de bienvenida
  const welcomeMsg = {
    type: 'connection',
    status: 'connected',
    clientId: clientId,
    message: 'Conexión establecida correctamente',
    timestamp: new Date().toISOString()
  };
  console.log(`[SERVER] Enviando mensaje de bienvenida al cliente ${clientId}:`, JSON.stringify(welcomeMsg, null, 2));
  ws.send(JSON.stringify(welcomeMsg));

  console.log(`[SERVER] Inicializando cliente Deepgram para el cliente ${clientId}`);
  const deepgram = createClient(apiKey);
  
  console.log(`[SERVER] Creando conexión con Deepgram para el cliente ${clientId}`);
  const deepgramConnection = deepgram.listen.live({
    model: "nova-2",
    language: "en-US",
    smart_format: true,
    interim_results: true,
    utterance_end_ms: 1000,
  });
  console.log(`[SERVER] Conexión con Deepgram establecida para el cliente ${clientId}`);

  // Store the client connection
  clients.set(clientId, { socket: ws, deepgramConnection });
  console.log(`[SERVER] Cliente ${clientId} registrado en el mapa de conexiones`);

  // Handle incoming audio data from client
  ws.on('message', (message: Buffer) => {
    try {
      console.log(`[SERVER] [${clientId}] Recibidos ${message.length} bytes de audio`);
      
      // Forward audio data to Deepgram
      if (deepgramConnection.getReadyState() === WebSocket.OPEN) {
        console.log(`[SERVER] [${clientId}] Reenviando audio a Deepgram`);
        deepgramConnection.send(message);
        console.log(`[SERVER] [${clientId}] Audio enviado a Deepgram correctamente`);
      } else {
        console.error(`[SERVER] [${clientId}] Error: La conexión con Deepgram no está abierta. Estado:`, deepgramConnection.getReadyState());
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      console.error(`[SERVER] [${clientId}] Error procesando audio:`, errorMessage);
      
      // Enviar mensaje de error al cliente
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Error al procesar el audio',
          error: errorMessage,
          timestamp: new Date().toISOString()
        }));
      }
    }
  });

  // Handle Deepgram transcription results
  deepgramConnection.on(LiveTranscriptionEvents.Transcript, (data) => {
    try {
      console.log(`[SERVER] [${clientId}] Datos brutos recibidos de Deepgram:`, JSON.stringify(data, null, 2));
      
      const transcript = data.channel?.alternatives?.[0]?.transcript;
      const isFinal = data.is_final;
      
      console.log(`[SERVER] [${clientId}] Transcripción recibida - Texto: "${transcript}", Final: ${isFinal}`);
      
      if (transcript && isFinal) {
        const result = {
          type: 'transcript',
          text: transcript,
          isFinal: isFinal,
          timestamp: new Date().toISOString()
        };
        
        console.log(`[SERVER] [${clientId}] Enviando transcripción al cliente:`, JSON.stringify(result, null, 2));
        
        // Send transcript back to client
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(result));
          console.log(`[SERVER] [${clientId}] Transcripción enviada correctamente`);
        } else {
          console.error(`[SERVER] [${clientId}] Error: WebSocket no está abierto. Estado:`, ws.readyState);
        }
      } else if (!transcript) {
        console.log(`[SERVER] [${clientId}] No hay transcripción disponible en los datos recibidos`);
      } else {
        console.log(`[SERVER] [${clientId}] Transcripción no finalizada, ignorando...`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      console.error(`[SERVER] [${clientId}] Error procesando transcripción:`, errorMessage);
      
      // Enviar mensaje de error al cliente
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Error al procesar la transcripción',
          error: errorMessage,
          timestamp: new Date().toISOString()
        }));
      }
    }
  });
  
  // Manejar cierre de conexión
  ws.on('close', () => {
    console.log(`[SERVER] [${clientId}] Cliente desconectado`);
    
    // Cerrar conexión con Deepgram
    if (deepgramConnection.getReadyState() === WebSocket.OPEN) {
      console.log(`[SERVER] [${clientId}] Cerrando conexión con Deepgram`);
      deepgramConnection.finish();
    }
    
    // Eliminar del mapa de clientes
    clients.delete(clientId);
    console.log(`[SERVER] [${clientId}] Cliente eliminado del mapa de conexiones`);
  });
  
  // Manejar errores
  ws.on('error', (error) => {
    console.error(`[SERVER] [${clientId}] Error en la conexión WebSocket:`, error);
  });
  
  deepgramConnection.on('error', (error) => {
    console.error(`[SERVER] [${clientId}] Error en la conexión con Deepgram:`, error);
    
    // Enviar mensaje de error al cliente
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Error en la conexión con el servicio de transcripción',
        error: error.message,
        timestamp: new Date().toISOString()
      }));
    }
  });

  // Handle Deepgram errors
  deepgramConnection.on(LiveTranscriptionEvents.Error, (error) => {
    console.error('Deepgram error:', error);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Error processing audio',
        error: error.message
      }));
    }
  });

  // Handle client disconnection
  ws.on('close', () => {
    console.log(`Client disconnected: ${clientId}`);
    // Clean up Deepgram connection
    if (deepgramConnection.getReadyState() === WebSocket.OPEN) {
      deepgramConnection.finish();
    }
    clients.delete(clientId);
  });

  // Send initial connection confirmation
  ws.send(JSON.stringify({
    type: 'connection',
    status: 'connected',
    clientId: clientId
  }));
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  const address = server.address();
  const port = typeof address === 'string' ? address : address?.port || PORT;
  
  console.log('========================================');
  console.log('🚀 Servidor STT Deepgram iniciado');
  console.log(`🌐 HTTP Server: http://localhost:${port}`);
  console.log(`🔌 WebSocket Server: ws://localhost:${port}`);
  console.log(`🔍 Health Check: http://localhost:${port}/health`);
  console.log('========================================');
});

// Manejar errores no capturados
process.on('uncaughtException', (error) => {
  console.error('Error no capturado:', error);
});

process.on('unhandledRejection', (reason, _promise) => {
  console.error('Promesa rechazada no manejada:', reason);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  
  // Close all client connections
  clients.forEach((client) => {
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.close(1000, 'Server shutting down');
    }
    if (client.deepgramConnection.getReadyState() === WebSocket.OPEN) {
      client.deepgramConnection.finish();
    }
  });
  
  // Close the WebSocket server
  wss.close(() => {
    console.log('WebSocket server closed');
    process.exit(0);
  });
});
