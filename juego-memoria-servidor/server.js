// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000', 'https://juego-memoria-cliente.onrender.com'], // Añade la URL de tu cliente en Render
    methods: ['GET', 'POST']
  }
});

// Datos de usuario (en una aplicación real, esto estaría en una base de datos)
const users = [
  { id: '1', username: 'jugador1', password: 'clave1', score: 5000, isAdmin: false, isBlocked: false },
  { id: '2', username: 'jugador2', password: 'clave2', score: 5000, isAdmin: false, isBlocked: false },
  { id: '3', username: 'jugador3', password: 'clave3', score: 5000, isAdmin: false, isBlocked: false },
  { id: '4', username: 'jugador4', password: 'clave4', score: 5000, isAdmin: false, isBlocked: false },
  { id: '5', username: 'jugador5', password: 'clave5', score: 5000, isAdmin: false, isBlocked: false },
  { id: '6', username: 'jugador6', password: 'clave6', score: 5000, isAdmin: false, isBlocked: false },
  { id: '7', username: 'jugador7', password: 'clave7', score: 5000, isAdmin: false, isBlocked: false },
  { id: '8', username: 'jugador8', password: 'clave8', score: 5000, isAdmin: false, isBlocked: false },
  { id: '9', username: 'jugador9', password: 'clave9', score: 5000, isAdmin: false, isBlocked: false },
  { id: '10', username: 'jugador10', password: 'clave10', score: 5000, isAdmin: false, isBlocked: false },
  { id: 'admin', username: 'admin', password: 'admin123', score: 0, isAdmin: true, isBlocked: false }
];

// Mapa de Socket IDs a usuarios
const connectedSockets = {};

// Estado del juego
let gameState = {
  board: generateBoard(),
  players: [],
  currentPlayerIndex: 0,
  currentPlayer: null,
  status: 'waiting', // waiting, playing, gameover
  turnStartTime: null
};

let turnTimer = null;

// Generar el tablero con 8 fichas ganadoras y 8 perdedoras
function generateBoard() {
  const tiles = [];
  
  // Crear 8 fichas ganadoras
  for (let i = 0; i < 8; i++) {
    tiles.push({ value: 15000, revealed: false });
  }
  
  // Crear 8 fichas perdedoras
  for (let i = 0; i < 8; i++) {
    tiles.push({ value: -15000, revealed: false });
  }
  
  // Mezclar las fichas aleatoriamente
  return shuffleArray(tiles);
}

