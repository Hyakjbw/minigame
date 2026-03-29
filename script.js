import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc,
  onSnapshot, collection, query, where, deleteDoc, getDocs
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

/* =======================
   FIREBASE CONFIG
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
   HỆ THỐNG ÂM THANH (WEB AUDIO API)
======================= */
const AudioSys = {
    ctx: null,
    init() { if(!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); },
    play(type) {
        try {
            this.init();
            if (this.ctx.state === 'suspended') this.ctx.resume();
            const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
            osc.connect(gain); gain.connect(this.ctx.destination);
            const now = this.ctx.currentTime;
            
            if (type === 'click') { osc.type = 'sine'; osc.frequency.setValueAtTime(600, now); osc.frequency.exponentialRampToValueAtTime(300, now + 0.1); gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1); osc.start(now); osc.stop(now + 0.1); }
            else if (type === 'ting') { osc.type = 'sine'; osc.frequency.setValueAtTime(1200, now); gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3); osc.start(now); osc.stop(now + 0.3); }
            else if (type === 'win') { osc.type = 'triangle'; osc.frequency.setValueAtTime(400, now); osc.frequency.setValueAtTime(523.25, now + 0.15); osc.frequency.setValueAtTime(659.25, now + 0.3); osc.frequency.setValueAtTime(1046.50, now + 0.45); gain.gain.setValueAtTime(0.3, now); gain.gain.linearRampToValueAtTime(0, now + 0.8); osc.start(now); osc.stop(now + 0.8); }
            else if (type === 'lose') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(300, now); osc.frequency.setValueAtTime(250, now + 0.3); osc.frequency.setValueAtTime(200, now + 0.6); gain.gain.setValueAtTime(0.2, now); gain.gain.linearRampToValueAtTime(0, now + 1); osc.start(now); osc.stop(now + 1); }
        } catch(e){}
    }
};

