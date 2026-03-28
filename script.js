import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc,
  onSnapshot, collection, query, where, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

/* =======================
   FIREBASE
======================= */
const firebaseConfig = {
  apiKey: "AIzaSyAVEiHOD1xTnlAFW3h-YjmQcHPsx4saaLo",
  authDomain: "cocaro-8be98.firebaseapp.com",
  projectId: "cocaro-8be98",
  storageBucket: "cocaro-8be98.firebasestorage.app",
  messagingSenderId: "620011719200",
  appId: "1:620011719200:web:fe8f79429587d96ddb4a45"
};

let app = null;
let db = null;
try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
} catch (e) {
  console.log("Chạy ở chế độ Offline.", e);
}

/* =======================
   LOCAL UID
======================= */
let myLocalUid = localStorage.getItem("caro_uid");
if (!myLocalUid) {
  myLocalUid = "user_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  localStorage.setItem("caro_uid", myLocalUid);
}

/* =======================
   CONFIG + DOM
======================= */
const BOARD_SIZE = 20;

const boardElement = document.getElementById("board");
const turnIndicator = document.getElementById("turnIndicator");
const modeSelect = document.getElementById("gameMode");
const onlinePanel = document.getElementById("onlinePanel");
const roomStatus = document.getElementById("roomStatus");

const modalOverlay = document.getElementById("modalOverlay");
const modalMessage = document.getElementById("modalMessage");

/* =======================
   STATE
======================= */
const State = {
  board: [],
  moveHistory: [],
  currentPlayer: "X",
  gameActive: true,
  lastMoveElement: null,
  isAiThinking: false,

  currentRoomId: null,
  mySide: null,
  unsubscribeRoom: null,
  unsubscribeRooms: null,
  currentResetSignal: 0,
  
  // Trạng thái online
  opponentRequestedRematch: false,
  lastChatId: 0
};

/* =======================
   TẠO GIAO DIỆN CHAT, REMATCH & EXIT BẰNG JS
======================= */
function injectOnlineUI() {
  if (document.getElementById("inGameUI")) return;

  const style = document.createElement("style");
  style.innerHTML = `
      #inGameUI { display: none; justify-content: center; flex-wrap: wrap; gap: 8px; margin-top: 15px; width: 100%; transition: 0.3s; }
      .chat-panel { display: none; position: fixed; bottom: 70px; left: 50%; transform: translateX(-50%); width: 340px; background: white; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); z-index: 1000; flex-direction: column; overflow: hidden; border: 1px solid #cbd5e1; }
      .chat-messages { height: 220px; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; background: #f8fafc; scroll-behavior: smooth; }
      
      .emote-row { display: flex; flex-wrap: wrap; gap: 10px; padding: 10px; background: #e2e8f0; justify-content: center; font-size: 1.5rem; max-height: 95px; overflow-y: auto; }
      .emote-btn { cursor: pointer; transition: transform 0.2s; user-select: none; padding: 2px; }
      .emote-btn:hover { transform: scale(1.3); }
      
      .chat-msg { max-width: 85%; padding: 8px 12px; border-radius: 15px; font-size: 0.95rem; word-wrap: break-word; font-weight: 500;}
      .chat-mine { background: #bfdbfe; color: #1e3a8a; align-self: flex-end; border-bottom-right-radius: 2px; }
      .chat-theirs { background: #e2e8f0; color: #334155; align-self: flex-start; border-bottom-left-radius: 2px; }
      .pulse-btn { animation: pulseWarning 1s infinite alternate !important; background-color: #ef4444 !important; }
      @keyframes pulseWarning { from { transform: scale(1); box-shadow: 0 0 0 rgba(239, 68, 68, 0.4); } to { transform: scale(1.05); box-shadow: 0 0 15px rgba(239, 68, 68, 0.8); } }
      .toast-msg { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: rgba(30, 41, 59, 0.9); color: white; padding: 10px 20px; border-radius: 30px; font-weight: bold; z-index: 9999; opacity: 0; transition: 0.3s; pointer-events: none; }
      .toast-msg.show { opacity: 1; top: 50px; }
  `;
  document.head.appendChild(style);

  // Toolbar
  const inGameUI = document.createElement("div");
  inGameUI.id = "inGameUI";
  inGameUI.innerHTML = `
      <button class="btn-action" style="background:#ef4444; color:white; border:none;" onclick="window.leaveRoom()">🚪 Thoát</button>
      <button id="btnInGameRematch" class="btn-action" style="background:#f59e0b; color:white; border:none;" onclick="window.requestRematch()">🔄 Chơi Lại</button>
      <button class="btn-action" style="background:#3b82f6; color:white; border:none; position:relative;" onclick="window.toggleChat()">
        💬 Chat 
        <span id="chatNotif" style="display:none; position:absolute; top:-5px; right:-5px; background:red; color:white; border-radius:50%; width:18px; height:18px; font-size:11px; line-height:18px; text-align:center;">!</span>
      </button>
  `;
  document.querySelector("header").appendChild(inGameUI);

  // Sinh HTML cho kho Emote tự động
  const emotes = ['🤣','😡','😢','🏳️','👏','👍','👎','🤔','😎','😭','🤬','🤯','💩','👻','🤡','❤️','🔥','😴'];
  const emotesHTML = emotes.map(e => `<span class="emote-btn" onclick="window.sendChat('${e}')">${e}</span>`).join('');

  // Chat Panel
  const chatPanel = document.createElement("div");
  chatPanel.id = "chatPanel";
  chatPanel.className = "chat-panel";
  chatPanel.innerHTML = `
      <div style="background: #3b82f6; color: white; padding: 10px; font-weight: bold; text-align: center; display:flex; justify-content:space-between; align-items:center;">
         <span>Kênh Trò Chuyện</span>
         <span onclick="window.toggleChat()" style="cursor:pointer; font-size:1.2rem;">✖</span>
      </div>
      <div id="chatMessages" class="chat-messages"></div>
      <div class="emote-row">
          ${emotesHTML}
      </div>
      <div style="display: flex; border-top: 1px solid #cbd5e1; background:white;">
          <input type="text" id="chatInput" placeholder="Nhắn gì đó..." style="flex: 1; border: none; padding: 12px; outline: none; background:transparent;">
          <button onclick="window.sendTextChat()" style="border: none; background: #10b981; color: white; padding: 0 20px; cursor: pointer; font-weight: bold;">Gửi</button>
      </div>
  `;
  document.body.appendChild(chatPanel);

  // Toast
  const toast = document.createElement("div");
  toast.id = "gameToast";
  toast.className = "toast-msg";
  document.body.appendChild(toast);
  
  // Enter để gửi chat
  document.getElementById("chatInput").addEventListener("keypress", function(e) {
      if (e.key === "Enter") window.sendTextChat();
  });
}

