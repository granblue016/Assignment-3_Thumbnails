<script>
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import 'leaflet/dist/leaflet.css';

	/** @typedef {typeof import('#lib/defaultConfig').defaultMapConfig & { key: string, status?: string, updatedAt?: string }} MapConfig */
	const key = $derived(page.params.key ?? '');
	/** @type {MapConfig | null} */
	let config = $state(null);
	let mapElement = $state();
	let errorMessage = $state('');
	let isLoading = $state(true);
	let selectedBase = $state(0);
	/** @type {boolean[]} */
	let activeOverlays = $state([]);
	/** @type {import('leaflet').Map | null} */
	let mapInstance = $state.raw(null);
	/** @type {typeof import('leaflet') | null} */
	let leaflet = $state.raw(null);
	/** @type {import('leaflet').TileLayer | null} */
	let baseLayerInstance = $state.raw(null);
	/** @type {import('leaflet').TileLayer[]} */
	let overlayInstances = $state.raw([]);

	onMount(() => {
		let isDestroyed = false;
		async function initializeMap() {
			try {
				const response = await fetch(`/api/config/${encodeURIComponent(key)}`);
				const payload = await response.json();
				if (!response.ok) {
					throw new Error(
						typeof payload.error === 'string' ? payload.error : 'Không thể tải cấu hình bản đồ.'
					);
				}
				const data = /** @type {MapConfig} */ (payload);
				if (!Array.isArray(data.baseLayers) || data.baseLayers.length === 0) {
					throw new Error('Cấu hình chưa có lớp bản đồ nền.');
				}

				config = data;
				await tick();
				const leaf = await import('leaflet');
				leaflet = leaf;
				if (isDestroyed || !mapElement) return;
				const map = leaf.map(mapElement).setView(data.center, data.zoom);
				mapInstance = map;
				baseLayerInstance = leaf.tileLayer(data.baseLayers[0].layerUrl, { maxZoom: 22 }).addTo(map);
				overlayInstances = data.overlays.map((overlay, index) => {
					const layer = leaf.tileLayer.wms(overlay.wmsUrl, {
						layers: overlay.layers,
						format: 'image/png',
						transparent: true
					});
					if (activeOverlays[index]) layer.addTo(map);
					return layer;
				});
				requestAnimationFrame(() => mapInstance?.invalidateSize());
			} catch (error) {
				errorMessage = error instanceof Error ? error.message : String(error);
			} finally {
				isLoading = false;
			}
		}
		void initializeMap();

		return () => {
			isDestroyed = true;
			mapInstance?.remove();
		};
	});

	/** @param {number} index */
	function selectBase(index) {
		if (!mapInstance || !leaflet || !config) return;
		baseLayerInstance?.remove();
		selectedBase = index;
		baseLayerInstance = leaflet
			.tileLayer(config.baseLayers[index].layerUrl, { maxZoom: 22 })
			.addTo(mapInstance);
	}

	/** @param {number} index */
	function toggleOverlay(index) {
		if (!mapInstance || !overlayInstances[index]) return;
		activeOverlays[index] = !activeOverlays[index];
		activeOverlays[index]
			? overlayInstances[index].addTo(mapInstance)
			: overlayInstances[index].remove();
		activeOverlays = [...activeOverlays];
	}
</script>

<svelte:head>
	<title>{config?.title ? `${config.title} | Bản đồ` : 'Bản đồ'}</title>
	<meta name="description" content={config?.title || 'Bản đồ được tải từ cấu hình động'} />
</svelte:head>

