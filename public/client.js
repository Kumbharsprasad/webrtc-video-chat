const socket = io();

// UI Elements
const lobbyScreen = document.getElementById('lobby');
const callScreen = document.getElementById('call-room');
const roomInput = document.getElementById('roomInput');
const joinBtn = document.getElementById('joinBtn');

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

const muteBtn = document.getElementById('muteBtn');
const cameraBtn = document.getElementById('cameraBtn');
const hangupBtn = document.getElementById('hangupBtn');

const statusText = document.getElementById('statusText');
const statusDot = document.getElementById('statusDot');

// SVG Icons
const micOnPath = '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line>';
const micOffPath = '<line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line>';

const videoOnPath = '<polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>';
const videoOffPath = '<path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"></path><line x1="1" y1="1" x2="23" y2="23"></line>';

// WebRTC State
let localStream;
let peerConnection;
let roomName;
let isInitiator = false;

// STUN servers
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Event Listeners for UI
joinBtn.addEventListener('click', joinRoom);
roomInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinRoom();
});

muteBtn.addEventListener('click', toggleMute);
cameraBtn.addEventListener('click', toggleVideo);
hangupBtn.addEventListener('click', hangup);

async function joinRoom() {
    roomName = roomInput.value.trim();
    if (roomName === '') return;

    lobbyScreen.style.display = 'none';
    callScreen.style.display = 'block';
    
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        
        socket.emit('join', roomName);
    } catch (err) {
        console.error('Error accessing media devices.', err);
        alert('Could not access camera/microphone');
        // Revert UI
        lobbyScreen.style.display = 'flex';
        callScreen.style.display = 'none';
    }
}

// Socket signaling events
socket.on('created', (room) => {
    isInitiator = true;
});

socket.on('joined', (room) => {
    isInitiator = false;
});

socket.on('full', (room) => {
    alert(`Room ${room} is full!`);
    lobbyScreen.style.display = 'flex';
    callScreen.style.display = 'none';
    if(localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
});

socket.on('ready', () => {
    statusText.innerText = 'Connected securely';
    statusDot.classList.remove('waiting');
    
    if (isInitiator) {
        createPeerConnection();
        createOffer();
    }
});

socket.on('offer', async (offer) => {
    statusText.innerText = 'Connected securely';
    statusDot.classList.remove('waiting');

    if (!isInitiator && !peerConnection) {
        createPeerConnection();
    }
    
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', roomName, answer);
    } catch (error) {
        console.error('Error handling offer:', error);
    }
});

socket.on('answer', async (answer) => {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
        console.error('Error handling answer:', error);
    }
});

socket.on('candidate', async (candidate) => {
    try {
        if (peerConnection) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    } catch (error) {
        console.error('Error adding received ice candidate', error);
    }
});

socket.on('peer-left', () => {
    statusText.innerText = 'Peer left. Waiting...';
    statusDot.classList.add('waiting');
    remoteVideo.srcObject = null;
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    // Set up as initiator for the next person
    isInitiator = true;
});

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfig);

    // Add local tracks to the connection
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // Handle incoming ice candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('candidate', roomName, event.candidate);
        }
    };

    // Handle remote tracks
    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };
}

async function createOffer() {
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', roomName, offer);
    } catch (error) {
        console.error('Error creating offer.', error);
    }
}

// Media Controls
function toggleMute() {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        if (audioTrack.enabled) {
            muteBtn.classList.remove('active');
            muteBtn.querySelector('svg').innerHTML = micOnPath;
        } else {
            muteBtn.classList.add('active');
            muteBtn.querySelector('svg').innerHTML = micOffPath;
        }
    }
}

function toggleVideo() {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        if (videoTrack.enabled) {
            cameraBtn.classList.remove('active');
            cameraBtn.querySelector('svg').innerHTML = videoOnPath;
            localVideo.style.opacity = '1';
        } else {
            cameraBtn.classList.add('active');
            cameraBtn.querySelector('svg').innerHTML = videoOffPath;
            // Optionally dim local video when off
            localVideo.style.opacity = '0.3';
        }
    }
}

function hangup() {
    socket.emit('leave', roomName);
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }

    // Reset UI
    remoteVideo.srcObject = null;
    localVideo.srcObject = null;
    lobbyScreen.style.display = 'flex';
    callScreen.style.display = 'none';
    roomInput.value = '';
    
    // Reset status
    statusText.innerText = 'Waiting for peer...';
    statusDot.classList.add('waiting');
    
    // Reset controls
    muteBtn.classList.remove('active');
    muteBtn.querySelector('svg').innerHTML = micOnPath;
    cameraBtn.classList.remove('active');
    cameraBtn.querySelector('svg').innerHTML = videoOnPath;
    localVideo.style.opacity = '1';
}

window.addEventListener('beforeunload', () => {
    if (roomName) {
        socket.emit('leave', roomName);
    }
});
