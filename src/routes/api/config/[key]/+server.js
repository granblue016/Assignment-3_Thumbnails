import { json } from '@sveltejs/kit';
import {
	deleteObject,
	getObject,
	getStorageErrorMessage,
	listObjects,
	putObject
} from '#lib/storage';
import { isMapConfig, normalizeThumbnailUrls } from '#lib/configValidation';

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
	'Cache-Control': 'no-store, no-cache, must-revalidate'
};

export async function OPTIONS() {
	return new Response(null, { headers: corsHeaders });
}

// GET /api/config/[key]: Lấy cấu hình tương ứng từ bộ lưu trữ đã chọn
export async function GET({ params }) {
	const { key } = params;
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key || '')) {
		return json(
			{ success: false, error: 'Key cấu hình không hợp lệ.' },
			{ status: 400, headers: corsHeaders }
		);
	}

	const objectName = `configs/${key}.json`;

	try {
		const objects = await listObjects('configs/');
		if (!objects.some((object) => object.name === objectName)) {
			return json(
				{ success: false, error: 'Không tìm thấy cấu hình bản đồ' },
				{ status: 404, headers: corsHeaders }
			);
		}
		const config = normalizeThumbnailUrls(
			JSON.parse((await getObject(objectName)).toString('utf8'))
		);
		if (!isMapConfig(config)) {
			throw new Error(`Cấu hình ${objectName} không đúng định dạng.`);
		}
		return json(
			{
				...config,
				key,
				status: config.status === 'inactive' ? 'inactive' : 'active',
				updatedAt: config.updatedAt || null
			},
			{ headers: corsHeaders }
		);
	} catch (error) {
		const errorCode =
			error && typeof error === 'object' && 'code' in error ? error.code : undefined;
		if (errorCode === 'NoSuchKey' || errorCode === 'NoSuchObject') {
			return json(
				{ success: false, error: 'Không tìm thấy cấu hình bản đồ' },
				{ status: 404, headers: corsHeaders }
			);
		}
		console.error(`Lỗi tải cấu hình '${key}':`, getStorageErrorMessage(error));
		return json(
			{
				success: false,
				error: `Không thể tải cấu hình: ${getStorageErrorMessage(error)}`
			},
			{ status: 500, headers: corsHeaders }
		);
	}
}

// PUT /api/config/[key]: Tạo mới hoặc cập nhật cấu hình
export async function PUT({ request, params }) {
	try {
		const { key } = params;
		if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key || '')) {
			return json(
				{ success: false, error: 'Key cấu hình không hợp lệ.' },
				{ status: 400, headers: corsHeaders }
			);
		}

		const body = normalizeThumbnailUrls(await request.json());
		if (!isMapConfig(body)) {
			return json(
				{ success: false, error: 'Dữ liệu cấu hình không hợp lệ' },
				{ status: 400, headers: corsHeaders }
			);
		}

		// Chuẩn hóa baseLayers: Tuyệt đối không có trường active
		const storedConfig = {
			...body,
			key,
			status: body.status === 'inactive' ? 'inactive' : 'active',
			updatedAt: new Date().toISOString()
		};

		const objectName = `configs/${key}.json`;
		const jsonString = JSON.stringify(storedConfig, null, 2);
		await putObject(objectName, Buffer.from(jsonString, 'utf-8'), 'application/json');

		return json({ success: true, config: storedConfig }, { headers: corsHeaders });
	} catch (error) {
		console.error('Lỗi lưu cấu hình:', getStorageErrorMessage(error));
		return json(
			{
				success: false,
				error: `Không thể lưu cấu hình: ${getStorageErrorMessage(error)}`
			},
			{ status: 500, headers: corsHeaders }
		);
	}
}

// DELETE /api/config/[key]: Xóa file cấu hình
export async function DELETE({ params }) {
	try {
		const { key } = params;
		if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key || '')) {
			return json(
				{ success: false, error: 'Key cấu hình không hợp lệ.' },
				{ status: 400, headers: corsHeaders }
			);
		}

		const objectName = `configs/${key}.json`;
		await deleteObject(objectName);

		return json(
			{ success: true, message: `Đã xóa cấu hình '${key}' thành công!` },
			{ headers: corsHeaders }
		);
	} catch (error) {
		console.error('Lỗi xóa cấu hình:', getStorageErrorMessage(error));
		return json(
			{
				success: false,
				error: `Không thể xóa cấu hình: ${getStorageErrorMessage(error)}`
			},
			{ status: 500, headers: corsHeaders }
		);
	}
}
