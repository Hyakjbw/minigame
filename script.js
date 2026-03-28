import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, collection, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// CẤU HÌNH FIREBASE 
const firebaseConfig = {
    apiKey: "AIzaSyAVEiHOD1xTnlAFW3h-YjmQcHPsx4saaLo",
    authDomain: "cocaro-8be98.firebaseapp.com",
    projectId: "cocaro-8be98",
    storageBucket: "cocaro-8be98.firebasestorage.app",
    messagingSenderId: "620011719200",
    appId: "1:620011719200:web:fe8f79429587d96ddb4a45"
};

let app, db;
try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
} catch (e) {
    console.log("Chạy ở chế độ Offline.", e);
}

// TẠO LOCAL ID CHUẨN (Khắc phục hoàn toàn lỗi trùng IP mạng)
let myLocalUid = localStorage.getItem('caro_uid');
if (!myLocalUid) {
    myLocalUid = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('caro_uid', myLocalUid);
}

// --- CÁC BIẾN CỦA GAME ---
const BOARD_SIZE = 20;
const boardElement = document.getElementById('board');
const turnIndicator = document.getElementById('turnIndicator');
const modeSelect = document.getElementById('gameMode');
const onlinePanel = document.getElementById('onlinePanel');
const roomStatus = document.getElementById('roomStatus');

let board = [];
let moveHistory = [];
let currentPlayer = 'X';
let gameActive = true;
let lastMoveElement = null;
let isAiThinking = false;

// Biến cho Online
let currentRoomId = null;
let mySide = null; 
let unsubscribe = null;
let roomsUnsubscribe = null;
let currentResetSignal = 0; 

// Biến Cheat
let cheatClicks = 0;
let cheatTimeout;

// BẢNG ĐIỂM CHUẨN GOMOKU CHO AI
const SCORE_WIN = 100000000;
const SCORE_OPEN_4 = 10000000;
const SCORE_CLOSED_4 = 1000000;
const SCORE_OPEN_3 = 500000; 
const SCORE_CLOSED_3 = 10000;
const SCORE_OPEN_2 = 5000;   

// CÁC MẪU CHUỖI CỜ CHUẨN (P: Mình, B: Địch/Biên, .: Trống)
const PATTERNS = [
    { regex: /PPPPP/, score: SCORE_WIN },
    { regex: /\.PPPP\./, score: SCORE_OPEN_4 },
    { regex: /BPPPP\./, score: SCORE_CLOSED_4 },
    { regex: /\.PPPPB/, score: SCORE_CLOSED_4 },
    { regex: /P\.PPP/, score: SCORE_CLOSED_4 },
    { regex: /PPP\.P/, score: SCORE_CLOSED_4 },
    { regex: /PP\.PP/, score: SCORE_CLOSED_4 },
    { regex: /\.PPP\./, score: SCORE_OPEN_3 },
    { regex: /\.P\.PP\./, score: SCORE_OPEN_3 },
    { regex: /\.PP\.P\./, score: SCORE_OPEN_3 },
    { regex: /BPPP\.\./, score: SCORE_CLOSED_3 },
    { regex: /\.\.PPPB/, score: SCORE_CLOSED_3 },
    { regex: /\.PP\./, score: SCORE_OPEN_2 },
    { regex: /\.P\.P\./, score: 500 }
];

// --- HÀM KHỞI TẠO BÀN CỜ ---
window.initGame = function(keepOnline = false) {
    boardElement.innerHTML = '';
    board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(''));
    moveHistory = [];
    
    for (let i = 0; i < BOARD_SIZE; i++) {
        for (let j = 0; j < BOARD_SIZE; j++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.row = i;
            cell.dataset.col = j;
            cell.addEventListener('click', handleCellClick);
            boardElement.appendChild(cell);
        }
    }

    currentPlayer = 'X';
    gameActive = true;
    lastMoveElement = null;
    isAiThinking = false;
    document.getElementById('modalOverlay').classList.remove('active');
    
    if (!keepOnline) {
        if (unsubscribe) { unsubscribe(); unsubscribe = null; }
        currentRoomId = null;
        mySide = null;
        currentResetSignal = 0;
        roomStatus.innerHTML = '';
    }
    updateUIState();
};

window.handleModeChange = function() {
    if (modeSelect.value === 'online') {
        onlinePanel.style.display = 'block';
        window.initGame();
        listenToAvailableRooms();
    } else {
        onlinePanel.style.display = 'none';
        if (roomsUnsubscribe) { roomsUnsubscribe(); roomsUnsubscribe = null; }
        window.initGame();
    }
};

