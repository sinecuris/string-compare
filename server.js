const express = require("express");
const helmet = require("helmet");

// utils

const randInt = n => Math.floor(Math.random() * n);
const randChar = () => String.fromCharCode("a".charCodeAt(0) + randInt(26));
const randString = n => [...new Array(n)].map(_ => randChar()).join("");

// app

const app = express();

// middleware

app.use((req, _, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});
app.use(helmet());

// room registry
const registry = {};

// create new room
app.get("/newRoom", (req, res) => {
  let roomId;
  // avoid collisions
  do {
    roomId = randString(8).toUpperCase();
  } while (registry[roomId]);
  // create room object;
  registry[roomId] = {
    created: true,
    ready: false,
    joinCallback: null,
    verifyCallback: null,
  };
  return res.send(roomId);
});

// confirm that both people are in the room
app.get("/join/:roomId", (req, res) => {
  const { roomId } = req.params;
  // check if room exists
  if (!registry[roomId]) {
    return res.sendStatus(404);
  }
  // if a callback exists, we're the second to submit a string
  if (registry[roomId].joinCallback) {
    try {
      registry[roomId].joinCallback();
      res.sendStatus(204);
      registry[roomId].ready = true;
      return;
    } catch (e) {
      return res.sendStatus(500);
    }
  } else {
    // we're the first to join the room, create the callback
    registry[roomId].joinCallback = () => {
      res.sendStatus(204);
    };
    // if they close the connection, remove the callback
    req.on("close", () => {
      if (registry[roomId]) {
        registry[roomId].joinCallback = null;
      }
    });
    return;
  }
});

// submit string
app.get("/submit/:roomId/:str", (req, res) => {
  const { roomId, str } = req.params;
  // check if room exists
  if (!registry[roomId]) {
    return res.sendStatus(404);
  }
  // check if room is ready
  if (!registry[roomId].ready) {
    return res.sendStatus(418);
  }
  // if a callback exists, we're the second to submit a string
  if (registry[roomId].verifyCallback) {
    try {
      res.send(registry[roomId].verifyCallback(str));
      // we're done with the room, clean it up
      delete registry[roomId];
      return;
    } catch (e) {
      return res.sendStatus(500);
    }
  } else {
    // we're the first to submit a string, create the callback
    registry[roomId].verifyCallback = otherStr => {
      const response = otherStr === str ? "good" : "bad";
      res.send(response);
      return response;
    };
    // if they close the connection, remove the room, the client doesn't know how to recover from this
    req.on("close", () => {
      delete registry[roomId];
    });
  }
});

// serve the client script
app.get("/script.js", (req, res) => res.sendFile(__dirname + "/clientScript.js"));

// serve the client
app.get("*", (req, res) => res.sendFile(__dirname + "/client.html"));

app.listen(process.env.PORT || 8080);