/* =======================
   LOCAL UID & STATE
======================= */
let myLocalUid = localStorage.getItem("caro_uid");
if (!myLocalUid) { myLocalUid = "user_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9); localStorage.setItem("caro_uid", myLocalUid); }

const BOARD_SIZE = 20;
const boardElement = document.getElementById("board");
const turnIndicator = document.getElementById("turnIndicator");
const modeSelect = document.getElementById("gameMode");
const onlinePanel = document.getElementById("onlinePanel");
const roomStatus = document.getElementById("roomStatus");
const modalOverlay = document.getElementById("modalOverlay");
const modalMessage = document.getElementById("modalMessage");

const State = {
  board: [], moveHistory: [], currentPlayer: "X", gameActive: true, lastMoveElement: null, isAiThinking: false,
  currentRoomId: null, mySide: null, unsubscribeRoom: null, unsubscribeRooms: null, currentResetSignal: 0,
  opponentRequestedRematch: false, swapRequested: false, lastChatId: 0, heartbeatInterval: null,
  myName: "Bạn", oppName: "Đối thủ", isSpectator: false,
  scoreX: 0, scoreO: 0, uidX: "", uidO: "", processedWinner: false
};

/* =======================
   BẢO MẬT ADMIN (MÃ HÓA)
======================= */
const ADMIN_PASS_HASH = "415f18ee12d87c15a4fe4d652f6ba1c32692962fd9a9662fcf1fd1387f3af409"; 

async function hashPassword(str) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* =======================
   TẠO GIAO DIỆN TỰ ĐỘNG BẰNG JS
======================= */
function injectDynamicUI() {
  const style = document.createElement("style");
  style.innerHTML = `
      body.dark-mode { background-color: #0f172a; color: #f8fafc; }
      body.dark-mode .board-wrapper { background-color: #1e293b; border-color: #334155; box-shadow: 3px 6px 15px rgba(0,0,0,0.6); }
      body.dark-mode .cell { background-color: #1e293b; color: #f8fafc; }
      body.dark-mode .cell:hover { background-color: #334155; }
      body.dark-mode .board { background-color: #475569; border-color: #475569; }
      body.dark-mode header h1 { color: #f8fafc; }
      body.dark-mode .controls, body.dark-mode #onlinePanel, body.dark-mode .turn-indicator, body.dark-mode #scoreBoard { background: #1e293b; border-color: #334155; color: #f8fafc; box-shadow: 0 4px 6px rgba(0,0,0,0.4); }
      body.dark-mode select, body.dark-mode input, body.dark-mode .btn-action { background: #334155; color: #f8fafc; border-color: #475569; }
      body.dark-mode .chat-panel { background: #1e293b; border-color: #334155; }
      body.dark-mode .chat-messages { background: #0f172a; }
      body.dark-mode .chat-theirs { background: #334155; color: #f8fafc; }
      body.dark-mode .chat-mine { background: #2563eb; color: #eff6ff; }
      body.dark-mode .emote-row { background: #0f172a; }
      body.dark-mode .modal-content { background: #1e293b; color: #f8fafc; }
      body.dark-mode .modal-title { color: #f8fafc; }
      
      /* Menu trượt bên trái */
      #menuToggleBtn { position: fixed; top: 15px; left: 15px; background: white; border: 2px solid #cbd5e1; border-radius: 8px; padding: 8px 12px; font-size: 1.2rem; cursor: pointer; z-index: 1001; box-shadow: 0 4px 6px rgba(0,0,0,0.1); transition:0.3s; color: #334155; font-weight:bold; }
      body.dark-mode #menuToggleBtn { background: #334155; border-color: #475569; color:white; }
      
      #sideMenu { position: fixed; top: 0; left: -300px; width: 280px; height: 100vh; background: white; z-index: 1002; transition: 0.3s; box-shadow: 2px 0 15px rgba(0,0,0,0.2); display:flex; flex-direction:column; padding-top: 60px; }
      body.dark-mode #sideMenu { background: #1e293b; color:white; border-right: 1px solid #334155; }
      #sideMenu.open { left: 0; }
      .menu-item { padding: 15px 20px; font-size: 1.1rem; border-bottom: 1px solid #e2e8f0; cursor: pointer; font-weight: 600; display:flex; align-items:center; justify-content:space-between; }
      .menu-item:hover { background: #f8fafc; }
      body.dark-mode .menu-item { border-bottom-color: #334155; }
      body.dark-mode .menu-item:hover { background: #334155; }
      #menuOverlay { position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index: 1000; display:none; }

      #darkModeToggle { display:flex; align-items:center; justify-content:space-between; width:100%; }

      /* In Game UI */
      #inGameUI { display: none; justify-content: center; flex-wrap: wrap; gap: 8px; margin-top: 15px; width: 100%; transition: 0.3s; }
      .chat-panel { display: none; position: fixed; bottom: 70px; left: 50%; transform: translateX(-50%); width: 340px; background: white; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); z-index: 1000; flex-direction: column; overflow: hidden; border: 1px solid #cbd5e1; }
      .chat-messages { height: 220px; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; background: #f8fafc; scroll-behavior: smooth; }
      .emote-row { display: flex; flex-wrap: wrap; gap: 10px; padding: 10px; background: #e2e8f0; justify-content: center; font-size: 1.5rem; max-height: 95px; overflow-y: auto; }
      .emote-btn { cursor: pointer; transition: transform 0.2s; user-select: none; padding: 2px; }
      .emote-btn:hover { transform: scale(1.3); }
      .chat-msg { max-width: 85%; padding: 8px 12px; border-radius: 15px; font-size: 0.95rem; word-wrap: break-word; font-weight: 500;}
      .chat-mine { background: #bfdbfe; color: #1e3a8a; align-self: flex-end; border-bottom-right-radius: 2px; }
      .chat-theirs { background: #e2e8f0; color: #334155; align-self: flex-start; border-bottom-left-radius: 2px; }
      .chat-sys { background: transparent; color: #64748b; font-size: 0.8rem; text-align: center; align-self: center; font-style: italic; padding: 2px; }
      .pulse-btn { animation: pulseWarning 1s infinite alternate !important; background-color: #ef4444 !important; }
      @keyframes pulseWarning { from { transform: scale(1); box-shadow: 0 0 0 rgba(239, 68, 68, 0.4); } to { transform: scale(1.05); box-shadow: 0 0 15px rgba(239, 68, 68, 0.8); } }
      .toast-msg { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: rgba(30, 41, 59, 0.9); color: white; padding: 10px 20px; border-radius: 30px; font-weight: bold; z-index: 9999; opacity: 0; transition: 0.3s; pointer-events: none; }
      .toast-msg.show { opacity: 1; top: 50px; }

      /* Tỉ số */
      #scoreBoard { display: none; background: white; padding: 5px 15px; border-radius: 20px; margin-bottom: 10px; font-weight: bold; border: 2px solid #cbd5e1; color: #334155; box-shadow: 0 2px 4px rgba(0,0,0,0.05); align-items: center; gap: 10px; justify-content: center;}
      .score-badge { padding: 4px 10px; border-radius: 12px; color: white; font-size: 0.9rem; }
      .score-x { background-color: var(--x-color); }
      .score-o { background-color: var(--o-color); }
      
      /* Admin Panel */
      #adminPanel { display:none; flex-direction:column; padding: 15px; background: #fef2f2; border: 2px dashed #ef4444; border-radius: 8px; margin: 15px; }
      body.dark-mode #adminPanel { background: #450a0a; border-color: #991b1b; }
      .admin-room-item { background:white; border: 1px solid #fca5a5; padding: 8px; margin-bottom: 5px; border-radius: 6px; display:flex; justify-content:space-between; align-items:center; font-size:0.9rem; }
      body.dark-mode .admin-room-item { background: #1e293b; border-color: #7f1d1d; }
  `;
  document.head.appendChild(style);

  // Menu Toggle Button
  const menuToggleBtn = document.createElement("button");
  menuToggleBtn.id = "menuToggleBtn"; menuToggleBtn.innerHTML = "☰";
  menuToggleBtn.onclick = window.toggleSideMenu;
  document.body.appendChild(menuToggleBtn);

  // Overlay Menu
  const menuOverlay = document.createElement("div"); menuOverlay.id = "menuOverlay";
  menuOverlay.onclick = window.toggleSideMenu;
  document.body.appendChild(menuOverlay);

  // Side Menu Container
  const sideMenu = document.createElement("div"); sideMenu.id = "sideMenu";
  
  // Nút Dark Mode tích hợp vào Menu
  const dmIcon = localStorage.getItem("caro_dark") === "1" ? "☀️ Sáng" : "🌙 Tối";
  
  // Dùng link download raw của github để file tự tải xuống.
  const iosConfigURL = "https://hyakjbw.github.io/minigame/co_caro.mobileconfig";
  
  sideMenu.innerHTML = `
      <div class="menu-item" onclick="window.toggleDarkMode()">
          <span>Giao diện</span> <span id="dmText">${dmIcon}</span>
      </div>
      <div class="menu-item" onclick="window.downloadIOSConfig()">
          ⬇️ Cài đặt Ứng dụng (iOS)
      </div>
      <div class="menu-item" onclick="window.openAdminLogin()">🛡️ Quản trị Admin</div>
      
      <div id="adminPanel">
          <div style="font-weight:bold; color:#ef4444; margin-bottom:10px; text-align:center;">--- KHU VỰC QUẢN TRỊ ---</div>
          <button class="btn-action" style="background:#3b82f6; color:white; border:none; margin-bottom:10px;" onclick="window.loadAdminRooms()">🔄 Quét Phòng Mạng</button>
          <div id="adminRoomList" style="max-height: 300px; overflow-y:auto; font-size:0.85rem;"></div>
      </div>
  `;
  document.body.appendChild(sideMenu);
  
  window.downloadIOSConfig = function() {
      // Hàm ẩn tạo link ảo, bắt trình duyệt tự động tải xuống.
      window.showToast("Đang tải cấu hình. Bạn nhớ cấp quyền cài đặt nhé!");
      const a = document.createElement("a");
      a.href = iosConfigURL;
      a.download = "co_caro.mobileconfig"; 
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
  };
  
  if (localStorage.getItem("caro_dark") === "1") document.body.classList.add("dark-mode");

  const oPanel = document.getElementById("onlinePanel");
  if (oPanel) {
      const nameInput = document.createElement("input"); nameInput.type = "text"; nameInput.id = "playerNameInput";
      nameInput.placeholder = "Biệt danh của bạn (Không bắt buộc)"; nameInput.maxLength = 15;
      nameInput.style.width = "100%"; nameInput.style.marginBottom = "8px"; nameInput.style.boxSizing = "border-box";
      nameInput.value = localStorage.getItem("caro_name") || "";
      nameInput.onchange = (e) => localStorage.setItem("caro_name", e.target.value.trim());
      const titleDiv = oPanel.querySelector("div"); if(titleDiv) oPanel.insertBefore(nameInput, titleDiv.nextSibling.nextSibling);
  }

  const scoreBoard = document.createElement("div");
  scoreBoard.id = "scoreBoard";
  scoreBoard.innerHTML = `🏆 Tỉ số: <span id="scoreTextX" class="score-badge score-x">0</span> - <span id="scoreTextO" class="score-badge score-o">0</span>`;
  const statusBar = document.querySelector(".status-bar");
  if(statusBar) statusBar.insertBefore(scoreBoard, turnIndicator);

  const inGameUI = document.createElement("div"); inGameUI.id = "inGameUI";
  inGameUI.innerHTML = `
      <button class="btn-action" style="background:#ef4444; color:white; border:none;" onclick="window.leaveRoom()">🚪 Thoát</button>
      <button id="btnInGameSwap" class="btn-action spectator-hide" style="background:#8b5cf6; color:white; border:none;" onclick="window.requestSwap()">🎲 Đổi Bên</button>
      <button id="btnInGameRematch" class="btn-action spectator-hide" style="background:#f59e0b; color:white; border:none;" onclick="window.requestRematch()">🔄 Chơi Lại</button>
      <button class="btn-action" style="background:#3b82f6; color:white; border:none; position:relative;" onclick="window.toggleChat()">💬 Chat <span id="chatNotif" style="display:none; position:absolute; top:-5px; right:-5px; background:red; color:white; border-radius:50%; width:18px; height:18px; font-size:11px; line-height:18px; text-align:center;">!</span></button>
  `;
  document.querySelector("header").appendChild(inGameUI);

  const emotes = ['🤣','😡','😢','🏳️','👏','👍','👎','🤔','😎','😭','🤬','🤯','💩','👻','🤡','❤️','🔥','😴'];
  const emotesHTML = emotes.map(e => `<span class="emote-btn" onclick="window.sendChat('${e}')">${e}</span>`).join('');

  const chatPanel = document.createElement("div"); chatPanel.id = "chatPanel"; chatPanel.className = "chat-panel";
  chatPanel.innerHTML = `
      <div style="background: #3b82f6; color: white; padding: 10px; font-weight: bold; text-align: center; display:flex; justify-content:space-between; align-items:center;"><span>Kênh Trò Chuyện</span><span onclick="window.toggleChat()" style="cursor:pointer; font-size:1.2rem;">✖</span></div>
      <div id="chatMessages" class="chat-messages"></div><div class="emote-row">${emotesHTML}</div>
      <div style="display: flex; border-top: 1px solid #cbd5e1; background:white;">
          <input type="text" id="chatInput" placeholder="Nhắn gì đó..." style="flex: 1; border: none; padding: 12px; outline: none; background:transparent;">
          <button onclick="window.sendTextChat()" style="border: none; background: #10b981; color: white; padding: 0 20px; cursor: pointer; font-weight: bold;">Gửi</button>
      </div>
  `;
  document.body.appendChild(chatPanel);

  const toast = document.createElement("div"); toast.id = "gameToast"; toast.className = "toast-msg"; document.body.appendChild(toast);
  document.getElementById("chatInput").addEventListener("keypress", function(e) { if (e.key === "Enter") window.sendTextChat(); });
}

window.showToast = function(msg) {
  const toast = document.getElementById("gameToast"); if (!toast) return;
  toast.textContent = msg; toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3500);
}

