export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
interface Options {
  url: () => string;
  token: () => string | null;
  verify: () => Promise<void>;
  create?: (url: string) => WebSocket;
  status: (status: ConnectionStatus) => void;
  event: (event: string) => void;
}
export function adminSocketUrl(api: string, origin: string) {
  const target = new URL(api || '/admin-api', origin);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.search || target.hash) throw new Error('后台接口地址无效');
  return `${target.protocol === 'https:' ? 'wss:' : 'ws:'}//${target.host}/ws/admin`;
}

/** 每个后台标签页共享一个实例；过期连接的回调不得改变新连接。 */
export class AdminSocket {
  private options: Options;
  private active = false;
  private generation = 0;
  private socket?: WebSocket;
  private retry?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private handshake?: ReturnType<typeof setTimeout>;
  private delay = 1000;
  constructor(options: Options) { this.options = options; }
  start() {
    if (this.active) return;
    this.active = true; this.delay = 1000;
    void this.connect(++this.generation);
  }
  stop() {
    this.active = false; ++this.generation;
    clearTimeout(this.retry); this.clearConnection();
    this.options.status('disconnected');
  }
  private clearConnection() {
    clearInterval(this.heartbeat); clearTimeout(this.handshake);
    const socket = this.socket; this.socket = undefined;
    if (socket) { socket.onclose = null; socket.onerror = null; socket.onmessage = null; socket.onopen = null; socket.close(); }
  }
  private schedule(generation: number) {
    if (!this.active || generation !== this.generation) return;
    this.clearConnection(); this.options.status('reconnecting');
    clearTimeout(this.retry);
    this.retry = setTimeout(() => { void this.connect(generation); }, this.delay + Math.random() * 300);
    this.delay = Math.min(this.delay * 2, 30000);
  }
  private async connect(generation: number) {
    if (!this.active || generation !== this.generation) return;
    this.options.status(this.delay === 1000 ? 'connecting' : 'reconnecting');
    try {
      // 复用HTTP拦截器刷新Token；不另建刷新令牌逻辑。
      await this.options.verify();
      if (!this.active || generation !== this.generation) return;
      const token = this.options.token();
      if (!token) { this.stop(); return; }
      const socket = (this.options.create || ((url) => new WebSocket(url)))(this.options.url());
      this.socket = socket;
      const current = () => this.active && generation === this.generation && this.socket === socket;
      let lastMessage = Date.now(); let ready = false;
      const startHeartbeat = (config?: { ping_seconds?: unknown; server_silence_seconds?: unknown }) => {
        const ping = config?.ping_seconds;
        const silence = config?.server_silence_seconds;
        const valid = typeof ping === 'number' && Number.isInteger(ping) && ping >= 5 && ping <= 300
          && typeof silence === 'number' && Number.isInteger(silence) && silence >= 15 && silence <= 900;
        const interval = valid ? ping * 1000 : 15000;
        const timeout = valid ? silence * 1000 : 35000;
        clearInterval(this.heartbeat);
        this.heartbeat = setInterval(() => {
          if (!current()) return;
          if (Date.now() - lastMessage > timeout) { this.schedule(generation); return; }
          if (ready && socket.readyState === 1) socket.send(JSON.stringify({ version: 1, type: 'ping' }));
        }, interval);
      };
      this.handshake = setTimeout(() => { if (current()) this.schedule(generation); }, 10000);
      socket.onopen = () => { if (current()) socket.send(JSON.stringify({ version: 1, type: 'authenticate', token })); };
      socket.onmessage = (message) => {
        if (!current()) return;
        try {
          const packet = JSON.parse(String(message.data));
          if (packet.version !== 1) return;
          lastMessage = Date.now();
          if (packet.type === 'ready') {
            ready = true; clearTimeout(this.handshake); this.delay = 1000;
            startHeartbeat(packet.config);
            this.options.status('connected'); this.options.event('ready');
          } else if (ready && packet.type === 'event' && typeof packet.event === 'string') this.options.event(packet.event);
        } catch { this.schedule(generation); }
      };
      socket.onclose = () => { if (current()) this.schedule(generation); };
      socket.onerror = () => { if (current()) this.schedule(generation); };
    } catch { this.schedule(generation); }
  }
}
