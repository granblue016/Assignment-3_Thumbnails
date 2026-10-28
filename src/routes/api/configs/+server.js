// src/routes/api/configs/+server.js
import { json } from '@sveltejs/kit';
import {
	getObject,
	getStorageDriver,
	getStorageErrorMessage,
	listObjects,
	putObject
} from '#lib/storage';
import { defaultMapConfig } from '#lib/defaultConfig';
import { isMapConfig, normalizeThumbnailUrls } from '#lib/configValidation';

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
	'Cache-Control': 'no-store, no-cache, must-revalidate'
};

export async function OPTIONS() {
	return new Response(null, { headers: corsHeaders });
}

export async function GET() {
	try {
		const configs = [];
		const objects = await listObjects('configs/');
		for (const obj of objects) {
			if (obj.name && /^configs\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(obj.name)) {
				const key = obj.name.slice('configs/'.length, -'.json'.length);
				const config = JSON.parse((await getObject(obj.name)).toString('utf8'));
				if (!isMapConfig(config)) {
					throw new Error(`Cấu hình configs/${key}.json không đúng định dạng.`);
				}

				configs.push({
					key,
					title: config.title,
					updatedAt: config.updatedAt || obj.lastModified,
					status: config.status === 'inactive' ? 'inactive' : 'active'
				});
			}
		}

		configs.sort((a, b) => a.key.localeCompare(b.key));
		return json(
			{ success: true, configs, storageDriver: getStorageDriver() },
			{ headers: corsHeaders }
		);
	} catch (error) {
		console.error('Không thể liệt kê cấu hình MinIO:', {
			code: error && typeof error === 'object' && 'code' in error ? error.code : 'UnknownError',
			message: getStorageErrorMessage(error)
		});
		return json(
			{
				success: false,
				configs: [],
				error: `Không thể tải danh sách cấu hình: ${getStorageErrorMessage(error)}`
			},
			{ status: 500, headers: corsHeaders }
		);
	}
}

export async function POST({ request }) {
	try {
		const body = await request.json();
		const key = typeof body?.key === 'string' ? body.key.trim().toLowerCase() : '';
		if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) {
			return json(
				{ success: false, error: 'Key chỉ được gồm chữ thường, số và dấu gạch ngang.' },
				{ status: 400, headers: corsHeaders }
			);
		}

		const objectName = `configs/${key}.json`;
		const objects = await listObjects('configs/');
		for (const object of objects) {
			if (object.name === objectName) {
				return json(
					{ success: false, error: `Key '${key}' đã tồn tại.` },
					{ status: 409, headers: corsHeaders }
				);
			}
		}

		const config = normalizeThumbnailUrls(body.config ?? defaultMapConfig);
		if (!isMapConfig(config)) {
			return json(
				{ success: false, error: 'Nội dung cấu hình không hợp lệ.' },
				{ status: 400, headers: corsHeaders }
			);
		}

		const storedConfig = {
			...config,
			key,
			status: config.status === 'inactive' ? 'inactive' : 'active',
			updatedAt: new Date().toISOString()
		};
		const buffer = Buffer.from(JSON.stringify(storedConfig, null, 2), 'utf8');
		await putObject(objectName, buffer, 'application/json');

		return json({ success: true, config: storedConfig }, { status: 201, headers: corsHeaders });
	} catch (error) {
		console.error('Lỗi tạo cấu hình:', error);
		return json(
			{
				success: false,
				error: `Không thể tạo cấu hình: ${getStorageErrorMessage(error)}`
			},
			{ status: 500, headers: corsHeaders }
		);
	}
}