/* =======================
   XỬ LÝ MENU & BẢO MẬT ADMIN
======================= */
window.toggleSideMenu = function() {
    AudioSys.play('click');
    const menu = document.getElementById("sideMenu");
    const overlay = document.getElementById("menuOverlay");
    if(menu.classList.contains("open")) {
        menu.classList.remove("open"); overlay.style.display = "none";
    } else {
        menu.classList.add("open"); overlay.style.display = "block";
    }
};

window.toggleDarkMode = function() {
    AudioSys.play('click');
    const isDark = document.body.classList.toggle("dark-mode");
    localStorage.setItem("caro_dark", isDark ? "1" : "0");
    document.getElementById("dmText").innerHTML = isDark ? "☀️ Sáng" : "🌙 Tối";
};


window.openAdminLogin = async function() {
    const pass = prompt("Nhập mật khẩu quản trị:");
    if (!pass) return;
    const hash = await hashPassword(pass);
    if (hash === ADMIN_PASS_HASH) {
        document.getElementById("adminPanel").style.display = "flex";
        window.showToast("🔓 Đã mở khóa Admin!");
        window.loadAdminRooms();
    } else {
        window.showToast("❌ Sai mật khẩu!");
    }
};

window.loadAdminRooms = async function() {
    if (!db) return window.showToast("Lỗi mạng!");
    const listEl = document.getElementById("adminRoomList");
    listEl.innerHTML = "<i>Đang quét phòng...</i>";
    
    try {
        const qSnap = await getDocs(collection(db, "rooms"));
        if (qSnap.empty) { listEl.innerHTML = "Không có phòng nào."; return; }
        
        let html = "";
        qSnap.forEach(docSnap => {
            const d = docSnap.data();
            const rName = docSnap.id.replace("room_", "");
            const pCount = (d.playerX ? 1 : 0) + (d.playerO ? 1 : 0);
            html += `<div class="admin-room-item">
                        <span><b>${rName}</b> (${pCount}/2)</span>
                        <button style="background:#ef4444; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;" onclick="window.adminDeleteRoom('${docSnap.id}')">Xóa</button>
                     </div>`;
        });
        listEl.innerHTML = html;
    } catch(e) { listEl.innerHTML = "Lỗi quét dữ liệu."; }
};

window.adminDeleteRoom = async function(roomId) {
    if(!confirm("Chắc chắn muốn xóa phòng này?")) return;
    if(db) {
        await deleteDoc(doc(db, "rooms", roomId));
        window.showToast("Đã xóa phòng " + roomId);
        window.loadAdminRooms();
    }
};


/* =======================
   NHỊP TIM & THOÁT PHÒNG
======================= */
function startHeartbeat() {
    if(State.heartbeatInterval) clearInterval(State.heartbeatInterval);
    State.heartbeatInterval = setInterval(() => {
        if (State.currentRoomId && modeSelect.value === "online" && db) {
            updateDoc(doc(db, "rooms", State.currentRoomId), { lastActive: Date.now() }).catch(()=>{});
        }
    }, 5 * 60 * 1000); 
}

function stopHeartbeat() { if(State.heartbeatInterval) { clearInterval(State.heartbeatInterval); State.heartbeatInterval = null; } }

window.leaveRoom = async function() {
    AudioSys.play('click');
    if (State.currentRoomId && db) {
        const roomRef = doc(db, "rooms", State.currentRoomId);
        try {
            if (State.isSpectator) {
                 window.sendChat("👋 Khán giả đã rời đi.", true);
            } else {
                const snap = await getDoc(roomRef);
                if (snap.exists()) {
                    const data = snap.data();
                    let pX = data.playerX; let pO = data.playerO;
                    if (State.mySide === "X") pX = ""; if (State.mySide === "O") pO = "";

                    if (pX === "" && pO === "") {
                        await deleteDoc(roomRef); 
                    } else {
                        await updateDoc(roomRef, { playerX: pX, playerO: pO, lastActive: Date.now(), scoreX: 0, scoreO: 0 });
                        window.sendChat("👋 Đối thủ đã rời phòng.", true);
                    }
                }
            }
        } catch (e) { console.error("Lỗi khi thoát", e); }
    }
    stopHeartbeat(); window.showToast("Đã rời phòng!");
    if (modeSelect) modeSelect.value = "pvp"; window.handleModeChange();
};

window.addEventListener("beforeunload", (e) => {
    if (modeSelect && modeSelect.value === "online" && State.currentRoomId && !State.isSpectator && db) {
        const roomRef = doc(db, "rooms", State.currentRoomId);
        getDoc(roomRef).then(snap => {
            if (snap.exists()) {
                const data = snap.data();
                let pX = data.playerX; let pO = data.playerO;
                if (State.mySide === "X") pX = ""; if (State.mySide === "O") pO = "";
                if (pX === "" && pO === "") deleteDoc(roomRef); 
                else updateDoc(roomRef, { playerX: pX, playerO: pO, scoreX: 0, scoreO: 0 });
            }
        }).catch(()=>{});
    }
});

/* =======================
   UTILS & RENDER
======================= */
function emptyBoard() { return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill("")); }
function inBounds(r, c) { return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE; }
function flattenBoard2D(b2) { return b2.flat(); }
function unflattenTo2D(board1D) { const b = emptyBoard(); for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) b[Math.floor(i / BOARD_SIZE)][i % BOARD_SIZE] = board1D[i] || ""; return b; }
function indexOfMove(r, c) { return r * BOARD_SIZE + c; }
function rcFromIndex(idx) { return { r: Math.floor(idx / BOARD_SIZE), c: idx % BOARD_SIZE }; }
function getCellElement(r, c) { return boardElement.querySelector(`[data-row="${r}"][data-col="${c}"]`); }
function showModal(msg) { modalMessage.innerHTML = msg; modalOverlay.classList.add("active"); }

