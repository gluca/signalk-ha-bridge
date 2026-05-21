const mqtt = require('mqtt');
const EventEmitter = require('events');

class MQTTClient extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.client = null;
  }

  connect() {
    const options = {
      clientId: this.config.mqtt.clientId,
      clean: false,
      reconnectPeriod: 5000,
      connectTimeout: 3000,
    };

    // Add credentials if provided
    if (this.config.mqtt.username) {
      options.username = this.config.mqtt.username;
    }
    if (this.config.mqtt.password) {
      options.password = this.config.mqtt.password;
    }

    const brokerUrl = `mqtt://${this.config.mqtt.broker}:${this.config.mqtt.port}`;
    console.log(`🔄 Connecting to MQTT broker ${brokerUrl} with options: %j`,options);
    this.client = mqtt.connect(brokerUrl, options);

    this.client.on('connect', () => {
      this.emit('connected');
    });

    this.client.on('error', (error) => {
      this.emit('error', error);
    });

    this.client.on('reconnect', () => {
      this.emit('reconnecting');
    });

    this.client.on('message', (topic, message) => {
      this.emit('message', topic, message);
    });

    this.client.on('close', () => {
      this.emit('disconnected');
    });
  }

  subscribe(topic, options = { qos: 0 }) {
    if (!this.client) {
      throw new Error('MQTT client not connected');
    }

    this.client.subscribe(topic, options, (error) => {
      if (error) {
        this.emit('error', error);
      }
    });
  }

  publish(topic, payload, options = { qos: 0, retain: false }) {
    if (!this.client) {
      throw new Error('MQTT client not connected');
    }

    const message = typeof payload === 'string' ? payload : JSON.stringify(payload);

    this.client.publish(topic, message, options, (error) => {
      if (error) {
        this.emit('error', error);
      }
    });
  }

  disconnect() {
    if (this.client) {
      this.client.end();
    }
  }
}

module.exports = MQTTClient;
