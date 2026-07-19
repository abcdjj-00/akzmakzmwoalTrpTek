var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_vite = require("vite");
var DB_FILE = import_path.default.join(process.cwd(), "db.json");
function loadDb() {
  try {
    if (import_fs.default.existsSync(DB_FILE)) {
      const raw = import_fs.default.readFileSync(DB_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error("Error reading database file, resetting:", e);
  }
  return { rooms: {} };
}
function saveDb(db) {
  try {
    import_fs.default.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (e) {
    console.error("Error writing database file:", e);
  }
}
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.use(import_express.default.json());
  app.post("/api/rooms", (req, res) => {
    const { nickname, pinHash, dates } = req.body;
    if (!nickname || !pinHash || !Array.isArray(dates)) {
      return res.status(400).json({ error: "Invalid parameters" });
    }
    const db = loadDb();
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let code = "";
    let attempts = 0;
    while (attempts < 10) {
      code = "";
      for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
      if (!db.rooms[code]) break;
      attempts++;
    }
    const newRoom = {
      code,
      dates: dates.sort(),
      createdAt: Date.now(),
      createdBy: nickname,
      users: {
        [nickname]: {
          pinHash,
          ranges: {},
          selectedDates: []
        }
      }
    };
    db.rooms[code] = newRoom;
    saveDb(db);
    res.json({
      success: true,
      code,
      config: {
        dates: newRoom.dates,
        createdBy: newRoom.createdBy,
        createdAt: newRoom.createdAt
      }
    });
  });
  app.post("/api/rooms/:code/join", (req, res) => {
    const { code } = req.params;
    const { nickname, pinHash } = req.body;
    if (!nickname || !pinHash) {
      return res.status(400).json({ error: "Nickname and PIN hash are required" });
    }
    const db = loadDb();
    const room = db.rooms[code?.toUpperCase()];
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    const existingUser = room.users[nickname];
    if (existingUser) {
      if (existingUser.pinHash !== pinHash) {
        return res.status(401).json({ error: "Incorrect PIN" });
      }
    } else {
      room.users[nickname] = {
        pinHash,
        ranges: {},
        selectedDates: []
      };
      saveDb(db);
    }
    res.json({
      success: true,
      nickname,
      myRanges: room.users[nickname].ranges,
      selectedDates: room.users[nickname].selectedDates || [],
      config: {
        dates: room.dates,
        createdBy: room.createdBy,
        createdAt: room.createdAt
      }
    });
  });
  app.post("/api/rooms/:code/user/:nickname/ranges", (req, res) => {
    const { code, nickname } = req.params;
    const { pinHash, ranges, selectedDates } = req.body;
    if (!pinHash || !ranges) {
      return res.status(400).json({ error: "PIN hash and ranges are required" });
    }
    const db = loadDb();
    const room = db.rooms[code?.toUpperCase()];
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    const user = room.users[nickname];
    if (!user) {
      return res.status(404).json({ error: "User not found in this room" });
    }
    if (user.pinHash !== pinHash) {
      return res.status(401).json({ error: "Incorrect PIN" });
    }
    user.ranges = ranges;
    if (selectedDates) {
      user.selectedDates = selectedDates;
    }
    saveDb(db);
    res.json({ success: true });
  });
  app.get("/api/rooms/:code/responses", (req, res) => {
    const { code } = req.params;
    const db = loadDb();
    const room = db.rooms[code?.toUpperCase()];
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    const responses = {};
    const userSelectedDates = {};
    Object.keys(room.users).forEach((nick) => {
      const user = room.users[nick];
      const activeDates = user.selectedDates || room.dates;
      userSelectedDates[nick] = activeDates;
      const userRanges = {};
      Object.keys(user.ranges).forEach((d) => {
        if (activeDates.includes(d)) {
          userRanges[d] = user.ranges[d];
        }
      });
      responses[nick] = userRanges;
    });
    res.json({
      success: true,
      responses,
      userSelectedDates,
      config: {
        dates: room.dates,
        createdBy: room.createdBy,
        createdAt: room.createdAt
      }
    });
  });
  app.post("/api/find-rooms", (req, res) => {
    const { nickname, pinHash } = req.body;
    if (!nickname || !pinHash) {
      return res.status(400).json({ error: "Nickname and PIN hash are required" });
    }
    const db = loadDb();
    const matchedRooms = [];
    Object.keys(db.rooms).forEach((code) => {
      const room = db.rooms[code];
      const user = room.users[nickname];
      if (user && user.pinHash === pinHash) {
        matchedRooms.push({
          code,
          config: {
            dates: room.dates,
            createdAt: room.createdAt,
            createdBy: room.createdBy
          }
        });
      }
    });
    res.json({
      success: true,
      rooms: matchedRooms
    });
  });
  app.post("/api/rooms/:code/dates", (req, res) => {
    const { code } = req.params;
    const { nickname, pinHash, dates } = req.body;
    if (!nickname || !pinHash || !Array.isArray(dates)) {
      return res.status(400).json({ error: "Nickname, PIN hash, and dates are required" });
    }
    const db = loadDb();
    const room = db.rooms[code?.toUpperCase()];
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    const user = room.users[nickname];
    if (!user) {
      return res.status(404).json({ error: "User not found in this room" });
    }
    if (user.pinHash !== pinHash) {
      return res.status(401).json({ error: "Incorrect PIN" });
    }
    room.dates = dates.sort();
    saveDb(db);
    res.json({
      success: true,
      config: {
        dates: room.dates,
        createdBy: room.createdBy,
        createdAt: room.createdAt
      }
    });
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}
startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
//# sourceMappingURL=server.cjs.map
