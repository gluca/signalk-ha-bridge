const http = require('http');

class SensorConverter {
  constructor(config) {
    this.config = config;
    // Cache for temperature conversion functions per path
    this.tempTransformCache = new Map();
    // Cache for fetched meta information per path
    this.metaCache = new Map();

    // Map SignalK units to Home Assistant device classes and target units
    // This is prescriptive - we trust SignalK's meta.units
    this.unitToDeviceClass = {
      'K': { deviceClass: 'temperature', targetUnit: '°C', convert: (v) => v - 273.15 },
      '°C': { deviceClass: 'temperature', targetUnit: '°C', convert: (v) => v },
      'C': { deviceClass: 'temperature', targetUnit: '°C', convert: (v) => v },
      '°F': { deviceClass: 'temperature', targetUnit: '°C', convert: (v) => (v - 32) * 5/9 },
      'F': { deviceClass: 'temperature', targetUnit: '°C', convert: (v) => (v - 32) * 5/9 },
      'm/s': { deviceClass: null, targetUnit: 'm/s', convert: (v) => v }, // speed or wind_speed determined by path
      'm': { deviceClass: 'distance', targetUnit: 'm', convert: (v) => v },
      'rad': { deviceClass: null, targetUnit: '°', convert: (v) => v * 57.29577951308232 }, // angles
      'V': { deviceClass: 'voltage', targetUnit: 'V', convert: (v) => v },
      'A': { deviceClass: 'current', targetUnit: 'A', convert: (v) => v },
      'Pa': { deviceClass: 'pressure', targetUnit: 'Pa', convert: (v) => v },
    };

    // Icon mapping by SignalK path patterns (still useful for UI)
    this.pathIcons = {
      'temperature': 'mdi:thermometer',
      'speedOverGround': 'mdi:speedometer',
      'speedThroughWater': 'mdi:speedometer-medium',
      'wind': 'mdi:weather-windy',
      'depth': 'mdi:waves',
      'heading': 'mdi:compass',
      'course': 'mdi:compass',
      'angle': 'mdi:compass',
      'voltage': 'mdi:flash',
      'current': 'mdi:current-ac',
      'pressure': 'mdi:gauge',
      'position': 'mdi:crosshairs-gps',
      'satellites': 'mdi:satellite-variant',
    };
  }

  /**
   * Fetch JSON from a URL using http.get
   */
  _httpGetJson(url) {
    return new Promise((resolve, reject) => {
      const req = http.get(url, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return resolve(null);
        }
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.setTimeout(5000, () => { req.destroy(); resolve(null); });
    });
  }

  /**
   * Fetch meta information from SignalK REST API and cache it.
   * Handles nested properties (e.g., navigation.attitude.yaw where yaw is a property
   * of the parent navigation.attitude path).
   */
  async fetchMeta(signalkPath) {
    if (this.metaCache.has(signalkPath)) {
      return this.metaCache.get(signalkPath);
    }

    const host = this.config.signalk?.host || 'localhost';
    const port = this.config.signalk?.port || 3000;
    const baseUrl = `http://${host}:${port}/signalk/v1/api/vessels/self`;

    const data = await this._httpGetJson(`${baseUrl}/${signalkPath.replace(/\./g, '/')}`);
    let meta = data?.meta || {};

    // If no meta found, try the parent path for nested properties
    if (Object.keys(meta).length === 0 && signalkPath.includes('.')) {
      const parts = signalkPath.split('.');
      const lastPart = parts.pop();
      const parentPath = parts.join('.');

      const parentData = await this._httpGetJson(`${baseUrl}/${parentPath.replace(/\./g, '/')}`);
      const parentMeta = parentData?.meta || {};
      if (parentMeta.properties && parentMeta.properties[lastPart]) {
        meta = parentMeta.properties[lastPart];
      }
    }

    this.metaCache.set(signalkPath, meta);
    return meta;
  }

  /**
   * Get sensor configuration for a given SignalK path
   * Auto-generates config if not explicitly defined in config file
   * @param {string} signalkPath - SignalK path
   * @param {*} value - SignalK value (used to infer type)
   * @param {Object} meta - SignalK meta object (optional)
   * @returns {Object} - Sensor configuration (never null)
   */
  getSensorConfig(signalkPath, value = null, meta = null) {
    // Check if explicitly configured in config file
    if (this.config.sensors && this.config.sensors[signalkPath]) {
      return this.config.sensors[signalkPath];
    }

    // Check wildcard match (e.g., "electrical.batteries.*.voltage")
    if (this.config.sensors) {
      for (const [configPath, sensorConfig] of Object.entries(this.config.sensors)) {
        if (configPath.includes('*')) {
          const pattern = configPath.replace(/\*/g, '[^.]+');
          const regex = new RegExp(`^${pattern}$`);
          if (regex.test(signalkPath)) {
            return sensorConfig;
          }
        }
      }
    }

    // Auto-generate configuration from path and meta
    return this.autoGenerateConfig(signalkPath, value, meta);
  }

  /**
   * Auto-generate sensor config from SignalK path and meta
   * @param {string} signalkPath - SignalK path
   * @param {*} value - SignalK value
   * @param {Object} meta - SignalK meta object
   * @returns {Object} - Generated sensor configuration
   */
  autoGenerateConfig(signalkPath, value, meta = null) {
    // Generate friendly name from path
    const name = this.generateFriendlyName(signalkPath);

    // Infer device class and unit from meta.units
    const { deviceClass, unit, icon } = this.inferFromMeta(signalkPath, value, meta);

    return {
      enabled: true,
      name: name,
      deviceClass: deviceClass,
      unit: unit,
      icon: icon
    };
  }