function updateUIState() {
  const mode = modeSelect ? modeSelect.value : "pvp";
  const inGameUI = document.getElementById("inGameUI");
  const scoreBoard = document.getElementById("scoreBoard");

  if (mode === "online" && State.currentRoomId) {
      if (inGameUI) inGameUI.style.display = "flex";
      if (scoreBoard && !State.isSpectator) scoreBoard.style.display = "flex";
      else if(scoreBoard) scoreBoard.style.display = "none";
      
      document.querySelectorAll(".spectator-hide").forEach(el => {
          if (el.id === "btnInGameSwap") {
              el.style.display = (State.isSpectator || State.moveHistory.length > 0) ? "none" : "block";
          } else {
              el.style.display = State.isSpectator ? "none" : "block";
          }
      });
  } else {
      if (inGameUI) inGameUI.style.display = "none";
      if (scoreBoard) scoreBoard.style.display = "none";
      const chatPanel = document.getElementById("chatPanel"); if(chatPanel) chatPanel.style.display = "none";
  }

  if (State.isAiThinking) { turnIndicator.textContent = "💻 Máy đang tính..."; turnIndicator.style.color = "#94a3b8"; turnIndicator.style.borderColor = "#94a3b8"; return; }

  if (mode === "online") {
    if (!State.currentRoomId) { turnIndicator.textContent = "Chưa vào phòng"; turnIndicator.style.color = "#94a3b8"; turnIndicator.style.borderColor = "#cbd5e1"; return; }
    
    if (State.isSpectator) {
        turnIndicator.textContent = `👀 Khán giả | Lượt: ${State.currentPlayer}`;
        turnIndicator.style.color = "#64748b"; turnIndicator.style.borderColor = "#cbd5e1";
        return;
    }

    if (State.currentPlayer === State.mySide) { turnIndicator.textContent = `Lượt đi: ${State.myName} (${State.currentPlayer})`; turnIndicator.style.color = State.currentPlayer === "X" ? "var(--x-color)" : "var(--o-color)"; } 
    else { turnIndicator.textContent = `Đợi ${State.oppName} (${State.currentPlayer})...`; turnIndicator.style.color = "#64748b"; }
    turnIndicator.style.borderColor = State.currentPlayer === "X" ? "var(--x-color)" : "var(--o-color)"; return;
  }
  turnIndicator.textContent = mode === "pvp" ? `Lượt đi: Người chơi ${State.currentPlayer}` : (State.currentPlayer === "X" ? "Lượt đi: Bạn (X)" : "Lượt đi: Máy (O)");
  turnIndicator.style.color = State.currentPlayer === "X" ? "var(--x-color)" : "var(--o-color)"; turnIndicator.style.borderColor = State.currentPlayer === "X" ? "var(--x-color)" : "var(--o-color)";
}

function buildBoardDOM() {
  if (!boardElement) return; boardElement.innerHTML = "";
  for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement("div"); cell.className = "cell"; cell.dataset.row = r; cell.dataset.col = c;
      cell.addEventListener("click", handleCellClick); boardElement.appendChild(cell);
  }
}

function resetLocalGame(keepOnline = false) {
  State.board = emptyBoard(); State.moveHistory = []; State.currentPlayer = "X"; State.gameActive = true; State.lastMoveElement = null; State.isAiThinking = false; State.opponentRequestedRematch = false; State.swapRequested = false; State.processedWinner = false;
  const rematchBtn = document.getElementById("btnInGameRematch"); if (rematchBtn) { rematchBtn.innerHTML = "🔄 Chơi Lại"; rematchBtn.classList.remove("pulse-btn"); }
  const swapBtn = document.getElementById("btnInGameSwap"); if (swapBtn) { swapBtn.innerHTML = "🎲 Đổi Bên"; swapBtn.classList.remove("pulse-btn"); }
  if (modalOverlay) modalOverlay.classList.remove("active"); document.querySelectorAll(".win-cell").forEach(e => e.classList.remove("win-cell"));

  if (!keepOnline) {
    if (State.unsubscribeRoom) { State.unsubscribeRoom(); State.unsubscribeRoom = null; }
    State.currentRoomId = null; State.mySide = null; State.currentResetSignal = 0; State.myName = "Bạn"; State.oppName = "Đối thủ"; State.isSpectator = false; State.scoreX = 0; State.scoreO = 0;
    stopHeartbeat(); if (roomStatus) roomStatus.innerHTML = "";
  }
  buildBoardDOM(); updateUIState();
}
window.initGame = function (keepOnline = false) { resetLocalGame(keepOnline); };

/* =======================
   WIN CHECK & APPLY MOVE
======================= */
function checkWin(row, col, player) {
  const directions = [[[0, 1], [0, -1]], [[1, 0], [-1, 0]], [[1, 1], [-1, -1]], [[1, -1], [-1, 1]]];
  for (const dir of directions) {
    const winCells = [{ row, col }];
    for (const [dr, dc] of dir) { let r = row + dr, c = col + dc; while (inBounds(r, c) && State.board[r][c] === player) { winCells.push({ row: r, col: c }); r += dr; c += dc; } }
    if (winCells.length >= 5) return winCells;
  }
  return null;
}
function highlightWinCells(cells) { cells.forEach(p => { const el = getCellElement(p.row, p.col); if(el) el.classList.add("win-cell"); }); }

function applyMoveLocally(r, c, player, isOnlineSync = false) {
  if (!State.gameActive || !inBounds(r, c) || State.board[r][c] !== "") return { ok: false };
  State.board[r][c] = player; const cell = getCellElement(r, c);
  if (cell) { cell.textContent = player; cell.classList.add(player.toLowerCase()); if (State.lastMoveElement) State.lastMoveElement.classList.remove("last-move"); cell.classList.add("last-move"); State.lastMoveElement = cell; }
  State.moveHistory.push({ row: r, col: c, player, element: cell });
  AudioSys.play('click'); 

  const winCells = checkWin(r, c, player);
  if (winCells) {
    highlightWinCells(winCells); State.gameActive = false;
    if (!isOnlineSync) {
        if(State.isSpectator) { showModal(`🎉 Người chơi ${player} thắng!`); AudioSys.play('win'); } 
        else {
            let msg = modeSelect.value === "online" ? "🎉 Bạn đã chiến thắng!" : `🎉 Người chơi ${player} thắng!`;
            if (modeSelect.value !== "online" && player === "O") msg = "🤖 Máy đã thắng!";
            showModal(msg); AudioSys.play('win');
        }
    }
    return { ok: true, winCells: winCells };
  }
  if (State.moveHistory.length === BOARD_SIZE * BOARD_SIZE) { State.gameActive = false; showModal("🤝 Hòa cờ!"); return { ok: true, draw: true }; }
  State.currentPlayer = (State.currentPlayer === "X") ? "O" : "X"; updateUIState(); return { ok: true };
}