function updateUIState() {
    if (isAiThinking) {
        turnIndicator.textContent = "💻 Máy đang tính...";
        turnIndicator.style.color = "#94a3b8";
        turnIndicator.style.borderColor = "#94a3b8";
    } else {
        if (modeSelect.value === 'pvp') {
            turnIndicator.textContent = `Lượt đi: Người chơi ${currentPlayer}`;
            turnIndicator.style.color = currentPlayer === 'X' ? 'var(--x-color)' : 'var(--o-color)';
            turnIndicator.style.borderColor = currentPlayer === 'X' ? 'var(--x-color)' : 'var(--o-color)';
        } else if (modeSelect.value === 'online') {
            if (currentRoomId) {
                if (currentPlayer === mySide) {
                    turnIndicator.textContent = `Lượt đi: Bạn (${currentPlayer})`;
                    turnIndicator.style.color = currentPlayer === 'X' ? 'var(--x-color)' : 'var(--o-color)';
                } else {
                    turnIndicator.textContent = `Đợi Đối thủ (${currentPlayer})...`;
                    turnIndicator.style.color = "#64748b";
                }
                turnIndicator.style.borderColor = currentPlayer === 'X' ? 'var(--x-color)' : 'var(--o-color)';
            } else {
                turnIndicator.textContent = "Chưa vào phòng";
                turnIndicator.style.color = "#94a3b8";
                turnIndicator.style.borderColor = "#cbd5e1";
            }
        } else {
            turnIndicator.textContent = currentPlayer === 'X' ? "Lượt đi: Bạn (X)" : "Lượt đi: Máy (O)";
            turnIndicator.style.color = currentPlayer === 'X' ? 'var(--x-color)' : 'var(--o-color)';
            turnIndicator.style.borderColor = currentPlayer === 'X' ? 'var(--x-color)' : 'var(--o-color)';
        }
    }
}

// --- LOGIC NHẤN Ô CỜ (TỐI ƯU CẬP NHẬT NHANH) ---
function handleCellClick(e) {
    if (!gameActive || isAiThinking) return;
    const row = parseInt(e.target.dataset.row);
    const col = parseInt(e.target.dataset.col);
    if (board[row][col] !== '') return;

    if (modeSelect.value === 'online') {
        if (!currentRoomId || currentPlayer !== mySide) return;
        applyMoveLocally(row, col, mySide);
        syncMoveToFirebase(row, col); // Gửi ngầm không đợi (Fire and forget)
        return;
    }

    applyMoveLocally(row, col, currentPlayer);

    if (gameActive && modeSelect.value.startsWith('pve') && currentPlayer === 'O') {
        isAiThinking = true;
        updateUIState();
        setTimeout(() => {
            let move = calculateLocalAIMove(modeSelect.value.split('-')[1], 'O');
            applyMoveLocally(move.r, move.c, 'O');
            isAiThinking = false;
            updateUIState();
        }, 50); 
    }
}

function applyMoveLocally(row, col, player) {
    board[row][col] = player;
    const cell = getCellElement(row, col);
    cell.textContent = player;
    cell.classList.add(player.toLowerCase());

    if (lastMoveElement) lastMoveElement.classList.remove('last-move');
    cell.classList.add('last-move');
    lastMoveElement = cell;

    moveHistory.push({ row, col, player, element: cell });

    const winCells = checkWin(row, col, player);
    if (winCells) {
        highlightWinCells(winCells);
        let msg = "";
        if (modeSelect.value === 'online') msg = player === mySide ? "🎉 Bạn đã chiến thắng!" : "🥲 Đối thủ đã thắng!";
        else if (modeSelect.value === 'pvp') msg = `🎉 Người chơi ${player} thắng!`;
        else msg = player === 'X' ? "🎉 Bạn đã chiến thắng!" : "🤖 Máy đã thắng!";
        
        showModal(msg);
        gameActive = false;
        return;
    }

    if (moveHistory.length === BOARD_SIZE * BOARD_SIZE) {
        showModal("🤝 Hòa cờ!");
        gameActive = false;
        return;
    }

    currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
    updateUIState();
}