window.showToast = function(msg) {
  const toast = document.getElementById("gameToast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3500);
}

/* =======================
   THOÁT PHÒNG & XÓA PHÒNG
======================= */
window.leaveRoom = async function() {
    if (State.currentRoomId && State.mySide && db) {
        const roomRef = doc(db, "rooms", State.currentRoomId);
        try {
            const snap = await getDoc(roomRef);
            if (snap.exists()) {
                const data = snap.data();
                let pX = data.playerX;
                let pO = data.playerO;
                
                // Gỡ tên mình ra khỏi ghế
                if (State.mySide === "X") pX = "";
                if (State.mySide === "O") pO = "";

                if (pX === "" && pO === "") {
                    // Nếu cả 2 ghế đều trống -> Hủy diệt phòng này khỏi Firebase luôn!
                    await deleteDoc(roomRef);
                } else {
                    // Nếu người kia vẫn còn ở lại -> Báo cho họ biết mình đã out
                    await updateDoc(roomRef, {
                        playerX: pX,
                        playerO: pO,
                        lastActive: Date.now()
                    });
                }
            }
        } catch (e) {
            console.error("Lỗi khi thoát phòng", e);
        }
    }
    window.showToast("Đã rời phòng!");
    if (modeSelect) modeSelect.value = "pvp";
    window.handleModeChange();
};

// Cứu cánh cuối cùng: Bắt sự kiện khi người dùng nhấn X tắt tab hoặc F5
window.addEventListener("beforeunload", (e) => {
    if (modeSelect && modeSelect.value === "online" && State.currentRoomId && State.mySide && db) {
        // Trình duyệt đang tắt, gọi lệnh hỏa tốc (không await được)
        const roomRef = doc(db, "rooms", State.currentRoomId);
        getDoc(roomRef).then(snap => {
            if (snap.exists()) {
                const data = snap.data();
                let pX = data.playerX;
                let pO = data.playerO;
                if (State.mySide === "X") pX = "";
                if (State.mySide === "O") pO = "";

                if (pX === "" && pO === "") {
                    deleteDoc(roomRef); // Cả 2 đều out
                } else {
                    updateDoc(roomRef, { playerX: pX, playerO: pO }); // Người kia còn
                }
            }
        }).catch(()=>{});
    }
});

/* =======================
   UTILS
======================= */
function emptyBoard() { return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill("")); }
function inBounds(r, c) { return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE; }
function flattenBoard2D(b2) { return b2.flat(); }
function unflattenTo2D(board1D) {
  const b = emptyBoard();
  for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
    b[Math.floor(i / BOARD_SIZE)][i % BOARD_SIZE] = board1D[i] || "";
  }
  return b;
}
function indexOfMove(r, c) { return r * BOARD_SIZE + c; }
function rcFromIndex(idx) { return { r: Math.floor(idx / BOARD_SIZE), c: idx % BOARD_SIZE }; }
function getCellElement(r, c) { return boardElement.querySelector(`[data-row="${r}"][data-col="${c}"]`); }
function showModal(msg) {
  modalMessage.innerHTML = msg;
  modalOverlay.classList.add("active");
}

