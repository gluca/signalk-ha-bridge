const WebSocket = require('ws');
const EventEmitter = require('events');

const INITIAL_RECONNECT_MS = 2000;
const MAX_RECONNECT_MS = 60000;
const HANDSHAKE_TIMEOUT_MS = 15000;

class SignalKClient extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.ws = null;
    this.reconnectInterval = INITIAL_RECONNECT_MS;
    this.reconnectTimer = null;
    this.shouldReconnect = true;
  }

  /**
   * Connect to SignalK WebSocket stream
   */
  connect() {
    const host = this.config.signalk.host || 'localhost';
    const port = this.config.signalk.port || 3000;
    const wsUrl = `ws://${host}:${port}/signalk/v1/stream?subscribe=self`;

    console.log(`Connecting to SignalK WebSocket: ${wsUrl}`);

    // Clean up any existing socket before creating a new one
    this.cleanup();

    this.ws = new WebSocket(wsUrl, { handshakeTimeout: HANDSHAKE_TIMEOUT_MS });

    this.ws.on('open', () => {
      console.log('Connected to SignalK WebSocket');
      this.reconnectInterval = INITIAL_RECONNECT_MS; // Reset backoff on success
      this.emit('connected');
      this.subscribe('vessels.self.*');
    });

    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch (error) {
        console.error('Error parsing SignalK message:', error.message);
      }
    });

    this.ws.on('error', (error) => {
      console.error('SignalK WebSocket error:', error.message);
      this.emit('error', error);
      // Terminate the socket so 'close' fires and triggers reconnect
      if (this.ws) {
        this.ws.terminate();
      }
    });

    this.ws.on('close', () => {
      console.log('SignalK WebSocket connection closed');
      this.emit('disconnected');

      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    });
  }

  /**
   * Handle incoming SignalK message
   */
  handleMessage(message) {
    if (message.updates) {
      this.emit('delta', message);
    } else if (message.self) {
      this.emit('hello', message);
    }
  }

  /**
   * Subscribe to SignalK paths
   */
  subscribe(path) {
    const subscription = {
      context: '*',
      subscribe: [
        {
          path: path,
          period: 1000,
          format: 'delta',
          policy: 'instant',
          minPeriod: 200
        }
      ]
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(subscription));
      console.log(`Subscribed to SignalK path: ${path}`);
    }
  }

  /**
   * Send PUT request to SignalK (for bidirectional control)
   */
  async put(path, value) {
    const host = this.config.signalk.host || 'localhost';
    const port = this.config.signalk.port || 3000;
    const url = `http://${host}:${port}/signalk/v1/api/vessels/self/${path}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    });

    return response.json();
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delaySec = (this.reconnectInterval / 1000).toFixed(0);
    console.log(`Reconnecting to SignalK in ${delaySec}s...`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.reconnectInterval);

    // Exponential backoff: 2s → 4s → 8s → ... → 60s cap
    this.reconnectInterval = Math.min(this.reconnectInterval * 2, MAX_RECONNECT_MS);
  }

  /**
   * Clean up existing WebSocket without triggering reconnect
   */
  cleanup() {
    if (this.ws) {
      // Remove listeners to avoid triggering reconnect from cleanup
      this.ws.removeAllListeners();
      this.ws.terminate();
      this.ws = null;
    }
  }

  /**
   * Disconnect from SignalK
   */
  disconnect() {
    this.shouldReconnect = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.cleanup();
  }
}

module.exports = SignalKClient;