/* =======================
   AI LOGIC 
======================= */
const PATTERNS = [{ re: /PPPPP/, score: 100000000 }, { re: /\.PPPP\./, score: 10000000 }, { re: /BPPPP\./, score: 1000000 }, { re: /\.PPPPB/, score: 1000000 }, { re: /P\.PPP/, score: 1000000 }, { re: /PPP\.P/, score: 1000000 }, { re: /PP\.PP/, score: 1000000 }, { re: /\.PPP\./, score: 100000 }, { re: /\.P\.PP\./, score: 80000 }, { re: /\.PP\.P\./, score: 80000 }, { re: /BPPP\.\./, score: 10000 }, { re: /\.\.PPPB/, score: 10000 }, { re: /BPP\.P\./, score: 8000 }, { re: /\.P\.PPB/, score: 8000 }, { re: /BP\.PP\./, score: 8000 }, { re: /\.PP\.PB/, score: 8000 }, { re: /P\.\.PP/, score: 5000 }, { re: /PP\.\.P/, score: 5000 }, { re: /P\.P\.P/, score: 5000 }, { re: /\.PP\./, score: 1000 }, { re: /\.P\.P\./, score: 800 }, { re: /\.\.PP\.\./, score: 600 }, { re: /BPP\.\.\./, score: 100 }, { re: /\.\.\.PPB/, score: 100 }];
function getAxisString(r, c, dr, dc, player) { let str = ""; for (let i = -4; i <= 4; i++) { const nr = r + dr * i, nc = c + dc * i; if (!inBounds(nr, nc)) str += "B"; else if (State.board[nr][nc] === player) str += "P"; else if (State.board[nr][nc] === "") str += "."; else str += "B"; } return str; }
function evaluateCellMaster(r, c, player) {
  State.board[r][c] = player; let score = 0; let open3Count = 0; let closed4Count = 0;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const str = getAxisString(r, c, dr, dc, player); let lineScore = 0;
    for (let i = 0; i < PATTERNS.length; i++) { if (PATTERNS[i].re.test(str)) { lineScore = PATTERNS[i].score; break; } }
    score += lineScore; if (lineScore === 100000 || lineScore === 80000) open3Count++; if (lineScore === 1000000) closed4Count++;
  }
  State.board[r][c] = ""; 
  if (closed4Count >= 2) score += 10000000; if (closed4Count >= 1 && open3Count >= 1) score += 5000000; if (open3Count >= 2) score += 2000000;
  return score;
}
function calculateLocalAIMove(difficulty, aiSide) {
  const oppSide = aiSide === "X" ? "O" : "X"; let candidates = []; let isBoardEmpty = true;
  for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) {
      if (State.board[r][c] !== "") { isBoardEmpty = false; continue; }
      let isNearPiece = false;
      for (let i = -2; i <= 2 && !isNearPiece; i++) for (let j = -2; j <= 2; j++) if (inBounds(r+i, c+j) && State.board[r+i][c+j] !== "") isNearPiece = true;
      if (!isNearPiece) continue;
      let totalScore = (evaluateCellMaster(r, c, aiSide) * 1.05) + evaluateCellMaster(r, c, oppSide) + (20 - (Math.abs(r - BOARD_SIZE/2) + Math.abs(c - BOARD_SIZE/2)));
      candidates.push({ r, c, score: totalScore });
  }
  if (isBoardEmpty || candidates.length === 0) return { r: Math.floor(BOARD_SIZE / 2), c: Math.floor(BOARD_SIZE / 2) };
  candidates.sort((a, b) => b.score - a.score);
  if (difficulty === "easy") return candidates[Math.floor(Math.random() * Math.min(6, candidates.length))];
  if (difficulty === "medium") return candidates[Math.floor(Math.random() * Math.min(2, candidates.length))];
  return candidates[0];
}

function handleCellClick(e) {
  AudioSys.init(); if (!State.gameActive || State.isAiThinking) return;
  if (State.isSpectator) return window.showToast("Bạn đang là Khán giả, không thể đánh cờ!");

  const r = parseInt(e.target.dataset.row, 10), c = parseInt(e.target.dataset.col, 10);
  if (State.board[r][c] !== "") return;
  const mode = modeSelect ? modeSelect.value : "pvp";

  if (mode === "online") {
    if (!State.currentRoomId || State.currentPlayer !== State.mySide) return;
    const result = applyMoveLocally(r, c, State.mySide);
    if (result.ok) syncMoveToFirebase(r, c, State.mySide, result.winCells);
    return;
  }
  applyMoveLocally(r, c, State.currentPlayer);
  if (State.gameActive && mode.startsWith("pve") && State.currentPlayer === "O") {
    State.isAiThinking = true; updateUIState();
    setTimeout(() => {
      let diff = mode.split("-")[1] || "hard"; if(diff === "super") diff = "hard"; 
      const move = calculateLocalAIMove(diff, "O"); applyMoveLocally(move.r, move.c, "O");
      State.isAiThinking = false; updateUIState();
    }, 50);
  }
}

/* =======================
   FIREBASE ONLINE SYNC
======================= */
function listenToAvailableRooms() {
  if (!db) return;
  const q = collection(db, "rooms");
  if (State.unsubscribeRooms) State.unsubscribeRooms();

  State.unsubscribeRooms = onSnapshot(q, (snapshot) => {
    const roomListEl = document.getElementById("availableRooms");
    if (!roomListEl) return; roomListEl.innerHTML = "";
    let hasActiveRooms = false; const now = Date.now();

    snapshot.forEach(d => {
      const data = d.data();
      if (!data.lastActive || (now - data.lastActive > 10 * 60 * 1000)) { deleteDoc(doc(db, "rooms", d.id)).catch(()=>{}); return; }
      
      hasActiveRooms = true;
      const roomName = d.id.replace("room_", "");
      const hostName = data.playerNameX ? ` (Host: ${data.playerNameX})` : ""; 
      const isFull = (data.playerX !== "" && data.playerO !== "") ? " <span style='color:red; font-size:0.7rem'>(Đầy - Khán giả)</span>" : "";

      const btn = document.createElement("button"); btn.className = "btn-room";
      btn.innerHTML = `🏠 <b>${roomName}</b><span style="font-size:0.75rem; color:#64748b;">${hostName}</span>${isFull}`;
      btn.onclick = () => { document.getElementById("roomIdInput").value = roomName; window.joinOrCreateRoom(); };
      roomListEl.appendChild(btn);
    });

    if (!hasActiveRooms) roomListEl.innerHTML = '<div style="color:#94a3b8; font-size:0.85rem;">Chưa có phòng nào. Hãy tạo phòng mới!</div>';
  });
}