/* =======================
   UI CẬP NHẬT
======================= */
function updateUIState() {
  const mode = modeSelect ? modeSelect.value : "pvp";
  const inGameUI = document.getElementById("inGameUI");

  if (mode === "online" && State.currentRoomId) {
      if (inGameUI) inGameUI.style.display = "flex";
  } else {
      if (inGameUI) inGameUI.style.display = "none";
      const chatPanel = document.getElementById("chatPanel");
      if(chatPanel) chatPanel.style.display = "none";
  }

  if (State.isAiThinking) {
    turnIndicator.textContent = "💻 Máy đang tính...";
    turnIndicator.style.color = "#94a3b8"; turnIndicator.style.borderColor = "#94a3b8";
    return;
  }

  if (mode === "online") {
    if (!State.currentRoomId) {
      turnIndicator.textContent = "Chưa vào phòng";
      turnIndicator.style.color = "#94a3b8"; turnIndicator.style.borderColor = "#cbd5e1";
      return;
    }
    if (State.currentPlayer === State.mySide) {
      turnIndicator.textContent = `Lượt đi: Bạn (${State.currentPlayer})`;
      turnIndicator.style.color = State.currentPlayer === "X" ? "var(--x-color)" : "var(--o-color)";
    } else {
      turnIndicator.textContent = `Đợi Đối thủ (${State.currentPlayer})...`;
      turnIndicator.style.color = "#64748b";
    }
    turnIndicator.style.borderColor = State.currentPlayer === "X" ? "var(--x-color)" : "var(--o-color)";
    return;
  }

  turnIndicator.textContent = mode === "pvp" ? `Lượt đi: Người chơi ${State.currentPlayer}` : (State.currentPlayer === "X" ? "Lượt đi: Bạn (X)" : "Lượt đi: Máy (O)");
  turnIndicator.style.color = State.currentPlayer === "X" ? "var(--x-color)" : "var(--o-color)";
  turnIndicator.style.borderColor = State.currentPlayer === "X" ? "var(--x-color)" : "var(--o-color)";
}

/* =======================
   INIT / RENDER
======================= */
function buildBoardDOM() {
  if (!boardElement) return;
  boardElement.innerHTML = "";
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.row = r; cell.dataset.col = c;
      cell.addEventListener("click", handleCellClick);
      boardElement.appendChild(cell);
    }
  }
}

function resetLocalGame(keepOnline = false) {
  State.board = emptyBoard();
  State.moveHistory = [];
  State.currentPlayer = "X";
  State.gameActive = true;
  State.lastMoveElement = null;
  State.isAiThinking = false;
  State.opponentRequestedRematch = false;
  
  const rematchBtn = document.getElementById("btnInGameRematch");
  if (rematchBtn) {
      rematchBtn.innerHTML = "🔄 Chơi Lại";
      rematchBtn.classList.remove("pulse-btn");
  }

  if (modalOverlay) modalOverlay.classList.remove("active");
  document.querySelectorAll(".win-cell").forEach(e => e.classList.remove("win-cell"));

  if (!keepOnline) {
    if (State.unsubscribeRoom) { State.unsubscribeRoom(); State.unsubscribeRoom = null; }
    State.currentRoomId = null;
    State.mySide = null;
    State.currentResetSignal = 0;
    if (roomStatus) roomStatus.innerHTML = "";
  }
  
  buildBoardDOM();
  updateUIState();
}

window.initGame = function (keepOnline = false) { resetLocalGame(keepOnline); };

/* =======================
   WIN CHECK
======================= */
function checkWin(row, col, player) {
  const directions = [[[0, 1], [0, -1]], [[1, 0], [-1, 0]], [[1, 1], [-1, -1]], [[1, -1], [-1, 1]]];
  for (const dir of directions) {
    const winCells = [{ row, col }];
    for (const [dr, dc] of dir) {
      let r = row + dr, c = col + dc;
      while (inBounds(r, c) && State.board[r][c] === player) {
        winCells.push({ row: r, col: c });
        r += dr; c += dc;
      }
    }
    if (winCells.length >= 5) return winCells;
  }
  return null;
}

