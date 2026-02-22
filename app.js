// app.js — Phusion Passenger entry point for Hostinger
require("dotenv").config();

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

// Passenger may pass a Unix socket path or a TCP port number
const portOrSocket = process.env.PORT || 3000;

app.prepare().then(() => {
  createServer((req, res) => {
    handle(req, res, parse(req.url, true));
  }).listen(portOrSocket, (err) => {
    if (err) throw err;
    console.log(`> ShakesScriptScissors ready on ${portOrSocket}`);
  });
});
