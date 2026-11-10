// -----------------------------------------------------------------------------
// Connection to the Eco Aterno box (a Delta Dore Tydom gateway), over the
// local network or through the cloud relay — the same protocol either way,
// see protocol.js.
//
// One instance is one connection attempt: connect() once, then request() as
// needed; when the socket closes the instance is done ('close' event) and the
// bridge creates a new one (src/bridge.js owns the retry policy).
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { constants as cryptoConstants } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import WebSocket from 'ws';
import { buildDigestHeader, parseDigestChallenge } from './digest.js';
import { buildRequest, parseMessage } from './protocol.js';

export const TRANSPORT = { LOCAL: 'local', CLOUD: 'cloud' };

// The box rejected the MAC address / password pair. Retrying cannot help, and
// hammering the cloud relay with a wrong password is not something to do.
export class TydomAuthError extends Error {
  constructor(message = 'The box refused the MAC address or the password') {
    super(message);
    this.name = 'TydomAuthError';
    this.code = 'AUTH';
  }
}

// The box only serves a self-signed certificate on the local network, and its
// TLS stack predates the current defaults: certificate checks are relaxed for
// the LOCAL channel only (see SECURITY.md). The cloud relay is verified like
// any other HTTPS host.
const LOCAL_TLS_OPTIONS = {
  rejectUnauthorized: false,
  minVersion: 'TLSv1',
  ciphers: 'DEFAULT:@SECLEVEL=0',
  secureOptions: cryptoConstants.SSL_OP_LEGACY_SERVER_CONNECT,
};

const DEFAULTS = {
  port: 443,
  secure: true,
  connectTimeout: 10_000,
  requestTimeout: 10_000,
  keepAliveInterval: 30_000,
};

