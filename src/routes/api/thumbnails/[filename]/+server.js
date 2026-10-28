// src/routes/api/thumbnails/[filename]/+server.js
import { json } from '@sveltejs/kit';
import { deleteObject, getObject, getStorageErrorMessage } from '#lib/storage';

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
	'Cache-Control': 'public, max-age=3600'
};

export async function OPTIONS() {
	return new Response(null, { headers: corsHeaders });
}

export async function GET({ params }) {
	const { filename } = params;
	if (!filename || !/^[a-z0-9][a-z0-9-]*-\d+\.jpg$/i.test(filename)) {
		return json(
			{ success: false, error: 'Tên file thumbnail không hợp lệ.' },
			{ status: 400, headers: corsHeaders }
		);
	}

	try {
		const image = await getObject(`thumbnails/${filename}`);
		return new Response(Uint8Array.from(image), {
			headers: { ...corsHeaders, 'Content-Type': 'image/jpeg' }
		});
	} catch (error) {
		const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
		if (code === 'NoSuchKey' || code === 'NoSuchObject' || code === 'ENOENT') {
			return json(
				{ success: false, error: 'Không tìm thấy thumbnail.' },
				{ status: 404, headers: corsHeaders }
			);
		}
		console.error('Lỗi đọc thumbnail:', getStorageErrorMessage(error));
		return json(
			{ success: false, error: `Không thể đọc thumbnail: ${getStorageErrorMessage(error)}` },
			{ status: 500, headers: corsHeaders }
		);
	}
}

export async function DELETE({ params }) {
	try {
		const { filename } = params;
		if (!filename || !/^[a-z0-9][a-z0-9-]*-\d+\.jpg$/i.test(filename)) {
			return json(
				{ success: false, error: 'Tên file thumbnail không hợp lệ.' },
				{ status: 400, headers: corsHeaders }
			);
		}

		const objectName = `thumbnails/${filename}`;
		await deleteObject(objectName);

		return json(
			{ success: true, message: `Đã xóa thumbnail '${filename}' thành công!` },
			{ headers: corsHeaders }
		);
	} catch (error) {
		console.error('Lỗi xóa thumbnail:', getStorageErrorMessage(error));
		return json(
			{
				success: false,
				error: `Không thể xóa thumbnail: ${getStorageErrorMessage(error)}`
			},
			{ status: 500, headers: corsHeaders }
		);
	}
}