function highlightWinCells(cells) {
  cells.forEach(p => {
    const el = getCellElement(p.row, p.col);
    if(el) el.classList.add("win-cell");
  });
}

/* =======================
   APPLY MOVE (Local)
======================= */
function applyMoveLocally(r, c, player, isOnlineSync = false) {
  if (!State.gameActive || !inBounds(r, c) || State.board[r][c] !== "") return { ok: false };

  State.board[r][c] = player;
  const cell = getCellElement(r, c);
  
  if (cell) {
    cell.textContent = player;
    cell.classList.add(player.toLowerCase());
    if (State.lastMoveElement) State.lastMoveElement.classList.remove("last-move");
    cell.classList.add("last-move");
    State.lastMoveElement = cell;
  }

  State.moveHistory.push({ row: r, col: c, player, element: cell });

  const winCells = checkWin(r, c, player);
  if (winCells) {
    highlightWinCells(winCells);
    State.gameActive = false;
    
    if (!isOnlineSync) {
        let msg = modeSelect.value === "online" ? "🎉 Bạn đã chiến thắng!" : `🎉 Người chơi ${player} thắng!`;
        if (modeSelect.value !== "online" && player === "O") msg = "🤖 Máy đã thắng!";
        showModal(msg);
    }
    return { ok: true, winCells: winCells };
  }

  if (State.moveHistory.length === BOARD_SIZE * BOARD_SIZE) {
    State.gameActive = false;
    showModal("🤝 Hòa cờ!");
    return { ok: true, draw: true };
  }

  State.currentPlayer = (State.currentPlayer === "X") ? "O" : "X";
  updateUIState();
  return { ok: true };
}

/* =======================
   AI (MASTER PATTERN HEURISTIC)
======================= */
const PATTERNS = [
  { re: /PPPPP/, score: 100000000 }, { re: /\.PPPP\./, score: 10000000 }, 
  { re: /BPPPP\./, score: 1000000 }, { re: /\.PPPPB/, score: 1000000 }, 
  { re: /P\.PPP/, score: 1000000 }, { re: /PPP\.P/, score: 1000000 },
  { re: /PP\.PP/, score: 1000000 }, { re: /\.PPP\./, score: 100000 }, 
  { re: /\.P\.PP\./, score: 80000 }, { re: /\.PP\.P\./, score: 80000 },
  { re: /BPPP\.\./, score: 10000 }, { re: /\.\.PPPB/, score: 10000 },
  { re: /BPP\.P\./, score: 8000 }, { re: /\.P\.PPB/, score: 8000 },
  { re: /BP\.PP\./, score: 8000 }, { re: /\.PP\.PB/, score: 8000 },
  { re: /P\.\.PP/, score: 5000 }, { re: /PP\.\.P/, score: 5000 },
  { re: /P\.P\.P/, score: 5000 }, { re: /\.PP\./, score: 1000 }, 
  { re: /\.P\.P\./, score: 800 }, { re: /\.\.PP\.\./, score: 600 },
  { re: /BPP\.\.\./, score: 100 }, { re: /\.\.\.PPB/, score: 100 }
];

function getAxisString(r, c, dr, dc, player) {
  let str = "";
  for (let i = -4; i <= 4; i++) {
    const nr = r + dr * i, nc = c + dc * i;
    if (!inBounds(nr, nc)) str += "B";
    else if (State.board[nr][nc] === player) str += "P";
    else if (State.board[nr][nc] === "") str += ".";
    else str += "B";
  }
  return str;
}

function evaluateCellMaster(r, c, player) {
  State.board[r][c] = player; 
  let score = 0; let open3Count = 0; let closed4Count = 0;
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of dirs) {
    const str = getAxisString(r, c, dr, dc, player);
    let lineScore = 0;
    for (let i = 0; i < PATTERNS.length; i++) {
      if (PATTERNS[i].re.test(str)) { lineScore = PATTERNS[i].score; break; }
    }
    score += lineScore;
    if (lineScore === 100000 || lineScore === 80000) open3Count++;
    if (lineScore === 1000000) closed4Count++;
  }
  State.board[r][c] = ""; 
  if (closed4Count >= 2) score += 10000000;
  if (closed4Count >= 1 && open3Count >= 1) score += 5000000;
  if (open3Count >= 2) score += 2000000;
  return score;
}

