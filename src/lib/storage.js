import { getStore } from '@netlify/blobs';
import * as Minio from 'minio';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const env = process.env;
export const BUCKET_NAME = env.MINIO_BUCKET || 'map-configs';
export const STORAGE_DRIVER = env.STORAGE_DRIVER || (env.NETLIFY ? 'netlify-blobs' : 'filesystem');

export function getStorageDriver() {
	return getDriver();
}

/** @type {InstanceType<typeof Minio.Client> | null} */
let minioClient = null;

/** @param {string} objectName */
function assertObjectName(objectName) {
	if (
		typeof objectName !== 'string' ||
		objectName.startsWith('/') ||
		objectName.includes('\\') ||
		objectName.split('/').some((part) => !part || part === '.' || part === '..')
	) {
		throw new Error('Tên object lưu trữ không hợp lệ.');
	}
}

/** @param {string} objectName */
function getLocalObjectPath(objectName) {
	assertObjectName(objectName);
	const root = path.resolve(process.cwd(), 'data', 'storage', BUCKET_NAME);
	const filePath = path.resolve(root, ...objectName.split('/'));
	if (!filePath.startsWith(`${root}${path.sep}`)) {
		throw new Error('Tên object lưu trữ không hợp lệ.');
	}
	return filePath;
}

function getMinioClient() {
	if (minioClient) return minioClient;

	const endPoint = env.MINIO_ENDPOINT;
	const accessKey = env.MINIO_ACCESS_KEY;
	const secretKey = env.MINIO_SECRET_KEY;
	if (!endPoint || !accessKey || !secretKey) {
		throw new Error('MINIO_ENDPOINT, MINIO_ACCESS_KEY, and MINIO_SECRET_KEY are required');
	}

	const useSSL = env.MINIO_USE_SSL === 'true';
	const port = Number(env.MINIO_PORT || (useSSL ? 443 : 9000));
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error('MINIO_PORT must be a valid port number');
	}
	if (endPoint.toLowerCase() === 'play.min.io' && useSSL && port === 9443) {
		throw new Error(
			'play.min.io:9443 là giao diện MinIO Console, không phải S3 API. Hãy dùng MINIO_PORT=443.'
		);
	}

	minioClient = new Minio.Client({
		endPoint,
		port,
		useSSL,
		accessKey,
		secretKey,
		region: env.MINIO_REGION || 'us-east-1'
	});

	return minioClient;
}

function getBlobStore() {
	const name = env.BLOBS_STORE_NAME || BUCKET_NAME;
	const region = env.BLOBS_REGION;
	if (!region) return getStore(name);
	const supportedRegions = [
		'us-east-1',
		'us-east-2',
		'eu-central-1',
		'ap-southeast-1',
		'ap-southeast-2'
	];
	if (!supportedRegions.includes(region)) {
		throw new Error(`BLOBS_REGION không hợp lệ: "${region}".`);
	}
	return getStore({
		name,
		region: /** @type {import('@netlify/blobs').GetStoreOptions['region']} */ (region)
	});
}

function getDriver() {
	if (!['filesystem', 'minio', 'netlify-blobs'].includes(STORAGE_DRIVER)) {
		throw new Error(
			`STORAGE_DRIVER không hợp lệ: "${STORAGE_DRIVER}". Chọn filesystem, minio hoặc netlify-blobs.`
		);
	}
	return STORAGE_DRIVER;
}

/** @returns {Promise<Array<{ name: string, lastModified: Date | null }>>} */
/** @param {string} prefix */
export async function listObjects(prefix) {
	assertObjectName(prefix.replace(/\/$/, ''));
	const driver = getDriver();
	if (driver === 'filesystem') {
		const directory = getLocalObjectPath(prefix.replace(/\/$/, ''));
		try {
			const entries = await readdir(directory, { withFileTypes: true });
			return Promise.all(
				entries
					.filter((entry) => entry.isFile())
					.map(async (entry) => {
						const objectPath = path.join(directory, entry.name);
						const details = await stat(objectPath);
						return {
							name: `${prefix}${entry.name}`,
							lastModified: details.mtime
						};
					})
			);
		} catch (error) {
			if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
				return [];
			}
			throw error;
		}
	}
	if (driver === 'netlify-blobs') {
		const store = getBlobStore();
		const { blobs } = await store.list({ prefix });
		return blobs.map((blob) => ({ name: blob.key, lastModified: null }));
	}

	const objects = [];
	for await (const object of getMinioClient().listObjects(BUCKET_NAME, prefix, true)) {
		if (object.name) {
			objects.push({ name: object.name, lastModified: object.lastModified || null });
		}
	}
	return objects;
}

