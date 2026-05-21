const http = require('http');

class DeviceRegistry {
  constructor(config) {
    this.config = config;
    this.devices = new Map();
  }

  /**
   * Fetch device information from SignalK API
   * @returns {Promise<void>}
   */
  async fetchDevices() {
    const signalkHost = this.config.signalk.host || 'localhost';
    const signalkPort = this.config.signalk.port || 3000;
    const url = `http://${signalkHost}:${signalkPort}/signalk/v1/api/sources`;

    return new Promise((resolve, reject) => {
      let req;
      const timeout = setTimeout(() => {
        if (req) req.destroy(); // Abort the request
        reject(new Error('SignalK API request timed out'));
      }, 30000); // Increased to 30 seconds for slow connections

      req = http.get(url, (res) => {
        clearTimeout(timeout);
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const sources = JSON.parse(data);
            this.parseDevices(sources);
            console.log(`📋 Loaded ${this.devices.size} N2K devices from SignalK`);
            resolve();
          } catch (error) {
            console.warn('url:',url);
            console.warn('data:',data.toString());
            console.warn('⚠️  Failed to parse SignalK sources:', error.message);
            resolve(); // Don't fail startup if API is unavailable
          }
        });
      }).on('error', (error) => {
        clearTimeout(timeout);
        console.warn('⚠️  Failed to fetch SignalK devices:', error.message);
        resolve(); // Don't fail startup if API is unavailable
      });
    });
  }

  /**
   * Parse device information from SignalK sources API response
   * @param {Object} sources - Sources object from SignalK API
   */
  parseDevices(sources) {
    const n2kOutput = sources['n2k-output'];
    if (!n2kOutput) {
      console.warn('⚠️  No n2k-output found in SignalK sources');
      return;
    }

    for (const [sourceId, sourceData] of Object.entries(n2kOutput)) {
      if (sourceData.n2k) {
        const n2k = sourceData.n2k;
        const deviceInfo = {
          sourceId: sourceId,
          manufacturer: n2k.manufacturerCode || n2k['Manufacturer Code'] || 'Unknown',
          model: n2k.modelId || n2k['Model ID'] || 'Unknown Device',
          deviceClass: n2k.deviceClass || n2k['Device Class'] || '',
          serialNumber: n2k.modelSerialCode || n2k['Model Serial Code'] || '',
          softwareVersion: n2k.softwareVersionCode || n2k['Software Version Code'] || '',
          productCode: n2k.productCode || n2k['Product Code'] || '',
        };

        this.devices.set(sourceId, deviceInfo);
        console.log(`  ↳ Source ${sourceId}: ${deviceInfo.manufacturer} ${deviceInfo.model}`);
      }
    }
  }

  /**
   * Get device information for a specific N2K source
   * @param {string} sourceId - N2K source ID
   * @returns {Object|null} - Device information or null if not found
   */
  getDevice(sourceId) {
    return this.devices.get(sourceId.toString()) || null;
  }

  /**
   * Get manufacturer name for a specific N2K source
   * @param {string} sourceId - N2K source ID
   * @returns {string} - Manufacturer name or 'NMEA 2000' as fallback
   */
  getManufacturer(sourceId) {
    const device = this.getDevice(sourceId);
    return device ? device.manufacturer : 'NMEA 2000';
  }

  /**
   * Get model name for a specific N2K source
   * @param {string} sourceId - N2K source ID
   * @returns {string} - Model name or 'NMEA 2000 Device' as fallback
   */
  getModel(sourceId) {
    const device = this.getDevice(sourceId);
    return device ? device.model : 'NMEA 2000 Device';
  }

  /**
   * Get friendly device name combining manufacturer and model
   * @param {string} sourceId - N2K source ID
   * @returns {string} - Friendly device name
   */
  getDeviceName(sourceId) {
    const device = this.getDevice(sourceId);
    if (device) {
      return `${device.manufacturer} ${device.model} (Src ${sourceId})`;
    }
    return `N2K Source ${sourceId}`;
  }
}

module.exports = DeviceRegistry;
