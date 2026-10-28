<!-- src/routes/admin/configs/[key]/+page.svelte -->
<script>
	import { page } from '$app/state';
	import { tick } from 'svelte';
	import { defaultMapConfig } from '#lib/defaultConfig';
	import '../../../jedison.css';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	// Lấy key động từ URL (Svelte 5 runes / derived)
	let key = $derived(page.params.key);

	let centerLat = $state(10.780074);
	let centerLng = $state(106.6876522);

	let generalSchema = {
		type: 'object',
		additionalProperties: false,
		title: 'Cấu hình chung (General Configuration)',
		properties: {
			title: { type: 'string', title: 'title' },
			logoUrl: { type: 'string', title: 'logoUrl' },
			zoom: { type: 'integer', title: 'zoom' },
			status: { type: 'string', title: 'status', enum: ['active', 'inactive'] }
		}
	};

	let layersSchema = {
		type: 'object',
		additionalProperties: false,
		properties: {
			baseLayers: {
				type: 'array',
				title: 'baseLayers (Không có active)',
				items: {
					type: 'object',
					additionalProperties: false,
					headerTemplate: '{{self.name}}',
					properties: {
						name: { type: 'string', title: 'name' },
						layerUrl: { type: 'string', title: 'layerUrl' },
						thumbnailUrl: { type: 'string', title: 'thumbnailUrl' }
					}
				}
			},
			overlays: {
				type: 'array',
				title: 'overlays (Có active)',
				items: {
					type: 'object',
					additionalProperties: false,
					headerTemplate: '{{self.name}}',
					properties: {
						name: { type: 'string', title: 'name' },
						wmsUrl: { type: 'string', title: 'wmsUrl' },
						layers: { type: 'string', title: 'layers' },
						iconUrl: { type: 'string', title: 'iconUrl' },
						active: { type: 'boolean', title: 'active' }
					}
				}
			}
		}
	};

	let editorGeneralContainer = $state();
	let editorLayersContainer = $state();
	let statusMessage = $state('');
	let isSuccess = $state(true);
	let isLoading = $state(true);
	/** @type {{ getValue: () => { title?: string, logoUrl?: string, zoom?: number, status?: string } } | null} */
	let editorGeneralInstance = $state.raw(null);
	/** @type {{ getValue: () => Record<string, unknown> } | null} */
	let editorLayersInstance = $state.raw(null);

	/** @param {string} currentKey */
	async function loadConfigData(currentKey) {
		isLoading = true;
		let initialData = JSON.parse(JSON.stringify(defaultMapConfig));

		try {
			const res = await fetch(`/api/config/${currentKey}?t=` + Date.now());
			if (!res.ok && res.status !== 404) {
				throw new Error(`HTTP ${res.status}`);
			}
			if (res.ok) {
				const json = await res.json();
				if (json && json.title) {
					initialData = json;
				}
			}
		} catch (error) {
			console.error('Không thể tải cấu hình:', error);
			statusMessage = 'Không thể tải cấu hình. Hãy kiểm tra kết nối bộ lưu trữ rồi tải lại trang.';
			isSuccess = false;
			isLoading = false;
			return;
		}

		if (Array.isArray(initialData.center) && initialData.center.length >= 2) {
			centerLat = initialData.center[0];
			centerLng = initialData.center[1];
		}

		const generalData = {
			title: initialData.title || '',
			logoUrl: initialData.logoUrl || '',
			zoom: initialData.zoom ?? 8,
			status: initialData.status === 'inactive' ? 'inactive' : 'active'
		};

		const layersData = {
			baseLayers: Array.isArray(initialData.baseLayers) ? initialData.baseLayers : [],
			overlays: Array.isArray(initialData.overlays) ? initialData.overlays : []
		};

		try {
			const jedisonModule = await import('jedison');
			/** Jedison does not publish TypeScript declarations. */
			const Jedison = /** @type {any} */ (jedisonModule.default || jedisonModule);

			await tick();

			if (editorGeneralContainer && editorLayersContainer && Jedison) {
				editorGeneralInstance = new Jedison.Create({
					container: editorGeneralContainer,
					theme: new Jedison.ThemeBootstrap5(),
					schema: generalSchema,
					data: generalData,
					disable_properties: true,
					disable_edit_json: true,
					disable_collapse: true
				});

				editorLayersInstance = new Jedison.Create({
					container: editorLayersContainer,
					theme: new Jedison.ThemeBootstrap5(),
					schema: layersSchema,
					data: layersData,
					disable_properties: true,
					disable_edit_json: true,
					disable_collapse: true
				});
			}
		} catch (e) {
			console.error('Lỗi khởi tạo Jedison:', e);
		} finally {
			isLoading = false;
		}
	}

	// Tự động load lại dữ liệu khi key thay đổi
	$effect(() => {
		if (key) {
			loadConfigData(key);
		}
	});

	async function handleSave() {
		if (!editorGeneralInstance || !editorLayersInstance) return;

		try {
			const generalVal = editorGeneralInstance.getValue();
			const layersVal = editorLayersInstance.getValue();

			const rawData = {
				title: generalVal.title,
				logoUrl: generalVal.logoUrl,
				zoom: generalVal.zoom,
				status: generalVal.status,
				center: [Number(centerLat) || 0, Number(centerLng) || 0],
				...layersVal
			};

			statusMessage = 'Đang lưu cấu hình...';
			isSuccess = true;

			const response = await fetch(`/api/config/${key}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(rawData)
			});

			const result = await response.json();
			if (result.success) {
				statusMessage = `Lưu cấu hình '${key}' thành công!`;
				isSuccess = true;
			} else {
				statusMessage = 'Lưu thất bại: ' + (result.error || 'Lỗi server');
				isSuccess = false;
			}
		} catch (err) {
			console.error(err);
			statusMessage = 'Lỗi kết nối khi lưu!';
			isSuccess = false;
		}

		setTimeout(() => (statusMessage = ''), 5000);
	}
</script>

<svelte:head>
	<title>Cấu hình bản đồ - {key}</title>
	<link
		rel="stylesheet"
		href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css"
	/>
</svelte:head>

<main class="min-h-screen bg-slate-100/60 px-4 py-12 font-sans text-slate-800">
	<div
		class="mx-auto max-w-4xl rounded-3xl border border-slate-200/60 bg-white p-8 shadow-sm sm:p-10"
	>
		<div class="d-flex justify-content-between align-items-center border-bottom mb-8 pb-5">
			<div>
				<h1 class="h3 fw-bold text-slate-900">
					Chỉnh sửa cấu hình: <span class="text-primary">{key}</span>
				</h1>
				<p class="text-muted mt-1 mb-0 text-sm">
					Quản lý và chỉnh sửa cấu hình bản đồ tại <code>configs/{key}.json</code>.
				</p>
			</div>
			<button
				onclick={() => goto(resolve('/admin/configs'))}
				class="btn btn-outline-secondary btn-sm"
			>
				← Quay lại danh sách
			</button>
		</div>

		{#if isLoading}
			<div class="text-muted py-16 text-center">Đang tải cấu hình bản đồ...</div>
		{/if}

		<!-- Sử dụng {#key key} để tự động tái tạo lại DOM sạch sẽ, loại bỏ hoàn toàn việc dùng innerHTML -->
		{#key key}
			<div
				class="rounded-3 bg-light mb-4 border p-4 shadow-sm"
				style:display={isLoading ? 'none' : 'block'}
			>
				<h2 class="h6 fw-bold border-bottom mb-3 pb-2 text-slate-700">
					Cấu hình chung (General Configuration)
				</h2>

				<div class="mb-4">
					<div bind:this={editorGeneralContainer} class="custom-jedison-wrapper"></div>
				</div>

				<div>
					<p class="form-label fw-semibold mb-1 text-slate-700">center [Lat, Lng]</p>
					<div class="row g-3">
						<div class="col-md-6">
							<label for="lat-input" class="form-label small text-muted">Latitude (Vĩ độ)</label>
							<input
								id="lat-input"
								type="number"
								step="any"
								bind:value={centerLat}
								class="form-control"
							/>
						</div>
						<div class="col-md-6">
							<label for="lng-input" class="form-label small text-muted">Longitude (Kinh độ)</label>
							<input
								id="lng-input"
								type="number"
								step="any"
								bind:value={centerLng}
								class="form-control"
							/>
						</div>
					</div>
				</div>
			</div>

			<div class="rounded-3 mb-4 border bg-white p-4" style:display={isLoading ? 'none' : 'block'}>
				<div bind:this={editorLayersContainer} class="custom-jedison-wrapper"></div>
			</div>
		{/key}

		<div class="d-flex justify-content-between align-items-center border-top pt-4">
			<button
				onclick={handleSave}
				disabled={isLoading || !editorGeneralInstance || !editorLayersInstance}
				class="btn btn-primary fw-semibold px-4 py-2 shadow-sm"
			>
				Lưu cấu hình
			</button>

			{#if statusMessage}
				<span class={`small fw-medium ${isSuccess ? 'text-success' : 'text-danger'}`}>
					{statusMessage}
				</span>
			{/if}
		</div>
	</div>
</main>