window.joinOrCreateRoom = async function () {
  AudioSys.init();
  if (!db) return alert("Hệ thống Offline. Vui lòng kiểm tra mạng!");
  const roomIdInputEl = document.getElementById("roomIdInput");
  if(!roomIdInputEl) return;
  const roomIdInput = roomIdInputEl.value.trim().toLowerCase();
  if (!roomIdInput) return alert("Vui lòng nhập tên phòng!");

  const inputNameVal = document.getElementById("playerNameInput")?.value.trim() || "";
  const myName = inputNameVal !== "" ? inputNameVal : "Người Lạ";
  const roomId = "room_" + roomIdInput; window.initGame(true); const now = Date.now();
  const roomRef = doc(db, "rooms", roomId);

  try {
    const snap = await getDoc(roomRef);
    if (!snap.exists()) {
      // Random phe lúc tạo phòng
      const hostSide = Math.random() < 0.5 ? "X" : "O";
      const payload = {
        board1D: Array(BOARD_SIZE * BOARD_SIZE).fill(""), turn: "X", lastMoveIndex: -1,
        playerX: hostSide === "X" ? myLocalUid : "", playerO: hostSide === "O" ? myLocalUid : "",
        playerNameX: hostSide === "X" ? myName : "", playerNameO: hostSide === "O" ? myName : "",
        resetSignal: now, lastActive: now, winner: null, winCells: null, rematchRequest: null, swapRequest: null,
        scoreX: 0, scoreO: 0
      };
      await setDoc(roomRef, payload);
      State.mySide = hostSide; State.currentRoomId = roomId; State.isSpectator = false;
    } else {
      const data = snap.data();
      if (!data.lastActive || (now - data.lastActive > 10 * 60 * 1000)) {
         const hostSide = Math.random() < 0.5 ? "X" : "O";
         await setDoc(roomRef, {
            board1D: Array(BOARD_SIZE * BOARD_SIZE).fill(""), turn: "X", lastMoveIndex: -1,
            playerX: hostSide === "X" ? myLocalUid : "", playerO: hostSide === "O" ? myLocalUid : "", 
            playerNameX: hostSide === "X" ? myName : "", playerNameO: hostSide === "O" ? myName : "",
            resetSignal: now, lastActive: now, winner: null, winCells: null, rematchRequest: null, swapRequest: null,
            scoreX: 0, scoreO: 0
         });
         State.mySide = hostSide; State.isSpectator = false;
      } else {
        let pX = data.playerX; let pO = data.playerO;
        if (pX === myLocalUid) { State.mySide = "X"; State.isSpectator = false; await updateDoc(roomRef, { playerNameX: myName }); }
        else if (pO === myLocalUid) { State.mySide = "O"; State.isSpectator = false; await updateDoc(roomRef, { playerNameO: myName }); }
        else if (pX === "") { await updateDoc(roomRef, { playerX: myLocalUid, playerNameX: myName, lastActive: now }); State.mySide = "X"; State.isSpectator = false; }
        else if (pO === "") { await updateDoc(roomRef, { playerO: myLocalUid, playerNameO: myName, lastActive: now }); State.mySide = "O"; State.isSpectator = false; } 
        else {
           // Phòng đầy -> Vào làm khán giả
           State.mySide = "Spectator"; State.isSpectator = true; State.myName = myName;
           window.sendChat(`👋 Khán giả <b>${myName}</b> vừa vào xem.`, true);
           window.showToast("Bạn đã vào phòng với tư cách Khán Giả!");
        }
      }
      State.currentRoomId = roomId; State.currentResetSignal = data.resetSignal || 0;
    }
    
    startHeartbeat(); listenToRoom(roomRef); updateUIState();
  } catch (e) { console.error(e); alert("Lỗi truy cập dữ liệu Firebase!"); }
};

function listenToRoom(roomRef) {
  if (State.unsubscribeRoom) State.unsubscribeRoom();
  State.unsubscribeRoom = onSnapshot(roomRef, (snap) => {
    if (!snap.exists()) {
        if (State.currentRoomId && modeSelect.value === "online") { window.showToast("Phòng đã bị xóa!"); window.initGame(); }
        return;
    }
    const data = snap.data();

    // ĐỌC VÀ CẬP NHẬT TỈ SỐ HIỂN THỊ
    State.scoreX = data.scoreX || 0; State.scoreO = data.scoreO || 0;

    if (!State.isSpectator) {
        State.myName = State.mySide === "X" ? (data.playerNameX || "Bạn") : (data.playerNameO || "Bạn");
        State.oppName = State.mySide === "X" ? (data.playerNameO || "Đối thủ") : (data.playerNameX || "Đối thủ");
    } else {
        State.oppName = "Hai người chơi"; 
    }

    const sTextX = document.getElementById("scoreTextX");
    const sTextO = document.getElementById("scoreTextO");
    if(sTextX && sTextO) {
        // Tên (Bạn) sẽ được gắn vào đúng màu quân để dễ phân biệt
        let labelX = data.playerNameX || 'Quân X';
        let labelO = data.playerNameO || 'Quân O';
        if (!State.isSpectator) {
            if (State.mySide === "X") labelX = `${labelX} (Bạn)`;
            if (State.mySide === "O") labelO = `${labelO} (Bạn)`;
        }
        
        sTextX.textContent = `${labelX}: ${State.scoreX}`;
        sTextO.textContent = `${labelO}: ${State.scoreO}`;
        
        sTextX.style.fontWeight = State.mySide === "X" ? "900" : "normal";
        sTextO.style.fontWeight = State.mySide === "O" ? "900" : "normal";
    }

    let isOpponentHere = (State.mySide === "X" && data.playerO !== "") || (State.mySide === "O" && data.playerX !== "");
    if (data.playerX && data.playerO !== "" && roomStatus) {
      if(State.isSpectator) roomStatus.innerHTML = `Phòng: <b>${State.currentRoomId.replace("room_", "")}</b><br>(Khán Giả đang xem)`;
      else roomStatus.innerHTML = `Phòng: <b>${State.currentRoomId.replace("room_", "")}</b><br>(Bạn là <b>${State.myName}</b> vs <b>${State.oppName}</b>)`;
    } else if (roomStatus) {
      if(State.isSpectator) roomStatus.innerHTML = `Phòng: <b>${State.currentRoomId.replace("room_", "")}</b><br>(Khán Giả: Chờ đủ 2 người)`;
      else roomStatus.innerHTML = `Phòng: <span style="color:#2563eb; font-size:1.1rem">${State.currentRoomId.replace("room_", "")}</span><br>Bạn là <b>${State.myName}</b>. Đang đợi...`;
      if (!isOpponentHere && State.gameActive === false && State.currentRoomId && !State.isSpectator) window.showToast(`${State.oppName} đã rời phòng!`);
    }

    // Xử lý Rematch Request
    const btnRematch = document.getElementById("btnInGameRematch");
    if (data.rematchRequest && !State.isSpectator) {
        if (data.rematchRequest !== State.mySide) {
            State.opponentRequestedRematch = true;
            if(btnRematch) { btnRematch.innerHTML = "⚠️ Đối thủ gạ chơi lại (Bấm Đồng ý)"; btnRematch.classList.add("pulse-btn"); }
        } else { if(btnRematch) btnRematch.innerHTML = "⏳ Đang đợi đối thủ xác nhận..."; }
    } else {
        State.opponentRequestedRematch = false;
        if(btnRematch) { btnRematch.innerHTML = "🔄 Chơi Lại"; btnRematch.classList.remove("pulse-btn"); }
    }

    // Xử lý Swap Request (Đổi bên)
    const btnSwap = document.getElementById("btnInGameSwap");
    if (data.swapRequest && !State.isSpectator && State.moveHistory.length === 0) {
        if (data.swapRequest !== State.mySide) {
            State.swapRequested = true;
            if(btnSwap) { btnSwap.innerHTML = "⚠️ Đối thủ xin Đổi X/O (Bấm Đồng ý)"; btnSwap.classList.add("pulse-btn"); }
        } else { if(btnSwap) btnSwap.innerHTML = "⏳ Chờ xác nhận đổi..."; }
    } else {
        State.swapRequested = false;
        if(btnSwap) { btnSwap.innerHTML = "🎲 Đổi Bên"; btnSwap.classList.remove("pulse-btn"); }
    }

    // Bắt tín hiệu reset (ván mới) HOẶC đổi phe
    if (data.resetSignal && data.resetSignal !== State.currentResetSignal) {
      State.currentResetSignal = data.resetSignal; 
      
      if(!State.isSpectator) {
          if(data.playerX === myLocalUid) State.mySide = "X";
          else if(data.playerO === myLocalUid) State.mySide = "O";
      }

      resetLocalGame(true); State.currentPlayer = data.turn || "X"; updateUIState(); 
      window.showToast("Bàn cờ đã được làm mới!"); return; 
    }

    if (Array.isArray(data.board1D) && data.board1D.length === BOARD_SIZE * BOARD_SIZE) {
      const serverBoard = unflattenTo2D(data.board1D);
      for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) {
          const v = serverBoard[r][c];
          if (State.board[r][c] !== v) {
            State.board[r][c] = v; const cell = getCellElement(r, c);
            if (cell) { cell.textContent = v; cell.className = "cell"; if (v === "X" || v === "O") cell.classList.add(v.toLowerCase()); }
          }
      }
    }

    if (typeof data.lastMoveIndex === "number" && data.lastMoveIndex !== -1) {
      const { r, c } = rcFromIndex(data.lastMoveIndex); const cell = getCellElement(r, c);
      if (cell) {
         if (State.lastMoveElement) State.lastMoveElement.classList.remove("last-move");
         cell.classList.add("last-move"); State.lastMoveElement = cell;
         if (State.currentPlayer === State.mySide && data.turn === State.mySide) AudioSys.play('click');
      }
    }

    // XỬ LÝ KHI CÓ WINNER (Thắng cờ)
    if (data.winner && State.gameActive) {
       State.gameActive = false;
       if (data.winCells) highlightWinCells(data.winCells);
       
       if (State.isSpectator) {
           showModal(`🎉 ${data.winner === "X" ? data.playerNameX : data.playerNameO} (${data.winner}) đã chiến thắng!`);
       } else {
           if (data.winner === State.mySide) { showModal("🎉 Bạn đã chiến thắng!"); AudioSys.play('win'); }
           else { showModal(`🥲 ${State.oppName} đã chiến thắng!`); AudioSys.play('lose'); }
       }
       
       // CỘNG ĐIỂM (Cơ chế an toàn: Chỉ người chơi X tự kiểm tra và cộng điểm cho đúng 1 lần)
       // Không cho cả X và O cùng gửi lệnh cộng điểm để tránh bị +2 điểm 1 ván.
       if (!State.processedWinner) {
           State.processedWinner = true;
           if (!State.isSpectator && State.mySide === "X") {
               const updateData = {};
               if (data.winner === "X") updateData.scoreX = State.scoreX + 1;
               else updateData.scoreO = State.scoreO + 1;
               updateDoc(roomRef, updateData).catch(()=>{});
           }
       }
    }

    if (data.chatMessage && data.chatMessage.id !== State.lastChatId) {
        State.lastChatId = data.chatMessage.id; displayIncomingChat(data.chatMessage);
    }
    State.currentPlayer = data.turn || "X"; updateUIState();
  }, (err) => console.error(err));
}

