<!-- src/routes/admin/configs/+page.svelte -->
<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { defaultMapConfig } from '#lib/defaultConfig';

	/** @type {{ key: string, title: string, updatedAt: string | Date, status: string }[]} */
	let configs = $state([]);
	let newKey = $state('');
	let isLoading = $state(true);
	let isCreating = $state(false);
	let isCreatingStarter = $state(false);
	let errorMessage = $state('');
	let storageDriver = $state('');
	/** @type {Record<string, string>} */
	const storageLabels = {
		filesystem: 'lưu trên máy local',
		minio: 'MinIO',
		'netlify-blobs': 'Netlify Blobs'
	};
	const starterKey = 'hcm-map';

	async function fetchConfigs() {
		isLoading = true;
		errorMessage = '';
		try {
			const res = await fetch('/api/configs');
			const data = await res.json();
			if (!res.ok || !data.success) {
				throw new Error(data.error || `HTTP ${res.status}`);
			}
			if (!Array.isArray(data.configs)) {
				throw new Error('API không trả về danh sách cấu hình hợp lệ.');
			}
			configs = data.configs;
			storageDriver = data.storageDriver || '';
		} catch (err) {
			errorMessage =
				err instanceof Error
					? `Không thể tải danh sách cấu hình: ${err.message}`
					: 'Không thể tải danh sách cấu hình.';
		} finally {
			isLoading = false;
		}
	}

	onMount(() => {
		fetchConfigs();
	});

	/** @param {SubmitEvent} event */
	async function handleCreate(event) {
		event.preventDefault();
		const sanitizedKey = newKey
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9-]+/g, '-')
			.replace(/^-+|-+$/g, '');
		if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sanitizedKey)) {
			errorMessage =
				'Key chỉ được gồm chữ thường, số và dấu gạch ngang, không bắt đầu/kết thúc bằng dấu gạch ngang.';
			return;
		}
		await createConfig(sanitizedKey, defaultMapConfig, false);
	}

	async function createStarterConfig() {
		await createConfig(starterKey, defaultMapConfig, true);
	}

	/**
	 * @param {string} key
	 * @param {typeof defaultMapConfig} config
	 * @param {boolean} isStarter
	 */
	async function createConfig(key, config, isStarter) {
		if (isStarter) isCreatingStarter = true;
		else isCreating = true;
		errorMessage = '';
		try {
			const response = await fetch('/api/configs', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ key, config })
			});
			const result = await response.json();
			if (!response.ok || !result.success) {
				throw new Error(result.error || `HTTP ${response.status}`);
			}

			await fetchConfigs();
			if (errorMessage) {
				throw new Error(
					`Tạo cấu hình có phản hồi thành công nhưng không xác minh được danh sách: ${errorMessage}`
				);
			}
			if (!configs.some((item) => item.key === key)) {
				throw new Error(
					'Cấu hình đã lưu nhưng chưa xuất hiện trong danh sách. Hãy tải lại trang và kiểm tra backend lưu trữ.'
				);
			}
			goto(resolve('/admin/configs/[key]', { key }));
		} catch (error) {
			errorMessage =
				error instanceof Error ? error.message : 'Không thể tạo cấu hình. Hãy thử lại.';
		} finally {
			if (isStarter) isCreatingStarter = false;
			else isCreating = false;
		}
	}

	/** @param {string} key */
	async function handleDelete(key) {
		if (!confirm(`Bạn có chắc chắn muốn xóa cấu hình '${key}' không?`)) return;
		try {
			const res = await fetch(`/api/config/${encodeURIComponent(key)}`, { method: 'DELETE' });
			const data = await res.json();
			if (data.success) {
				configs = configs.filter((c) => c.key !== key);
			} else {
				alert('Xóa thất bại: ' + data.error);
			}
		} catch {
			alert('Lỗi kết nối khi xóa!');
		}
	}
</script>

<svelte:head>
	<title>Quản lý Cấu hình Bản đồ</title>
	<link
		rel="stylesheet"
		href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css"
	/>
</svelte:head>