function calculateLocalAIMove(difficulty, aiSide) {
  const oppSide = aiSide === "X" ? "O" : "X";
  let candidates = [];
  let isBoardEmpty = true;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (State.board[r][c] !== "") { isBoardEmpty = false; continue; }
      let isNearPiece = false;
      for (let i = -2; i <= 2 && !isNearPiece; i++) {
        for (let j = -2; j <= 2; j++) {
          if (inBounds(r+i, c+j) && State.board[r+i][c+j] !== "") isNearPiece = true;
        }
      }
      if (!isNearPiece) continue;

      let attackScore = evaluateCellMaster(r, c, aiSide);
      let defenseScore = evaluateCellMaster(r, c, oppSide);
      let centerBias = 20 - (Math.abs(r - BOARD_SIZE/2) + Math.abs(c - BOARD_SIZE/2));
      let totalScore = (attackScore * 1.05) + defenseScore + centerBias;

      candidates.push({ r, c, score: totalScore, attackScore });
    }
  }

  if (isBoardEmpty || candidates.length === 0) {
    return { r: Math.floor(BOARD_SIZE / 2), c: Math.floor(BOARD_SIZE / 2) };
  }

  candidates.sort((a, b) => b.score - a.score);

  if (difficulty === "easy") return candidates[Math.floor(Math.random() * Math.min(6, candidates.length))];
  if (difficulty === "medium") return candidates[Math.floor(Math.random() * Math.min(2, candidates.length))];
  
  return candidates[0];
}

/* =======================
   CLICK HANDLER
======================= */
function handleCellClick(e) {
  if (!State.gameActive || State.isAiThinking) return;

  const r = parseInt(e.target.dataset.row, 10);
  const c = parseInt(e.target.dataset.col, 10);
  if (State.board[r][c] !== "") return;

  const mode = modeSelect ? modeSelect.value : "pvp";

  if (mode === "online") {
    if (!State.currentRoomId || State.currentPlayer !== State.mySide) return;
    const result = applyMoveLocally(r, c, State.mySide);
    if (result.ok) {
        syncMoveToFirebase(r, c, State.mySide, result.winCells);
    }
    return;
  }

  applyMoveLocally(r, c, State.currentPlayer);

  if (State.gameActive && mode.startsWith("pve") && State.currentPlayer === "O") {
    State.isAiThinking = true;
    updateUIState();
    setTimeout(() => {
      let diff = mode.split("-")[1] || "hard";
      if(diff === "super") diff = "hard"; 
      const move = calculateLocalAIMove(diff, "O");
      applyMoveLocally(move.r, move.c, "O");
      State.isAiThinking = false;
      updateUIState();
    }, 50);
  }
}

/* =======================
   ONLINE & FIREBASE
======================= */
function listenToAvailableRooms() {
  if (!db) return;
  const roomsRef = collection(db, "rooms");
  const q = query(roomsRef, where("playerO", "==", ""));
  if (State.unsubscribeRooms) State.unsubscribeRooms();

  State.unsubscribeRooms = onSnapshot(q, (snapshot) => {
    const roomListEl = document.getElementById("availableRooms");
    if (!roomListEl) return;
    roomListEl.innerHTML = "";
    if (snapshot.empty) {
      roomListEl.innerHTML = '<div style="color:#94a3b8; font-size:0.85rem;">Chưa có phòng nào. Hãy tạo phòng mới!</div>';
      return;
    }
    snapshot.forEach(d => {
      const roomName = d.id.replace("room_", "");
      const btn = document.createElement("button");
      btn.className = "btn-room";
      btn.innerHTML = `🏠 <b>${roomName}</b>`;
      btn.onclick = () => { document.getElementById("roomIdInput").value = roomName; window.joinOrCreateRoom(); };
      roomListEl.appendChild(btn);
    });
  });
}

