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
      // Send files one by one, chunked
      let idx = 0;
      const CHUNK_SIZE = 16 * 1024; // 16KB
      function sendFileChunked(file, fileIdx, cb) {
        let offset = 0;
        function sendChunk() {
          const slice = file.slice(offset, offset + CHUNK_SIZE);
          const reader = new FileReader();
          reader.onload = function(e) {
            dataChannel.send(e.target.result);
            offset += CHUNK_SIZE;
            sendStatus.innerText = `Sending: ${file.name} (${((offset/file.size)*100).toFixed(1)}%)`;
            // Update progress bar
            const percent = Math.min(100, (offset/file.size)*100);
            const bar = document.getElementById('sendProgress'+fileIdx);
            if (bar) bar.style.width = percent + '%';
            if (offset < file.size) {
              setTimeout(sendChunk, 0);
            } else {
              sendStatus.innerText = `Sent: ${file.name}`;
              if (bar) bar.style.width = '100%';
              cb();
            }
          };
          reader.readAsArrayBuffer(slice);
        }
        sendChunk();
      }
      function sendNext() {
        if (idx < outgoingFiles.length) {
          const file = outgoingFiles[idx];
          uiLog("📦 Sending file:", file.name, file.size, "bytes");
          // Send a marker to indicate start of file
          dataChannel.send(JSON.stringify({chunkStart: true, fileIdx: idx}));
          sendFileChunked(file, idx, () => {
            // Send a marker to indicate end of file
            dataChannel.send(JSON.stringify({chunkEnd: true, fileIdx: idx}));
            idx++;
            setTimeout(sendNext, 100);
          });
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
  let receivingChunks = [];

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
          receivingChunks = [];
          // Show file list for download (empty until received)
          let listHtml = msg.files.map((f, i) => `<div id='fileStatus${i}'>${f.filename} <span class='text-gray-400'>(${(f.size/1024).toFixed(2)} KB)</span> <span class='text-yellow-400'>(waiting...)</span></div>`).join('');
          document.getElementById('downloadList').innerHTML = listHtml;
          // Add progress bars for receive
          let progressHtml = msg.files.map((f, i) => `<div class='w-full bg-gray-700 rounded h-2.5 mb-2'><div id='receiveProgress${i}' class='bg-blue-500 h-2.5 rounded' style='width:0%'></div></div>`).join('');
          document.getElementById('receiveProgressList').innerHTML = progressHtml;
          return;
        }
        if (msg.chunkStart) {
          receivingChunks[msg.fileIdx] = [];
          return;
        }
        if (msg.chunkEnd) {
          // Reassemble file
          const meta = incomingFilesMeta[msg.fileIdx];
          const blob = new Blob(receivingChunks[msg.fileIdx], { type: meta.type || "application/octet-stream" });
          const url = URL.createObjectURL(blob);
          receivedFiles.push({ url, meta });
          // Update download list
          const linkHtml = `<a href='${url}' download='${meta.filename}' class='bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-4 rounded inline-block mt-2'>Download</a>`;
          document.getElementById('fileStatus'+msg.fileIdx).innerHTML = `${meta.filename} <span class='text-gray-400'>(${(meta.size/1024).toFixed(2)} KB)</span> ${linkHtml}`;
          receiveStatus.innerText = `Received: ${meta.filename}`;
          // Set progress bar to 100%
          const bar = document.getElementById('receiveProgress'+msg.fileIdx);
          if (bar) bar.style.width = '100%';
          if (receivedFiles.length === incomingFilesMeta.length) {
            receiveStatus.innerText = `All files received!`;
          }
          return;
        }
      } catch (e) {}
    }
    // Receiving file data (chunk)
    if (incomingFilesMeta.length > 0) {
      // Find which file is being received (assume sequential)
      let idx = fileReceiveIdx;
      if (!receivingChunks[idx]) receivingChunks[idx] = [];
      receivingChunks[idx].push(event.data);
      // Optionally, show progress
      const meta = incomingFilesMeta[idx];
      let receivedSize = receivingChunks[idx].reduce((acc, arr) => acc + (arr.byteLength || arr.size || 0), 0);
      // Update progress bar
      const percent = Math.min(100, (receivedSize/meta.size)*100);
      const bar = document.getElementById('receiveProgress'+idx);
      if (bar) bar.style.width = percent + '%';
      document.getElementById('fileStatus'+idx).innerHTML = `${meta.filename} <span class='text-gray-400'>(${(meta.size/1024).toFixed(2)} KB)</span> <span class='text-green-400'>(${percent.toFixed(1)}%)</span>`;
      // If chunkEnd is received, fileReceiveIdx will be incremented
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
  let progressHtml = '';
  files.forEach((f, i) => {
    fileListHtml += `<div>${f.name} <span class='text-gray-400'>(${(f.size/1024).toFixed(2)} KB)</span></div>`;
    progressHtml += `<div class='w-full bg-gray-700 rounded h-2.5 mb-2'><div id='sendProgress${i}' class='bg-green-500 h-2.5 rounded' style='width:0%'></div></div>`;
  });
  document.getElementById('fileList').innerHTML = fileListHtml;
  document.getElementById('sendProgressList').innerHTML = progressHtml;
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
