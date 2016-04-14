"use strict";

const http = require("http");
const express = require("express");
const favicon = require("serve-favicon");
const socketio = require("socket.io");
const path = require("path");
const request = require("request");
const Tailer = require("tailer");

let app = express();
let server = http.createServer(app);
let io = socketio(server);
let tailer = new Tailer("/var/log/sauerbraten-server", {
	fromStart: false,
	delay: 100
});

app.set("view engine", "hbs");
app.use(favicon(path.join(__dirname, "static", "favicon.ico")));
app.use(express.static(path.join(__dirname, "static")));
app.use("/components", express.static(path.join(__dirname, "bower_components")));

app.get(/^\/(chat|clients|stats)?$/, (req, res, next) => {
	res.render("home", {
		serverName: "Wincinderith"
	});
});

const defaultStat = {
	remoteClients: 0,
	send: 0,
	receive: 0
};
let clients = [];
let stats = [ defaultStat ];
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

const defaultStatsCallback = () => {
	for (let i = 0; i < 2; i++) {
		stats.push(defaultStat);
		io.emit("stat add", {
			stat: defaultStat
		});
		if (stats.length > 60) {
			stats.shift();
			io.emit("stat overflow");
		}
	}
};
let statsInterval = setInterval(defaultStatsCallback, 120000);

const reConnected = /^client connected \((\d+.\d+.\d+.\d+)\)$/;
const reDisconnected = /^disconnected client \((\d+.\d+.\d+.\d+)\)$/;
const reStatus = /^status: (\d+) remote clients, (\d+.\d+) send, (\d+.\d+) rec \(K\/sec\)$/;
const reMessage = /^([\s\S]+?): ([\s\S]+)$/;
tailer.tail((error, line) => {
	line = line.trim();
	let match = null;

	if (line == "dedicated server started, waiting for clients...") {
		io.emit("server start");
	} else if (line == "master server registration succeeded") {
		io.emit("server master");
	} else if ((match = reConnected.exec(line)) !== null) {
		request({
			json: true,
			url: "https://geoip.nekudo.com/api/" + match[1]
		}, (err, res, client) => {
			clients.push(client);
			io.emit("client add", {
				client: client
			});
		});
	} else if ((match = reDisconnected.exec(line)) !== null) {
		for (let i = 0; i < clients.length; i++) {
			if (clients[i].ip == match[1]) {
				clients.splice(i, 1);
				io.emit("client remove", {
					clientIndex: i
				});
				break;
			}
		}
	} else if ((match = reStatus.exec(line)) !== null) {
		clearInterval(statsInterval);
		let stat = {
			remoteClients: parseFloat(match[1]),
			send: parseFloat(match[2]),
			receive: parseFloat(match[3])
		};
		stats.push(stat);
		io.emit("stat add", {
			stat: stat
		});
		if (stats.length > 60) {
			stats.shift();
			io.emit("stat overflow");
		}
		statsInterval = setInterval(defaultStatsCallback, 120000);
	} else if ((match = reMessage.exec(line)) !== null) {
		if (match[1] == "Using home directory") return;
		
		let message = {
			player: match[1],
			message: match[2]
		};
		chat.push(message);
		io.emit("chat add", {
			message: message
		});
		if (chat.length > 4096) {
			chat.shift();
			io.emit("chat oveflow");
		}
	}
});

const port = 3000;
server.listen(port, () => console.log("sauerbraten-monitor listening on port", port, "..."));