window.joinOrCreateRoom = async function () {
  if (!db) return alert("Hệ thống Offline. Vui lòng kiểm tra mạng!");
  const roomIdInputEl = document.getElementById("roomIdInput");
  if(!roomIdInputEl) return;
  const roomIdInput = roomIdInputEl.value.trim().toLowerCase();
  if (!roomIdInput) return alert("Vui lòng nhập tên phòng!");

  const roomId = "room_" + roomIdInput;
  window.initGame(true);
  const roomRef = doc(db, "rooms", roomId);
  const now = Date.now();

  try {
    const snap = await getDoc(roomRef);
    if (!snap.exists()) {
      await setDoc(roomRef, {
        board1D: Array(BOARD_SIZE * BOARD_SIZE).fill(""),
        turn: "X", lastMoveIndex: -1,
        playerX: myLocalUid, playerO: "",
        resetSignal: now, lastActive: now,
        winner: null, winCells: null, rematchRequest: null
      });
      State.mySide = "X";
      State.currentRoomId = roomId;
      if (roomStatus) roomStatus.innerHTML = `Đã tạo: <span style="color:#2563eb; font-size:1.1rem">${roomIdInput}</span><br>Bạn là Quân X. Đang đợi...`;
    } else {
      const data = snap.data();
      let pX = data.playerX;
      let pO = data.playerO;

      // Xóa người chơi nếu phòng bỏ hoang > 30 phút
      if (!data.lastActive || (now - data.lastActive > 30 * 60 * 1000)) { pX = ""; pO = ""; }

      if (pX === "" && pO === "") {
         await updateDoc(roomRef, {
            board1D: Array(BOARD_SIZE * BOARD_SIZE).fill(""), turn: "X", lastMoveIndex: -1,
            playerX: myLocalUid, playerO: "", resetSignal: now, lastActive: now,
            winner: null, winCells: null, rematchRequest: null
         });
         State.mySide = "X";
      } else {
        if (pX === myLocalUid) State.mySide = "X";
        else if (pO === myLocalUid) State.mySide = "O";
        else if (pX === "") { await updateDoc(roomRef, { playerX: myLocalUid, lastActive: now }); State.mySide = "X"; }
        else if (pO === "") { await updateDoc(roomRef, { playerO: myLocalUid, lastActive: now }); State.mySide = "O"; } 
        else return alert("Phòng đã đủ 2 người đang chơi!");
      }

      State.currentRoomId = roomId;
      State.currentResetSignal = data.resetSignal || 0;
      if (roomStatus) roomStatus.innerHTML = `Vào phòng: <span style="color:#2563eb; font-size:1.1rem">${roomIdInput}</span><br>Bạn là Quân ${State.mySide}`;
    }
    listenToRoom(roomRef);
    updateUIState();
  } catch (e) {
    console.error(e);
    alert("Lỗi truy cập dữ liệu! Hãy mở quyền cho Firebase.");
  }
};

function listenToRoom(roomRef) {
  if (State.unsubscribeRoom) State.unsubscribeRoom();
  State.unsubscribeRoom = onSnapshot(roomRef, (snap) => {
    if (!snap.exists()) {
        // Nếu phòng bị xóa (do cả 2 người leaveRoom)
        if (State.currentRoomId && modeSelect.value === "online") {
            window.showToast("Phòng đã bị xóa do không còn ai!");
            window.initGame();
        }
        return;
    }
    const data = snap.data();

    // Check xem đối thủ có out không
    let isOpponentHere = (State.mySide === "X" && data.playerO !== "") || (State.mySide === "O" && data.playerX !== "");
    if (data.playerX && data.playerO !== "" && roomStatus) {
      roomStatus.innerHTML = `Đang thi đấu: <b>${State.currentRoomId.replace("room_", "")}</b><br>(Bạn là quân ${State.mySide})`;
    } else if (roomStatus) {
      roomStatus.innerHTML = `Vào phòng: <span style="color:#2563eb; font-size:1.1rem">${State.currentRoomId.replace("room_", "")}</span><br>Bạn là Quân ${State.mySide}. Đang đợi...`;
      if (!isOpponentHere && State.gameActive === false && State.currentRoomId) {
          window.showToast("Đối thủ đã rời phòng!");
      }
    }

    // Xử lý Gạ Chơi Lại (Có Timeout)
    const btnRematch = document.getElementById("btnInGameRematch");
    if (data.rematchRequest) {
        if (data.rematchRequest !== State.mySide) {
            State.opponentRequestedRematch = true;
            if(btnRematch) {
               btnRematch.innerHTML = "⚠️ Đối thủ gạ chơi lại (Bấm Đồng ý)";
               btnRematch.classList.add("pulse-btn");
            }
        } else {
            if(btnRematch) btnRematch.innerHTML = "⏳ Đang đợi đối thủ xác nhận...";
        }
    } else {
        State.opponentRequestedRematch = false;
        if(btnRematch) {
            btnRematch.innerHTML = "🔄 Chơi Lại";
            btnRematch.classList.remove("pulse-btn");
        }
    }

    if (data.resetSignal && data.resetSignal !== State.currentResetSignal) {
      State.currentResetSignal = data.resetSignal;
      resetLocalGame(true);
      State.currentPlayer = data.turn || "X";
      updateUIState();
      window.showToast("Ván mới đã bắt đầu!");
      return; 
    }

    if (Array.isArray(data.board1D) && data.board1D.length === BOARD_SIZE * BOARD_SIZE) {
      const serverBoard = unflattenTo2D(data.board1D);
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          const v = serverBoard[r][c];
          if (State.board[r][c] !== v) {
            State.board[r][c] = v;
            const cell = getCellElement(r, c);
            if (cell) {
               cell.textContent = v;
               cell.className = "cell";
               if (v === "X" || v === "O") cell.classList.add(v.toLowerCase());
            }
          }
        }
      }
    }

    if (typeof data.lastMoveIndex === "number" && data.lastMoveIndex !== -1) {
      const { r, c } = rcFromIndex(data.lastMoveIndex);
      const cell = getCellElement(r, c);
      if (cell) {
         if (State.lastMoveElement) State.lastMoveElement.classList.remove("last-move");
         cell.classList.add("last-move");
         State.lastMoveElement = cell;
      }
    }

    if (data.winner && State.gameActive) {
       State.gameActive = false;
       if (data.winCells) highlightWinCells(data.winCells);
       let msg = (data.winner === State.mySide) ? "🎉 Bạn đã chiến thắng!" : "🥲 Đối thủ đã chiến thắng!";
       showModal(msg);
    }

    if (data.chatMessage && data.chatMessage.id !== State.lastChatId) {
        State.lastChatId = data.chatMessage.id;
        displayIncomingChat(data.chatMessage);
    }

    State.currentPlayer = data.turn || "X";
    updateUIState();
  }, (err) => console.error(err));
}

