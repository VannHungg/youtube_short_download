FROM node:20-alpine

# Cài yt-dlp + ffmpeg
RUN apk add --no-cache python3 ffmpeg curl \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
       -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp

WORKDIR /app
COPY package.json .
RUN npm install

COPY index.js .

VOLUME ["/videos"]

EXPOSE 3001
CMD ["npm", "start"]
