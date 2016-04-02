"use strict";

const http = require("http");
const express = require("express");
const socketio = require("socket.io");
const path = require("path");
const Tailer = require("tailer");

let app = express();
let server = http.createServer(app);
let io = socketio(server);
let tailer = new Tailer("/var/log/sauerbraten-server", {
	fromStart: false,
	delay: 100
});

app.set("view engine", "hbs");
app.use(express.static(path.join(__dirname, "static")));
app.use("/components", express.static(path.join(__dirname, "bower_components")));

app.get("/", (req, res, next) => {
	res.render("home", {
		serverName: "Wincinderith"
	});
});

let clients = [];
let stats = {};
let chat = [];
io.on("connection", (socket) => {
	socket.emit("clients update", {
		clients: clients
	});
	socket.emit("stats update", {
		stats: stats
	});
	socket.emit("chat update", {
		chat: chat
	});
});

const reConnected = /client connected \((\d+.\d+.\d+.\d+)\)/g;
const reDisconnected = /disconnected client \((\d+.\d+.\d+.\d+)\)/g;
const reStatus = /^status: (\d+) remote clients, (\d+.\d+) send, (\d+.\d+) rec \(K\/sec\)$/g;
const reMessage = /^([\s\S]+?): ([\s\S]+)$/g;
tailer.tail((error, line) => {
	let match = null;

	if (line == "dedicated server started, waiting for clients...") {
		io.emit("server start");
	} else if (line == "master server registration succeeded") {
		io.emit("server master");
	} else if (match = reConnected.exec(line)) {
		clients.push(match[1]);
		io.emit("clients update", {
			clients: clients
		});
	} else if (match = reDisconnected.exec(line)) {
		let clientIndex = clients.indexOf(match[1]);
		if (clientIndex > -1) {
			clients.splice(clientIndex, 1);
		}
		io.emit("clients update", {
			clients: clients
		});
	} else if (match = reStatus.exec(line)) {
		stats.remoteClients = match[1];
		stats.send = match[2];
		stats.receive = match[3];
		io.emit("stats update", {
			stats: stats
		});
	} else if (match = reMessage.exec(line)) {
		chat.push({
			player: match[1],
			message: match[2]
		});
		if (chat.length > 64) {
			chat.shift();
		}
		io.emit("chat update", {
			chat: chat
		});
	}
});

const port = 3000;
server.listen(port, () => console.log("sauerbraten-monitor listening on port", port, "..."));