function syncMoveToFirebase(row, col, playerJustMoved, winCellsData) {
  if (!db || !State.currentRoomId) return;
  const roomRef = doc(db, "rooms", State.currentRoomId);
  const lastMoveIndex = indexOfMove(row, col);
  const turnNext = (playerJustMoved === "X") ? "O" : "X";
  
  let payload = { board1D: flattenBoard2D(State.board), turn: turnNext, lastMoveIndex, lastActive: Date.now(), swapRequest: null };
  if (winCellsData) { payload.winner = playerJustMoved; payload.winCells = winCellsData; }
  updateDoc(roomRef, payload).catch(e => console.error(e));
}

/* =======================
   REMATCH & SWAP
======================= */
window.requestRematch = async function () {
  AudioSys.play('click');
  const mode = modeSelect ? modeSelect.value : "pvp";
  if (mode === "online" && State.currentRoomId && db && !State.isSpectator) {
    const roomRef = doc(db, "rooms", State.currentRoomId);
    
    if (State.opponentRequestedRematch) {
       if (modalOverlay) modalOverlay.classList.remove("active");
       
       const snap = await getDoc(roomRef);
       if (snap.exists()) {
           const d = snap.data();
           const shouldSwap = Math.random() < 0.5;
           const newPX = shouldSwap ? d.playerO : d.playerX;
           const newPO = shouldSwap ? d.playerX : d.playerO;
           const newNameX = shouldSwap ? d.playerNameO : d.playerNameX;
           const newNameO = shouldSwap ? d.playerNameX : d.playerNameO;
           const newScoreX = shouldSwap ? d.scoreO : d.scoreX;
           const newScoreO = shouldSwap ? d.scoreX : d.scoreO;

           await updateDoc(roomRef, { 
               board1D: Array(BOARD_SIZE * BOARD_SIZE).fill(""), turn: "X", lastMoveIndex: -1, 
               playerX: newPX, playerO: newPO, playerNameX: newNameX, playerNameO: newNameO,
               scoreX: newScoreX, scoreO: newScoreO,
               winner: null, winCells: null, rematchRequest: null, resetSignal: Date.now(), lastActive: Date.now() 
           }).catch(e => console.error(e));
           if(shouldSwap) window.showToast("Ván mới: Hệ thống đã đổi bên X/O!");
       }
    } else {
       await updateDoc(roomRef, { rematchRequest: State.mySide, lastActive: Date.now() }).catch(e=>console.error(e));
       window.showToast("Đã gửi lời mời, chờ (5 giây)...");
       setTimeout(async () => {
           if (State.currentRoomId) {
               const snap = await getDoc(roomRef);
               if (snap.exists() && snap.data().rematchRequest === State.mySide) { updateDoc(roomRef, { rematchRequest: null }).catch(()=>{}); window.showToast("Lời mời chơi lại đã hết hạn!"); }
           }
       }, 5000);
    }
  } else window.initGame();
};
window.triggerRematch = window.requestRematch; 

