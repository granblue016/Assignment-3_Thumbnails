# Thumbnails

Ứng dụng SvelteKit quản lý cấu hình bản đồ và thumbnail. Có thể chạy local không cần tài khoản cloud, và dùng Netlify Blobs hoặc MinIO khi deploy.

## Chạy local

Yêu cầu Node.js 22.12 trở lên.

1. Cài dependency:

   ```sh
   npm install
   ```

2. Sao chép `.env.example` thành `.env`. Mặc định `STORAGE_DRIVER=filesystem`, không cần credentials cloud; dữ liệu nằm trong `data/storage/map-configs/` và không được commit.
3. Chạy ứng dụng:

   ```sh
   npm run dev
   ```

Để dùng MinIO, đặt `STORAGE_DRIVER=minio` rồi nhập credentials S3 có quyền `ListBucket`, `GetObject`, `PutObject`, `DeleteObject`. Với MinIO Play, `https://play.min.io:9443` là giao diện quản trị, không phải S3 API; endpoint S3 là `play.min.io:443`, SSL bật và region `us-east-1`. Cặp `minioadmin` trong đề không được MinIO Play chấp nhận làm credentials công khai. Nếu chữ ký bị từ chối, hãy dùng backend filesystem local hoặc cấu hình MinIO riêng với access key hợp lệ. Không commit `.env`; khởi động lại Vite sau khi đổi biến môi trường.

Các lệnh kiểm tra và build:

```sh
npm run check
npm run build
npm run preview
```

## Deploy lên Netlify

Netlify dùng `@sveltejs/adapter-netlify` trong cấu hình SvelteKit ở `vite.config.js`; `netlify.toml` đặt lệnh build, thư mục xuất bản và `STORAGE_DRIVER=netlify-blobs`. Khi chạy trong Netlify Functions, ứng dụng luôn chọn Netlify Blobs (trừ khi đặt rõ `STORAGE_DRIVER=minio`); vì vậy biến `STORAGE_DRIVER=filesystem` trong cấu hình deploy sẽ không làm ứng dụng ghi vào thư mục chỉ đọc `/var/task`. Netlify Blobs được khởi tạo với strong consistency để việc đọc danh sách/cấu hình ngay sau khi lưu không bị dữ liệu cũ. Dùng cùng `BLOBS_STORE_NAME` giữa các deploy để giữ chung kho dữ liệu.

Các lựa chọn backend:

| `STORAGE_DRIVER` | Dùng ở đâu                   | Ghi chú                                                                                                                                    |
| ---------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `filesystem`     | Local development (mặc định) | Lưu file trong `data/storage/map-configs/`; dữ liệu này chỉ tồn tại trên máy đó, không dùng làm storage bền vững khi deploy serverless.    |
| `netlify-blobs`  | Netlify deployment           | Dùng Netlify Blobs, không yêu cầu credentials MinIO. `BLOBS_STORE_NAME` chọn tên kho (mặc định `map-configs`); `BLOBS_REGION` là tùy chọn. |
| `minio`          | Local hoặc deploy            | Cần endpoint, port, SSL, region, access key, secret key và bucket MinIO hợp lệ.                                                            |

Khi dùng MinIO, khai báo `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL`, `MINIO_REGION`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` và `MINIO_BUCKET`. Tạo bucket trước khi dùng. Thumbnail từ mọi backend được truy cập qua đường dẫn cùng origin `/api/thumbnails/<filename>`; link cũ chứa `localhost` được chuẩn hóa khi đọc/lưu cấu hình để không gây Mixed Content trên HTTPS.

Từ `/admin/configs`, nếu bucket chưa có cấu hình, chọn **Tạo cấu hình hcm-map** để tạo cấu hình khởi đầu; nội dung mẫu không còn chiếm chỗ trong trang danh sách. Cấu hình mới được sao chép từ mẫu và chỉnh sửa bằng JSON Editor sau khi tạo. Dữ liệu lưu tại `configs/<key>.json`. Có thể sửa tại `/admin/configs/<key>`, xem bản đồ động tại `/map/<key>`, hoặc mở JSON API tại `/api/config/<key>`. API cấu hình trả về JSON cấu hình; API danh sách trả về các trường `key`, `title`, `updatedAt`, `status`.

Trang `/admin/thumbnails` cho phép xem trước một BaseLayer, chụp thành JPEG (tối đa 4 MB để phù hợp giới hạn payload của Netlify Functions) và quản lý các object trong `thumbnails/`. Tile server phải cho phép CORS để trình duyệt chụp canvas; nếu không, trình duyệt sẽ từ chối export ảnh. API cấu hình giữ nguyên object name `configs/<key>.json`; thumbnail lưu theo `thumbnails/<name>-<timestamp>.jpg` trên tất cả backend.

> **Bảo mật:** các trang quản trị và API ghi/xóa hiện chưa có đăng nhập. Không triển khai ứng dụng này công khai trước khi bổ sung xác thực hoặc giới hạn truy cập bằng một lớp bảo vệ phù hợp. Không đưa access key/secret key vào mã nguồn hay biến môi trường phía trình duyệt.