  /**
   * Generate friendly name from SignalK path
   * @param {string} signalkPath - SignalK path
   * @returns {string} - Friendly name
   */
  generateFriendlyName(signalkPath) {
    // Convert path like "environment.water.temperature" to "Water Temperature"
    const parts = signalkPath.split('.');

    // Take last 2-3 meaningful parts
    const relevantParts = parts.slice(-2);

    return relevantParts
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .map(part => part.replace(/([A-Z])/g, ' $1').trim()) // Add spaces before capitals
      .join(' ');
  }

  /**
   * Infer device class, unit, and icon from meta.units
   * This is prescriptive - we trust SignalK's meta
   * @param {string} signalkPath - SignalK path
   * @param {*} value - SignalK value
   * @param {Object} meta - SignalK meta object
   * @returns {Object} - { deviceClass, unit, icon }
   */
  inferFromMeta(signalkPath, value, meta = null) {
    const metaUnits = meta?.units;
    let deviceClass = null;
    let unit = null;
    let icon = 'mdi:gauge';

    // Use meta.units to determine device class and target unit
    if (metaUnits && this.unitToDeviceClass[metaUnits]) {
      const mapping = this.unitToDeviceClass[metaUnits];
      deviceClass = mapping.deviceClass;
      unit = mapping.targetUnit;

      // Special case: m/s could be speed or wind_speed
      if (metaUnits === 'm/s') {
        if (signalkPath.includes('wind')) {
          deviceClass = 'wind_speed';
        } else if (signalkPath.includes('speed')) {
          deviceClass = 'speed';
        }
      }
    }

    // Find icon based on path
    for (const [keyword, iconName] of Object.entries(this.pathIcons)) {
      if (signalkPath.toLowerCase().includes(keyword)) {
        icon = iconName;
        break;
      }
    }

    // Boolean fallback
    if (typeof value === 'boolean') {
      icon = 'mdi:toggle-switch';
    }

    return { deviceClass, unit, icon };
  }

  /**
   * Round value intelligently based on type
   * @param {number} value - Value to round
   * @param {string} signalkPath - SignalK path
   * @param {Object} sensorConfig - Sensor config
   * @returns {number} - Rounded value
   */
  smartRound(value, signalkPath, sensorConfig) {
    if (typeof value !== 'number' || !isFinite(value)) {
      return value;
    }

    // Never round position (lat/lon)
    if (signalkPath.includes('position')) {
      return value;
    }

    // Never round pressure (need precision for weather)
    if (signalkPath.includes('pressure')) {
      return Number(value.toFixed(2));
    }

    // 1 decimal for temp, speed, wind, depth, angles
    if (
      sensorConfig.deviceClass === 'temperature' ||
      sensorConfig.deviceClass === 'speed' ||
      sensorConfig.deviceClass === 'wind_speed' ||
      sensorConfig.deviceClass === 'distance' ||
      sensorConfig.unit === 'rad' ||
      sensorConfig.unit === '°'
    ) {
      return Number(value.toFixed(1));
    }

    // 2 decimals for everything else
    return Number(value.toFixed(2));
  }

  /**
   * Convert SignalK value to Home Assistant format
   * Uses meta.units to determine conversion (prescriptive approach)
   * @param {string} signalkPath - SignalK path
   * @param {*} value - SignalK value
   * @param {Object} sensorConfig - Sensor configuration
   * @param {Object} meta - SignalK meta object (required for proper conversion)
   * @returns {string} - Converted value for HA
   */
  convertValue(signalkPath, value, sensorConfig, meta = null) {
    // Handle null/undefined values
    if (value === null || value === undefined) {
      return 'unknown';
    }

    // Handle position (lat/lon object)
    if (signalkPath.includes('position') && typeof value === 'object' && value.latitude && value.longitude) {
      return JSON.stringify({
        value: `${value.latitude.toFixed(6)}, ${value.longitude.toFixed(6)}`,
        latitude: value.latitude,
        longitude: value.longitude,
      });
    }

    // Handle datetime/timestamp
    if (signalkPath.includes('datetime') || (sensorConfig && sensorConfig.deviceClass === 'timestamp')) {
      return new Date(value).toISOString();
    }

    // Handle numeric values
    if (typeof value === 'number') {
      // Check if NaN or non-finite
      if (!isFinite(value)) {
        return 'unknown';
      }

      // RAW MODE: return exactly as received (no conversion, no rounding)
      if (this.config.rawMode) {
        return value.toString();
      }

      // NORMAL MODE: Apply conversions based on meta.units
      const metaUnits = meta?.units;
      if (metaUnits && this.unitToDeviceClass[metaUnits]) {
        const mapping = this.unitToDeviceClass[metaUnits];
        value = mapping.convert(value);

        // Sanity check for temperatures
        if (mapping.deviceClass === 'temperature' && (value < -50 || value > 100)) {
          console.warn(`⚠️  Suspicious temperature value ${value.toFixed(1)}°C for ${signalkPath} (raw: ${value}, meta.units: ${metaUnits})`);
        }
      }

      // Apply smart rounding
      return this.smartRound(value, signalkPath, sensorConfig).toString();
    }

    // Handle objects (convert to JSON string)
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    // Handle strings and other types
    return String(value);
  }
}

module.exports = SensorConverter;