window.requestSwap = async function () {
    AudioSys.play('click');
    if (modeSelect?.value !== "online" || !State.currentRoomId || !db || State.isSpectator) return;
    
    if (State.moveHistory.length > 0) return window.showToast("Chỉ được đổi phe khi bàn cờ trống!");

    const roomRef = doc(db, "rooms", State.currentRoomId);
    if (State.swapRequested) {
        const snap = await getDoc(roomRef);
        if (snap.exists()) {
            const d = snap.data();
            await updateDoc(roomRef, { 
               board1D: Array(BOARD_SIZE * BOARD_SIZE).fill(""), turn: "X", lastMoveIndex: -1, 
               playerX: d.playerO, playerO: d.playerX, playerNameX: d.playerNameO, playerNameO: d.playerNameX,
               scoreX: d.scoreO, scoreO: d.scoreX,
               winner: null, winCells: null, swapRequest: null, resetSignal: Date.now(), lastActive: Date.now() 
           });
           window.showToast("Đổi bên thành công!");
        }
    } else {
       await updateDoc(roomRef, { swapRequest: State.mySide, lastActive: Date.now() }).catch(e=>console.error(e));
       window.showToast("Xin đổi phe, chờ (5 giây)...");
       setTimeout(async () => {
           if (State.currentRoomId) {
               const snap = await getDoc(roomRef);
               if (snap.exists() && snap.data().swapRequest === State.mySide) { updateDoc(roomRef, { swapRequest: null }).catch(()=>{}); window.showToast("Xin đổi phe hết hạn!"); }
           }
       }, 5000);
    }
}

/* =======================
   CHAT LOGIC
======================= */
window.toggleChat = function() {
    AudioSys.play('click'); const panel = document.getElementById("chatPanel"); const notif = document.getElementById("chatNotif");
    if (!panel) return;
    if (panel.style.display === "none" || panel.style.display === "") {
        panel.style.display = "flex"; if(notif) notif.style.display = "none";
        const box = document.getElementById("chatMessages"); if(box) box.scrollTop = box.scrollHeight;
    } else panel.style.display = "none";
};

window.sendChat = function(text, isSystemMsg = false) {
    AudioSys.play('click');
    if (!State.currentRoomId || !db) return;
    let sName = State.isSpectator ? `👁️ Khán giả (${State.myName})` : State.myName;
    if (isSystemMsg) sName = "Hệ thống";
    
    updateDoc(doc(db, "rooms", State.currentRoomId), { chatMessage: { text: text, sender: State.mySide, sName: sName, sys: isSystemMsg, id: Date.now() }, lastActive: Date.now() }).catch(e => console.log(e));
};

window.sendTextChat = function() {
    const input = document.getElementById("chatInput");
    if(input && input.value.trim() !== "") { window.sendChat(input.value.trim()); input.value = ""; }
};

function displayIncomingChat(msgData) {
    const box = document.getElementById("chatMessages"); const panel = document.getElementById("chatPanel"); const notif = document.getElementById("chatNotif");
    if (!box) return;

    const isMe = msgData.sender === State.mySide && !msgData.sys;
    const div = document.createElement("div");
    
    if (msgData.sys) {
        div.className = "chat-msg chat-sys"; div.innerHTML = msgData.text;
    } else {
        div.className = "chat-msg " + (isMe ? "chat-mine" : "chat-theirs");
        div.innerHTML = `<b>${msgData.sName}:</b> ${msgData.text}`;
    }
    
    box.appendChild(div); box.scrollTop = box.scrollHeight;

    if (!isMe) {
        AudioSys.play('ting'); 
        if (panel.style.display === "none" || panel.style.display === "") {
            if(notif) notif.style.display = "block";
            window.showToast(`💬 ${msgData.sName}: ${msgData.text}`);
        }
    }
}

/* =======================
   MODE CHANGE & UNDO
======================= */
window.handleModeChange = function () {
  AudioSys.play('click');
  const mode = modeSelect ? modeSelect.value : "pvp";
  if (mode === "online") { if (onlinePanel) onlinePanel.style.display = "block"; window.initGame(); listenToAvailableRooms(); } 
  else { if (onlinePanel) onlinePanel.style.display = "none"; if (State.unsubscribeRooms) { State.unsubscribeRooms(); State.unsubscribeRooms = null; } window.initGame(); }
};

window.undoMove = function () {
  AudioSys.play('click');
  const mode = modeSelect ? modeSelect.value : "pvp";
  if (State.moveHistory.length < 1 || State.isAiThinking || mode === "online") return;
  const steps = mode.startsWith("pve") ? 2 : 1;
  for (let i = 0; i < steps; i++) {
    if (State.moveHistory.length === 0) break;
    const last = State.moveHistory.pop(); State.board[last.row][last.col] = "";
    if (last.element) { last.element.textContent = ""; last.element.className = "cell"; }
  }
  document.querySelectorAll(".win-cell").forEach(e => e.classList.remove("win-cell")); if (modalOverlay) modalOverlay.classList.remove("active");
  if (State.moveHistory.length > 0) { State.lastMoveElement = State.moveHistory[State.moveHistory.length - 1].element; if (State.lastMoveElement) State.lastMoveElement.classList.add("last-move"); } 
  else State.lastMoveElement = null;
  State.gameActive = true; State.currentPlayer = "X"; updateUIState();
};

/* =======================
   CHEAT (ẤN 4 LẦN HIỆN, 2 LẦN ẨN)
======================= */
let cheatClicks = 0; let cheatTimeout = null;
window.handleFooterClick = function () {
  clearTimeout(cheatTimeout); cheatClicks++; const cheatBtn = document.getElementById("cheatBtn");
  if (cheatClicks >= 4) { if (cheatBtn) cheatBtn.style.display = "block"; cheatClicks = 0; return; }
  cheatTimeout = setTimeout(() => { if (cheatClicks === 2) { if (cheatBtn) cheatBtn.style.display = "none"; } cheatClicks = 0; }, 500); 
};
window.handleCheatClick = window.handleFooterClick;

window.triggerCheat = function () {
  if (!State.gameActive || State.isAiThinking || State.isSpectator) return;
  const mode = modeSelect ? modeSelect.value : "pvp";
  if (mode === "online") {
    if (!State.currentRoomId || State.currentPlayer !== State.mySide) return;
    State.isAiThinking = true; updateUIState();
    setTimeout(() => {
      const move = calculateLocalAIMove("hard", State.mySide); const result = applyMoveLocally(move.r, move.c, State.mySide);
      if (result.ok) syncMoveToFirebase(move.r, move.c, State.mySide, result.winCells);
      State.isAiThinking = true; setTimeout(()=>{ State.isAiThinking = false; updateUIState(); }, 300);
    }, 50);
  } else {
    State.isAiThinking = true; updateUIState();
    setTimeout(() => { const move = calculateLocalAIMove("hard", State.currentPlayer); applyMoveLocally(move.r, move.c, State.currentPlayer); State.isAiThinking = false; updateUIState(); }, 50);
  }
};

/* =======================
   MODAL + FULLSCREEN
======================= */
window.closeModal = function () { AudioSys.play('click'); if(modalOverlay) modalOverlay.classList.remove("active"); };
window.enterFullScreen = function () { AudioSys.play('click'); const el = document.documentElement; if (el.requestFullscreen) el.requestFullscreen(); document.body.classList.add("fullscreen-mode"); };
window.exitFullScreen = function () { AudioSys.play('click'); if (document.exitFullscreen) document.exitFullscreen(); document.body.classList.remove("fullscreen-mode"); };

/* =======================
   START 
======================= */
document.addEventListener("DOMContentLoaded", () => {
   injectDynamicUI(); 
   buildBoardDOM();
   window.initGame();
   if (turnIndicator) { turnIndicator.addEventListener("click", window.handleCheatClick); turnIndicator.style.cursor = "pointer"; }
});
