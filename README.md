# S-Chat

پیام‌رسان شخصی Satin Graphic — مثل تلگرام و واتس‌اپ، روی سرور خودت.
A private Telegram/WhatsApp-style messenger you host yourself.

**امکانات:** چت خصوصی و گروهی · عکس، ویدیو، فایل، موقعیت · پیام صوتی (ویس) · تماس صوتی و تصویری · ریپلای، ویرایش، حذف، هدایت، ری‌اکشن · تیک ارسال/دریافت/خوانده‌شده · در حال نوشتن، آنلاین و آخرین بازدید · لینک دعوت گروه · پیام‌های ذخیره‌شده · بلاک · نوتیفیکیشن (PWA) · فارسی/انگلیسی · پوسته شیشه‌ای روشن/تیره · ورود با ایمیل یا شماره موبایل (کد تأیید)

## Stack
- **Server:** Node.js 22, zero npm dependencies — HTTP + WebSocket + SQLite (`node:sqlite`), Web Push (VAPID), SMTP email, VoIP.ms SMS
- **Web app:** vanilla JS PWA (`public/`), installable, offline shell, push notifications
- **Calls:** WebRTC with coturn TURN/STUN (UDP, TCP and TLS 5349)
- **Android:** Trusted Web Activity in `android/`, built by GitHub Actions → release `apk-latest`
- **Deploy:** Docker Compose (app + Caddy auto-HTTPS + coturn)

## Install on a DigitalOcean droplet (Ubuntu 24.04)
1. DNS: `A  chat.satingraphic.ca → <droplet IP>`
2. SSH in as root and run:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/Mehrad-zb/s-chat/main/deploy/install.sh | bash
   ```
3. Open https://chat.satingraphic.ca

Update: `cd /opt/s-chat && bash deploy/update.sh` · Backup: `bash deploy/backup.sh` · Settings: `/opt/s-chat/.env`

## Optional: Iran relay
On the Iranian server: `sudo bash deploy/iran-relay.sh <droplet IP>`, add DNS `ir.chat.satingraphic.ca → <Iran server IP>`,
then set `DOMAINS=chat.satingraphic.ca, ir.chat.satingraphic.ca` in `.env` and run `docker compose up -d`.

## Local development
```bash
DEV_MODE=1 INSECURE_COOKIE=1 node server/server.js   # http://localhost:3000, login codes shown on screen
```
