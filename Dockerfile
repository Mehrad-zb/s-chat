FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=3000 NODE_NO_WARNINGS=1
COPY server ./server
COPY public ./public
# Persian font (Vazirmatn, OFL) — fetched at build time
RUN mkdir -p public/fonts && \
    (wget -q -O public/fonts/Vazirmatn.woff2 "https://cdn.jsdelivr.net/npm/vazirmatn@33.0.3/fonts/webfonts/Vazirmatn[wght].woff2" || \
     wget -q -O public/fonts/Vazirmatn.woff2 "https://github.com/rastikerdar/vazirmatn/raw/master/fonts/webfonts/Vazirmatn%5Bwght%5D.woff2" || true)
USER node
EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "server/server.js"]
