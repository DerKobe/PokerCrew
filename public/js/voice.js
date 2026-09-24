// Voice- und Videochat: WebRTC-Mesh, Signaling über Socket.IO.
// Wer neu beitritt, baut zu allen bestehenden Teilnehmern die Verbindung auf (kein Glare).
// Jede Verbindung hat von Anfang an einen Audio- und einen Video-Kanal; Mikro und Kamera
// werden danach nur per replaceTrack ein-/ausgeschaltet (keine Neuverhandlung nötig).

const VIDEO_CONSTRAINTS = {
  width: { ideal: 320 },
  height: { ideal: 240 },
  frameRate: { ideal: 15, max: 20 },
  facingMode: 'user',
};
const VIDEO_MAX_BITRATE = 250_000;

export class Voice {
  constructor(socket, audioCtx) {
    this.socket = socket;
    this.ctx = audioCtx;
    this.iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
    this.peers = new Map(); // id -> { pc, audio, video, analyser, pendingCandidates }
    this.localStream = null;
    this.localTrack = null;
    this.localAnalyser = null;
    this.videoTrack = null;
    this.localVideo = null;
    this.muted = localStorage.getItem('pc.muted') === '1';
    this.deafened = false;
    this.joined = false;
    this.micError = null;
    this.camError = null;
    this.levels = new Map(); // id|'self' -> 0..1
    this.onChange = () => {};
    this.mediaRoot = document.createElement('div');
    this.mediaRoot.style.display = 'none';
    document.body.appendChild(this.mediaRoot);

    socket.on('voice-peers', ({ peers }) => peers.forEach((id) => this.#connectTo(id)));
    socket.on('voice-signal', (msg) => this.#onSignal(msg));
    socket.on('voice-left', ({ id }) => this.#closePeer(id));
    socket.on('connect', () => {
      // Nach einem Reconnect: neu verbinden (neue Socket-ID)
      if (this.joined) {
        for (const id of [...this.peers.keys()]) this.#closePeer(id);
        this.socket.emit('voice-join', this.#status());
      }
    });
    this.#meterLoop();
  }

  setIceServers(list) {
    if (Array.isArray(list) && list.length) this.iceServers = list;
  }

  #status() {
    return { muted: this.muted || !this.localTrack, video: !!this.videoTrack };
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
    // Kamera wieder einschalten, wenn sie beim letzten Mal an war
    if (localStorage.getItem('pc.video') === '1') await this.#startCamera();
    this.joined = true;
    // Ist der Socket noch nicht verbunden, übernimmt der 'connect'-Handler den Beitritt
    if (this.socket.connected) this.socket.emit('voice-join', this.#status());
    this.onChange();
  }

  get hasMic() {
    return !!this.localTrack;
  }

  get videoOn() {
    return !!this.videoTrack;
  }

  setMuted(m) {
    this.muted = m;
    localStorage.setItem('pc.muted', m ? '1' : '0');
    if (this.localTrack) this.localTrack.enabled = !m;
    this.socket.emit('voice-mute', this.#status());
    this.onChange();
  }

  setDeafened(d) {
    this.deafened = d;
    for (const p of this.peers.values()) if (p.audio) p.audio.muted = d;
    this.onChange();
  }

  async setVideo(on) {
    if (on) await this.#startCamera();
    else this.#stopCamera();
    localStorage.setItem('pc.video', this.videoTrack ? '1' : '0');
    this.socket.emit('voice-mute', this.#status());
    this.onChange();
  }

  async #startCamera() {
    if (this.videoTrack) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO_CONSTRAINTS, audio: false });
      this.videoTrack = stream.getVideoTracks()[0];
      this.camError = null;
      // Kamera wird extern beendet (z. B. Berechtigung entzogen)
      this.videoTrack.addEventListener('ended', () => this.setVideo(false));
      this.localVideo = this.#videoElement(this.localVideo);
      this.localVideo.srcObject = new MediaStream([this.videoTrack]);
      this.localVideo.play().catch(() => {});
      for (const p of this.peers.values()) this.#sendVideo(p.pc);
    } catch (err) {
      console.warn('Keine Kamera:', err);
      this.videoTrack = null;
      this.camError = err?.name === 'NotAllowedError' ? 'Kamera-Zugriff verweigert' : 'Keine Kamera gefunden';
    }
  }

  #stopCamera() {
    if (!this.videoTrack) return;
    this.videoTrack.stop();
    this.videoTrack = null;
    if (this.localVideo) this.localVideo.srcObject = null;
    for (const p of this.peers.values()) this.#videoTransceiver(p.pc)?.sender.replaceTrack(null).catch(() => {});
  }

  #videoTransceiver(pc) {
    return pc.getTransceivers().find((t) => t.receiver.track?.kind === 'video');
  }

  async #sendVideo(pc) {
    const tr = this.#videoTransceiver(pc);
    if (!tr) return;
    try {
      await tr.sender.replaceTrack(this.videoTrack);
      if (!this.videoTrack) return;
      const params = tr.sender.getParameters();
      if (params.encodings?.length) {
        params.encodings[0].maxBitrate = VIDEO_MAX_BITRATE;
        await tr.sender.setParameters(params);
      }
    } catch (err) {
      console.warn('Video senden fehlgeschlagen', err);
    }
  }

