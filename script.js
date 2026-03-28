import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc,
  onSnapshot, collection, query, where
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
};

/* =======================
   UTILS
======================= */
function emptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(""));
}
function inBounds(r, c) {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}
function flattenBoard2D(b2) {
  return b2.flat();
}
function unflattenTo2D(board1D) {
  const b = emptyBoard();
  for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
    b[Math.floor(i / BOARD_SIZE)][i % BOARD_SIZE] = board1D[i] || "";
  }
  return b;
}
function indexOfMove(r, c) {
  return r * BOARD_SIZE + c;
}
function rcFromIndex(idx) {
  return { r: Math.floor(idx / BOARD_SIZE), c: idx % BOARD_SIZE };
}
function getCellElement(r, c) {
  return boardElement.querySelector(`[data-row="${r}"][data-col="${c}"]`);
}
function showModal(msg) {
  modalMessage.innerHTML = msg;
  modalOverlay.classList.add("active");
}

/* =======================
   UI
======================= */
function updateUIState() {
  const mode = modeSelect ? modeSelect.value : "pvp";

  if (State.isAiThinking) {
    turnIndicator.textContent = "💻 Máy đang tính...";
    turnIndicator.style.color = "#94a3b8";
    turnIndicator.style.borderColor = "#94a3b8";
    return;
  }

  if (mode === "pvp") {
    turnIndicator.textContent = `Lượt đi: Người chơi ${State.currentPlayer}`;
    turnIndicator.style.color = State.currentPlayer === "X" ? "var(--x-color)" : "var(--o-color)";
    turnIndicator.style.borderColor = State.currentPlayer === "X" ? "var(--x-color)" : "var(--o-color)";
    return;
  }

  if (mode === "online") {
    if (!State.currentRoomId) {
      turnIndicator.textContent = "Chưa vào phòng";
      turnIndicator.style.color = "#94a3b8";
      turnIndicator.style.borderColor = "#cbd5e1";
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

  turnIndicator.textContent = State.currentPlayer === "X" ? "Lượt đi: Bạn (X)" : "Lượt đi: Máy (O)";
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
      cell.dataset.row = r;
      cell.dataset.col = c;
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
  
  if (modalOverlay) modalOverlay.classList.remove("active");

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

window.initGame = function (keepOnline = false) {
  resetLocalGame(keepOnline);
};

/* =======================
   WIN CHECK
======================= */
function checkWin(row, col, player) {
  const directions = [
    [[0, 1], [0, -1]],
    [[1, 0], [-1, 0]],
    [[1, 1], [-1, -1]],
    [[1, -1], [-1, 1]]
  ];

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
   APPLY MOVE
======================= */
function applyMoveLocally(r, c, player) {
  if (!State.gameActive || !inBounds(r, c) || State.board[r][c] !== "") return false;

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
    const mode = modeSelect ? modeSelect.value : "pvp";
    let msg = mode === "online" ? (player === State.mySide ? "🎉 Bạn đã chiến thắng!" : "🥲 Đối thủ đã thắng!") :
              mode === "pvp" ? `🎉 Người chơi ${player} thắng!` : 
              (player === "X" ? "🎉 Bạn đã chiến thắng!" : "🤖 Máy đã thắng!");
    showModal(msg);
    return true;
  }

  if (State.moveHistory.length === BOARD_SIZE * BOARD_SIZE) {
    State.gameActive = false;
    showModal("🤝 Hòa cờ!");
    return true;
  }

  State.currentPlayer = (State.currentPlayer === "X") ? "O" : "X";
  updateUIState();
  return true;
}

/* =======================
   AI (MASTER PATTERN HEURISTIC)
======================= */
const PATTERNS = [
  { re: /PPPPP/, score: 100000000 }, 
  { re: /\.PPPP\./, score: 10000000 }, 
  { re: /BPPPP\./, score: 1000000 }, 
  { re: /\.PPPPB/, score: 1000000 }, 
  { re: /P\.PPP/, score: 1000000 }, 
  { re: /PPP\.P/, score: 1000000 },
  { re: /PP\.PP/, score: 1000000 },
  { re: /\.PPP\./, score: 100000 }, 
  { re: /\.P\.PP\./, score: 80000 }, 
  { re: /\.PP\.P\./, score: 80000 },
  { re: /BPPP\.\./, score: 10000 }, 
  { re: /\.\.PPPB/, score: 10000 },
  { re: /BPP\.P\./, score: 8000 },
  { re: /\.P\.PPB/, score: 8000 },
  { re: /BP\.PP\./, score: 8000 },
  { re: /\.PP\.PB/, score: 8000 },
  { re: /P\.\.PP/, score: 5000 },
  { re: /PP\.\.P/, score: 5000 },
  { re: /P\.P\.P/, score: 5000 },
  { re: /\.PP\./, score: 1000 }, 
  { re: /\.P\.P\./, score: 800 },
  { re: /\.\.PP\.\./, score: 600 },
  { re: /BPP\.\.\./, score: 100 }, 
  { re: /\.\.\.PPB/, score: 100 }
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
  let score = 0;
  let open3Count = 0;
  let closed4Count = 0;

  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of dirs) {
    const str = getAxisString(r, c, dr, dc, player);
    let lineScore = 0;
    
    for (let i = 0; i < PATTERNS.length; i++) {
      if (PATTERNS[i].re.test(str)) {
        lineScore = PATTERNS[i].score;
        break;
      }
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
      if (State.board[r][c] !== "") {
        isBoardEmpty = false;
        continue;
      }

      let isNearPiece = false;
      for (let i = -2; i <= 2 && !isNearPiece; i++) {
        for (let j = -2; j <= 2; j++) {
          let nr = r + i, nc = c + j;
          if (inBounds(nr, nc) && State.board[nr][nc] !== "") isNearPiece = true;
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
    const ok = applyMoveLocally(r, c, State.mySide);
    if (ok) syncMoveToFirebase(r, c, State.mySide);
    return;
  }

  const ok = applyMoveLocally(r, c, State.currentPlayer);
  if (!ok) return;

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
   XÓA SLOT KHI OUT GAME (Tự động rời phòng)
======================= */
window.addEventListener("beforeunload", () => {
  if (modeSelect && modeSelect.value === "online" && State.currentRoomId && State.mySide) {
    const roomRef = doc(db, "rooms", State.currentRoomId);
    if(State.mySide === "X") updateDoc(roomRef, { playerX: "" }).catch(()=>{});
    if(State.mySide === "O") updateDoc(roomRef, { playerO: "" }).catch(()=>{});
  }
});

/* =======================
   ONLINE
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
      btn.onclick = () => {
        document.getElementById("roomIdInput").value = roomName;
        window.joinOrCreateRoom();
      };
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
        turn: "X",
        lastMoveIndex: -1,
        playerX: myLocalUid,
        playerO: "",
        resetSignal: now,
        lastActive: now
      });
      State.mySide = "X";
      State.currentRoomId = roomId;
      if (roomStatus) roomStatus.innerHTML = `Đã tạo: <span style="color:#2563eb; font-size:1.1rem">${roomIdInput}</span><br>Bạn là Quân X. Đang đợi...`;
    } else {
      const data = snap.data();
      let pX = data.playerX;
      let pO = data.playerO;

      // Xóa người chơi nếu phòng không có ai động vào > 30 phút
      if (!data.lastActive || (now - data.lastActive > 30 * 60 * 1000)) {
         pX = ""; pO = "";
      }

      // NẾU CẢ 2 SLOT ĐỀU TRỐNG (Hoặc do out game, hoặc do hết hạn) -> RESET BÀN CỜ LUÔN!
      if (pX === "" && pO === "") {
         await updateDoc(roomRef, {
            board1D: Array(BOARD_SIZE * BOARD_SIZE).fill(""),
            turn: "X",
            lastMoveIndex: -1,
            playerX: myLocalUid,
            playerO: "",
            resetSignal: now,
            lastActive: now
         });
         State.mySide = "X";
      } else {
        // Vào tiếp nếu còn slot
        if (pX === myLocalUid) State.mySide = "X";
        else if (pO === myLocalUid) State.mySide = "O";
        else if (pX === "") {
          await updateDoc(roomRef, { playerX: myLocalUid, lastActive: now });
          State.mySide = "X";
        }
        else if (pO === "") {
          await updateDoc(roomRef, { playerO: myLocalUid, lastActive: now });
          State.mySide = "O";
        } else return alert("Phòng đã đủ 2 người đang chơi!");
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
    if (!snap.exists()) return;
    const data = snap.data();
    if (data.playerX && data.playerO !== "" && roomStatus) {
      roomStatus.innerHTML = `Đang thi đấu: <b>${State.currentRoomId.replace("room_", "")}</b><br>(Bạn là quân ${State.mySide})`;
    }
    if (data.resetSignal && data.resetSignal !== State.currentResetSignal) {
      State.currentResetSignal = data.resetSignal;
      resetLocalGame(true);
      State.currentPlayer = data.turn || "X";
      updateUIState();
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
    State.currentPlayer = data.turn || "X";
    updateUIState();
  }, (err) => console.error(err));
}

function syncMoveToFirebase(row, col, playerJustMoved) {
  if (!db || !State.currentRoomId) return;
  const roomRef = doc(db, "rooms", State.currentRoomId);
  const lastMoveIndex = indexOfMove(row, col);
  const turnNext = (playerJustMoved === "X") ? "O" : "X";
  updateDoc(roomRef, {
    board1D: flattenBoard2D(State.board),
    turn: turnNext,
    lastMoveIndex,
    lastActive: Date.now()
  }).catch(e => console.error("Lỗi đồng bộ", e));
}

/* =======================
   MODE CHANGE
======================= */
window.handleModeChange = function () {
  const mode = modeSelect ? modeSelect.value : "pvp";
  if (mode === "online") {
    if (onlinePanel) onlinePanel.style.display = "block";
    window.initGame();
    listenToAvailableRooms();
  } else {
    if (onlinePanel) onlinePanel.style.display = "none";
    if (State.unsubscribeRooms) { State.unsubscribeRooms(); State.unsubscribeRooms = null; }
    window.initGame();
  }
};

/* =======================
   REMATCH
======================= */
window.triggerRematch = async function () {
  const mode = modeSelect ? modeSelect.value : "pvp";
  if (mode === "online" && State.currentRoomId) {
    if (modalOverlay) modalOverlay.classList.remove("active");
    const roomRef = doc(db, "rooms", State.currentRoomId);
    const now = Date.now();
    try {
      await updateDoc(roomRef, { board1D: Array(BOARD_SIZE * BOARD_SIZE).fill(""), turn: "X", lastMoveIndex: -1, resetSignal: now, lastActive: now });
    } catch (e) {
      console.error("Lỗi yêu cầu ván mới", e);
    }
  } else window.initGame();
};

/* =======================
   UNDO
======================= */
window.undoMove = function () {
  const mode = modeSelect ? modeSelect.value : "pvp";
  if (State.moveHistory.length < 1 || State.isAiThinking || mode === "online") return;
  const steps = mode.startsWith("pve") ? 2 : 1;
  for (let i = 0; i < steps; i++) {
    if (State.moveHistory.length === 0) break;
    const last = State.moveHistory.pop();
    State.board[last.row][last.col] = "";
    if (last.element) {
        last.element.textContent = "";
        last.element.className = "cell";
    }
  }
  document.querySelectorAll(".win-cell").forEach(e => e.classList.remove("win-cell"));
  if (modalOverlay) modalOverlay.classList.remove("active");
  if (State.moveHistory.length > 0) {
    State.lastMoveElement = State.moveHistory[State.moveHistory.length - 1].element;
    if (State.lastMoveElement) State.lastMoveElement.classList.add("last-move");
  } else State.lastMoveElement = null;
  State.gameActive = true;
  State.currentPlayer = "X";
  updateUIState();
};

/* =======================
   CHEAT (HIỆN NGAY LẬP TỨC)
======================= */
let cheatClicks = 0;
let cheatTimeout = null;

window.handleFooterClick = function () {
  clearTimeout(cheatTimeout);
  cheatClicks++;
  
  const cheatBtn = document.getElementById("cheatBtn");

  // Nếu bấm chạm mốc 5 cái -> HIỆN NGAY LẬP TỨC, không cần chờ
  if (cheatClicks >= 5) {
    if (cheatBtn) cheatBtn.style.display = "block";
    cheatClicks = 0; // Hiện xong thì reset đếm
    return;
  }

  // Nếu dừng tay không bấm nữa trong 0.5 giây
  cheatTimeout = setTimeout(() => {
    // Nếu vừa bấm đúng 2 cái thì ẨN đi
    if (cheatClicks === 2) {
      if (cheatBtn) cheatBtn.style.display = "none";
    }
    cheatClicks = 0; // Trả về 0 để đếm lại từ đầu
  }, 500); 
};

// Gắn chung hàm này cho chữ Lượt Đi ở trên cùng
window.handleCheatClick = window.handleFooterClick;

window.triggerCheat = function () {
  if (!State.gameActive || State.isAiThinking) return;
  const mode = modeSelect ? modeSelect.value : "pvp";

  if (mode === "online") {
    if (!State.currentRoomId || State.currentPlayer !== State.mySide) return;
    State.isAiThinking = true;
    updateUIState();
    setTimeout(() => {
      const move = calculateLocalAIMove("hard", State.mySide);
      const ok = applyMoveLocally(move.r, move.c, State.mySide);
      if (ok) syncMoveToFirebase(move.r, move.c, State.mySide);
      State.isAiThinking = true; // Dừng xíu cho mượt
      setTimeout(()=>{
         State.isAiThinking = false;
         updateUIState();
      }, 300);
    }, 50);
  } else {
    State.isAiThinking = true;
    updateUIState();
    setTimeout(() => {
      const move = calculateLocalAIMove("hard", State.currentPlayer);
      applyMoveLocally(move.r, move.c, State.currentPlayer);
      State.isAiThinking = false;
      updateUIState();
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
   buildBoardDOM();
   window.initGame();
   
   // Gắn sự kiện click vào chữ Lượt Đi
   if (turnIndicator) {
      turnIndicator.addEventListener("click", window.handleCheatClick);
      turnIndicator.style.cursor = "pointer"; 
   }
});

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
   buildBoardDOM();
   window.initGame();
   
   // Tự động GẮN SỰ KIỆN CLICK VÀO CHỮ "LƯỢT ĐI" ĐỂ HIỆN NÚT CHEAT 
   // (Bạn hãy nhấp chuột liên tục 5 lần vào chữ Lượt đi (TurnIndicator) nhé)
   if (turnIndicator) {
      turnIndicator.addEventListener("click", window.handleCheatClick);
      turnIndicator.style.cursor = "pointer"; // Thay con trỏ chuột báo hiệu có thể click
   }
});
