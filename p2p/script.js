const sendBtn = document.getElementById("sendBtn");
const receiveBtn = document.getElementById("receiveBtn");
const sendSection = document.getElementById("sendSection");
const receiveSection = document.getElementById("receiveSection");
const fileInput = document.getElementById("fileInput");
const generatedCode = document.getElementById("generatedCode");
const sendStatus = document.getElementById("sendStatus");
const receiveStatus = document.getElementById("receiveStatus");
const codeInput = document.getElementById("codeInput");
const connectBtn = document.getElementById("connectBtn");
const downloadLink = document.getElementById("downloadLink");
const logArea = document.createElement('div');
logArea.id = 'logArea';
logArea.className = 'bg-gray-800 text-xs p-2 rounded h-32 overflow-y-auto my-2';
document.querySelector('.text-center').appendChild(logArea);

let peerConnection;
let dataChannel;
let signalingSocket;
let incomingFileMeta = null;
let outgoingFiles = [];
let incomingFilesMeta = [];
let receivedFiles = [];

const SIGNALING_URL = "wss://p2p-dropcode.onrender.com"; // Replace with your deployed signaling URL

function generateCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

function uiLog(...args) {
  const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ');
  logArea.innerHTML += msg + '<br>';
  logArea.scrollTop = logArea.scrollHeight;
}

sendBtn.onclick = () => {
  sendSection.classList.remove("hidden");
  receiveSection.classList.add("hidden");
};

receiveBtn.onclick = () => {
  receiveSection.classList.remove("hidden");
  sendSection.classList.add("hidden");
};