  #videoElement(existing) {
    if (existing) return existing;
    const v = document.createElement('video');
    v.autoplay = true;
    v.playsInline = true;
    v.muted = true; // Ton läuft separat über das Audio-Element
    this.mediaRoot.appendChild(v);
    return v;
  }

  /** Video-Element eines Teilnehmers ('self' = eigene Kamera) oder null */
  videoFor(id) {
    if (id === 'self') return this.videoTrack ? this.localVideo : null;
    return this.peers.get(id)?.video || null;
  }

  #createPeer(id) {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const peer = { pc, audio: null, video: null, analyser: null, pendingCandidates: [] };
    this.peers.set(id, peer);
    pc.onicecandidate = (e) => {
      if (e.candidate) this.socket.emit('voice-signal', { to: id, candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      const stream = new MediaStream([e.track]);
      if (e.track.kind === 'video') {
        peer.video = this.#videoElement(peer.video);
        peer.video.srcObject = stream;
        peer.video.play().catch(() => {});
        this.onChange();
        return;
      }
      if (!peer.audio) {
        peer.audio = document.createElement('audio');
        peer.audio.autoplay = true;
        peer.audio.playsInline = true;
        this.mediaRoot.appendChild(peer.audio);
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
    const audio = peer.pc.addTransceiver('audio', { direction: 'sendrecv' });
    peer.pc.addTransceiver('video', { direction: 'sendrecv' });
    if (this.localTrack) await audio.sender.replaceTrack(this.localTrack);
    await this.#sendOffer(id, peer);
    if (this.videoTrack) await this.#sendVideo(peer.pc);
  }

  async #onSignal({ from, description, candidate }) {
    let peer = this.peers.get(from);
    try {
      if (description) {
        if (description.type === 'offer') {
          if (!peer) peer = this.#createPeer(from);
          await peer.pc.setRemoteDescription(description);
          for (const tr of peer.pc.getTransceivers()) {
            const kind = tr.receiver.track?.kind;
            tr.direction = 'sendrecv';
            if (kind === 'audio' && this.localTrack) await tr.sender.replaceTrack(this.localTrack);
          }
          await peer.pc.setLocalDescription(await peer.pc.createAnswer());
          this.socket.emit('voice-signal', { to: from, description: peer.pc.localDescription });
          if (this.videoTrack) await this.#sendVideo(peer.pc);
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
    for (const el of [p.audio, p.video]) {
      if (!el) continue;
      el.srcObject = null;
      el.remove();
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
