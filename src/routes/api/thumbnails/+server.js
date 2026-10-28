// src/routes/api/thumbnails/+server.js
import { json } from '@sveltejs/kit';
import {
	getStorageErrorMessage,
	getStorageDriver,
	getThumbnailUrl,
	listObjects,
	putObject
} from '#lib/storage';

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type'
};

export async function OPTIONS() {
	return new Response(null, { headers: corsHeaders });
}

// GET /api/thumbnails: Lấy danh sách thumbnail từ bộ lưu trữ đã chọn
export async function GET() {
	try {
		const objects = await listObjects('thumbnails/');
		const thumbnails = [];
		for (const obj of objects) {
			if (obj.name && obj.name.startsWith('thumbnails/')) {
				const filename = obj.name.replace('thumbnails/', '');
				if (!filename) continue;

				const publicUrl = getThumbnailUrl(filename);
				const match = /^(.*)-(\d+)\.jpg$/i.exec(filename);

				thumbnails.push({
					filename,
					name: match?.[1] || filename,
					timestamp: match
						? new Date(Number(match[2])).toISOString()
						: (obj.lastModified || new Date()).toISOString(),
					url: publicUrl
				});
			}
		}

		thumbnails.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
		return json(
			{ success: true, thumbnails, storageDriver: getStorageDriver() },
			{ headers: corsHeaders }
		);
	} catch (error) {
		console.error('Lỗi lấy danh sách thumbnail:', getStorageErrorMessage(error));
		return json(
			{
				success: false,
				thumbnails: [],
				error: `Không thể tải danh sách thumbnail: ${getStorageErrorMessage(error)}`
			},
			{ status: 500, headers: corsHeaders }
		);
	}
}

// POST /api/thumbnails: Upload thumbnail mới
export async function POST({ request }) {
	try {
		const { name, image } = await request.json();
		if (typeof name !== 'string' || typeof image !== 'string' || !name.trim() || !image) {
			return json(
				{ success: false, error: 'Thiếu tên hoặc dữ liệu ảnh' },
				{ status: 400, headers: corsHeaders }
			);
		}

		const sanitizedName = name
			.trim()
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/đ/g, 'd')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 80);
		if (!sanitizedName) {
			return json(
				{ success: false, error: 'Tên thumbnail phải có ít nhất một chữ cái hoặc chữ số.' },
				{ status: 400, headers: corsHeaders }
			);
		}

		const imageMatch = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
		if (!imageMatch) {
			return json(
				{ success: false, error: 'Ảnh phải là dữ liệu JPEG hợp lệ.' },
				{ status: 400, headers: corsHeaders }
			);
		}
		const base64Data = imageMatch[1];
		if (base64Data.length > 5_600_000) {
			return json(
				{ success: false, error: 'Ảnh vượt quá giới hạn 4 MB.' },
				{ status: 413, headers: corsHeaders }
			);
		}
		const timestamp = Date.now();
		const fileName = `${sanitizedName}-${timestamp}.jpg`;
		const objectName = `thumbnails/${fileName}`;
		const buffer = Buffer.from(base64Data, 'base64');
		if (buffer.length === 0 || buffer.length > 4 * 1024 * 1024) {
			return json(
				{ success: false, error: 'Ảnh rỗng hoặc vượt quá giới hạn 4 MB.' },
				{ status: 413, headers: corsHeaders }
			);
		}

		await putObject(objectName, buffer, 'image/jpeg');

		const publicUrl = getThumbnailUrl(fileName);

		return json(
			{
				success: true,
				message: 'Upload thumbnail thành công!',
				url: publicUrl,
				filename: fileName
			},
			{ headers: corsHeaders }
		);
	} catch (error) {
		console.error('Lỗi upload thumbnail:', getStorageErrorMessage(error));
		return json(
			{
				success: false,
				error: `Không thể tải thumbnail lên bộ lưu trữ: ${getStorageErrorMessage(error)}`
			},
			{ status: 500, headers: corsHeaders }
		);
	}
}
