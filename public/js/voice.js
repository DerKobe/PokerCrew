// Voicechat: WebRTC-Mesh, Signaling über Socket.IO.
// Wer neu beitritt, baut zu allen bestehenden Teilnehmern die Verbindung auf (kein Glare).
export class Voice {
  constructor(socket, audioCtx) {
    this.socket = socket;
    this.ctx = audioCtx;
    this.iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
    this.peers = new Map(); // id -> { pc, audio, analyser, pendingCandidates, level }
    this.localStream = null;
    this.localTrack = null;
    this.localAnalyser = null;
    this.muted = localStorage.getItem('pc.muted') === '1';
    this.deafened = false;
    this.joined = false;
    this.micError = null;
    this.levels = new Map(); // id|'self' -> 0..1
    this.onChange = () => {};
    this.audioRoot = document.createElement('div');
    this.audioRoot.style.display = 'none';
    document.body.appendChild(this.audioRoot);

    socket.on('voice-peers', ({ peers }) => peers.forEach((id) => this.#connectTo(id)));
    socket.on('voice-signal', (msg) => this.#onSignal(msg));
    socket.on('voice-left', ({ id }) => this.#closePeer(id));
    socket.on('connect', () => {
      // Nach einem Reconnect: neu verbinden (neue Socket-ID)
      if (this.joined) {
        for (const id of [...this.peers.keys()]) this.#closePeer(id);
        this.socket.emit('voice-join', { muted: this.muted || !this.localTrack });
      }
    });
    this.#meterLoop();
  }

  setIceServers(list) {
    if (Array.isArray(list) && list.length) this.iceServers = list;
  }

  async start() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      this.localTrack = this.localStream.getAudioTracks()[0];
      this.localTrack.enabled = !this.muted;
      if (this.ctx) {
        const src = this.ctx.createMediaStreamSource(this.localStream);
        this.localAnalyser = this.ctx.createAnalyser();
        this.localAnalyser.fftSize = 512;
        src.connect(this.localAnalyser);
      }
    } catch (err) {
      console.warn('Kein Mikrofon:', err);
      this.micError = !window.isSecureContext
        ? 'Mikrofon braucht HTTPS'
        : err?.name === 'NotAllowedError'
          ? 'Mikrofon-Zugriff verweigert'
          : 'Kein Mikrofon gefunden';
    }
    this.joined = true;
    // Ist der Socket noch nicht verbunden, übernimmt der 'connect'-Handler den Beitritt
    if (this.socket.connected) this.socket.emit('voice-join', { muted: this.muted || !this.localTrack });
    this.onChange();
  }

  get hasMic() {
    return !!this.localTrack;
  }

  setMuted(m) {
    this.muted = m;
    localStorage.setItem('pc.muted', m ? '1' : '0');
    if (this.localTrack) this.localTrack.enabled = !m;
    this.socket.emit('voice-mute', { muted: m || !this.localTrack });
    this.onChange();
  }

  setDeafened(d) {
    this.deafened = d;
    for (const p of this.peers.values()) if (p.audio) p.audio.muted = d;
    this.onChange();
  }

  #createPeer(id) {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const peer = { pc, audio: null, analyser: null, pendingCandidates: [], level: 0 };
    this.peers.set(id, peer);
    pc.onicecandidate = (e) => {
      if (e.candidate) this.socket.emit('voice-signal', { to: id, candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      const stream = e.streams[0] || new MediaStream([e.track]);
      if (!peer.audio) {
        peer.audio = document.createElement('audio');
        peer.audio.autoplay = true;
        peer.audio.playsInline = true;
        this.audioRoot.appendChild(peer.audio);
      }
      peer.audio.srcObject = stream;
      peer.audio.muted = this.deafened;
      peer.audio.play().catch(() => {});
      if (this.ctx) {
        try {
          const src = this.ctx.createMediaStreamSource(stream);
          peer.analyser = this.ctx.createAnalyser();
          peer.analyser.fftSize = 512;
          src.connect(peer.analyser);
        } catch {}
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' && peer.initiator) {
        pc.restartIce();
        this.#sendOffer(id, peer, true);
      }
      this.onChange();
    };
    return peer;
  }

  async #sendOffer(id, peer, iceRestart = false) {
    const offer = await peer.pc.createOffer({ iceRestart });
    await peer.pc.setLocalDescription(offer);
    this.socket.emit('voice-signal', { to: id, description: peer.pc.localDescription });
  }

  async #connectTo(id) {
    if (this.peers.has(id)) this.#closePeer(id);
    const peer = this.#createPeer(id);
    peer.initiator = true;
    const tr = peer.pc.addTransceiver('audio', { direction: 'sendrecv' });
    if (this.localTrack) await tr.sender.replaceTrack(this.localTrack);
    await this.#sendOffer(id, peer);
  }

  async #onSignal({ from, description, candidate }) {
    let peer = this.peers.get(from);
    try {
      if (description) {
        if (description.type === 'offer') {
          if (!peer) peer = this.#createPeer(from);
          await peer.pc.setRemoteDescription(description);
          for (const tr of peer.pc.getTransceivers()) {
            if (tr.receiver.track?.kind === 'audio') {
              tr.direction = 'sendrecv';
              if (this.localTrack) await tr.sender.replaceTrack(this.localTrack);
            }
          }
          await peer.pc.setLocalDescription(await peer.pc.createAnswer());
          this.socket.emit('voice-signal', { to: from, description: peer.pc.localDescription });
        } else if (peer) {
          await peer.pc.setRemoteDescription(description);
        }
        if (peer) {
          for (const c of peer.pendingCandidates) await peer.pc.addIceCandidate(c).catch(() => {});
          peer.pendingCandidates = [];
        }
      } else if (candidate && peer) {
        if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(candidate).catch(() => {});
        else peer.pendingCandidates.push(candidate);
      } else if (candidate) {
        // Kandidat kam vor dem Offer an
        peer = this.#createPeer(from);
        peer.pendingCandidates.push(candidate);
      }
    } catch (err) {
      console.warn('Voice-Signal-Fehler', err);
    }
  }

  #closePeer(id) {
    const p = this.peers.get(id);
    if (!p) return;
    try {
      p.pc.close();
    } catch {}
    if (p.audio) {
      p.audio.srcObject = null;
      p.audio.remove();
    }
    this.peers.delete(id);
    this.levels.delete(id);
    this.onChange();
  }

  peerState(id) {
    return this.peers.get(id)?.pc.connectionState || 'new';
  }

  #meterLoop() {
    const buf = new Uint8Array(512);
    const measure = (an) => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      return Math.min(1, Math.sqrt(sum / buf.length) * 6);
    };
    setInterval(() => {
      if (this.localAnalyser) this.levels.set('self', this.muted ? 0 : measure(this.localAnalyser));
      for (const [id, p] of this.peers) if (p.analyser) this.levels.set(id, measure(p.analyser));
    }, 90);
  }
}