// --- HỆ THỐNG AI CỤC BỘ ---
function getAxisString(r, c, dr, dc, player, opp) {
    let str = "";
    for (let i = -4; i <= 4; i++) {
        let nr = r + dr * i; let nc = c + dc * i;
        if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) str += "B"; 
        else if (board[nr][nc] === player) str += "P"; 
        else if (board[nr][nc] === opp) str += "B"; 
        else str += "."; 
    }
    return str;
}

function evaluateLineStr(str) {
    for (let pat of PATTERNS) {
        if (pat.regex.test(str)) return pat.score;
    }
    return 0;
}

function evaluateCellPro(r, c, aiSide, oppSide) {
    let aiScore = 0;
    let oppScore = 0;
    const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
    
    board[r][c] = aiSide;
    for (let [dr, dc] of dirs) {
        let str = getAxisString(r, c, dr, dc, aiSide, oppSide);
        aiScore += evaluateLineStr(str);
    }
    
    board[r][c] = oppSide;
    for (let [dr, dc] of dirs) {
        let str = getAxisString(r, c, dr, dc, oppSide, aiSide);
        oppScore += evaluateLineStr(str);
    }
    board[r][c] = ''; 
    
    return { aiScore, oppScore, total: aiScore + oppScore * 1.3 };
}

function calculateLocalAIMove(difficulty, aiSide) {
    let oppSide = aiSide === 'X' ? 'O' : 'X';
    let candidates = [];

    // Tìm các ô trống quanh khu vực cờ
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] === '') {
                let near = false;
                for (let i = -2; i <= 2; i++) {
                    for (let j = -2; j <= 2; j++) {
                        let nr = r+i, nc = c+j;
                        if (nr>=0 && nr<BOARD_SIZE && nc>=0 && nc<BOARD_SIZE && board[nr][nc] !== '') {
                            near = true; break;
                        }
                    }
                    if (near) break;
                }
                if (near) candidates.push({r, c});
            }
        }
    }

    if (candidates.length === 0) return {r: Math.floor(BOARD_SIZE/2), c: Math.floor(BOARD_SIZE/2)};

    candidates.forEach(m => {
        let evalResult = evaluateCellPro(m.r, m.c, aiSide, oppSide);
        m.aiScore = evalResult.aiScore;
        m.oppScore = evalResult.oppScore;
        m.score = evalResult.total;
    });
    candidates.sort((a, b) => b.score - a.score);

    if (difficulty === 'easy') {
        return candidates[Math.floor(Math.random() * Math.min(8, candidates.length))];
    } else if (difficulty === 'medium') {
        return candidates[Math.floor(Math.random() * Math.min(3, candidates.length))];
    } else if (difficulty === 'hard') {
        return candidates[0];
    } else {
        // SIÊU KHÓ: Minimax
        for (let m of candidates) if (m.aiScore >= SCORE_WIN) return m;
        for (let m of candidates) if (m.oppScore >= SCORE_WIN) return m;

        let searchPool = candidates.slice(0, Math.min(10, candidates.length));
        let bestScore = -Infinity;
        let bestMove = searchPool[0];

        for (let move of searchPool) {
            board[move.r][move.c] = aiSide; 
            let maxOppResponse = -Infinity;
            
            for (let oppMove of searchPool) {
                if (board[oppMove.r][oppMove.c] === '') {
                    let oppEval = evaluateCellPro(oppMove.r, oppMove.c, oppSide, aiSide);
                    if (oppEval.oppScore > maxOppResponse) maxOppResponse = oppEval.oppScore;
                    if (maxOppResponse >= SCORE_WIN) break; 
                }
            }
            board[move.r][move.c] = ''; 

            let simulatedScore = move.score - maxOppResponse;
            if (simulatedScore > bestScore) {
                bestScore = simulatedScore;
                bestMove = move;
            }
        }
        return bestMove;
    }
}

// --- CHỨC NĂNG ONLINE ---

// Cập nhật Danh sách phòng
function listenToAvailableRooms() {
    if(!db) return;
    const roomsRef = collection(db, 'rooms');
    const q = query(roomsRef, where("playerO", "==", "")); // Lấy phòng trống

    if (roomsUnsubscribe) roomsUnsubscribe();

    roomsUnsubscribe = onSnapshot(q, (snapshot) => {
        const roomListEl = document.getElementById('availableRooms');
        roomListEl.innerHTML = '';
        if (snapshot.empty) {
            roomListEl.innerHTML = '<div style="color:#94a3b8; font-size:0.85rem;">Chưa có phòng nào. Hãy tạo phòng mới!</div>';
            return;
        }

        snapshot.forEach(doc => {
            const roomName = doc.id.replace('room_', '');
            const btn = document.createElement('button');
            btn.className = 'btn-room';
            btn.innerHTML = `🏠 <b>${roomName}</b>`;
            btn.onclick = () => {
                document.getElementById('roomIdInput').value = roomName;
                window.joinOrCreateRoom();
            };
            roomListEl.appendChild(btn);
        });
    });
}

