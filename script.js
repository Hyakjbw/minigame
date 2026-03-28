```js
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
   AI: SCORING (GOMOKU)
======================= */
const SCORE_WIN = 100000000;
const SCORE_OPEN_4 = 10000000;
const SCORE_CLOSED_4 = 1000000;
const SCORE_OPEN_3 = 500000;
const SCORE_CLOSED_3 = 10000;
const SCORE_OPEN_2 = 5000;

const PATTERNS = [
  { regex: /PPPPP/, score: SCORE_WIN },
  { regex: /\.PPPP\./, score: SCORE_OPEN_4 },
  { regex: /BPPPP\./, score: SCORE_CLOSED_4 },
  { regex: /\.PPPPB/, score: SCORE_CLOSED_4 },
  { regex: /P\.PPP/, score: SCORE_CLOSED regex: /PPP\.P/, score: SCORE_CLOSED_4 },
  { regex: /PP\.PP/, score: SCORE_CLOSED_4 },
  { regex: /\.PPP\./, score: SCORE_OPEN_3 },
  { regex: /\.P\./, score: SCORE_OPEN_3 },
  { regex: /\.PP\.P\./, score: SCORE_OPEN_3 },
  { regex: /BPPP\.\./, score: SCORE_CLOSED_3 },
  { regex: /\.\.PPPB/, score: SCORE_CLOSED_3 },
  { regex: /\.PP\./, score: SCORE_OPEN_2 },
  { regex: /\.P\.P\./, score: 500 }
];

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
  for (let i = 0; i < BOARD_SIZE * BOARD_SIZE;    b[Math.floor(i / BOARD_SIZE)][i % BOARD_SIZE] = board1D[i] || "";
  }
  return b;
}
function indexOfMove(r, c) {
  return r * BOARD_SIZE + c;
}
function  return { r: Math.floor(idx / BOARD_SIZE), c: idx % BOARD_SIZE };
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
function update const mode = modeSelect.value;

  if (State.isAiThinking) {
    turnIndicator.textContent = "💻 Máy đang tính...";
    turnIndicator.style.color = "#94a3b8";
    turnIndicator.style.borderColor = "#94a3b8";
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

  // pve-*
  turnIndicator.textContent = State.currentPlayer === "X" ? "Lượt đi: Bạn (X)" : "Lượt đi: Máy (O)";
  turnIndicator.style.color = State.currentPlayer === "X" ? "var(--x-color)" : "var(--o-color)";
  turnIndicator.style.borderColor = State.currentPlayer === "X" ? "var(--x-color)" : "var(--o-color)";
}

/* =======================
   INIT / RENDER
======================= */
function buildBoardDOM() {
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
  modalOverlay.classList.remove("active  if (!keepOnline) {
    if (State.unsubscribeRoom) { State.unsubscribeRoom(); State.unsubscribeRoom = null; }
    State.currentRoomId = null;
    State.mySide = null;
    State.currentResetSignal = 0;
    roomStatus.innerHTML = "";
  }
  updateUIState();
}

window.initGame = function (keepOnline = false) {
  resetLocalGame(keepOnline);
};

/* =======================
   WIN CHECK
======================= */
function checkWinOnBoard(board2D, row, col, player) {
  const directions = [
    [[0, 1], [0, -1]],
    [[1, 0], [-1, 0]],
    [[1, 1], [-1, -1]],
    [[1, -1], [-1, 1]]
  ];
  for (const dir of directions) {
    let count = 1;
    for (const [dr, dc] of dir) {
      let r = row + dr, c = col + dc;
     , c) && board2D[r][c] === player) {
        count++;
        r += dr; c += dc;
      }
    }
    if (count >= 5) return true;
  }
  return false;
}

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

function) {
  cells.forEach(p => getCellElement(p.row, p.col).classList.add("win-cell"));
}

/* =======================
   APPLY MOVE
======================= */
function applyMoveLocally(r, c, player) {
  if (!State.gameActive) return false;
  if (!inBounds(r, c)) return false;
  if (State.board[r][c] !== "") return false;

  State.board[r][c] = player;

  const cell = getCellElement(r, c);
  cell.textContent = player;
  cell.classList.add(player.toLowerCase());

  if (State.lastMoveElement) State.lastMoveElement.classList.remove("last-move");
  cell.classList.add("last-move");
  State.lastMoveElement = cell;

  State.moveHistory.push({ row: r, col: c, player, element: cell });

  const winCells = checkWin(r, c, player);
  if (winCells) {
    highlightWinCells(winCells);
    State.gameActive = false;

    const mode = modeSelect.value;
    let msg = "";
    if (mode === "online") msg = (player === State.mySide) ? "🎉 Bạn đã chiến thắng!" : "🥲 Đối thủ đã thắng!";
    else if (mode === "pvp") msg = `🎉 Người chơi ${player} thắng!`;
    else msg = (player === "X") ? "🎉 Bạn đã chiến thắng!" : "🤖 Máy đã thắng!";

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
   AI (easy/medium/h cũ
======================= */
function getAxisString(r, c, dr, dc, player, opp) {
  let str = "";
  for (let i = -4; i <= 4; i nr = r + dr * i;
    const nc = c + dc * i;
    if (!inBounds(nr, nc)) str += "B";
    else if (State.board[nr][nc] === player) str += "P";
    else if (State.board[nr][nc] === opp) str += "B";
    else str += ".";
  }
  return str;
}

function evaluateLineStr(str) {
  for (const pat of PATTERNS) {
    if (pat.regex.test(str)) return pat.score;
  }
  return 0;
}

function evaluateCellPro(r, c, aiSide, oppSide) {
  let aiScore = 0;
  let oppScore = 0;
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];

  State.board[r][c] = aiSide;
  for (const [dr, dc] of dirs) {
    aiScore += evaluateLineStr(getAxisString(r, c, dr, dc, aiSide, oppSide));
  }

  State.board[r][c] = oppSide;
  for (const [dr, dc] of dirs) {
    oppScore += evaluateLineStr(getAxisString(r, c, dr, dc, oppSide, aiSide));
  }

  State.board[r][c] = "";
  return { aiScore, oppScore, total: aiScore + oppScore * 1.3 };
}

function calculateLocalAIMove(difficulty, aiSide) {
  const oppSide = aiSide === "X" ? "O" : "X";
  const candidates = [];

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (State.board[r][c] !== "") continue;

      let near = false;
      for (let i = -2; i <= 2 && !near; i++) {
        for (let j = -2; j <= 2; j++) {
          const nr = r + i, nc = c j;
          if (inBounds(nr, nc) && State.board[nr][nc] !== "") { near true; break; }
        }
      }
      if (!near) continue;

      const ev = evaluateCellPro(r, c, aiSide, oppSide);
      candidates.push({ r, c, aiScore: ev.aiScore, opp.oppScore, score: ev.total });
    }
  }

  if (candidates.length === 0) return { r: Math.floor(BOARD_SIZE / 2), c: Math.floor(BOARD_SIZE / 2) };

  candidates.sort((a, b) => b.score - a.score);

  if (difficulty === "easy") {
    return candidates[Math.floor(Math.random() * Math.min(8, candidates.length))];
  }
  if (difficulty === "medium") {
    return candidates[Math.floor(Math.random() * Math.min(3, candidates.length))];
  }
  // hard
  return candidates[0];
}

/* =======================
   AI CỰC KHÓ: Alpha-Beta + Iterative Deepening
======================= */
const AI = {
  MAX_DEPTH: 4,
  TIME_LIMIT_MS: 450,
  CANDIDATE_LIMIT: 14,
  NEAR_DIST: 2,
};
const TT = new Map();

function boardKey(board2D, playerToMove) {
  s = playerToMove + "|";
  for (let r = 0; r < BOARD_SIZE; r++) s += board2D[r].join("") + "/";
  return s;
}

function getAxisStringOnBoard(board2D, r, c, dr, dc, player, opp) {
  let str = "";
  for (let i = -4; i <= 4; i++) {
    const nr = r + dr * i;
    const nc = c + dc * i;
    if (!inBounds(nr, nc)) str += "B";
    if (board2D[nr][nc] === player) str += "P";
    else if (board2D[nr][nc] === opp) str += "B";
    else str += ".";
  }
  return str;
}

function evaluateCellOnBoard(board2D, r, c, side, opp) {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  board2D[r][c] = side;
  let s = 0;
  for (const [dr,dc] of dirs) s += evaluateLineStr(getAxisStringOnBoard(board2D, r, c, dr, dc, side, opp));
  board2D[r][c] = "";
  return s;
}

function hasNeighbor(board2D, r, c, dist) {
  for (; dr <= dist; dr++) {
    for (let dc = -dist; dc <= dist; dc++) {
      if (dr === 0 && dc ===0) continue;
      const nr = r + dr, nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      if[nr][nc] !== "") return true;
    }
  }
  return false;
}

function generateCandidates(board2D, side, opp) moves = [];
  let hasAnyStone = false;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board2D[r][c] !== "") { hasAnyStone = true; continue; }
      if (!hasNeighbor(board2D, r, c, AI.NEAR_DIST)) continue;

      const a = evaluateCellOnBoard(board2D, r, c, side, opp);
      const d = evaluateCellOnBoard(board2D, r, c, opp, side);
      const score = a + d * 1.15;
      moves.push({ r, c, score, a, d });
    }
  }

  if (!hasAnyStone) {
    const mid = Math.floor(BOARD_SIZE / 2);
    return [{ r: mid, c: mid, score: 0, a: 0, d: 0 }];
  }

  moves.sort((x, y) => y.score - x.score);
  return moves.slice(0, AI.CANDIDATE_LIMIT);
}

function evaluateBoardHeuristic(board2D, aiSide, oppSide) {
  let ai = 0, opp = 0;
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board2D[r][c] !== "") continue;
      if (!hasNeighbor(board2D, r, c, 2)) continue;

      board2D[r][c] = aiSide;
      let s1 = 0;
      for (const [dr,dc] of dirs) s1 += evaluateLineStr(getAxisStringOnBoard r, c, dr, dc, aiSide, oppSide));
      board2D[r][c] = "";

      board2D[r][c] = oppSide;
      let s2 = 0;
      for (const [dr,dc] of dirs) s2 += evaluateLineStr(getAxisStringOnBoard(board2D, r, c, dr, dc, oppSide, aiSide));
      board2D[r][c] = "";

      ai += s1;
      opp += s2;
    }
  }

  return ai - opp * 1.05;
}

function alphaBeta(board2D, depth, alpha, beta, playerToMove, aiSide, oppSide, lastMove, deadline) {
  if (performance.now() > deadline) return { score: 0, timedOut: true };

  const key = boardKey(board2D, playerToMove) + "|d" + depth;
  const cached = TT.get(key);
  if (cached && cached.depth >= depth) return { score: cached.score, timedOut: false };

  if (lastMove) {
    const { r, c, p } = lastMove;
    if (checkWinOnBoard(board2D, r, c, p)) {
      const winScore = (p === aiSide) ? SCORE_WIN : -SCORE_WIN;
      const sc = winScore - (AI.MAX_DEPTH - depth);
      TT.set(key, { score: sc, depth });
      return { score: sc, timedOut: false };
    }
  }

  if (depth === 0) {
    const sc = evaluateBoardHeuristic(board2D, aiSide, oppSide);
    TT.set(key, { score: sc, depth });
    return { score: sc, timedOut: false };
  }

  const maximizing = (playerToMove === aiSide);
  const side = playerToMove;
  const opp = (side === "X") ? "O" : "X";

  const candidates = generateCandidates(board2D, side, opp);

  let bestScore = maximizing ? -Infinity : Infinity;

  for (const mv of candidates) {
    if (performance.now() > deadline) return { score: bestScore, timedOut: true };

    board2D[mv.r][mv.c] = side;

    const child = alphaBeta(
      board2D,
      depth - 1,
      alpha,
      beta,
      opp,
      aiSide,
      oppSide,
      { r: mv.r, c: mv.c, side },
      deadline
    );

    board2D[mv.r][mv.c] = "";

    if (child.timedOut) return { score: bestScore, timedOut: true };

    const sc = child.score;

    if (maximizing) {
      if (sc > bestScore) bestScore = sc;
      alpha = Math.max(alpha, bestScore);
      if (alpha >= beta) break;
    } else {
      if (sc < bestScore) bestScore = sc;
      beta = Math.min(beta, bestScore);
      if (alpha >= beta) break;
    }
  }

  TT.set(key, { score: bestScore, depth });
  return { score: bestScore, timedOut: false };
}

function calculateLocalAIMoveExtreme(aiSide) {
  const oppSide = aiSide === "X" ? "O" : "X";
  const board2D = State.board.map(row => row.slice());

  const quick = generateCandidates(board2D, aiSide, oppSide);

  for (const mv of quick) {
    board2D[mv.r][mv.c] = aiSide;
    const win = checkWinOnBoard(board2D, mv.r, mv.c, aiSide);
    board2D[mv.r.c] = "";
    if (win) return { r: mv.r, c: mv.c };
  }
  for (const mv of quick) {
    board2D[mv.r][mv.c] = oppSide;
    const win = checkWinOnBoard(board2D, mv.r, mv.c, oppSide);
    board2D[mv.r][mv.c] = "";
    if (win) return { r: mv.r, c: mv.c };
  }

  const start = performance.now();
  const deadline = start + AI.TIME_LIMIT_MS;

  let bestMove = quick[0] || { r: Math.floor(BOARD_SIZE / 2), c: Math.floor(BOARD_SIZE / 2) };
  TT.clear();

  for (let depth = 1; depth <= AI.MAX_DEPTH; depth++) {
    if (performance.now() > deadline) break;

    let localBestMove = bestMove;
    let localBestScore = -Infinity;
    let timedOut = false;

    const rootCandidates = generateCandidates(board2D, aiSide, oppSide);

   Candidates) {
      if (performance.now() > deadline) { timedOut = true; break; }

      board2D[mv.r][mv.c] = aiSide;

      const child = alphaBeta(
        board2D,
        depth - 1,
        -Infinity,
        Infinity,
        oppSide,
        aiSide,
        oppSide,
        { r: mv.r, c: mv.c, p: aiSide },
        deadline
      );

      board2D[mv.r][mv.c] = "";

      if (child.timedOut) { timedOut = true; break; }

      if (child.score > localBestScore) {
        localBestScore = child.score;
        localBestMove = { r: mv.r, c: mv.c };
      }
    }

    if (!timedOut) {
      bestMove = localBestMove;
    } else {
      break;
    }
  }

  return bestMove;
}

/* =======================
   CLICK HANDLER
======================= */
function handleCellClick(e) {
  if (!State.gameActive || State.isAiThinking) return;

  const r = parseInt(e.target.dataset.row, 10);
  const c = parseInt(e.target.dataset.col, 10);
  if (State.board[r][c] !== "") return;

  const mode = modeSelect.value;

  if (mode === "online") {
    if (!State.currentRoomId) return;
    if (State.currentPlayer !== State.mySide) return;

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
      const diff = mode.split("-")[1];

      let move;
      if (diff === "super") move = calculateLocalAIMoveExtreme("O");
      else move = calculateLocalAIMove(diff, "O");

      applyMoveLocally(move.r, move.cO");
      State.isAiThinking = false;
      updateUIState();
    }, 50);
  }
}

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
    roomListEl.innerHTML = "";

    if (snapshot.empty) {
      roomListEl.innerHTML =
        '<div style="color:#94a3b8; font-size:0.85rem;">Chưa có phòng nào. Hãy tạo phòng mới!</div>';
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
db) return alert("Hệ thống Offline. Vui lòng kiểm tra mạng!");

  const roomIdInput = document.getElementById("roomIdInput").value.trim().toLowerCase();
  if (!roomIdInput) return alert("Vui lòng nhập tên phòng!");

  const roomId = "room_" + roomIdInput;
  window.initGame(true);

  const roomRef = doc(db, "rooms", roomId);

  try {
    const snap = await getDoc(roomRef);

    if (!snap.exists()) {
      await setDoc(roomRef, {
        board1D: Array(BOARD_SIZE * BOARD_SIZE).fill(""),
        turn: "X",
        lastMoveIndex: -1,
        playerX: myLocalUid,
        playerO: "",
        resetSignal: Date.now()
      });

      State.mySide = "X";
      State.currentRoomId = roomId;
      roomStatus.innerHTML =
        `Đã tạo: <span style="color:#2563eb; font-size:1.1rem">${roomIdInput}</span><br>Bạn là Quân X. Đang đợi...`;
    } else {
      const data = snap.data();

      if (data.playerX === myLocalUid) State.mySide = "X";
      else if (data.playerO === myLocalUid) State.mySide = "O";
      else if (data.playerO === "") {
        await updateDoc(roomRef, { playerO: myLocalUid });
        State.mySide = "O";
      } else {
        return alert("Phòng đã đủ 2 người!");
      }

      State.currentRoomId = roomId;
      State.currentResetSignal = data.resetSignal || 0;
      roomStatus.innerHTML =
        `Vào phòng: <span style="color:#2563eb; font-size:1.1rem">${roomIdInput}</span><br>Bạn là Quân ${State.mySide}`;
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

    if (data.playerX && data.playerO !== "") {
      roomStatus.innerHTML =
        `Đang thi đấu: <b>${State.currentRoomId.replace("room_", "")}</b><br>(Bạn là quân ${State.mySide})`;
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
            cell.textContent = v;
            cell.className = "cell";
            if (v === "X" || v === "O") cell.classList.add(v.toLowerCase());
          }
        }
      }
    }

    if (typeof data.lastMoveIndex === "number" && data.lastMoveIndex !== -1) {
      const { r, c } = rcFromIndex(data.lastMoveIndex);
      const cell = getCellElement(r, c);
      if (State.lastMoveElement) State.lastMoveElement.classList.remove("last-move");
      cell.classList.add("last-move");
      State.lastMoveElement = cell;
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
    lastMoveIndex
  }).catch(e => console.error("Lỗi đồng bộ", e));
}

/* =======================
   MODE CHANGE
======================= */
window.handleModeChange = function () {
  const mode = modeSelect.value;

  if (mode === "online") {
    onlinePanel.style.display = "block";
    window.initGame();
    listenToAvailableRooms();
  } else {
    onlinePanel.style.display = "none";
    if (State.unsubscribe { State.unsubscribeRooms(); State.unsubscribeRooms = null; }
    window.initGame();
  }
};

/* =======================
   REMATCH
======================= */
window.triggerRematch = async function () {
  if (modeSelect.value === "online" && State.currentRoomId) {
    modalOverlay.classList.remove("active");
    const roomRef = doc(db, "rooms", State.currentRoomId);
    try {
      await updateDoc(roomRef, {
        board1D: Array(BOARD_SIZE * BOARD_SIZE).fill(""),
        turn: "X",
        lastMoveIndex: -1,
        resetSignal: Date.now()
      });
    } catch (e) {
      console.error("Lỗi yêu cầu ván mới", e);
    }
  } else {
    window.initGame();
  }
};

/* =======================
   UNDO (offline only)
======================= */
window.undoMove = function () {
  const mode = modeSelect.value;
  if (State.moveHistory.length < 1 || State.isAiThinking || mode === "online") return;

  const steps = mode.startsWith("pve") ? 2 : 1;

  for (let i = 0; i < steps; i++) {
    if (State.moveHistory.length === 0) break;
    const last = State.moveHistory.pop();
    State.board[last.row][last.col] = "";
    last.element.textContent = "";
    last.element.className = "cell";
  }

  document.querySelectorAll(".win-cell").forEach(e => e.classList.remove("win-cell"));
  modalOverlay.classList.remove("active");

  if (State.moveHistory.length > 0) {
    State.lastMoveElement = State.moveHistory[State.moveHistory.length - 1].element;
    State.lastMoveElement.classList.add("last-move");
  } else {
    State.lastMoveElement = null;
  }

  State.gameActive = true;
  State.currentPlayer = "X";
  updateUIState();
};

/* =======================
   CHEAT
======================= */
let cheatClicks = 0;
let cheatTimeout = null;

window.handleFooterClick = function () {
  clearTimeout(cheatTimeout);
  cheatClicks++;
  if (cheatClicks >= 5) {
    document.getElementById("cheatBtn").style.display = "block";
    cheatClicks = 0;
  }
  cheatTimeout = setTimeout(() => { cheatClicks = 0; }, 2000);
};

window.triggerCheat = function () {
  if (!State.gameActive || State.isAiThinking) return;

  const mode = modeSelect.value;

  if (mode === "online") {
    if (!State.current || State.currentPlayer !== State.mySide) return;

    State.isAiThinking = true;
    updateUIState();
    setTimeout(() => {
      const move = calculateLocalAIMoveExtreme(State.mySide);
      const ok = applyMoveLocally(move.r, move.c, State.mySide);
      if (ok) syncMoveToFirebase(move.r, move.c, State.mySide);
      State.isAiThinking = false;
      updateUIState();
    }, 50);
  } else {
    State.isAiThinking = true;
    updateUIState();
    setTimeout(() => {
      const move = calculateLocalAIMoveExtreme(State.currentPlayer);
      applyMoveLocally(move.r, move.c, State.currentPlayer);
      State.isAiThinking = false;
      updateUIState();
    }, 50);
  }
};

/* =======================
   MODAL + FULLSCREEN
======================= */
window.closeModal = function () {
  modalOverlay.classList.remove("active");
};

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
   START=======window.initGame();
```