<main class="map-page">
	<header class="map-header">
		<div class="brand">
			{#if config?.logoUrl}
				<img src={config.logoUrl} alt="Logo" class="brand-logo" />
			{/if}
			<div>
				<h1>{config?.title || 'Bản đồ'}</h1>
				<p>Cấu hình: <code>{key}</code></p>
			</div>
		</div>
		<a href={resolve('/admin/configs')} class="admin-link">Quản lý cấu hình</a>
	</header>

	{#if isLoading}
		<div class="message">Đang tải cấu hình bản đồ…</div>
	{:else if errorMessage}
		<div class="message error" role="alert">
			<h2>Không thể hiển thị bản đồ</h2>
			<p>{errorMessage}</p>
			<a href={resolve('/admin/configs')}>Quay lại danh sách cấu hình</a>
		</div>
	{:else if config}
		<div class="map-layout">
			<aside class="layer-panel" aria-label="Điều khiển lớp bản đồ">
				<h2>Lớp bản đồ</h2>
				<h3>Bản đồ nền</h3>
				{#each config.baseLayers as layer, index (index)}
					<button
						class:chosen={selectedBase === index}
						class="base-option"
						aria-pressed={selectedBase === index}
						onclick={() => selectBase(index)}
					>
						{#if layer.thumbnailUrl}<img src={layer.thumbnailUrl} alt="" />{/if}
						<span>{layer.name}</span>
					</button>
				{/each}

				{#if config.overlays.length}
					<h3>Lớp phủ</h3>
					{#each config.overlays as overlay, index (index)}
						<button
							class="overlay-option"
							class:chosen={activeOverlays[index]}
							aria-pressed={activeOverlays[index]}
							onclick={() => toggleOverlay(index)}
						>
							<span class="check">{activeOverlays[index] ? '✓' : ''}</span>
							{#if overlay.iconUrl}<img src={overlay.iconUrl} alt="" />{/if}
							<span>{overlay.name}</span>
						</button>
					{/each}
				{/if}
			</aside>
			<div
				bind:this={mapElement}
				class="leaflet-map"
				role="application"
				aria-label="Bản đồ tương tác"
			></div>
		</div>
	{/if}
</main>

<style>
	:global(body) {
		margin: 0;
		font-family: Arial, sans-serif;
		color: #172033;
	}
	.map-page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		background: #f1f5f9;
	}
	.map-header {
		min-height: 76px;
		padding: 12px 24px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
		background: #fff;
		border-bottom: 1px solid #dbe3ee;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 14px;
		min-width: 0;
	}
	.brand-logo {
		width: 48px;
		height: 48px;
		object-fit: contain;
	}
	h1 {
		margin: 0;
		font-size: 1.15rem;
	}
	.brand p {
		margin: 4px 0 0;
		color: #64748b;
		font-size: 0.85rem;
	}
	.admin-link {
		color: #075985;
		text-decoration: none;
		font-weight: 600;
		white-space: nowrap;
	}
	.map-layout {
		flex: 1;
		min-height: 560px;
		display: grid;
		grid-template-columns: minmax(220px, 280px) 1fr;
	}
	.layer-panel {
		padding: 18px;
		overflow-y: auto;
		background: white;
		border-right: 1px solid #dbe3ee;
	}
	.layer-panel h2 {
		margin: 0 0 18px;
		font-size: 1.1rem;
	}
	.layer-panel h3 {
		margin: 20px 0 8px;
		color: #64748b;
		font-size: 0.8rem;
		text-transform: uppercase;
	}
	.base-option,
	.overlay-option {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 9px;
		margin: 5px 0;
		text-align: left;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		background: #fff;
		color: #1e293b;
		cursor: pointer;
	}
	.base-option.chosen,
	.overlay-option.chosen {
		border-color: #0284c7;
		background: #f0f9ff;
	}
	.base-option img,
	.overlay-option img {
		width: 34px;
		height: 28px;
		object-fit: cover;
		border-radius: 4px;
	}
	.check {
		width: 16px;
		height: 16px;
		flex: 0 0 16px;
		border: 1px solid #94a3b8;
		border-radius: 3px;
		text-align: center;
		font-size: 12px;
	}
	.overlay-option.chosen .check {
		color: white;
		border-color: #0284c7;
		background: #0284c7;
	}
	.leaflet-map {
		min-height: 560px;
		width: 100%;
		background: #dbeafe;
	}
	.message {
		margin: auto;
		padding: 32px;
		text-align: center;
	}
	.error {
		color: #991b1b;
	}
	@media (max-width: 700px) {
		.map-header {
			padding: 12px;
		}
		.map-layout {
			grid-template-columns: 1fr;
			grid-template-rows: auto minmax(420px, 65vh);
		}
		.layer-panel {
			max-height: 230px;
			border-right: 0;
			border-bottom: 1px solid #dbe3ee;
		}
		.layer-panel h2 {
			margin-bottom: 8px;
		}
		.layer-panel h3 {
			margin-top: 12px;
		}
		.leaflet-map {
			min-height: 420px;
		}
	}
</style>