/** @returns {Promise<Buffer>} */
/** @param {string} objectName */
export async function getObject(objectName) {
	assertObjectName(objectName);
	const driver = getDriver();
	if (driver === 'filesystem') {
		return readFile(getLocalObjectPath(objectName));
	}
	if (driver === 'netlify-blobs') {
		const data = await getBlobStore().get(objectName, { type: 'arrayBuffer' });
		if (!data) {
			const error = /** @type {Error & { code: string }} */ (
				new Error(`Không tìm thấy object "${objectName}".`)
			);
			error.code = 'NoSuchKey';
			throw error;
		}
		return Buffer.from(data);
	}

	const stream = await getMinioClient().getObject(BUCKET_NAME, objectName);
	const chunks = [];
	for await (const chunk of stream) chunks.push(Buffer.from(chunk));
	return Buffer.concat(chunks);
}

/**
 * @param {string} objectName
 * @param {Buffer | Uint8Array | string} data
 * @param {string} contentType
 */
export async function putObject(objectName, data, contentType) {
	assertObjectName(objectName);
	const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
	const driver = getDriver();
	if (driver === 'filesystem') {
		const filePath = getLocalObjectPath(objectName);
		await mkdir(path.dirname(filePath), { recursive: true });
		await writeFile(filePath, buffer);
		return;
	}
	if (driver === 'netlify-blobs') {
		const blobData = new Uint8Array(buffer.byteLength);
		blobData.set(buffer);
		await getBlobStore().set(objectName, new Blob([blobData], { type: contentType }));
		return;
	}
	await getMinioClient().putObject(BUCKET_NAME, objectName, buffer, buffer.length, {
		'Content-Type': contentType
	});
}

/** @param {string} objectName */
export async function deleteObject(objectName) {
	assertObjectName(objectName);
	const driver = getDriver();
	if (driver === 'filesystem') {
		await rm(getLocalObjectPath(objectName), { force: true });
		return;
	}
	if (driver === 'netlify-blobs') {
		await getBlobStore().delete(objectName);
		return;
	}
	await getMinioClient().removeObject(BUCKET_NAME, objectName);
}

/** @param {unknown} error */
export function getStorageErrorMessage(error) {
	const message = error instanceof Error ? error.message : String(error);
	const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
	if (code === 'SignatureDoesNotMatch' || /signature we calculated does not match/i.test(message)) {
		return 'MinIO từ chối chữ ký S3. Kiểm tra credentials S3 còn hiệu lực và khớp endpoint.';
	}
	if (code === 'AccessDenied' || /access denied/i.test(message)) {
		return `MinIO từ chối quyền truy cập bucket "${BUCKET_NAME}". Kiểm tra quyền ListBucket, GetObject, PutObject, DeleteObject.`;
	}
	if (code === 'NoSuchBucket' || /specified bucket does not exist/i.test(message)) {
		return `Bucket "${BUCKET_NAME}" chưa tồn tại. Hãy tạo bucket trong MinIO Console.`;
	}
	return message;
}

/** @param {string} filename */
export function getThumbnailUrl(filename) {
	if (getDriver() === 'minio') {
		const useSSL = env.MINIO_USE_SSL === 'true';
		const port = Number(env.MINIO_PORT || (useSSL ? 443 : 9000));
		const origin =
			env.MINIO_PUBLIC_URL || `${useSSL ? 'https' : 'http'}://${env.MINIO_ENDPOINT}:${port}`;
		const encodedName = `thumbnails/${filename}`.split('/').map(encodeURIComponent).join('/');
		return `${origin.replace(/\/+$/, '')}/${encodeURIComponent(BUCKET_NAME)}/${encodedName}`;
	}
	return `/api/thumbnails/${encodeURIComponent(filename)}`;
}