<main class="min-h-screen bg-slate-100 p-8 font-sans">
	<div class="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
		<div class="d-flex align-items-center border-bottom mb-6 justify-between pb-4">
			<div>
				<h1 class="h3 fw-bold text-slate-800">Hệ thống Quản lý Đa Cấu Hình Bản Đồ</h1>
				<p class="text-muted small mb-0">
					Quản lý cấu hình bản đồ; dữ liệu đang lưu bằng {storageLabels[storageDriver] ||
						'backend đã chọn'}.
				</p>
			</div>
			<a href={resolve('/admin/thumbnails')} class="btn btn-outline-secondary btn-sm"
				>Quản lý Thumbnail →</a
			>
		</div>

		{#if errorMessage}
			<div class="alert alert-danger" role="alert">
				<p class="mb-2">{errorMessage}</p>
				<button type="button" class="btn btn-sm btn-outline-danger" onclick={fetchConfigs}>
					Tải lại danh sách
				</button>
			</div>
		{/if}

		{#if !isLoading && configs.length === 0 && !errorMessage}
			<div class="border-primary-subtle bg-primary-subtle mb-5 rounded-2xl border p-4">
				<h2 class="h5 fw-bold text-slate-800">Bắt đầu với cấu hình mẫu</h2>
				<p class="mb-3 text-slate-700">
					Tạo cấu hình khởi đầu <code>{starterKey}</code> với các lớp bản đồ mẫu. Sau đó bạn có thể chỉnh
					sửa bằng JSON Editor và xem bản đồ ngay.
				</p>
				<button
					type="button"
					class="btn btn-primary"
					onclick={createStarterConfig}
					disabled={isCreatingStarter}
				>
					{isCreatingStarter ? 'Đang tạo cấu hình khởi đầu…' : `Tạo cấu hình ${starterKey}`}
				</button>
			</div>
		{/if}

		<!-- Tạo cấu hình mới từ cấu hình mẫu; nội dung JSON được chỉnh sửa sau khi tạo. -->
		<form onsubmit={handleCreate} class="row g-3 mb-5 rounded-2xl border bg-slate-50 p-4">
			<div class="col-md-8">
				<label for="newKeyInput" class="form-label fw-semibold small text-slate-700"
					>Nhập key duy nhất cho cấu hình mới:</label
				>
				<input
					id="newKeyInput"
					type="text"
					bind:value={newKey}
					placeholder="Ví dụ: thu-duc-map..."
					class="form-control"
					required
				/>
			</div>
			<div class="col-md-4 d-flex align-items-end">
				<button type="submit" disabled={isCreating} class="btn btn-primary fw-semibold w-100">
					{isCreating ? 'Đang tạo...' : '+ Tạo từ cấu hình mẫu'}
				</button>
			</div>
			<p class="small text-muted col-12 mb-0">
				Cấu hình mẫu sẽ được sao chép; hãy mở “Sửa” để thay đổi JSON sau khi tạo.
			</p>
		</form>

		<!-- Bảng danh sách cấu hình -->
		<h2 class="h5 fw-bold mb-3 text-slate-700">Danh sách cấu hình hiện có</h2>

		{#if isLoading}
			<div class="text-muted py-5 text-center">Đang tải danh sách...</div>
		{:else if errorMessage}
			<div class="text-muted rounded-3 bg-light border py-4 text-center">
				Không thể xác định danh sách cấu hình do lỗi kết nối bộ lưu trữ.
			</div>
		{:else if configs.length === 0}
			<div class="text-muted rounded-3 bg-light border py-5 text-center">
				Chưa có cấu hình. Tạo cấu hình khởi đầu ở trên để bắt đầu.
			</div>
		{:else}
			<div class="table-responsive">
				<table class="table-hover table align-middle">
					<thead class="table-light">
						<tr>
							<th>Key</th>
							<th>Tiêu đề (Title)</th>
							<th>Cập nhật lần cuối</th>
							<th>Trạng thái</th>
							<th>Map/API</th>
							<th class="text-end">Hành động</th>
						</tr>
					</thead>
					<tbody>
						{#each configs as cfg (cfg.key)}
							<tr>
								<td class="fw-bold text-primary">{cfg.key}</td>
								<td>{cfg.title}</td>
								<td class="text-muted small">{new Date(cfg.updatedAt).toLocaleString()}</td>
								<td>
									<span
										class="badge"
										class:bg-success={cfg.status === 'active'}
										class:bg-secondary={cfg.status !== 'active'}
									>
										{cfg.status}
									</span>
								</td>
								<td>
									<a
										href={resolve('/map/[key]', { key: cfg.key })}
										class="btn btn-sm btn-outline-success me-1">Xem bản đồ</a
									>
									<a
										href={resolve('/api/config/[key]', { key: cfg.key })}
										target="_blank"
										rel="noreferrer"
										class="btn btn-sm btn-outline-secondary">JSON API</a
									>
								</td>
								<td class="text-end">
									<a
										href={resolve('/admin/configs/[key]', { key: cfg.key })}
										class="btn btn-sm btn-outline-primary me-2">Sửa</a
									>
									<button
										onclick={() => handleDelete(cfg.key)}
										class="btn btn-sm btn-outline-danger">Xóa</button
									>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</main>
