FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
ENV CONTROLJUS_HEADLESS=true

EXPOSE 8787

CMD ["npm", "start"]