// Función para mezclar un array (algoritmo Fisher-Yates)
function shuffleArray(array) {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

// Comprueba si todas las fichas han sido reveladas
function checkGameOver() {
  return gameState.board.every(tile => tile.revealed);
}

// Obtener usuario por ID
function getUserById(id) {
  return users.find(user => user.id === id);
}

// Actualizar la puntuación de un usuario
function updateUserScore(id, points) {
  const user = getUserById(id);
  if (user) {
    user.score += points;
    return user.score;
  }
  return null;
}

// Reiniciar el juego
function resetGame() {
  gameState.board = generateBoard();
  gameState.status = 'playing';
  gameState.currentPlayerIndex = 0;
  gameState.turnStartTime = Date.now();
  
  if (gameState.players.length > 0) {
    gameState.currentPlayer = gameState.players[0];
  }
  
  clearTimeout(turnTimer);
  io.emit('gameState', {
    board: gameState.board.map(tile => ({
      ...tile,
      value: tile.revealed ? tile.value : null
    })),
    currentPlayer: gameState.currentPlayer,
    players: gameState.players.map(player => ({
      id: player.id,
      username: player.username,
      isBlocked: getUserById(player.id).isBlocked
    })),
    status: gameState.status,
    turnStartTime: gameState.turnStartTime
  });
  
  if (gameState.players.length > 0) {
    startPlayerTurn();
  }
}

// Función para iniciar el turno de un jugador
function startPlayerTurn() {
  if (gameState.players.length === 0) return;
  
  // Actualizar el jugador actual
  gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
  let nextPlayerIndex = gameState.currentPlayerIndex;
  
  // Buscar el siguiente jugador no bloqueado
  let loopCount = 0;
  while (
    loopCount < gameState.players.length && 
    getUserById(gameState.players[nextPlayerIndex].id).isBlocked
  ) {
    nextPlayerIndex = (nextPlayerIndex + 1) % gameState.players.length;
    loopCount++;
    if (loopCount >= gameState.players.length) {
      console.log("Todos los jugadores están bloqueados");
      return; // Evita un bucle infinito
    }
  }
  
  // Asignar el nuevo jugador actual
  gameState.currentPlayerIndex = nextPlayerIndex;
  gameState.currentPlayer = gameState.players[gameState.currentPlayerIndex];
  gameState.turnStartTime = Date.now();
  
  console.log(`Turno de ${gameState.currentPlayer.username}, tiene 4 segundos`);
  
  // Emitir el estado actualizado del juego
  io.emit('gameState', {
    board: gameState.board.map(tile => ({
      ...tile,
      value: tile.revealed ? tile.value : null // Solo enviamos el valor si ya fue revelado
    })),
    currentPlayer: gameState.currentPlayer,
    players: gameState.players.map(player => ({
      id: player.id,
      username: player.username,
      isBlocked: getUserById(player.id).isBlocked
    })),
    status: gameState.status,
    turnStartTime: gameState.turnStartTime
  });
  
  // Establecer temporizador para el turno actual (4 segundos exactos)
  clearTimeout(turnTimer);
  turnTimer = setTimeout(() => {
    console.log(`Tiempo agotado para ${gameState.currentPlayer.username}`);
    io.emit('turnTimeout', { playerId: gameState.currentPlayer.id });
    // Pequeña pausa antes de pasar al siguiente jugador
    setTimeout(() => {
      startPlayerTurn(); // Pasar al siguiente jugador automáticamente
    }, 500);
  }, 4000);
}

// Configuración de Socket.io
io.on('connection', (socket) => {
  console.log(`Usuario conectado: ${socket.id}`);
  
  // Evento de prueba para verificar conexión
  socket.on('test', (data) => {
    console.log(`Prueba recibida del cliente ${socket.id}:`, data);
    // Enviar respuesta al cliente
    socket.emit('testResponse', { message: 'Prueba exitosa' });
  });
  
  // Login
  socket.on('login', (credentials, callback) => {
    const user = users.find(
      u => u.username === credentials.username && u.password === credentials.password
    );
    
    if (!user) {
      callback({ success: false, message: 'Credenciales incorrectas' });
      return;
    }
    
    if (gameState.players.some(p => p.id === user.id)) {
      callback({ success: false, message: 'Usuario ya está conectado' });
      return;
    }
    
    // Registrar usuario en el socket
    connectedSockets[socket.id] = user.id;
    console.log(`Usuario ${user.username} autenticado con socket ${socket.id}`);
    
    // Responder al cliente
    callback({
      success: true,
      userId: user.id,
      username: user.username,
      score: user.score,
      isAdmin: user.isAdmin,
      isBlocked: user.isBlocked
    });
  });
  
  // Unirse al juego
  socket.on('joinGame', () => {
    const userId = connectedSockets[socket.id];
    if (!userId) {
      console.log(`Socket ${socket.id} intentó unirse al juego sin estar autenticado`);
      return;
    }
    
    const user = getUserById(userId);
    if (!user) {
      console.log(`Usuario con ID ${userId} no encontrado`);
      return;
    }
    
    if (user.isAdmin) {
      console.log(`Admin ${user.username} intentó unirse al juego`);
      return;
    }
    
    if (user.isBlocked) {
      console.log(`Usuario bloqueado ${user.username} intentó unirse al juego`);
      return;
    }
    
    console.log(`Usuario ${user.username} intentando unirse al juego`);
    
    // Verificar si el jugador ya está en el juego
    if (!gameState.players.some(player => player.id === userId)) {
      gameState.players.push({
        id: userId,
        username: user.username,
        socketId: socket.id
      });
      
      console.log(`Usuario ${user.username} añadido al juego`);
      
      // Si es el primer jugador, iniciar el juego
      if (gameState.players.length === 1) {
        gameState.status = 'playing';
        gameState.currentPlayer = gameState.players[0];
        gameState.turnStartTime = Date.now();
        console.log(`Primer jugador, iniciando juego con ${user.username}`);
        resetGame();
      } else {
        // Enviar estado actualizado a todos
        console.log(`Enviando estado actualizado, hay ${gameState.players.length} jugadores`);
        io.emit('gameState', {
          board: gameState.board.map(tile => ({
            ...tile,
            value: tile.revealed ? tile.value : null
          })),
          currentPlayer: gameState.currentPlayer,
          players: gameState.players.map(player => ({
            id: player.id,
            username: player.username,
            isBlocked: getUserById(player.id).isBlocked
          })),
          status: gameState.status,
          turnStartTime: gameState.turnStartTime
        });
      }
    } else {
      // Si el jugador se reconecta, actualizamos su socketId
      const playerIndex = gameState.players.findIndex(player => player.id === userId);
      if (playerIndex !== -1) {
        gameState.players[playerIndex].socketId = socket.id;
        console.log(`Usuario ${user.username} reconectado con nuevo socket ${socket.id}`);
      }
      
      // Enviar estado actual al jugador reconectado
      console.log(`Enviando estado actual a ${user.username}`);
      socket.emit('gameState', {
        board: gameState.board.map(tile => ({
          ...tile,
          value: tile.revealed ? tile.value : null
        })),
        currentPlayer: gameState.currentPlayer,
        players: gameState.players.map(player => ({
          id: player.id,
          username: player.username,
          isBlocked: getUserById(player.id).isBlocked
        })),
        status: gameState.status,
        turnStartTime: gameState.turnStartTime
      });
    }
  });
  
  // Seleccionar una ficha
  socket.on('selectTile', ({ tileIndex }) => {
    console.log(`Recibido evento selectTile para ficha ${tileIndex} de socket ${socket.id}`);
    
    // Enviar respuesta inmediata para confirmar recepción
    socket.emit('tileSelectResponse', { received: true, tileIndex });
    
    const userId = connectedSockets[socket.id];
    if (!userId) {
      console.log('Usuario no autenticado, evento ignorado');
      return;
    }
    
    const user = getUserById(userId);
    if (!user) {
      console.log('Usuario no encontrado, evento ignorado');
      return;
    }
    
    if (user.isBlocked) {
      console.log('Usuario bloqueado, evento ignorado');
      return;
    }
    
    // Verificar que es el turno del jugador
    if (gameState.status !== 'playing') {
      console.log(`Estado del juego es ${gameState.status}, no 'playing'`);
      return;
    }
    
    if (!gameState.currentPlayer) {
      console.log('No hay jugador actual');
      return;
    }
    
    if (gameState.currentPlayer.id !== userId) {
      console.log(`No es el turno de ${user.username}, es el turno de ${gameState.currentPlayer.username}`);
      return;
    }
    
    if (tileIndex < 0 || tileIndex >= gameState.board.length) {
      console.log(`Índice de ficha ${tileIndex} fuera de rango`);
      return;
    }
    
    if (gameState.board[tileIndex].revealed) {
      console.log(`Ficha ${tileIndex} ya revelada`);
      return;
    }
    
    console.log(`Jugador ${user.username} seleccionó ficha ${tileIndex}`);
    
    // Revelar la ficha
    gameState.board[tileIndex].revealed = true;
    const tileValue = gameState.board[tileIndex].value;
    
    // Actualizar puntuación
    const newScore = updateUserScore(userId, tileValue);
    console.log(`Nuevo puntaje de ${user.username}: ${newScore} (${tileValue > 0 ? '+' : ''}${tileValue} puntos)`);
    
    // Enviar actualización a todos los jugadores
    io.emit('tileSelected', {
      tileIndex,
      tileValue,
      playerId: userId,
      newScore
    });
    
    // Emitir actualización de puntuación al jugador específico
    socket.emit('scoreUpdate', newScore);
    
    // Verificar si el juego ha terminado
    if (checkGameOver()) {
      gameState.status = 'gameover';
      clearTimeout(turnTimer);
      
      io.emit('gameState', {
        board: gameState.board,
        currentPlayer: null,
        players: gameState.players.map(player => ({
          id: player.id,
          username: player.username,
          isBlocked: getUserById(player.id).isBlocked
        })),
        status: gameState.status
      });
      
      setTimeout(() => {
        resetGame();
      }, 5000);
    } else {
      // Cancelar el temporizador actual y pasar al siguiente turno
      clearTimeout(turnTimer);
      startPlayerTurn();
    }
  });
  
  // Obtener lista de jugadores (solo para admins)
  socket.on('getPlayers', (callback) => {
    const userId = connectedSockets[socket.id];
    if (!userId) {
      callback({ success: false, message: 'No autorizado' });
      return;
    }
    
    const user = getUserById(userId);
    if (!user || !user.isAdmin) {
      callback({ success: false, message: 'No autorizado' });
      return;
    }
    
    callback({
      success: true,
      players: users.filter(u => !u.isAdmin).map(u => ({
        id: u.id,
        username: u.username,
        score: u.score,
        isBlocked: u.isBlocked
      }))
    });
  });
  
  // Actualizar puntos (solo para admins)
  socket.on('updatePoints', ({ userId, points }, callback) => {
    const adminId = connectedSockets[socket.id];
    if (!adminId) {
      callback({ success: false, message: 'No autorizado' });
      return;
    }
    
    const admin = getUserById(adminId);
    if (!admin || !admin.isAdmin) {
      callback({ success: false, message: 'No autorizado' });
      return;
    }
    
    const targetUser = getUserById(userId);
    if (!targetUser) {
      callback({ success: false, message: 'Usuario no encontrado' });
      return;
    }
    
    // Actualizar puntuación
    const newScore = updateUserScore(userId, points);
    
    // Notificar al usuario, si está conectado
    const playerSocketId = gameState.players.find(p => p.id === userId)?.socketId;
    if (playerSocketId) {
      io.to(playerSocketId).emit('scoreUpdate', newScore);
    }
    
    // Actualizar lista de jugadores para todos los admins
    io.emit('playersUpdate', users.filter(u => !u.isAdmin).map(u => ({
      id: u.id,
      username: u.username,
      score: u.score,
      isBlocked: u.isBlocked
    })));
    
    callback({ success: true });
  });
  
  // Bloquear/desbloquear usuario (solo para admins)
  socket.on('toggleBlockUser', ({ userId }, callback) => {
    const adminId = connectedSockets[socket.id];
    if (!adminId) {
      callback({ success: false, message: 'No autorizado' });
      return;
    }
    
    const admin = getUserById(adminId);
    if (!admin || !admin.isAdmin) {
      callback({ success: false, message: 'No autorizado' });
      return;
    }
    
    const targetUser = getUserById(userId);
    if (!targetUser) {
      callback({ success: false, message: 'Usuario no encontrado' });
      return;
    }
    
    // Cambiar estado de bloqueo
    targetUser.isBlocked = !targetUser.isBlocked;
    
    // Notificar al usuario, si está conectado
    const playerSocketId = gameState.players.find(p => p.id === userId)?.socketId;
    if (playerSocketId) {
      if (targetUser.isBlocked) {
        io.to(playerSocketId).emit('blocked');
      }
    }
    
    // Actualizar lista de jugadores para todos los admins
    io.emit('playersUpdate', users.filter(u => !u.isAdmin).map(u => ({
      id: u.id,
      username: u.username,
      score: u.score,
      isBlocked: u.isBlocked
    })));
    
    // Actualizar el estado del juego para todos
    io.emit('gameState', {
      board: gameState.board.map(tile => ({
        ...tile,
        value: tile.revealed ? tile.value : null
      })),
      currentPlayer: gameState.currentPlayer,
      players: gameState.players.map(player => ({
        id: player.id,
        username: player.username,
        isBlocked: getUserById(player.id).isBlocked
      })),
      status: gameState.status,
      turnStartTime: gameState.turnStartTime
    });
    
    callback({ success: true });
  });
  
  // Reiniciar juego (solo para admins)
  socket.on('resetGame', (callback) => {
    const adminId = connectedSockets[socket.id];
    if (!adminId) {
      callback({ success: false, message: 'No autorizado' });
      return;
    }
    
    const admin = getUserById(adminId);
    if (!admin || !admin.isAdmin) {
      callback({ success: false, message: 'No autorizado' });
      return;
    }
    
    resetGame();
    callback({ success: true });
  });
  
  // Salir del juego
  socket.on('leaveGame', () => {
    const userId = connectedSockets[socket.id];
    if (!userId) return;
    
    // Eliminar jugador de la lista
    const playerIndex = gameState.players.findIndex(player => player.id === userId);
    if (playerIndex !== -1) {
      gameState.players.splice(playerIndex, 1);
      
      // Si era el turno de este jugador, pasar al siguiente
      if (gameState.currentPlayer && gameState.currentPlayer.id === userId) {
        clearTimeout(turnTimer);
        if (gameState.players.length > 0) {
          startPlayerTurn();
        }
      }
      
      // Si no quedan jugadores, reiniciar estado
      if (gameState.players.length === 0) {
        gameState.status = 'waiting';
        gameState.currentPlayer = null;
        clearTimeout(turnTimer);
      }
      
      // Actualizar estado para todos
      io.emit('gameState', {
        board: gameState.board.map(tile => ({
          ...tile,
          value: tile.revealed ? tile.value : null
        })),
        currentPlayer: gameState.currentPlayer,
        players: gameState.players.map(player => ({
          id: player.id,
          username: player.username,
          isBlocked: getUserById(player.id).isBlocked
        })),
        status: gameState.status,
        turnStartTime: gameState.turnStartTime
      });
    }
  });
  
  // Desconexión
  socket.on('disconnect', () => {
    console.log(`Usuario desconectado: ${socket.id}`);
    
    const userId = connectedSockets[socket.id];
    if (userId) {
      // No eliminamos al jugador inmediatamente para permitir reconexiones
      delete connectedSockets[socket.id];
      
      // Si era el turno de este jugador, pasar al siguiente después de un tiempo
      if (gameState.currentPlayer && gameState.currentPlayer.id === userId) {
        clearTimeout(turnTimer);
        setTimeout(() => {
          // Verificar si el jugador se reconectó
          const reconnected = Object.values(connectedSockets).includes(userId);
          if (!reconnected) {
            startPlayerTurn();
          }
        }, 5000);
      }
    }
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Servidor ejecutándose en el puerto ${PORT}`);
});

// Ruta básica para comprobar que el servidor está funcionando
app.get('/', (req, res) => {
  res.send('Servidor del juego de memoria funcionando');
});