function syncMoveToFirebase(row, col, playerJustMoved, winCellsData) {
  if (!db || !State.currentRoomId) return;
  const roomRef = doc(db, "rooms", State.currentRoomId);
  const lastMoveIndex = indexOfMove(row, col);
  const turnNext = (playerJustMoved === "X") ? "O" : "X";
  
  let payload = {
    board1D: flattenBoard2D(State.board),
    turn: turnNext,
    lastMoveIndex,
    lastActive: Date.now()
  };

  if (winCellsData) {
      payload.winner = playerJustMoved;
      payload.winCells = winCellsData;
  }

  updateDoc(roomRef, payload).catch(e => console.error("Lỗi đồng bộ", e));
}

/* =======================
   REMATCH (Xác nhận 2 chiều + Hủy sau 5s)
======================= */
window.requestRematch = async function () {
  const mode = modeSelect ? modeSelect.value : "pvp";
  if (mode === "online" && State.currentRoomId) {
    const roomRef = doc(db, "rooms", State.currentRoomId);
    
    // Nếu đối thủ đã gạ rồi, mình ấn tức là ĐỒNG Ý
    if (State.opponentRequestedRematch) {
       if (modalOverlay) modalOverlay.classList.remove("active");
       await updateDoc(roomRef, { 
           board1D: Array(BOARD_SIZE * BOARD_SIZE).fill(""), 
           turn: "X", lastMoveIndex: -1, 
           winner: null, winCells: null, rematchRequest: null,
           resetSignal: Date.now(), lastActive: Date.now() 
       }).catch(e => console.error(e));
    } 
    // Nếu chưa ai gạ, mình là người gạ
    else {
       await updateDoc(roomRef, { rematchRequest: State.mySide, lastActive: Date.now() }).catch(e=>console.error(e));
       window.showToast("Đã gửi lời mời, chờ (5 giây)...");

       // Tính năng HỦY SAU 5 GIÂY NẾU KHÔNG TRẢ LỜI
       setTimeout(async () => {
           if (State.currentRoomId) {
               const snap = await getDoc(roomRef);
               // Nếu sau 5s mà request trên Firebase vẫn là của mình (tức là đối phương chưa bấm Đồng ý)
               if (snap.exists() && snap.data().rematchRequest === State.mySide) {
                   updateDoc(roomRef, { rematchRequest: null }).catch(()=>{});
                   window.showToast("Lời mời chơi lại đã hết hạn!");
               }
           }
       }, 5000);
    }
  } else {
      window.initGame();
  }
};
window.triggerRematch = window.requestRematch; 

/* =======================
   CHAT LOGIC
======================= */
window.toggleChat = function() {
    const panel = document.getElementById("chatPanel");
    const notif = document.getElementById("chatNotif");
    if (!panel) return;
    if (panel.style.display === "none" || panel.style.display === "") {
        panel.style.display = "flex";
        if(notif) notif.style.display = "none";
        const box = document.getElementById("chatMessages");
        if(box) box.scrollTop = box.scrollHeight;
    } else {
        panel.style.display = "none";
    }
};

window.sendChat = function(text) {
    if (!State.currentRoomId || !db) { window.showToast("Chưa vào phòng Online!"); return; }
    const roomRef = doc(db, "rooms", State.currentRoomId);
    updateDoc(roomRef, {
        chatMessage: { text: text, sender: State.mySide, id: Date.now() },
        lastActive: Date.now()
    }).catch(e => console.log(e));
};

window.sendTextChat = function() {
    const input = document.getElementById("chatInput");
    if(input && input.value.trim() !== "") {
        window.sendChat(input.value.trim());
        input.value = "";
    }
};

