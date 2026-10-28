/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
export function isMapConfig(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

	const config = /** @type {Record<string, any>} */ (value);
	return (
		typeof config.title === 'string' &&
		config.title.trim().length > 0 &&
		typeof config.logoUrl === 'string' &&
		Number.isFinite(config.zoom) &&
		Number.isInteger(config.zoom) &&
		config.zoom >= 0 &&
		config.zoom <= 22 &&
		Array.isArray(config.center) &&
		config.center.length === 2 &&
		Number.isFinite(config.center[0]) &&
		config.center[0] >= -90 &&
		config.center[0] <= 90 &&
		Number.isFinite(config.center[1]) &&
		config.center[1] >= -180 &&
		config.center[1] <= 180 &&
		Array.isArray(config.baseLayers) &&
		config.baseLayers.every(
			(layer) =>
				layer &&
				typeof layer.name === 'string' &&
				typeof layer.layerUrl === 'string' &&
				layer.layerUrl.trim().length > 0 &&
				typeof layer.thumbnailUrl === 'string'
		) &&
		Array.isArray(config.overlays) &&
		config.overlays.every(
			(layer) =>
				layer &&
				typeof layer.name === 'string' &&
				typeof layer.wmsUrl === 'string' &&
				layer.wmsUrl.trim().length > 0 &&
				typeof layer.layers === 'string' &&
				layer.layers.trim().length > 0 &&
				typeof layer.iconUrl === 'string' &&
				typeof layer.active === 'boolean'
		) &&
		(config.status === undefined || config.status === 'active' || config.status === 'inactive')
	);
}
