# Changelog

All notable changes to the SignalK HA Bridge project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 2026-04-10

### Fixed
- **WebSocket reconnection failure** - Error events now terminate the socket and trigger reconnect (previously the bridge could go permanently silent after a network disruption)
- **No connection timeout** - Added 15s handshake timeout so the bridge doesn't hang forever if SignalK is unreachable during connect
- **Unhandled async errors** - Replaced async forEach with for...of loops so errors are properly caught; added global unhandledRejection handler
- **Incomplete shutdown** - SIGINT/SIGTERM now disconnect both SignalK WebSocket and MQTT client

### Changed
- **Exponential backoff** on reconnect: 2s, 4s, 8s, ... up to 60s cap (was fixed 5s). Resets on successful connection
- **Standardized HTTP** - sensor-converter.js now uses Node http module instead of global fetch() for consistency with device-registry.js and broader Node version compatibility
- Removed hardcoded fallback IP in device-registry.js (uses localhost as default)

### Removed
- **Deleted signalk-parser.js** - Dead code that was never imported or used (bridge uses WebSocket, not MQTT subscription)

## [1.3.2] - 2025-11-20

### Fixed
- **Nested property meta** - Now correctly fetches meta for expanded object properties (e.g., `navigation.attitude.yaw` gets units from `navigation.attitude.meta.properties.yaw.units`)
- **Angle double-conversion** - Restarting the add-on republishes discovery messages without value_template, fixing 8743° errors
- **Attitude sensor units** - Yaw/pitch/roll now show ° symbol correctly

### Changed
- Enhanced `fetchMeta()` to check parent path for `meta.properties.{child}` when direct path returns empty meta
- Existing entities update in place (retained MQTT discovery messages are replaced on restart)

## [1.3.1] - 2025-11-20

### Fixed
- **Meta-driven unit detection** - Replaced regex pattern guessing with prescriptive meta.units-based approach
- **Temperature conversion** - Now fetches and respects meta.units from SignalK REST API (K→°C conversion based on actual meta)
- **Electrical vs water current** - Fixed misidentification by checking path context (electrical.* vs environment.*)
- **Angle conversions** - Now properly converts radians to degrees based on meta.units
- **Derived-data handling** - Gracefully handles sensors without meta information

### Changed
- Fetch meta from SignalK REST API on first sensor discovery (cached for performance)
- Use unit-to-device-class mapping table (K→temperature, m/s→speed, rad→angle, etc.)
- Apply all unit conversions in sensor-converter based on meta.units (not in discovery templates)

## [1.3.0] - 2025-11-20

### Added - Perfect Units System 🎉

The bridge now features an intelligent, automatic unit conversion system that makes marine sensor data display perfectly in Home Assistant without any template sensors or YAML configuration.

#### Core Features
- **Automatic unit conversion** - Temperature, speed, wind, depth, and angles all display in the correct units based on your HA preferences
- **Meta-aware temperature conversion** - Handles Kelvin, Celsius, and Fahrenheit from SignalK with caching for performance
- **Regex-based device class detection** - 30+ patterns for precise sensor type identification
- **Smart rounding rules** - 1 decimal for temps/speeds/angles, 2 for everything else, never rounds lat/lon
- **Angle conversion** - Radians → degrees with value templates (e.g., wind direction, heading, course)
- **Raw debug mode** - Optional `raw_mode: true` setting for debugging with raw SignalK units

#### Technical Implementation
- Temperature: SignalK Kelvin → °C (bridge) → °F automatic (HA imperial users)
- Speed/Wind: m/s with `device_class: speed` → knots (imperial) or km/h (metric) automatic
- Depth/Distance: meters with `device_class: distance` → feet (imperial) automatic
- Angles: radians → degrees via value_template with 1 decimal precision

#### Configuration
- Single boolean option: `raw_mode: false` (default)
- Zero template sensors required
- Zero YAML configuration required
- Works out of the box for 99% of users

#### Breaking Changes
- Temperature sensors now publish in °C instead of K (converted from SignalK)
- Angle sensors now display in degrees instead of radians (via value_template)
- Config file updated: `environment.water.temperature` unit changed from `K` to `°C`

### Changed
- Updated all auto-generated sensor configs to use HA-friendly device classes
- Enhanced `SensorConverter` with comprehensive unit conversion logic
- Improved `HADiscovery` to handle angle conversion and raw_mode entity naming
- Added startup log message showing current unit mode
- Added `raw_mode` config option export in run.sh

### Fixed
- Fixed temperature display for US/imperial users (no more Kelvin!)
- Fixed angle sensors showing confusing radian values
- Fixed missing `state_class: measurement` on numeric sensors
- **Fixed add-on startup failures after HA migrations/restores** - Added self-healing data directory initialization that automatically creates `/data/addons/data/signalk-ha-bridge/` and `options.json` if missing (prevents "Can't write options.json" errors)

## [1.2.4] - 2025-01-XX

### Added
- 1-second throttling for MQTT publishes to reduce message rate

## [1.2.3] - 2025-01-XX

### Fixed
- Fixed vessels.self subscription filtering

## [1.2.2] - 2025-01-XX

### Changed
- Filter to vessels.self only - exclude AIS data

## [1.2.1] - 2025-01-XX

### Added
- Added state_class for time-series graphing support

## [1.2.0] - 2025-01-XX

### Added
- Object expansion for multi-value sensors (e.g., attitude.yaw, attitude.pitch, attitude.roll)

## [1.0.0] - Initial Release

### Added
- SignalK WebSocket connection for real-time N2K data streaming
- Home Assistant MQTT Discovery integration
- Device registry with manufacturer/model metadata
- Configurable sensor mappings via app-config.json
- Support for position, temperature, speed, depth, wind, voltage, and more
- Automatic sensor discovery and entity creation
- Real-time sensor value publishing with throttling