function displayIncomingChat(msgData) {
    const box = document.getElementById("chatMessages");
    const panel = document.getElementById("chatPanel");
    const notif = document.getElementById("chatNotif");
    if (!box) return;

    const isMe = msgData.sender === State.mySide;
    const div = document.createElement("div");
    div.className = "chat-msg " + (isMe ? "chat-mine" : "chat-theirs");
    div.textContent = msgData.text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;

    if (!isMe && (panel.style.display === "none" || panel.style.display === "")) {
        if(notif) notif.style.display = "block";
        window.showToast("💬 Đối thủ: " + msgData.text);
    }
}

/* =======================
   MODE CHANGE & UNDO
======================= */
window.handleModeChange = function () {
  const mode = modeSelect ? modeSelect.value : "pvp";
  if (mode === "online") {
    if (onlinePanel) onlinePanel.style.display = "block";
    window.initGame(); listenToAvailableRooms();
  } else {
    if (onlinePanel) onlinePanel.style.display = "none";
    if (State.unsubscribeRooms) { State.unsubscribeRooms(); State.unsubscribeRooms = null; }
    window.initGame();
  }
};

window.undoMove = function () {
  const mode = modeSelect ? modeSelect.value : "pvp";
  if (State.moveHistory.length < 1 || State.isAiThinking || mode === "online") return;
  const steps = mode.startsWith("pve") ? 2 : 1;
  for (let i = 0; i < steps; i++) {
    if (State.moveHistory.length === 0) break;
    const last = State.moveHistory.pop();
    State.board[last.row][last.col] = "";
    if (last.element) { last.element.textContent = ""; last.element.className = "cell"; }
  }
  document.querySelectorAll(".win-cell").forEach(e => e.classList.remove("win-cell"));
  if (modalOverlay) modalOverlay.classList.remove("active");
  if (State.moveHistory.length > 0) {
    State.lastMoveElement = State.moveHistory[State.moveHistory.length - 1].element;
    if (State.lastMoveElement) State.lastMoveElement.classList.add("last-move");
  } else State.lastMoveElement = null;
  State.gameActive = true; State.currentPlayer = "X";
  updateUIState();
};

/* =======================
   CHEAT
======================= */
let cheatClicks = 0; let cheatTimeout = null;
window.handleFooterClick = function () {
  clearTimeout(cheatTimeout); cheatClicks++;
  const cheatBtn = document.getElementById("cheatBtn");
  if (cheatClicks >= 5) { if (cheatBtn) cheatBtn.style.display = "block"; cheatClicks = 0; return; }
  cheatTimeout = setTimeout(() => {
    if (cheatClicks === 2) { if (cheatBtn) cheatBtn.style.display = "none"; }
    cheatClicks = 0;
  }, 500); 
};
window.handleCheatClick = window.handleFooterClick;

window.triggerCheat = function () {
  if (!State.gameActive || State.isAiThinking) return;
  const mode = modeSelect ? modeSelect.value : "pvp";
  if (mode === "online") {
    if (!State.currentRoomId || State.currentPlayer !== State.mySide) return;
    State.isAiThinking = true; updateUIState();
    setTimeout(() => {
      const move = calculateLocalAIMove("hard", State.mySide);
      const result = applyMoveLocally(move.r, move.c, State.mySide);
      if (result.ok) syncMoveToFirebase(move.r, move.c, State.mySide, result.winCells);
      State.isAiThinking = true; 
      setTimeout(()=>{ State.isAiThinking = false; updateUIState(); }, 300);
    }, 50);
  } else {
    State.isAiThinking = true; updateUIState();
    setTimeout(() => {
      const move = calculateLocalAIMove("hard", State.currentPlayer);
      applyMoveLocally(move.r, move.c, State.currentPlayer);
      State.isAiThinking = false; updateUIState();
    }, 50);
  }
};

/* =======================
   MODAL + FULLSCREEN
======================= */
window.closeModal = function () { if(modalOverlay) modalOverlay.classList.remove("active"); };
window.enterFullScreen = function () {
  const el = document.documentElement;
  if (el.requestFullscreen) el.requestFullscreen();
  document.body.classList.add("fullscreen-mode");
};
window.exitFullScreen = function () {
  if (document.exitFullscreen) document.exitFullscreen();
  document.body.classList.remove("fullscreen-mode");
};

/* =======================
   START 
======================= */
document.addEventListener("DOMContentLoaded", () => {
   injectOnlineUI(); 
   buildBoardDOM();
   window.initGame();
   
   if (turnIndicator) {
      turnIndicator.addEventListener("click", window.handleCheatClick);
      turnIndicator.style.cursor = "pointer"; 
   }
});
