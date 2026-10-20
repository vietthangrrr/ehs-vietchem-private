FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    EHS_CLOUD_MODE=1 \
    EHS_SECURE_COOKIE=1 \
    EHS_ENFORCE_ORIGIN=1 \
    EHS_ENABLE_LEGAL_WATCH=1 \
    EHS_AUTO_BACKUP=1 \
    EHS_HOME_DIR=/data/VIETCHEM_EHS

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      poppler-utils \
      tesseract-ocr \
      tesseract-ocr-vie \
      tesseract-ocr-eng \
      imagemagick \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . /app
RUN chmod +x /app/start-railway.sh

EXPOSE 8787
CMD ["/app/start-railway.sh"]