export class TydomClient extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} options.host IP address / hostname of the box, or of the cloud relay
   * @param {string} options.mac MAC address of the box, 12 hexadecimal digits
   * @param {string} options.password password chosen in the Eco Aterno app
   * @param {'local' | 'cloud'} options.transport
   * @param {number} [options.port]
   * @param {boolean} [options.secure] false = plain HTTP/WS, for the tests only
   * @param {object} [options.logger]
   */
  constructor(options) {
    super();
    this.options = { ...DEFAULTS, ...options };
    this.transport = this.options.transport;
    this.remote = this.transport === TRANSPORT.CLOUD;
    this.logger = this.options.logger;
    this.socket = null;
    this.pending = new Map();
    this.transactionCounter = 0;
    this.keepAliveTimer = null;
    this.closed = false;
  }

  get path() {
    return `/mediation/client?mac=${this.options.mac}&appli=1`;
  }

  get tlsOptions() {
    return this.options.secure && !this.remote ? LOCAL_TLS_OPTIONS : {};
  }

  /** Authenticate and open the WebSocket. Rejects with TydomAuthError on a 401. */
  async connect() {
    const { host, port, mac, password, secure, connectTimeout } = this.options;
    const challenge = await this.fetchChallenge();
    const headers = {};
    if (challenge) {
      headers.Authorization = buildDigestHeader({
        username: mac,
        password,
        method: 'GET',
        uri: this.path,
        challenge,
      });
    }

    const url = `${secure ? 'wss' : 'ws'}://${host}:${port}${this.path}`;
    await new Promise((resolve, reject) => {
      const socket = new WebSocket(url, {
        headers,
        handshakeTimeout: connectTimeout,
        ...this.tlsOptions,
      });
      let settled = false;
      const fail = (err) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      };
      socket.on('open', () => {
        settled = true;
        this.socket = socket;
        this.startKeepAlive();
        resolve();
      });
      socket.on('unexpected-response', (_request, response) => {
        response.resume();
        socket.terminate();
        fail(
          response.statusCode === 401 || response.statusCode === 403
            ? new TydomAuthError()
            : new Error(`The box answered HTTP ${response.statusCode} to the connection`),
        );
      });
      socket.on('error', (err) => {
        // After the opening, an error is followed by 'close': handled there.
        fail(err);
      });
      socket.on('message', (data) => this.handleFrame(data));
      socket.on('close', () => {
        fail(new Error('The connection closed before it opened'));
        this.handleClose();
      });
    });
  }

  // First leg of the Digest authentication: a plain GET on the WebSocket path,
  // answered by a 401 carrying the challenge. A box that answers without one
  // does not ask for credentials: connect without.
  fetchChallenge() {
    const { host, port, secure, connectTimeout } = this.options;
    const transport = secure ? https : http;
    return new Promise((resolve, reject) => {
      const request = transport.request(
        {
          host,
          port,
          path: this.path,
          method: 'GET',
          agent: false,
          timeout: connectTimeout,
          headers: { Accept: '*/*', Connection: 'close' },
          ...this.tlsOptions,
        },
        (response) => {
          response.resume();
          resolve(parseDigestChallenge(response.headers['www-authenticate']));
        },
      );
      request.on('timeout', () => request.destroy(new Error(`No answer from ${host}`)));
      request.on('error', reject);
      request.end();
    });
  }

  handleFrame(data) {
    let message;
    try {
      message = parseMessage(data);
    } catch (err) {
      this.logger?.debug('Unreadable frame from the box', err);
      return;
    }
    if (!message) {
      return;
    }
    if (message.type === 'request') {
      // The box pushes its changes as requests (PUT /devices/data...).
      this.emit('push', message);
      return;
    }
    const waiter = message.transactionId ? this.pending.get(message.transactionId) : undefined;
    if (!waiter) {
      // An answer nobody waits for (a late one, or the broadcast that follows
      // a refresh): its content is still the freshest known, relay it.
      this.emit('push', message);
      return;
    }
    this.pending.delete(message.transactionId);
    clearTimeout(waiter.timer);
    if (message.status >= 400) {
      waiter.reject(new Error(`${waiter.label} failed: HTTP ${message.status}`));
    } else {
      waiter.resolve(message);
    }
  }

  handleClose() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.stopKeepAlive();
    for (const waiter of this.pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error(`${waiter.label} failed: connection closed`));
    }
    this.pending.clear();
    this.emit('close');
  }

  get connected() {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  /**
   * Send a request and wait for the answer of the box.
   * @returns {Promise<unknown>} the parsed JSON body (null when empty)
   */
  request(method, url, body) {
    if (!this.connected) {
      return Promise.reject(new Error('Not connected to the box'));
    }
    this.transactionCounter += 1;
    const transactionId = `${Date.now()}${this.transactionCounter}`;
    const label = `${method} ${url}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(transactionId);
        reject(new Error(`${label} failed: no answer from the box`));
      }, this.options.requestTimeout);
      this.pending.set(transactionId, {
        label,
        timer,
        resolve: (message) => resolve(message.body),
        reject,
      });
      this.socket.send(
        buildRequest({ method, url, body, transactionId, remote: this.remote }),
        (err) => {
          if (err && this.pending.delete(transactionId)) {
            clearTimeout(timer);
            reject(err);
          }
        },
      );
    });
  }

  get(url) {
    return this.request('GET', url);
  }

  put(url, body) {
    return this.request('PUT', url, body);
  }

  post(url, body) {
    return this.request('POST', url, body);
  }

  // The cloud relay drops an idle socket, and a dead local one would otherwise
  // go unnoticed until the next command: ping, and give up on a silent box.
  startKeepAlive() {
    const { keepAliveInterval } = this.options;
    if (!keepAliveInterval) {
      return;
    }
    this.keepAliveTimer = setInterval(() => {
      this.get('/ping').catch((err) => {
        this.logger?.warn(`Keep-alive failed, closing the connection: ${err.message}`);
        this.socket?.terminate();
      });
    }, keepAliveInterval);
    this.keepAliveTimer.unref?.();
  }

  stopKeepAlive() {
    clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = null;
  }

  /** Close the connection; 'close' is emitted once it is down. */
  close() {
    this.stopKeepAlive();
    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
      this.socket.terminate();
    } else {
      this.handleClose();
    }
  }
}
