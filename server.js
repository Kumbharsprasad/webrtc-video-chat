const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join', (room) => {
        const clientsInRoom = io.sockets.adapter.rooms.get(room);
        const numClients = clientsInRoom ? clientsInRoom.size : 0;

        if (numClients === 0) {
            socket.join(room);
            socket.emit('created', room, socket.id);
        } else if (numClients === 1) {
            socket.join(room);
            socket.emit('joined', room, socket.id);
            // Inform the other peer that someone joined so they can initiate the offer
            io.sockets.in(room).emit('ready', room);
        } else {
            socket.emit('full', room);
        }
    });

    socket.on('offer', (roomId, offer) => {
        socket.to(roomId).emit('offer', offer);
    });

    socket.on('answer', (roomId, answer) => {
        socket.to(roomId).emit('answer', answer);
    });

    socket.on('candidate', (roomId, candidate) => {
        socket.to(roomId).emit('candidate', candidate);
    });

    socket.on('leave', (roomId) => {
        socket.leave(roomId);
        socket.to(roomId).emit('peer-left');
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
});