window.joinOrCreateRoom = async function() {
    if(!db) return alert("Hệ thống Offline. Vui lòng kiểm tra mạng!");
    let roomIdInput = document.getElementById('roomIdInput').value.trim().toLowerCase();
    if (!roomIdInput) return alert("Vui lòng nhập tên phòng!");
    
    const roomId = "room_" + roomIdInput; 
    window.initGame(true);
    const roomRef = doc(db, 'rooms', roomId);
    
    try {
        const roomSnap = await getDoc(roomRef);
        if (!roomSnap.exists()) {
            await setDoc(roomRef, {
                board1D: Array(BOARD_SIZE * BOARD_SIZE).fill(''),
                turn: 'X',
                lastMoveIndex: -1,
                playerX: myLocalUid,
                playerO: "", // "" để dễ truy vấn
                resetSignal: Date.now()
            });
            mySide = 'X';
            currentRoomId = roomId;
            roomStatus.innerHTML = `Đã tạo: <span style="color:#2563eb; font-size:1.1rem">${roomIdInput}</span><br>Bạn là Quân X. Đang đợi...`;
        } else {
            const data = roomSnap.data();
            
            if (data.playerX === myLocalUid) {
                mySide = 'X';
            } else if (data.playerO === myLocalUid) {
                mySide = 'O';
            } else if (data.playerO === "") {
                await updateDoc(roomRef, { playerO: myLocalUid });
                mySide = 'O';
            } else {
                return alert("Phòng đã đủ 2 người!");
            }

            currentRoomId = roomId;
            currentResetSignal = data.resetSignal || 0; 
            roomStatus.innerHTML = `Vào phòng: <span style="color:#2563eb; font-size:1.1rem">${roomIdInput}</span><br>Bạn là Quân ${mySide}`;
        }
        listenToRoom(roomRef);
    } catch(e) { 
        console.error(e); 
        alert("Lỗi truy cập dữ liệu! Hãy mở quyền cho Firebase.");
    }
};

function listenToRoom(roomRef) {
    if (unsubscribe) unsubscribe();
    unsubscribe = onSnapshot(roomRef, (doc) => {
        if(!doc.exists()) return;
        const data = doc.data();
        
        if (data.playerX && data.playerO !== "") {
            roomStatus.innerHTML = `Đang thi đấu: <b>${currentRoomId.replace('room_','')}</b><br>(Bạn là quân ${mySide})`;
        }

        // XỬ LÝ CHƠI LẠI ĐỒNG BỘ
        if (data.resetSignal && data.resetSignal !== currentResetSignal) {
            currentResetSignal = data.resetSignal;
            
            // Xóa bàn cờ local
            boardElement.innerHTML = '';
            board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(''));
            moveHistory = [];
            for (let i = 0; i < BOARD_SIZE; i++) {
                for (let j = 0; j < BOARD_SIZE; j++) {
                    const cell = document.createElement('div');
                    cell.className = 'cell';
                    cell.dataset.row = i;
                    cell.dataset.col = j;
                    cell.addEventListener('click', handleCellClick);
                    boardElement.appendChild(cell);
                }
            }
            currentPlayer = 'X';
            gameActive = true;
            lastMoveElement = null;
            isAiThinking = false;
            document.getElementById('modalOverlay').classList.remove('active');
            updateUIState();
            return; 
        } 
        
        // Cập nhật nước cờ của địch
        if (data.turn !== currentPlayer && gameActive) {
            const lMove = data.lastMoveIndex;
            if (lMove !== -1) {
                const r = Math.floor(lMove / BOARD_SIZE);
                const c = lMove % BOARD_SIZE;
                if (board[r][c] === '') { 
                    applyMoveLocally(r, c, currentPlayer); 
                }
            }
        }
    }, (err) => console.error(err));
}