function setupDataChannel() {
  dataChannel.onopen = () => {
    uiLog("✅ DataChannel open");
    if (outgoingFiles.length > 0) {
      // Send all file metadata first
      dataChannel.send(JSON.stringify({
        meta: true,
        files: outgoingFiles.map(f => ({
          filename: f.name,
          type: f.type,
          size: f.size
        }))
      }));
      // Send files one by one
      let idx = 0;
      function sendNext() {
        if (idx < outgoingFiles.length) {
          const file = outgoingFiles[idx];
          uiLog("📦 Sending file:", file.name, file.size, "bytes");
          const reader = new FileReader();
          reader.onload = function(e) {
            dataChannel.send(e.target.result);
            sendStatus.innerText = `Sent: ${file.name}`;
            idx++;
            setTimeout(sendNext, 100);
          };
          reader.readAsArrayBuffer(file);
        } else {
          sendStatus.innerText = "All files sent!";
        }
      }
      setTimeout(sendNext, 100);
    } else {
      uiLog("⚠️ No file selected.");
      sendStatus.innerText = "No file selected.";
    }
  };

  let fileReceiveIdx = 0;
  let fileBuffers = [];
  let expectedFiles = 0;

  dataChannel.onmessage = (event) => {
    if (typeof event.data === "string") {
      try {
        const msg = JSON.parse(event.data);
        if (msg.meta && msg.files) {
          uiLog("📦 File metadata received:", msg.files);
          incomingFilesMeta = msg.files;
          expectedFiles = msg.files.length;
          receivedFiles = [];
          fileReceiveIdx = 0;
          fileBuffers = [];
          // Show file list for download (empty until received)
          let listHtml = msg.files.map((f, i) => `<div id='fileStatus${i}'>${f.filename} <span class='text-gray-400'>(${(f.size/1024).toFixed(2)} KB)</span> <span class='text-yellow-400'>(waiting...)</span></div>`).join('');
          document.getElementById('downloadList').innerHTML = listHtml;
          return;
        }
      } catch (e) {}
    }
    // Receiving file data
    if (incomingFilesMeta.length > 0 && fileReceiveIdx < incomingFilesMeta.length) {
      const meta = incomingFilesMeta[fileReceiveIdx];
      fileBuffers.push(event.data);
      // Assume one file per message for simplicity
      const blob = new Blob([event.data], { type: meta.type || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      receivedFiles.push({ url, meta });
      // Update download list
      const linkHtml = `<a href='${url}' download='${meta.filename}' class='bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-4 rounded inline-block mt-2'>Download</a>`;
      document.getElementById('fileStatus'+fileReceiveIdx).innerHTML = `${meta.filename} <span class='text-gray-400'>(${(meta.size/1024).toFixed(2)} KB)</span> ${linkHtml}`;
      receiveStatus.innerText = `Received: ${meta.filename}`;
      fileReceiveIdx++;
      if (fileReceiveIdx === incomingFilesMeta.length) {
        receiveStatus.innerText = `All files received!`;
      }
    }
  };
}

function createConnection(room, isHost, files) {
  uiLog("🔌 Connecting as", isHost ? "Sender" : "Receiver", "to room:", room);
  signalingSocket = new WebSocket(SIGNALING_URL);

  signalingSocket.onopen = () => {
    uiLog("✅ WebSocket connected to", SIGNALING_URL);
    signalingSocket.send(JSON.stringify({ type: "join", room }));

    peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    peerConnection.onconnectionstatechange = () => {
      uiLog("🔁 WebRTC connection state:", peerConnection.connectionState);
    };

    if (isHost) {
      dataChannel = peerConnection.createDataChannel("file");
      outgoingFiles = files || [];
      setupDataChannel();
    } else {
      peerConnection.ondatachannel = (event) => {
        uiLog("📡 DataChannel received on receiver");
        dataChannel = event.channel;
        setupDataChannel();
      };
    }

    peerConnection.onicecandidate = (e) => {
      if (e.candidate) {
        uiLog("❄️ ICE candidate sent");
        signalingSocket.send(JSON.stringify({ type: "candidate", room, data: e.candidate }));
      }
    };

    if (isHost) {
      peerConnection.createOffer()
        .then((offer) => {
          uiLog("📤 Sending offer");
          return peerConnection.setLocalDescription(offer);
        })
        .then(() => signalingSocket.send(JSON.stringify({
          type: "offer",
          room,
          data: peerConnection.localDescription
        })));
    }

    signalingSocket.onmessage = async (message) => {
      const { type, data } = JSON.parse(message.data);
      uiLog("📨 Received signaling message:", type);

      if (type === "offer" && !isHost) {
        uiLog("📥 Offer received, sending answer...");
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        signalingSocket.send(JSON.stringify({ type: "answer", room, data: answer }));
      } else if (type === "answer" && isHost) {
        uiLog("📥 Answer received");
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data));
      } else if (type === "candidate") {
        uiLog("❄️ ICE candidate received");
        await peerConnection.addIceCandidate(new RTCIceCandidate(data));
      }
    };
  };

  signalingSocket.onerror = (e) => {
    uiLog("❌ WebSocket error:", e);
    receiveStatus.innerText = "Error connecting to signaling server.";
  };

  signalingSocket.onclose = () => {
    uiLog("⚠️ WebSocket connection closed");
  };
}

fileInput.onchange = () => {
  const files = Array.from(fileInput.files);
  let fileListHtml = '';
  files.forEach(f => {
    fileListHtml += `<div>${f.name} <span class='text-gray-400'>(${(f.size/1024).toFixed(2)} KB)</span></div>`;
  });
  document.getElementById('fileList').innerHTML = fileListHtml;
  // Generate QR code for sharing
  const room = generateCode();
  generatedCode.innerText = "Share this code: " + room;
  sendStatus.innerText = "Waiting for receiver to join...";
  // Show QR code for mobile join
  const qrUrl = `${location.origin}${location.pathname}?code=${room}`;
  document.getElementById('qrCode').innerHTML = '';
  new QRCode(document.getElementById('qrCode'), {
    text: qrUrl,
    width: 180,
    height: 180,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });
  document.getElementById('qrHint').innerText = 'Scan to join and download files on your phone.';
  createConnection(room, true, files);
};

connectBtn.onclick = () => {
  const room = codeInput.value.trim().toUpperCase();
  if (!room || room.length !== 6) {
    receiveStatus.innerText = "Enter a valid 6-character code.";
    return;
  }
  receiveStatus.innerText = "Connecting to sender...";
  document.getElementById('downloadList').innerHTML = '';
  createConnection(room, false);
};
