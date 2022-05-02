const express = require("express");
const app = express();
const http = require("http");
const { Server } = require("socket.io");
const ACTIONS = require("./src/Actions");
const path = require("path");
const cors = require("cors");

const server = http.createServer(app);
const io = new Server(server);
const bodyParser = require("body-parser");
var request = require("request");

app.use(cors());

app.use(bodyParser.json());

app.use(express.static("build"));
app.use((req, res, next) => {
    res.sendFile(path.join(__dirname, "build", "index.html"));
});

app.use(bodyParser.urlencoded({ extended: true }));
app.post("/api/code", (req, res) => {
    console.log(req);
    const code = req.body["code"];

    var options = {
        method: "POST",
        url: "https://api.jdoodle.com/v1/execute",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            script: code,
            language: "python3",
            versionIndex: "0",
            clientId: "7b46866ffeb29b303ce3aa3bfda16214",
            clientSecret: "65b2c248908b400e74bcd210e15f17135defa3cfb62c6e86582cae23c8c3f0fb",
        }),
    };
    request(options, function(error, response) {
        if (error) return error;
        return res.status(200).json({
            ok: true,
            data: response.body,
        });
    });
});
const userSocketMap = {};

function getAllConnectedClients(roomId) {
    // Map
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
        (socketId) => {
            return {
                socketId,
                username: userSocketMap[socketId],
            };
        }
    );
}

io.on("connection", (socket) => {
    console.log("socket connected", socket.id);

    socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
        userSocketMap[socket.id] = username;
        socket.join(roomId);
        const clients = getAllConnectedClients(roomId);
        clients.forEach(({ socketId }) => {
            io.to(socketId).emit(ACTIONS.JOINED, {
                clients,
                username,
                socketId: socket.id,
            });
        });
    });

    socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
        socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code });
    });

    socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
        io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
    });

    socket.on("disconnecting", () => {
        const rooms = [...socket.rooms];
        rooms.forEach((roomId) => {
            socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
                socketId: socket.id,
                username: userSocketMap[socket.id],
            });
        });
        delete userSocketMap[socket.id];
        socket.leave();
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));