// Sync Firebase mà không cần `await` (để tránh lag UI)
function syncMoveToFirebase(row, col) {
    const roomRef = doc(db, 'rooms', currentRoomId);
    const index = row * BOARD_SIZE + col;
    updateDoc(roomRef, {
        board1D: board.flat(), // Lưu nguyên bàn cờ cho người vào sau
        turn: currentPlayer, 
        lastMoveIndex: index
    }).catch(e => console.error("Lỗi đồng bộ", e));
}

// Chơi lại ván mới
window.triggerRematch = async function() {
    if (modeSelect.value === 'online' && currentRoomId) {
        document.getElementById('modalOverlay').classList.remove('active');
        const roomRef = doc(db, 'rooms', currentRoomId);
        try {
            await updateDoc(roomRef, {
                board1D: Array(BOARD_SIZE * BOARD_SIZE).fill(''),
                turn: 'X', 
                lastMoveIndex: -1,
                resetSignal: Date.now() 
            });
        } catch(e) { console.error("Lỗi yêu cầu ván mới", e); }
    } else {
        window.initGame(); 
    }
};

// --- NÚT CHEAT (NGUYỄN HẢI HUY) ---
window.handleFooterClick = function() {
    clearTimeout(cheatTimeout);
    cheatClicks++;
    if (cheatClicks >= 5) {
        document.getElementById('cheatBtn').style.display = 'block';
        cheatClicks = 0;
    }
    cheatTimeout = setTimeout(() => { cheatClicks = 0; }, 2000);
};

window.triggerCheat = function() {
    if (!gameActive || isAiThinking) return;
    
    if (modeSelect.value === 'online') {
        if (!currentRoomId || currentPlayer !== mySide) return;
        isAiThinking = true;
        updateUIState();
        setTimeout(() => {
            let move = calculateLocalAIMove('super', mySide);
            applyMoveLocally(move.r, move.c, mySide);
            syncMoveToFirebase(move.r, move.c);
            isAiThinking = false;
            updateUIState();
        }, 50);
    } else {
        isAiThinking = true;
        updateUIState();
        setTimeout(() => {
            let move = calculateLocalAIMove('super', currentPlayer);
            applyMoveLocally(move.r, move.c, currentPlayer);
            isAiThinking = false;
            updateUIState();
        }, 50);
    }
};

// --- TIỆN ÍCH CƠ BẢN ---
function checkWin(row, col, player) {
    const directions = [[[0, 1], [0, -1]], [[1, 0], [-1, 0]], [[1, 1], [-1, -1]], [[1, -1], [-1, 1]]];
    for (let dir of directions) {
        let winCells = [{row, col}];
        for (let [dr, dc] of dir) {
            let r = row + dr, c = col + dc;
            while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === player) {
                winCells.push({row: r, col: c});
                r += dr; c += dc;
            }
        }
        if (winCells.length >= 5) return winCells;
    }
    return null;
}

function highlightWinCells(cells) {
    cells.forEach(p => getCellElement(p.row, p.col).classList.add('win-cell'));
}

window.undoMove = function() {
    if (moveHistory.length < 1 || isAiThinking || modeSelect.value === 'online') return; 
    const steps = modeSelect.value.startsWith('pve') ? 2 : 1;
    for (let i = 0; i < steps; i++) {
        if (moveHistory.length === 0) break;
        const last = moveHistory.pop();
        board[last.row][last.col] = '';
        last.element.textContent = '';
        last.element.className = 'cell';
    }
    if (moveHistory.length > 0) {
        lastMoveElement = moveHistory[moveHistory.length-1].element;
        lastMoveElement.classList.add('last-move');
    } else { lastMoveElement = null; }
    gameActive = true;
    currentPlayer = 'X';
    document.querySelectorAll('.win-cell').forEach(e => e.classList.remove('win-cell'));
    document.getElementById('modalOverlay').classList.remove('active');
    updateUIState();
};

function getCellElement(r, c) { return boardElement.querySelector(`[data-row="${r}"][data-col="${c}"]`); }
function showModal(msg) { document.getElementById('modalMessage').innerHTML = msg; document.getElementById('modalOverlay').classList.add('active'); }
window.closeModal = function() { document.getElementById('modalOverlay').classList.remove('active'); }

window.enterFullScreen = function() {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen();
    document.body.classList.add('fullscreen-mode');
};
window.exitFullScreen = function() {
    if (document.exitFullscreen) document.exitFullscreen();
    document.body.classList.remove('fullscreen-mode');
};

window.initGame();

